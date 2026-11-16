import { clubProfile } from './aiprofile';
import { freeAgentLimit, mayBeFree } from './freeagents';
import { agentOf, listedPlayers } from './aimarket';
import { seasonEndDay } from './aitrade';
import { marketValue } from './aisales';
import { advanceDeal, openDeal, userAccept, userCancel, userCounter, userRefuse, type OpenResult } from './deals';
import { calOf } from './calendar';
import { defaultContract, locate } from './dealeval';
import { makeInstallments } from './dealpay';
import { baseWage } from './finance';
import { divisionIndexOf, playerValue } from './transfers';
import { inflate } from './economy';
import type { DealClause, GameState, LoanTerms, Player } from './types';

/* API do usuário para o mercado avançado (a interface só chama estas funções). */

export { userAccept, userCancel, userCounter, userRefuse };

export interface BuyOptions {
  fee: number;
  /** Número de parcelas (1 = à vista) e % de entrada. */
  installments?: number; firstPct?: number; spacing?: number;
  /** Jogadores seus oferecidos em troca (o `fee` é o dinheiro além deles). */
  swapIds?: string[];
  clauses?: DealClause[];
  wage?: number; years?: number;
}

/** Faz uma proposta de compra (ou troca, se houver jogadores na troca) por um jogador de outro clube. */
export function proposeBuy(g: GameState, playerId: string, o: BuyOptions): OpenResult {
  if (g.unemployed) return { state: g, error: 'Você está sem clube.' };
  const day = calOf(g).day;
  const fee = Math.max(0, Math.round(o.fee));
  const o2 = openDeal(g, {
    kind: o.swapIds?.length ? 'troca' : 'compra', playerId, buyerId: g.userClubId,
    terms: { fee, installments: o.installments && o.installments > 1 ? makeInstallments(fee, o.installments, day, o.firstPct ?? 0.4, o.spacing ?? 90) : undefined, swapPlayerIds: o.swapIds, clauses: o.clauses, wage: o.wage, years: o.years },
    reason: 'proposta do treinador',
  });
  return o2.deal ? { ...o2, state: advanceDeal(o2.state, o2.deal.id) } : o2;
}

export interface LoanOptions { fee: number; originWagePct?: number; buyOption?: number; buyObligation?: number; obligationGames?: number }
/** Pede um jogador emprestado até o fim da temporada (com divisão salarial, opção ou obrigação de compra). */
export function proposeLoan(g: GameState, playerId: string, o: LoanOptions): OpenResult {
  if (g.unemployed) return { state: g, error: 'Você está sem clube.' };
  const loan: LoanTerms = { untilDay: seasonEndDay(g), originWagePct: o.originWagePct ?? 0, fee: Math.round(o.fee), buyOption: o.buyOption, buyObligation: o.buyObligation, obligationGames: o.obligationGames };
  const r = openDeal(g, { kind: 'emprestimo', playerId, buyerId: g.userClubId, terms: { fee: Math.round(o.fee), loan }, reason: 'empréstimo pedido pelo treinador' });
  return r.deal ? { ...r, state: advanceDeal(r.state, r.deal.id) } : r;
}

/** Contrata um jogador livre. O jogador avalia o salário e o clube (pode recusar ou pedir mais). */
export function proposeFree(g: GameState, playerId: string, o: { wage?: number; years?: number } = {}): OpenResult {
  if (g.unemployed) return { state: g, error: 'Você está sem clube.' };
  const r = openDeal(g, { kind: 'livre', playerId, buyerId: g.userClubId, terms: { fee: 0, wage: o.wage, years: o.years }, reason: 'jogador livre' });
  return r.deal ? { ...r, state: advanceDeal(r.state, r.deal.id) } : r;
}

/* ---------- consultas para as telas ---------- */

/** Valor de mercado do jogador (R$) onde ele joga agora. */
export function valueOf(g: GameState, playerId: string): number {
  const l = locate(g, playerId);
  if (!l) return 0;
  return l.clubId ? marketValue(g, l.clubId, l.player) : inflate(g, playerValue(l.player, divisionIndexOf(g, g.userClubId)));
}

/** Salário que um jogador livre pede ao seu clube (R$/ano). */
export const wageAsk = (g: GameState, p: Player) => defaultContract(g, g.userClubId, p).wage;

