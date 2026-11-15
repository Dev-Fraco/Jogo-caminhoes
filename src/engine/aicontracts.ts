import { avgXI, clubProfile, profileCtx, signingScore, type ClubProfile, type ProfileCtx } from './aiprofile';
import { roleOf } from './aisales';
import { baseWage, payrollOf } from './finance';
import { hashString, type Rng } from './rng';
import { rosterOk } from './roster';
import { divisionIndexOf, MIN_BY_POS } from './transfers';
import { AI_MAX_SQUAD, developPlayer } from './ai';
import { longInjured, RETIRING_AGE, squadNeeds } from './aineeds';
import { autoLineup, spotOf } from './squad';
import { goalStatus } from './aigoals';
import { forgetClub } from './aisales';
import { loanedIds } from './aiyouth';
import type { GameState, NewsItem, Player } from './types';

/* =====================================================================
   Contratos dos clubes da IA. Cada jogador tem salário e prazo; os clubes acompanham os vencimentos, renovam quem vale a pena
   (importância, idade, qualidade e potencial), negociam um salário que cabe na folha e deixam sair quem não compensa.
   Jogador importante em último ano de contrato é renovado ANTES (na janela do meio do ano) para o clube não perdê-lo de graça.
   Quem sai sem renovar vira jogador livre e pode ser contratado por outros clubes sem pagar transferência.
   ===================================================================== */

/** Folha máxima por porte, em relação à receita-base: gigantes toleram passar um pouco; pequenos não. */
export const WAGE_LIMIT = { gigante: 1.2, medio: 1.05, pequeno: 0.95 } as const;
export const MAX_FREE_AGENTS = 600; // livres continuam no jogo; só encerram a carreira por idade

/** Anos de contrato conforme a idade (garotos e jovens no auge assinam mais; veteranos, um ano). */
export function contractYears(p: Pick<Player, 'age'>): number {
  return p.age <= 21 ? 4 : p.age <= 27 ? 3 : p.age <= 31 ? 2 : 1;
}

const news = (g: GameState, text: string, tone: NewsItem['tone']): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const isAi = (g: GameState, id: string) => !(id === g.userClubId && !g.unemployed);

/** Novo contrato de transferência: salário da fórmula do clube e prazo pela idade. */
export function newContract(g: GameState, clubId: string, p: Player, bonus = 1.05): NonNullable<Player['contract']> {
  return { wage: Math.round((baseWage(g, clubId, { ...p, contract: undefined }) * bonus) / 1_000) * 1_000, until: g.season + contractYears(p) - 1 };
}

/**
 * Dá contrato a quem ainda não tem (saves e elencos que começam sem contratos). Os prazos se espalham (poucos vencendo já, a maioria
 * mais adiante) para a renovação acontecer aos poucos, e não todo mundo de uma vez. Só clubes da IA.
 */
export function ensureAiContracts(g: GameState, lastSeason = g.season): GameState {
  let changed = false;
  const teams = { ...g.teams };
  for (const [id, t] of Object.entries(g.teams)) {
    if (!isAi(g, id) || t.players.every((p) => p.contract)) continue;
    changed = true;
    teams[id] = { ...t, players: t.players.map((p) => {
      if (p.contract) return p;
      const h = hashString(`${p.id}:c`) % 100;
      const extra = h < 10 ? 0 : h < 40 ? 1 : h < 75 ? 2 : 3;
      return { ...p, contract: { wage: baseWage(g, id, p), until: lastSeason + extra } };
    }) };
  }
  return changed ? { ...g, teams } : g;
}

export interface RenewalDecision { renew: boolean; wage: number; years: number; reason: string; importance: number }

/** Importância do jogador para o clube de 0 a 1 (craque, titular, promessa ou reserva útil). */
export function importanceOf(g: GameState, clubId: string, p: Player, ctx: ProfileCtx): { value: number; promessa: boolean } {
  const r = roleOf(g, clubId, p, ctx);
  const level = ctx.xi.get(clubId) ?? avgXI(g.teams[clubId]);
  const promessa = p.age <= 23 && p.strength >= level - 8;
  const base = r.role === 'craque' ? 1 : r.role === 'titular' ? 0.75 : r.role === 'reserva' ? 0.4 : 0;
  const thin = g.teams[clubId].players.filter((q) => q.pos === p.pos).length <= MIN_BY_POS[p.pos] + 1; // pouca gente na posição: todo mundo conta
  return { value: Math.min(1, base + (promessa ? 0.3 : 0) + (thin ? 0.2 : 0)), promessa };
}

/**
 * O clube renova? Pesa importância, idade, qualidade e potencial; o salário pedido sobe com a importância e tem que caber na folha do porte.
 * Se não cabe, o clube oferece o que pode: se for pelo menos 85% do pedido o jogador aceita; senão ele sai. Nunca passa da folha máxima.
 */
