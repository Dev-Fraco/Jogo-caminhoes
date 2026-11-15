import { avgXI, clubProfile, profileCtx } from './aiprofile';
import { AI_MAX_SQUAD, clubActivity, SELLER_POOL } from './ai';
import { longInjured, squadNeeds } from './aineeds';
import { marketValue } from './aisales';
import { baseWage } from './finance';
import { managed } from './lookup';
import { clamp, type Rng } from './rng';
import { rosterOk } from './roster';
import { autoLineup, pickSpot, randomName, spotOf } from './squad';
import { divisionIndexOf, MIN_BY_POS } from './transfers';
import { newContract, WAGE_LIMIT } from './aicontracts';
import type { AiLoan, GameState, NewsItem, Player, Position, Prospect } from './types';

/* =====================================================================
   Base e empréstimos dos clubes da IA.
   - Cada clube tem uma categoria de base (promessas de 16 a 19 anos com potencial). Quando o time principal precisa da posição e o garoto
     está pronto (ou tem potencial claro), ele é promovido: ninguém fica esquecido na base enquanto o clube precisa justamente dele.
   - Jovens sem espaço no time (reservas de até 23 anos) são emprestados a clubes que precisam da posição e onde vão jogar;
     no fim da temporada voltam ao dono, que reavalia (já tem espaço? vai de novo? é excedente?).
   ===================================================================== */

export const BASE_SIZE = 4;
export const MAX_PROSPECT_AGE = 19;   // passou disso sem ser aproveitado: sai da base (ou é promovido, se tem potencial)
export const MAX_LOAN_AGE = 23;
export const MAX_AI_LOANS = 70;
const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'ATT'];
const SHAPE: Record<Position, number> = { GK: 3, DEF: 8, MID: 8, ATT: 5 };
const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const aiIds = (g: GameState) => Object.keys(g.teams).filter((id) => !managed(g, id));
const swap = (g: GameState, id: string, players: Player[]): GameState => ({ ...g, teams: { ...g.teams, [id]: { ...g.teams[id], players, lineup: autoLineup(players, g.teams[id].formation) } } });
const shuffle = <T,>(a: T[], rng: Rng): T[] => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

/** Jogadores que estão emprestados (seus ou entre clubes da IA): não podem ser vendidos, renovados nem emprestados de novo. */
export const loanedIds = (g: GameState): Set<string> => new Set([...g.loans.map((l) => l.playerId), ...(g.aiLoans ?? []).map((l) => l.playerId)]);

function newProspect(g: GameState, clubId: string, rng: Rng, used: Set<string>, n: number): Prospect {
  const t = g.teams[clubId];
  const level = avgXI(t);
  const short = [...POSITIONS].sort((a, b) => (SHAPE[b] - t.players.filter((p) => p.pos === b).length) - (SHAPE[a] - t.players.filter((p) => p.pos === a).length));
  const pos = rng() < 0.5 ? short[0] : POSITIONS[Math.floor(rng() * 4)];
  const pot = clamp(Math.round(level + (rng() - 0.35) * 22), 40, 92);
  const age = 16 + Math.floor(rng() * 2);
  const strength = clamp(Math.round(pot - 14 - rng() * 14), 25, 80);
  return { id: `${clubId}-b${g.season}-${n}-${Math.floor(rng() * 1e9).toString(36)}`, name: randomName(rng, used), pos, spot: pickSpot(t.players, pos), age, strength, pot };
}

/** Completa a base de cada clube da IA até BASE_SIZE garotos. */
export function ensureAiYouth(g: GameState, rng: Rng): GameState {
  const youth = { ...(g.aiYouth ?? {}) };
  let changed = !g.aiYouth;
  for (const id of aiIds(g)) {
    const cur = youth[id] ?? [];
    if (cur.length >= BASE_SIZE) continue;
    const used = new Set([...g.teams[id].players, ...cur].map((p) => p.name));
    const add: Prospect[] = [];
    for (let i = cur.length; i < BASE_SIZE; i++) add.push(newProspect(g, id, rng, used, i + cur.length * 7));
    youth[id] = [...cur, ...add]; changed = true;
  }
  return changed ? { ...g, aiYouth: youth } : g;
}

