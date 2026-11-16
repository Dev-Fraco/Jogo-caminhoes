import { avgXI, clubProfile, profileCtx } from './aiprofile';
import { aiTrade } from './aitrade';
import { mayBeFree } from './freeagents';
import { squadNeeds } from './aineeds';
import { marketValue } from './aisales';
import { managed } from './lookup';
import type { Rng } from './rng';
import { rosterOk } from './roster';
import { autoLineup } from './squad';
import { divisionIndexOf } from './transfers';
import { loanedIds } from './aiyouth';
import type { GameState, NewsItem, Player, Position, SquadLimits } from './types';

/* =====================================================================
   Elencos realistas. Limites por posição, tamanho e idade média (configuráveis em `g.squadRules`), análise do elenco
   (quantidade, profundidade, idade) e organização do excesso SEM apagar jogadores: o excedente é vendido a quem precisa
   da posição, ou liberado para o mercado de jogadores livres (onde outro clube pode contratá-lo).
   Os limites orientam as decisões da IA; elenco cadastrado fora deles não é cortado de uma vez.
   ===================================================================== */

export const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'ATT'];
export const DEFAULT_LIMITS: SquadLimits = {
  total: { min: 20, max: 27 },
  pos: { GK: { min: 2, ideal: 3, max: 4 }, DEF: { min: 5, ideal: 8, max: 11 }, MID: { min: 5, ideal: 8, max: 11 }, ATT: { min: 3, ideal: 5, max: 8 } }, // mínimos = MIN_BY_POS (valores fixos aqui para não depender da ordem de carga dos módulos)
  age: { min: 23, max: 29.5 },
};

/** Limites em vigor: o padrão com os ajustes de `g.squadRules`. */
export function squadLimits(g: Pick<GameState, 'squadRules'>): SquadLimits {
  const r = g.squadRules;
  if (!r) return DEFAULT_LIMITS;
  const pos = { ...DEFAULT_LIMITS.pos };
  for (const k of POSITIONS) pos[k] = { ...DEFAULT_LIMITS.pos[k], ...(r.pos?.[k] ?? {}) };
  return { total: { ...DEFAULT_LIMITS.total, ...(r.total ?? {}) }, age: { ...DEFAULT_LIMITS.age, ...(r.age ?? {}) }, pos };
}

export type SquadIssueKind = 'falta' | 'excesso' | 'desequilibrio' | 'idade-alta' | 'idade-baixa' | 'sem-profundidade' | 'tamanho';
export interface SquadIssue { kind: SquadIssueKind; pos?: Position; text: string }
export interface SquadReport {
  counts: Record<Position, number>;
  total: number;
  avgAge: number;
  /** Jogadores de nível útil (perto do time titular) por posição: a profundidade real. */
  depth: Record<Position, number>;
  issues: SquadIssue[];
}
const LABEL: Record<Position, string> = { GK: 'goleiros', DEF: 'defensores', MID: 'meias', ATT: 'atacantes' };
const SLOTS: Record<Position, number> = { GK: 1, DEF: 4, MID: 3, ATT: 3 };

export function squadReport(g: GameState, clubId: string): SquadReport {
  const t = g.teams[clubId], L = squadLimits(g);
  const level = avgXI(t);
  const counts = {} as Record<Position, number>, depth = {} as Record<Position, number>;
  for (const pos of POSITIONS) { const ps = t.players.filter((p) => p.pos === pos); counts[pos] = ps.length; depth[pos] = ps.filter((p) => p.strength >= level - 14).length; }
  const avgAge = t.players.length ? t.players.reduce((a, p) => a + p.age, 0) / t.players.length : 0;
  const issues: SquadIssue[] = [];
  for (const pos of POSITIONS) {
    const lim = L.pos[pos];
    if (counts[pos] < lim.min) issues.push({ kind: 'falta', pos, text: `faltam ${LABEL[pos]} (${counts[pos]}, mínimo ${lim.min})` });
    else if (counts[pos] < lim.ideal - 1) issues.push({ kind: 'falta', pos, text: `poucos ${LABEL[pos]} (${counts[pos]})` });
    if (counts[pos] > lim.max) issues.push({ kind: 'excesso', pos, text: `excesso de ${LABEL[pos]} (${counts[pos]}, máximo ${lim.max})` });
    if (depth[pos] < SLOTS[pos] + (pos === 'GK' ? 1 : 2) && counts[pos] >= lim.min) issues.push({ kind: 'sem-profundidade', pos, text: `${LABEL[pos]} sem profundidade` });
  }
  const over = issues.find((i) => i.kind === 'excesso'), under = issues.find((i) => i.kind === 'falta');
  if (over && under) issues.push({ kind: 'desequilibrio', text: `desequilíbrio: sobram ${LABEL[over.pos!]} e faltam ${LABEL[under.pos!]}` });
  if (t.players.length > L.total.max) issues.push({ kind: 'tamanho', text: `elenco grande demais (${t.players.length})` });
  if (t.players.length < L.total.min) issues.push({ kind: 'tamanho', text: `elenco curto (${t.players.length})` });
  if (avgAge > L.age.max) issues.push({ kind: 'idade-alta', text: `elenco velho (média ${avgAge.toFixed(1)} anos)` });
  else if (avgAge < L.age.min) issues.push({ kind: 'idade-baixa', text: `elenco muito jovem (média ${avgAge.toFixed(1)} anos)` });
  return { counts, total: t.players.length, avgAge, depth, issues };
}

