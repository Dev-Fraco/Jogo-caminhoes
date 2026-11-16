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
import { repairLineup } from './roster';
import { autoLineup } from './squad';
import { noteMove } from './dealeval';
import type { GameState, LoanDeal, LoanRecord, NewsItem, Player, Transfer } from './types';

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
  const r = completeLoanPurchase(g, loan, loan.buyOption, 'opção');
  return r.ok ? { ...r, state: logLoan(r.state, loan, 'comprado-opcao', `Opção de compra exercida por ${fmt(loan.buyOption)}.`) } : r;
}

/** Decide e executa a compra de um empréstimo que acabou (obrigação cumprida ou opção exercida pela IA). Devolve o estado e se houve compra. */
function settleOne(g: GameState, loan: LoanDeal): { state: GameState; bought: boolean } {
  let s = g;
  if (loan.buyObligation && loan.obligationGames !== undefined && loan.apps >= loan.obligationGames) {
    const r = completeLoanPurchase(s, loan, loan.buyObligation, 'obrigação');
    if (r.ok) return { state: logLoan(r.state, loan, 'comprado-obrigacao', `Obrigação de compra cumprida (${loan.apps} jogos): ${fmt(loan.buyObligation)}.`), bought: true };
  }
  if (loan.buyOption && !userIs(s, loan.hostId)) {
    const l = locate(s, loan.playerId);
    if (l && l.clubId === loan.hostId) {
      const host = s.teams[loan.hostId];
      const important = l.player.strength >= avgXI(host) - 2 && loan.apps >= 8;       // joga e rende no clube
      const room = host.players.length < AI_MAX_SQUAD + 2;
      const want = important && room && marketValue(s, loan.hostId, l.player) * 1.4 >= loan.buyOption && clubProfile(s, loan.hostId).financial !== 'crise' && hashString(`${loan.dealId}:opcao`) % 100 < 70;
      if (want) { const r = completeLoanPurchase(s, loan, loan.buyOption, 'opção'); if (r.ok) return { state: logLoan(r.state, loan, 'comprado-opcao', `Opção de compra exercida por ${fmt(loan.buyOption)}.`), bought: true }; }
    }
  }
  return { state: s, bought: false };
}

/** Registra o empréstimo no histórico (os encerrados ficam guardados). */
function logLoan(g: GameState, loan: LoanDeal, outcome: LoanRecord['outcome'], note: string): GameState {
  const p = locate(g, loan.playerId)?.player;
  const rec: LoanRecord = { dealId: loan.dealId, playerId: loan.playerId, playerName: p?.name ?? loan.playerId, originId: loan.originId, hostId: loan.hostId, season: loan.season, fromDay: loan.fromDay, endDay: calOf(g).day, apps: loan.apps, strengthFrom: loan.startStrength ?? p?.strength ?? 0, strengthTo: p?.strength ?? 0, outcome, reason: loan.reason, note };
  return { ...g, loanLog: [rec, ...(g.loanLog ?? [])].slice(0, 300) };
}

/** Acompanhamento do jogador emprestado: jogos, evolução do overall e lesões (gols e assistências não são registrados pelo jogo). */
export function loanReport(g: GameState, loan: LoanDeal) {
  const p = locate(g, loan.playerId)?.player;
  const evolution = p ? p.strength - (loan.startStrength ?? p.strength) : 0;
  const injured = !!g.injuries?.[loan.playerId];
  const positive = loan.apps >= 10 || evolution >= 2;
  return { player: p, apps: loan.apps, evolution, injured, positive, status: loan.apps >= 10 ? 'titular' : loan.apps >= 3 ? 'utilizado' : 'pouco aproveitado' };
}

/**
 * Devolve o jogador ao clube de origem: sai do elenco que o recebeu, volta com o contrato original, as listas e o registro são encerrados e o histórico
 * guarda o resultado. O clube de origem (IA) reavalia: bom empréstimo reintegra; sem evolução e sem espaço, o jogador vai para a lista de venda.
 */