/** Virada de temporada: a base cresce em direção ao potencial; quem passou da idade sem espaço sai; entram garotos novos. */
export function developYouth(g: GameState, rng: Rng): GameState {
  const youth: Record<string, Prospect[]> = {};
  for (const [id, list] of Object.entries(g.aiYouth ?? {})) {
    if (!g.teams[id]) continue;
    youth[id] = list.map((p) => ({ ...p, age: p.age + 1, strength: clamp(p.strength + Math.min(Math.max(0, p.pot - p.strength), 3 + Math.floor(rng() * 5)), 25, 95) }));
  }
  return ensureAiYouth({ ...g, aiYouth: youth }, rng);
}

/**
 * Promove garotos da base ao time principal. Pronto = 18+ anos, o clube precisa da posição e o nível dele chega perto de quem joga;
 * promessa = 18+ com potencial acima do nível do time; 19+ sem espaço: sobe se tem potencial razoável, senão sai da base.
 */
export function aiPromoteYouth(g: GameState, rng: Rng, perClub = 2): GameState {
  if (!g.aiYouth) return g;
  let s = g;
  const ctx = profileCtx(s);
  const youth = { ...s.aiYouth! };
  let notable = 0;
  for (const id of shuffle(aiIds(s), rng)) {
    let base = youth[id] ?? [];
    if (!base.length) continue;
    const prof = clubProfile(s, id, ctx);
    const needs = squadNeeds(s, id, prof, { divisionLevel: ctx.divAvg.get(divisionIndexOf(s, id)) });
    const level = ctx.xi.get(id) ?? avgXI(s.teams[id]);
    let promoted = 0;
    for (const pr of [...base].sort((a, b) => b.pot - a.pot || b.strength - a.strength)) {
      if (promoted >= perClub || s.teams[id].players.length >= AI_MAX_SQUAD) break;
      if (pr.age < 18) continue;
      const t = s.teams[id];
      const xi = new Set(autoLineup(t.players, t.formation));
      const weak = Math.min(...t.players.filter((p) => p.pos === pr.pos && xi.has(p.id)).map((p) => p.strength));
      const need = needs.find((n) => n.pos === pr.pos && (!n.spot || spotOf(pr) === n.spot));
      const ready = !!need && pr.strength >= Math.min(need.minStrength, Number.isFinite(weak) ? weak : 0) - 6;
      const talent = pr.pot >= level + 2 && pr.strength >= level - 14;
      const overdue = pr.age >= MAX_PROSPECT_AGE && pr.pot >= level - 8;
      if (!ready && !talent && !overdue) continue;
      const { pot: _pot, ...p } = pr;
      const joined: Player = { ...p, spot: pickSpot(t.players, p.pos), contract: newContract(s, id, p as Player, 0.6) };
      s = swap(s, id, [...t.players, joined]);
      base = base.filter((x) => x.id !== pr.id);
      promoted++;
      if (notable < 5 && (ready || pr.pot >= level + 6)) { notable++; s = news(s, `🌱 ${s.clubs[id].name} promove ${pr.name}, ${pr.age} anos (${pr.pos === 'GK' ? 'goleiro' : pr.pos === 'DEF' ? 'defensor' : pr.pos === 'MID' ? 'meia' : 'atacante'}), da base para o time principal.`); }
    }
    // quem passou da idade da base sem ser aproveitado sai (o clube não guarda promessa para sempre)
    youth[id] = base.filter((x) => x.age <= MAX_PROSPECT_AGE);
  }
  return { ...s, aiYouth: youth };
}

/**
 * Janela de empréstimos: clubes com necessidade numa posição buscam jovens que estão sem espaço em outros clubes (donos de divisão igual ou
 * superior). O garoto precisa ter chance real de jogar no clube que o recebe, o dono não pode ficar curto na posição e a taxa cabe no caixa.
 */