/** Maior overall que o seu clube pode contratar entre os livres. */
export const freeLimitOf = (g: GameState) => freeAgentLimit(g, g.userClubId);
export interface FreeRow { player: Player; ask: number; agent: string; lastClub?: string }
/** Jogadores livres do mercado, com salário pedido, agente e último clube. */
export function freeList(g: GameState): FreeRow[] {
  const cap = freeAgentLimit(g, g.userClubId);
  return [...(g.freeAgents ?? [])].filter((p) => mayBeFree(p) && p.strength <= cap).sort((a, b) => b.strength - a.strength).map((player) => ({ player, ask: wageAsk(g, player), agent: agentOf(player.id).name, lastClub: player.lastClubId ? g.clubs[player.lastClubId]?.name : undefined }));
}

export interface ListedRow { player: Player; clubId: string; reason: string; value: number; since: number }
/** Jogadores que os clubes colocaram oficialmente à venda. */
export const officialList = (g: GameState): ListedRow[] => listedPlayers(g).filter((x) => x.clubId !== g.userClubId).map((x) => ({ player: x.player, clubId: x.clubId, reason: x.reason, value: marketValue(g, x.clubId, x.player), since: x.day })).sort((a, b) => b.player.strength - a.player.strength);

/** Jogadores de outros clubes que podem ser abordados (fora da lista oficial): preço pedido mais alto. */
export const approachable = (g: GameState, clubId: string) => (g.teams[clubId]?.players ?? []).filter((p) => !g.listed?.[p.id]);

/** Jogador emprestado ao seu clube com opção/obrigação de compra (para a tela de empréstimos). */
export const myLoanDeals = (g: GameState) => (g.loanDeals ?? []).filter((l) => !l.closed && !g.unemployed && (l.hostId === g.userClubId || l.originId === g.userClubId));
export const clubReputation = (g: GameState, id: string) => clubProfile(g, id).label;
export { baseWage };

/* ---------- pedidos dos jogadores ---------- */

/** Pedidos de jogadores do seu clube (quer sair / pede aumento), do mais urgente para o menos. */
export const myRequests = (g: GameState) => Object.entries(g.mood ?? {}).flatMap(([pid, m]) => { const p = g.teams[g.userClubId]?.players.find((x) => x.id === pid); return p && !g.unemployed ? [{ player: p, mood: m }] : []; }).sort((a, b) => b.mood.level - a.mood.level);

/**
 * Responde a um pedido: 'listar' coloca o jogador na lista de transferência; 'conceder' dá o aumento pelo sistema de renovação existente;
 * 'ignorar' deixa o jogador esperando (o descontentamento cresce, e depois de um tempo ele é colocado à venda).
 */
export function answerRequest(g: GameState, playerId: string, action: 'conceder' | 'listar' | 'ignorar'): { state: GameState; ok: boolean; text: string } {
  const m = g.mood?.[playerId];
  const p = g.teams[g.userClubId]?.players.find((x) => x.id === playerId);
  if (!m || !p) return { state: g, ok: false, text: 'Pedido não encontrado.' };
  const rest = (() => { const { [playerId]: _x, ...r } = g.mood!; return r; })();
  if (action === 'listar') return { state: { ...g, mood: rest, transferList: g.transferList.includes(playerId) ? g.transferList : [...g.transferList, playerId] }, ok: true, text: `${p.name} foi colocado na lista de transferência.` };
  if (action === 'ignorar') {
    const day = calOf(g).day;
    return { state: { ...g, mood: { ...g.mood!, [playerId]: { ...m, level: Math.min(3, m.level + 1) as 1 | 2 | 3, cooldown: day + 45 } } }, ok: true, text: `${p.name} continua insatisfeito.` };
  }
  const q = renewalQuote(g, playerId);
  if (!q) return { state: g, ok: false, text: 'Renovação indisponível.' };
  const r = renew(g, playerId, q.wageDemand, Math.min(q.yearsMax, Math.max(q.yearsMin, 3)));
  if (!r.ok) return { state: g, ok: false, text: r.text };
  const { [playerId]: _y, ...left } = r.state.mood ?? {};
  return { state: { ...r.state, mood: left }, ok: true, text: r.text };
}
import { renew, renewalQuote } from './market';