export function decideRenewal(g: GameState, clubId: string, p: Player, prof: ClubProfile, ctx: ProfileCtx, payroll: number, forced = false): RenewalDecision {
  const { value: imp, promessa } = importanceOf(g, clubId, p, ctx);
  const level = ctx.xi.get(clubId) ?? avgXI(g.teams[clubId]);
  const cur = p.contract?.wage ?? baseWage(g, clubId, p);
  const fair = baseWage(g, clubId, { ...p, contract: undefined });
  const demand = Math.round((fair * (imp >= 1 ? 1.15 : imp >= 0.75 ? 1.05 : promessa ? 1.0 : 0.95)) / 1_000) * 1_000;
  const room = prof.revenue * WAGE_LIMIT[prof.tier] - (payroll - cur);   // quanto cabe para ESTE jogador sem estourar a folha
  const no = (reason: string): RenewalDecision => ({ renew: false, wage: 0, years: 0, reason, importance: imp });
  if (!forced) {
    if (p.age >= 36) return no('idade');
    if (imp <= 0) return no('excedente');
    if (imp < 0.5 && !promessa) return no('sem importância');
    if (p.age >= 31 && p.strength < level - 3 && imp < 0.8) return no('em queda');                // veterano abaixo do nível: não compensa
    if (demand > prof.revenue * 0.09 && imp < 0.85) return no('salário alto para o que rende'); // peso grande na folha por pouco retorno
    if (prof.financial === 'crise' && imp < 1) return no('contas em crise');
  }
  let wage = demand;
  if (wage > room) { wage = Math.floor(room / 1_000) * 1_000; if (wage < demand * 0.85 && !forced) return no('não cabe na folha'); }
  if (wage < Math.max(6_000, fair * 0.7)) { if (!forced) return no('não cabe na folha'); wage = Math.max(6_000, Math.round((fair * 0.8) / 1_000) * 1_000); }
  const years = p.age >= 33 ? 1 : p.age >= 29 ? Math.min(2, contractYears(p)) : promessa ? 4 : contractYears(p);
  return { renew: true, wage, years, reason: imp >= 1 ? 'peça fundamental' : promessa ? 'promessa' : 'importante para o elenco', importance: imp };
}

/**
 * Rotina de renovações dos clubes da IA.
 *  - 'meio': jogadores em ÚLTIMO ano de contrato (vence ao fim desta temporada): renova cedo quem é importante.
 *  - 'virada': contratos que acabaram: renova quem vale a pena e libera os outros (viram jogadores livres).
 */
export function aiRenewals(g: GameState, _rng: Rng, mode: 'meio' | 'virada', lastSeason = g.season): GameState {
  let s = ensureAiContracts(g, lastSeason);
  const ctx = profileCtx(s);
  const onLoan = loanedIds(s);
  const free: Player[] = [...(s.freeAgents ?? [])];
  const teams = { ...s.teams };
  let notable = 0;
  for (const id of Object.keys(teams)) {
    if (!isAi(s, id)) continue;
    let team = teams[id];
    const expiring = team.players.filter((p) => !onLoan.has(p.id) && p.contract && (mode === 'meio' ? p.contract.until === s.season : p.contract.until <= lastSeason));
    if (!expiring.length) continue;
    const prof = clubProfile({ ...s, teams }, id, ctx);
    let payroll = team.players.reduce((t, p) => t + (p.contract?.wage ?? baseWage(s, id, p)), 0);
    // mais importantes primeiro: se a folha apertar, eles têm prioridade
    const order = [...expiring].sort((a, b) => importanceOf(s, id, b, ctx).value - importanceOf(s, id, a, ctx).value || b.strength - a.strength);
    for (const p of order) {
      const cur = team.players.find((x) => x.id === p.id);
      if (!cur) continue;
      const rosterWithout = team.players.filter((x) => x.id !== p.id);
      const forced = mode === 'virada' && !rosterOk(rosterWithout); // sem ele o elenco ficaria inválido: renova mesmo assim (com salário ajustado)
      const d = decideRenewal(s, id, cur, prof, ctx, payroll, forced);
      if (d.renew) {
        const until = mode === 'meio' ? s.season + d.years : s.season + d.years - 1; // na virada, a temporada nova já é a 1ª do contrato
        team = { ...team, players: team.players.map((x) => (x.id === p.id ? { ...x, contract: { wage: d.wage, until } } : x)) };
        payroll += d.wage - (cur.contract?.wage ?? d.wage);
        if (notable < 5 && d.importance >= 1 && p.strength >= 70) { notable++; s = news(s, `✍️ ${s.clubs[id].name} renova com ${p.name} (overall ${p.strength}) por ${d.years} ${d.years === 1 ? 'ano' : 'anos'}.`, 'info'); }
      } else if (mode === 'virada') {
        team = { ...team, players: rosterWithout, lineup: team.lineup.filter((x) => x !== p.id) };
        payroll -= cur.contract?.wage ?? 0;
        free.push({ ...p, contract: undefined });
        if (notable < 5 && p.strength >= 72) { notable++; s = news(s, `🆓 ${p.name} (overall ${p.strength}) deixa o ${s.clubs[id].name} ao fim do contrato e fica livre no mercado.`, 'info'); }
      }
    }
    teams[id] = team;
  }
  const freeAgents = free.sort((a, b) => b.strength - a.strength).slice(0, MAX_FREE_AGENTS);
  // quem ficou sem lineup completo recebe escalação nova na rotina do jogo (repairLineup/autoLineup), aqui só mantemos o elenco coerente
  return { ...s, teams, freeAgents };
}

