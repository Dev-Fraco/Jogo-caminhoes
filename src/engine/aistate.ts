import { ensureAiCoaches } from './aicoaches';
import { ensureAiContracts } from './aicontracts';
import { freezeGoals } from './aigoals';
import { ensureAiYouth } from './aiyouth';
import { seasonEndDay } from './aitrade';
import { homeLeague } from './homeleague';
import { ensurePotentials } from './potential';
import { calOf } from './calendar';
import { windowInfo } from './windows';
import { makeRng } from './rng';
import type { Deal, GameState, Player } from './types';

/**
 * Compatibilidade de saves: completa o que a IA precisa (contratos, treinadores, base, objetivos) em carreiras criadas antes desses
 * sistemas, sem mexer no que já existe (elencos, caixa, histórico e o seu clube ficam como estão). Idempotente e determinística:
 * a mesma carreira sempre gera o mesmo resultado, então abrir o save várias vezes não cria decisões novas.
 */
export function ensureAiState(g: GameState): GameState {
  let s = g;
  s = dedupePlayers(s);
  s = ensureAiContracts(s);
  s = ensureAiCoaches(s);
  s = s.aiYouth ? s : ensureAiYouth(s, makeRng(s.seed * 67 + s.season * 11 + 3));
  s = freezeGoals(s);
  s = ensureMarketState(s);
  s = ensureYouthLoanState(s);
  return s;
}

/**
 * Empréstimos, base e contratos em carreiras antigas: dá potencial a quem tem até 25 anos, registra o clube formador dos garotos da base,
 * completa os empréstimos em andamento (overall de partida) e inicia a contagem de partidas. Não muda overall, contrato, elenco nem caixa. Idempotente.
 */
export function ensureYouthLoanState(g: GameState): GameState {
  let s = ensurePotentials(g);
  if (s.aiYouth) {
    let changed = false;
    const youth: NonNullable<GameState['aiYouth']> = {};
    for (const [id, list] of Object.entries(s.aiYouth)) youth[id] = list.map((p) => (p.formedAt ? p : ((changed = true), { ...p, formedAt: id, formedSeason: s.season, nat: p.nat ?? homeLeague(s).countryId })));
    if (changed) s = { ...s, aiYouth: youth };
  }
  if (s.loanDeals?.some((l) => !l.closed && l.startStrength === undefined)) {
    s = { ...s, loanDeals: s.loanDeals.map((l) => (l.startStrength === undefined && !l.closed ? { ...l, startStrength: s.teams[l.hostId]?.players.find((p) => p.id === l.playerId)?.strength } : l)) };
  }
  if (!s.apps) s = { ...s, apps: {} };
  return s;
}

/**
 * Mercado avançado em carreiras antigas: registra a situação atual da janela (sem avisos), e converte as propostas simples antigas
 * (`offers`) em negociações oficiais, mantendo valor, jogador e clube. Idempotente.
 */
export function ensureMarketState(g: GameState): GameState {
  let s = g;
  if (!s.windowState) s = { ...s, windowState: { id: windowInfo(s).window?.id ?? null } };
  if (s.offers?.length) {
    const day = calOf(s).day;
    const deals: Deal[] = [];
    if (!s.unemployed) for (const o of s.offers) {
      const p = s.teams[s.userClubId]?.players.find((x) => x.id === o.playerId);
      if (!p || !s.teams[o.clubId]) continue;
      deals.push({
        id: `legacy:${o.id}`, kind: o.kind === 'buy' ? 'compra' : 'emprestimo', playerId: o.playerId, sellerId: s.userClubId, buyerId: o.clubId,
        terms: { fee: o.fee, ...(o.kind === 'loan' ? { loan: { untilDay: seasonEndDay(s), originWagePct: 0, fee: o.fee } } : {}) },
        state: 'recebida', turn: 'vendedor', createdDay: day, deadlineDay: day + 7, round: 0, answerDay: day,
        history: [{ day, by: 'comprador', action: 'proposta', fee: o.fee, note: `${s.clubs[o.clubId].name} propõe ${o.fee.toLocaleString('pt-BR')} por ${p.name} (proposta de antes da atualização).` }],
      });
    }
    s = { ...s, offers: [], deals: [...(s.deals ?? []), ...deals.filter((d) => !(s.deals ?? []).some((x) => x.id === d.id))] };
  }
  return s;
}

/** Garante que nenhum jogador esteja em dois lugares (clubes, livres ou base): fica no primeiro clube e as cópias saem. Nada é apagado de saves íntegros. */
export function dedupePlayers(g: GameState): GameState {
  const seen = new Set<string>();
  let changed = false;
  const teams = { ...g.teams };
  for (const [id, t] of Object.entries(g.teams)) {
    const players = t.players.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    if (players.length !== t.players.length) { teams[id] = { ...t, players, lineup: t.lineup.filter((x) => players.some((p) => p.id === x)) }; changed = true; }
  }
  let freeAgents = g.freeAgents;
  if (freeAgents) { const f = freeAgents.filter((p: Player) => (seen.has(p.id) ? false : (seen.add(p.id), true))); if (f.length !== freeAgents.length) { freeAgents = f; changed = true; } }
  return changed ? { ...g, teams, freeAgents } : g;
}