export function aiLoanWindow(g: GameState, rng: Rng, perHost = 1): GameState {
  let s = g;
  const ctx = profileCtx(s);
  const loaned = loanedIds(s);
  const loans: AiLoan[] = [...(s.aiLoans ?? [])];
  const ids = aiIds(s);
  let notable = 0;
  for (const hostId of shuffle(ids, rng)) {
    if (loans.length >= MAX_AI_LOANS) break;
    let got = 0;
    while (got < perHost && s.teams[hostId].players.length < AI_MAX_SQUAD) {
      const prof = clubProfile(s, hostId, ctx);
      const needs = squadNeeds(s, hostId, prof, { divisionLevel: ctx.divAvg.get(divisionIndexOf(s, hostId)) });
      if (!needs.length) break;
      if (got === 0 && needs[0].priority < 100 && rng() > clubActivity(hostId, prof)) break; // nem todo clube busca empréstimo agora
      const host = s.teams[hostId];
      const hdi = divisionIndexOf(s, hostId);
      const hxi = new Set(autoLineup(host.players, host.formation));
      const room = prof.revenue * WAGE_LIMIT[prof.tier] - host.players.reduce((t, p) => t + (p.contract?.wage ?? baseWage(s, hostId, p)), 0);
      type Deal = { p: Player; ownerId: string; fee: number; gain: number };
      let best = null as Deal | null;
      const owners = ids.length > SELLER_POOL ? shuffle(ids, rng).slice(0, SELLER_POOL) : ids;
      for (const need of needs) {
        const weak = Math.min(...host.players.filter((p) => p.pos === need.pos && hxi.has(p.id)).map((p) => p.strength));
        for (const ownerId of owners) {
          if (ownerId === hostId || divisionIndexOf(s, ownerId) > hdi) continue; // dono de divisão igual ou superior à do clube que recebe
          const owner = s.teams[ownerId];
          const oxi = new Set(autoLineup(owner.players, owner.formation));
          const sameCount = owner.players.filter((x) => x.pos === need.pos).length;
          if (sameCount <= MIN_BY_POS[need.pos] + 1) continue; // o dono não fica curto na posição
          for (const p of owner.players) {
            if (p.pos !== need.pos || (need.spot && spotOf(p) !== need.spot) || p.age > MAX_LOAN_AGE || oxi.has(p.id) || loaned.has(p.id) || longInjured(s, p.id)) continue;
            if (p.strength < need.minStrength - 4) continue;                                  // fraco demais para ajudar
            if (Number.isFinite(weak) && p.strength < weak - 2 && !need.reasons.includes('falta-gente')) continue; // não vai jogar lá também
            const m = s.aiMoves?.[p.id]; if (m && m.season >= s.season) continue;
            if (!rosterOk(owner.players.filter((x) => x.id !== p.id))) continue;
            const fee = Math.round((marketValue(s, ownerId, p) * 0.05) / 10_000) * 10_000;
            if (fee > (s.budgets[hostId] ?? 0) * prof.spendShare || baseWage(s, hostId, p) > room) continue;
            const gain = p.strength - (Number.isFinite(weak) ? weak : need.minStrength) + (p.age <= 21 ? 2 : 0);
            if (!best || gain > best.gain) best = { p, ownerId, fee, gain };
          }
        }
        if (best) break;
      }
      const deal = best as Deal | null;
      if (!deal) break;
      const { p, ownerId, fee } = deal;
      s = swap(s, ownerId, s.teams[ownerId].players.filter((x) => x.id !== p.id));
      s = swap(s, hostId, [...s.teams[hostId].players, p]);
      s = { ...s, budgets: { ...s.budgets, [ownerId]: (s.budgets[ownerId] ?? 0) + fee, [hostId]: (s.budgets[hostId] ?? 0) - fee } };
      loans.push({ playerId: p.id, ownerId, hostId, season: s.season });
      loaned.add(p.id);
      got++;
      if (notable < 3 && p.age <= 21) { notable++; s = news(s, `📤 ${s.clubs[ownerId].name} empresta o jovem ${p.name} (${p.age} anos, overall ${p.strength}) ao ${s.clubs[hostId].name}, onde terá mais chances de jogar.`); }
    }
  }
  return { ...s, aiLoans: loans };
}

/** Fim de temporada (ou quando o jogador assume um clube): os emprestados voltam ao dono, que reavalia no seu elenco. */
export function returnAiLoans(g: GameState, onlyClub?: string): GameState {
  if (!g.aiLoans?.length) return g;
  let s = g;
  const keep: AiLoan[] = [];
  let notable = 0;
  for (const l of g.aiLoans) {
    if (onlyClub && l.ownerId !== onlyClub && l.hostId !== onlyClub) { keep.push(l); continue; }
    const host = s.teams[l.hostId], owner = s.teams[l.ownerId];
    const p = host?.players.find((x) => x.id === l.playerId);
    if (!p || !owner) continue;
    s = swap(s, l.hostId, host.players.filter((x) => x.id !== l.playerId));
    s = swap(s, l.ownerId, [...s.teams[l.ownerId].players, p]);
    const t = s.teams[l.ownerId];
    const xi = new Set(autoLineup(t.players, t.formation));
    if (notable < 3 && xi.has(p.id) && p.strength >= 55) { notable++; s = news(s, `🔙 ${p.name} volta de empréstimo ao ${s.clubs[l.ownerId].name} e já entra entre os titulares.`); }
  }
  return { ...s, aiLoans: keep };
}
