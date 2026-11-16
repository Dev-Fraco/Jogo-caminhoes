import { AI_MAX_SQUAD } from './ai';
import { avgXI, clubProfile } from './aiprofile';
import { marketValue } from './aisales';
import { calOf } from './calendar';
import { canAfford, payResaleClauses } from './dealpay';
import { defaultContract, fmt, locate, wageFits } from './dealeval';
import { hashString } from './rng';
import { notifyPhone } from './phone';
import { afterSigning } from './fairplay';
import { transferBlock } from './windows';
import type { GameState, LoanDeal, NewsItem, Player, Transfer } from './types';

/* =====================================================================
   Ciclo de vida dos empréstimos negociados: opção de compra (quem recebeu decide), obrigação de compra (cumprida por partidas) e devolução
   com o contrato de origem restaurado. Os empréstimos vivem nas listas existentes (`loans`, `loansIn`, `aiLoans`) para a devolução física
   continuar igual; aqui ficam as condições e a compra.
   ===================================================================== */

const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const userIs = (g: GameState, id: string) => !g.unemployed && id === g.userClubId;

export const activeLoanDeals = (g: GameState) => (g.loanDeals ?? []).filter((l) => !l.closed);
export const loanDealOf = (g: GameState, playerId: string) => activeLoanDeals(g).find((l) => l.playerId === playerId);

/** Depois de cada rodada: conta partida como titular dos emprestados no clube que os recebeu. */
export function trackLoanApps(g: GameState, started: Set<string>): GameState {
  const list = g.loanDeals;
  if (!list?.some((l) => !l.closed && started.has(l.playerId))) return g;
  return { ...g, loanDeals: list.map((l) => (!l.closed && started.has(l.playerId) && g.teams[l.hostId]?.players.some((p) => p.id === l.playerId) ? { ...l, apps: l.apps + 1 } : l)) };
}

/** Tira o empréstimo das listas de devolução (a compra o torna permanente). */
function dropLoanLists(g: GameState, playerId: string): GameState {
  return { ...g, loans: g.loans.filter((l) => l.playerId !== playerId), loansIn: (g.loansIn ?? []).filter((l) => l.playerId !== playerId), aiLoans: (g.aiLoans ?? []).filter((l) => l.playerId !== playerId) };
}

export type PurchaseResult = { state: GameState; ok: boolean; reason?: string };

/** O clube que recebeu compra o jogador pelo valor combinado (opção ou obrigação). O jogador continua onde está, agora com contrato do comprador. */
export function completeLoanPurchase(g: GameState, loan: LoanDeal, price: number, why: 'opção' | 'obrigação'): PurchaseResult {
  const l = locate(g, loan.playerId);
  if (!l || l.clubId !== loan.hostId) return { state: g, ok: false, reason: 'O jogador não está mais no clube que o recebeu.' };
  if (!canAfford(g, loan.hostId, price, 0)) return { state: g, ok: false, reason: 'O clube não tem caixa para a compra.' };
  const contract = defaultContract(g, loan.hostId, l.player);
  if (!userIs(g, loan.hostId) && !wageFits(g, loan.hostId, contract.wage * 0.7)) return { state: g, ok: false, reason: 'O salário não cabe na folha do clube.' };
  const day = calOf(g).day;
  const bought: Player = { ...l.player, contract: { wage: contract.wage, until: g.season + contract.years - 1 } };
  const host = g.teams[loan.hostId];
  let s: GameState = dropLoanLists(g, loan.playerId);
  s = { ...s, teams: { ...s.teams, [loan.hostId]: { ...host, players: host.players.map((p) => (p.id === bought.id ? bought : p)) } },
    budgets: { ...s.budgets, [loan.hostId]: (s.budgets[loan.hostId] ?? 0) - price, [loan.originId]: (s.budgets[loan.originId] ?? 0) + price },
    loanDeals: (s.loanDeals ?? []).map((x) => (x.dealId === loan.dealId ? { ...x, closed: true } : x)) };
  s = payResaleClauses(s, loan.playerId, loan.originId, price);
  const rec: Transfer = { kind: 'buy', season: s.season, round: s.round, playerId: bought.id, playerName: bought.name, pos: bought.pos, strength: bought.strength, fromClubId: loan.originId, toClubId: loan.hostId, fee: price };
  if (userIs(g, loan.hostId) || userIs(g, loan.originId)) s = { ...s, transfers: [...s.transfers, userIs(g, loan.hostId) ? rec : { ...rec, kind: 'sale' }] };
  const text = `✍️ ${s.clubs[loan.hostId].name} ${why === 'opção' ? 'exerce a opção de compra' : 'cumpre a obrigação de compra'} de ${bought.name} por ${fmt(price)} (empréstimo do ${s.clubs[loan.originId].name}).`;
  s = userIs(g, loan.hostId) || userIs(g, loan.originId) ? notifyPhone(news(s, text, 'good'), 'noticias', text.replace(/^\S+\s/, '')) : bought.strength >= 68 || price >= 3_000_000 ? news(s, text) : s;
  s = { ...s, dealLog: [{ id: `${loan.dealId}:compra:${day}`, kind: 'compra' as const, playerId: bought.id, playerName: bought.name, sellerId: loan.originId, buyerId: loan.hostId, fee: price, state: 'concluida' as const, day, summary: text }, ...(s.dealLog ?? [])].slice(0, 300) };
  if (userIs(g, loan.hostId)) s = afterSigning(s);
  return { state: s, ok: true };
}