/** Jogadores livres envelhecem e evoluem a cada virada; quem passa dos 33 anos ou fica sem nível profissional (sem clube) encerra a carreira. */
export function agedFreeAgents(g: GameState, rng: Rng): Player[] {
  return (g.freeAgents ?? []).map((p) => developPlayer(p, rng)).filter((p) => p.age < 34 && !(p.age >= 24 && p.strength < 40)).sort((a, b) => b.strength - a.strength).slice(0, MAX_FREE_AGENTS);
}

/** Folga de folha do clube (R$/ano) para contratar. */
export const wageRoomOf = (g: GameState, clubId: string, prof: ClubProfile, boost = 1) => prof.revenue * WAGE_LIMIT[prof.tier] * boost - payrollOf(g, clubId);

/**
 * Clubes da IA contratam jogadores livres (sem pagar transferência) onde há necessidade real, se o salário cabe na folha.
 * Cada clube leva no máximo `perClub` livres por rodada de contratação; o livre que ninguém quis continua no mercado.
 */
export function aiSignFreeAgents(g: GameState, rng: Rng, perClub = 2): GameState {
  if (!(g.freeAgents ?? []).length) return g;
  let s = g;
  const ctx = profileCtx(s);
  const ids = Object.keys(s.teams).filter((id) => isAi(s, id)).sort(() => rng() - 0.5);
  let signed = 0;
  for (const id of ids) {
    for (let k = 0; k < perClub; k++) {
      const pool = s.freeAgents ?? [];
      if (!pool.length || s.teams[id].players.length >= AI_MAX_SQUAD) break;
      const prof = clubProfile(s, id, ctx);
      const needs = squadNeeds(s, id, prof, { divisionLevel: ctx.divAvg.get(divisionIndexOfSafe(s, id)) });
      if (!needs.length) break;
      const room = wageRoomOf(s, id, prof);
      const mode = goalStatus(s, id).mode;
      const level = ctx.xi.get(id) ?? avgXI(s.teams[id]);
      let pick: { p: Player; score: number } | null = null;
      for (const need of needs) {
        for (const p of pool) {
          if (p.pos !== need.pos || (need.spot && spotOf(p) !== need.spot) || p.strength < need.minStrength || p.age > need.maxAge || p.age >= RETIRING_AGE) continue;
          if (p.strength > level + 12 || longInjured(s, p.id)) continue;
          const c = newContract(s, id, p, 1);
          if (c.wage > room) continue; // salário impossível para o orçamento: não contrata
          let score = signingScore(prof, Math.max(1, p.strength - need.minStrength), 0, p.age);
          if (mode === 'sobrevivencia' && p.age >= 26 && p.age <= 33) score *= 1.3; // fugindo do rebaixamento: experiência
          else if (mode === 'disputa') score += Math.max(0, p.strength - need.minStrength) * 0.6; // disputando algo: melhora imediata
          if (!pick || score > pick.score) pick = { p, score };
        }
        if (pick) break;
      }
      if (!pick) break;
      const p = pick.p;
      const t = s.teams[id];
      const players = [...t.players, { ...p, contract: newContract(s, id, p, 1) }];
      s = { ...s, teams: { ...s.teams, [id]: { ...t, players, lineup: autoLineup(players, t.formation) } }, freeAgents: pool.filter((x) => x.id !== p.id) };
      forgetClub(ctx, id);
      signed++;
      if (signed <= 4 && p.strength >= 68) s = news(s, `🆓 ${s.clubs[id].name} contrata o jogador livre ${p.name} (overall ${p.strength}).`, 'info');
    }
  }
  return s;
}
const divisionIndexOfSafe = (g: GameState, id: string) => divisionIndexOf(g, id);