function returnLoan(g: GameState, loan: LoanDeal): GameState {
  const l = locate(g, loan.playerId);
  const origin = g.teams[loan.originId];
  let s = g;
  const rep = loanReport(g, loan);
  if (l && l.clubId === loan.hostId && origin) {
    const host = g.teams[loan.hostId];
    const back: Player = l.player.contract !== undefined || loan.origContract ? { ...l.player, contract: loan.origContract } : l.player;
    if (!loan.origContract) delete (back as { contract?: unknown }).contract;
    const hostLeft = host.players.filter((p) => p.id !== loan.playerId);
    const originPlayers = [...origin.players, back];
    s = { ...s, teams: { ...s.teams,
      [loan.hostId]: userIs(g, loan.hostId) ? repairLineup({ ...host, players: hostLeft }) : { ...host, players: hostLeft, lineup: autoLineup(hostLeft, host.formation) },
      [loan.originId]: userIs(g, loan.originId) ? repairLineup({ ...origin, players: originPlayers }) : { ...origin, players: originPlayers, lineup: autoLineup(originPlayers, origin.formation) } } };
    noteMove(loan.playerId, loan.originId);
  } else if (l && l.clubId === loan.originId && origin) { // já voltou pela devolução antiga (lista): só falta restaurar o contrato de origem
    const fixed = origin.players.map((p) => { if (p.id !== loan.playerId) return p; if (loan.origContract) return { ...p, contract: loan.origContract }; const { contract: _c, ...rest } = p; return rest; });
    s = { ...s, teams: { ...s.teams, [loan.originId]: { ...origin, players: fixed } } };
  }
  s = dropLoanLists(s, loan.playerId);
  s = { ...s, loanDeals: (s.loanDeals ?? []).map((x) => (x.dealId === loan.dealId ? { ...x, closed: true } : x)) };
  s = logLoan(s, loan, 'devolvido', `${rep.status}: ${loan.apps} jogos como titular, overall ${(loan.startStrength ?? 0)} → ${rep.player?.strength ?? '?'}${rep.injured ? ', lesionado' : ''}.`);
  // reavaliação do clube de origem (IA)
  if (!userIs(g, loan.originId) && rep.player) {
    const p = rep.player;
    const level = avgXI(s.teams[loan.originId]);
    if (!rep.positive && p.age >= 23 && p.strength < level - 4 && !s.listed?.[p.id]) s = { ...s, listed: { ...(s.listed ?? {}), [p.id]: { clubId: loan.originId, day: calOf(s).day, reason: 'sem evolução no empréstimo' } } };
  }
  if (userIs(g, loan.originId) || userIs(g, loan.hostId)) s = notifyPhone(news(s, `🔙 Fim do empréstimo: ${rep.player?.name ?? 'jogador'} volta ao ${g.clubs[loan.originId]?.name} (${loan.apps} jogos, overall ${loan.startStrength ?? '?'} → ${rep.player?.strength ?? '?'}).`), 'noticias', `Fim do empréstimo de ${rep.player?.name ?? 'jogador'}.`);
  else if (rep.player && rep.positive && rep.evolution >= 4) s = news(s, `📈 ${rep.player.name} evoluiu ${rep.evolution} pontos de overall emprestado ao ${g.clubs[loan.hostId]?.name} e volta ao ${g.clubs[loan.originId]?.name}.`);
  return s;
}

/**
 * Todo dia: os empréstimos que passaram da data de encerramento terminam sozinhos. Antes de devolver, a obrigação de compra (cumprida pelas partidas) e a
 * opção (exercida pela IA, quando faz sentido) são resolvidas. Um empréstimo só termina aqui: ninguém o interrompe antes do prazo combinado.
 */
export function endLoans(g: GameState): GameState {
  const day = calOf(g).day;
  const due = (g.loanDeals ?? []).filter((l) => !l.closed && l.untilDay < day);
  if (!due.length) return g;
  let s = g;
  for (const l0 of due) {
    const loan = (s.loanDeals ?? []).find((x) => x.dealId === l0.dealId);
    if (!loan || loan.closed) continue;               // não reprocessa empréstimo já encerrado
    const r = settleOne(s, loan);
    s = r.bought ? r.state : returnLoan(r.state, loan);
  }
  return s;
}

/** Virada de temporada (reserva): resolve compras pendentes dos empréstimos que ainda estiverem ativos. */
export function settleLoanPurchases(g: GameState): GameState {
  let s = g;
  for (const loan of activeLoanDeals(g)) {
    const cur = (s.loanDeals ?? []).find((x) => x.dealId === loan.dealId);
    if (!cur || cur.closed) continue;
    const r = settleOne(s, cur);
    if (r.bought) s = r.state;
  }
  return s;
}

/** Depois da devolução física (reserva, na virada): os empréstimos que sobraram voltam ao contrato de origem e fecham; os encerrados ficam no histórico. */
export function finishLoans(g: GameState): GameState {
  const list = g.loanDeals;
  if (!list?.some((l) => !l.closed)) return list && list.length > 60 ? { ...g, loanDeals: list.slice(-60) } : g;
  let s = g;
  for (const l of list.filter((x) => !x.closed)) s = returnLoan(s, l);
  const rest = s.loanDeals ?? [];
  return { ...s, loanDeals: rest.filter((l) => !l.closed).concat(rest.filter((l) => l.closed).slice(-60)) };
}