const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const strip = (p: Player, clubId?: string): Player => { const { contract: _c, ...rest } = p; return clubId ? { ...rest, lastClubId: clubId } : rest; };

/** Quem o clube deve tirar primeiro: posição acima do limite/ideal, fora do time titular, não emprestado; o mais fraco (e mais velho como desempate). */
export function surplusCandidates(g: GameState, clubId: string, loaned: Set<string>): Player[] {
  const t = g.teams[clubId], L = squadLimits(g), xi = new Set(autoLineup(t.players, t.formation));
  const count = (pos: Position) => t.players.filter((p) => p.pos === pos).length;
  return t.players
    .filter((p) => !xi.has(p.id) && !loaned.has(p.id) && count(p.pos) > L.pos[p.pos].ideal)
    .sort((a, b) => (count(b.pos) - L.pos[b.pos].ideal) - (count(a.pos) - L.pos[a.pos].ideal) || a.strength - b.strength || b.age - a.age);
}

/**
 * Organiza o excesso nos clubes da IA, sem apagar ninguém: posição acima do máximo (ou elenco acima do total) vende o excedente a um clube
 * que precisa da posição e pode pagar; se ninguém quer, o jogador é liberado para o mercado de livres. No máximo `maxPerClub` por clube por rodada.
 */
export function aiBalanceSquads(g: GameState, rng: Rng, maxPerClub = 3): GameState {
  let s = g;
  const ctx = profileCtx(s);
  const loaned = loanedIds(s);
  const L = squadLimits(s);
  const ids = Object.keys(s.teams).filter((id) => !managed(s, id));
  for (const id of ids) {
    let moved = 0;
    while (moved < maxPerClub) {
      const t = s.teams[id];
      const rep = squadReport(s, id);
      const overPos = POSITIONS.filter((pos) => rep.counts[pos] > L.pos[pos].max);
      const tooBig = t.players.length > L.total.max;
      if (!overPos.length && !tooBig) break;
      const cand = surplusCandidates(s, id, loaned).find((p) => (overPos.length ? overPos.includes(p.pos) : true) && rosterOk(t.players.filter((x) => x.id !== p.id)) && rep.counts[p.pos] > L.pos[p.pos].min);
      if (!cand) break;
      // 1) vende a um clube que precisa da posição
      const buyers = ids.filter((b) => b !== id && s.teams[b].players.length < L.total.max && s.teams[b].players.filter((x) => x.pos === cand.pos).length < L.pos[cand.pos].ideal);
      const fee = Math.max(10_000, Math.round((marketValue(s, id, cand) * 0.7) / 10_000) * 10_000);
      let sold = false;
      for (const b of buyers.sort(() => rng() - 0.5)) {
        if ((s.budgets[b] ?? 0) < fee * 1.5 || divisionIndexOf(s, b) < divisionIndexOf(s, id) - 1) continue;
        const prof = clubProfile(s, b, ctx);
        if (!squadNeeds(s, b, prof).some((n) => n.pos === cand.pos)) continue;
        const tr = aiTrade(s, { kind: 'compra', playerId: cand.id, buyerId: b, fee, reason: `reposição de ${LABEL[cand.pos]} · vendedor: excesso na posição` });
        if (!tr.ok) continue;
        s = tr.state;
        sold = true; break;
      }
      // 2) ninguém precisa: libera para o mercado de jogadores livres (só quem tem overall 70 ou menos; os demais ficam no clube)
      if (!sold && !mayBeFree(cand)) break;
      if (!sold) {
        const left = s.teams[id].players.filter((x) => x.id !== cand.id);
        s = { ...s, teams: { ...s.teams, [id]: { ...s.teams[id], players: left, lineup: autoLineup(left, s.teams[id].formation) } }, freeAgents: [...(s.freeAgents ?? []), strip(cand, id)] };
        if (cand.strength >= 60) s = news(s, `📋 ${s.clubs[id].name} libera ${cand.name} (overall ${cand.strength}) para organizar o elenco; ele fica livre no mercado.`);
      }
      moved++;
    }
  }
  return s;
}