/** Você (como clube que recebeu) exerce a opção de compra de um jogador emprestado. */
export function exerciseBuyOption(g: GameState, playerId: string): PurchaseResult {
  const loan = loanDealOf(g, playerId);
  if (!loan || !userIs(g, loan.hostId)) return { state: g, ok: false, reason: 'Não há opção de compra para este jogador.' };
  if (!loan.buyOption) return { state: g, ok: false, reason: 'O empréstimo não tem opção de compra.' };
  const closed = transferBlock(g, 'comum');
  if (closed) return { state: g, ok: false, reason: closed };
  return completeLoanPurchase(g, loan, loan.buyOption, 'opção');
}

/**
 * Antes da devolução, na virada de temporada: a obrigação de compra se cumpre (partidas combinadas) e os clubes da IA decidem
 * exercer (ou não) a opção, conforme a importância do jogador e o caixa. Quem não for comprado volta ao dono.
 */
export function settleLoanPurchases(g: GameState): GameState {
  let s = g;
  for (const loan of activeLoanDeals(g)) {
    const cur = (s.loanDeals ?? []).find((x) => x.dealId === loan.dealId);
    if (!cur || cur.closed) continue;
    if (cur.buyObligation && cur.obligationGames !== undefined && cur.apps >= cur.obligationGames) {
      const r = completeLoanPurchase(s, cur, cur.buyObligation, 'obrigação');
      if (r.ok) { s = r.state; continue; }
    }
    if (cur.buyOption && !userIs(s, cur.hostId)) {
      const l = locate(s, cur.playerId);
      if (!l || l.clubId !== cur.hostId) continue;
      const host = s.teams[cur.hostId];
      const level = avgXI(host);
      const important = l.player.strength >= level - 2 && cur.apps >= 8;       // joga e rende no clube
      const room = host.players.length < AI_MAX_SQUAD + 2;
      const want = important && room && marketValue(s, cur.hostId, l.player) * 1.4 >= cur.buyOption && clubProfile(s, cur.hostId).financial !== 'crise' && hashString(`${cur.dealId}:opcao`) % 100 < 70;
      if (want) { const r = completeLoanPurchase(s, cur, cur.buyOption, 'opção'); if (r.ok) s = r.state; }
    }
  }
  return s;
}

/** Depois da devolução física: o jogador volta ao contrato do clube de origem e o empréstimo é encerrado no registro. */
export function finishLoans(g: GameState): GameState {
  const list = g.loanDeals;
  if (!list?.some((l) => !l.closed)) return list && list.length > 60 ? { ...g, loanDeals: list.slice(-60) } : g;
  let s = g;
  const teams = { ...g.teams };
  const out = list.map((l) => {
    if (l.closed) return l;
    const origin = teams[l.originId];
    if (origin?.players.some((p) => p.id === l.playerId)) {
      teams[l.originId] = { ...origin, players: origin.players.map((p) => (p.id === l.playerId ? { ...p, contract: l.origContract } : p)) };
      if (!l.origContract) teams[l.originId].players = teams[l.originId].players.map((p) => { if (p.id !== l.playerId) return p; const { contract: _c, ...rest } = p; return rest; });
    }
    if (userIs(g, l.originId) || userIs(g, l.hostId)) s = news(s, `🔙 Fim do empréstimo: ${locate({ ...g, teams }, l.playerId)?.player.name ?? 'jogador'} volta ao ${g.clubs[l.originId]?.name}.`);
    return { ...l, closed: true };
  });
  return { ...s, teams, loanDeals: out.filter((l) => !l.closed).concat(out.filter((l) => l.closed).slice(-60)) };
}
