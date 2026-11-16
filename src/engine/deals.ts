import { profileCtx } from './aiprofile';
import { AI_MAX_SQUAD } from './ai';
import { activeDeals, buyerAnswer, defaultContract, fmt, isActive, locate, playerDecision, sellerAnswer, today, wageFits } from './dealeval';
import { canAfford, cashDue, clausesFor, debtsFor, installmentsOk, payResaleClauses, termsTotal } from './dealpay';
import { fairplayBlock, afterSigning } from './fairplay';
import { baseWage } from './finance';
import { marketValue } from './aisales';
import { managed } from './lookup';
import { notifyPhone } from './phone';
import { hashString } from './rng';
import { repairLineup, rosterOk } from './roster';
import { autoLineup } from './squad';
import { MAX_SQUAD } from './transfers';
import { transferBlock } from './windows';
import type { Deal, DealKind, DealRecord, DealState, DealStep, DealTerms, GameState, NewsItem, Player, Transfer } from './types';

/* =====================================================================
   Motor de negociações. Toda transferência (compra, troca, empréstimo, jogador livre) é uma PROPOSTA com estados, prazo e histórico de
   contrapropostas. Só se conclui quando o clube vendedor, o jogador e (se for a IA comprando) o comprador aprovam; a conclusão é atômica:
   valida tudo antes (jogador no clube certo, janela, dinheiro, elenco, duplicidade) e, se algo falhar, o estado anterior é preservado.
   ===================================================================== */

export const DEAL_LIFE = 7;          // dias para o outro lado responder
export const MAX_ROUNDS = 5;         // rodadas de contraproposta antes de encerrar sem acordo
export const AI_NEWS_PER_DAY = 8;    // notícias de negócios da IA por dia
export const MAX_DEAL_LOG = 300;     // histórico de negociações encerradas
const NEWS_CAP = 80;

const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, NEWS_CAP) });
const userIs = (g: GameState, id: string | null) => !g.unemployed && !!id && id === g.userClubId;
const aiIs = (g: GameState, id: string | null) => !!id && !managed(g, id);

const step = (g: GameState, by: DealStep['by'], action: string, note: string, fee?: number): DealStep => ({ day: today(g), by, action, note, ...(fee !== undefined ? { fee } : {}) });
const put = (g: GameState, d: Deal): GameState => ({ ...g, deals: (g.deals ?? []).map((x) => (x.id === d.id ? d : x)) });
const dealOf = (g: GameState, id: string) => (g.deals ?? []).find((d) => d.id === id);

/** Jogadores já comprometidos numa negociação aprovada (não podem entrar em outra). */
export function lockedPlayers(g: GameState, exceptDealId?: string): Set<string> {
  const out = new Set<string>();
  for (const d of g.deals ?? []) if (d.id !== exceptDealId && (d.state === 'aceita-clube' || d.state === 'aceita-jogador')) { out.add(d.playerId); for (const id of d.terms.swapPlayerIds ?? []) out.add(id); }
  return out;
}
const loanedNow = (g: GameState, pid: string) => g.loans.some((l) => l.playerId === pid) || (g.loansIn ?? []).some((l) => l.playerId === pid) || (g.aiLoans ?? []).some((l) => l.playerId === pid);

export interface OpenParams { kind: DealKind; playerId: string; buyerId: string; terms: Partial<DealTerms> & { fee: number }; reason?: string }
export type OpenResult = { state: GameState; deal?: Deal; error?: string };

/** Abre uma proposta oficial. Recusa duplicatas, janela fechada, jogador em outra negociação aprovada e jogador emprestado. */
export function openDeal(g: GameState, p: OpenParams): OpenResult {
  const l = locate(g, p.playerId);
  if (!l) return { state: g, error: 'Jogador não encontrado.' };
  const sellerId = l.clubId;
  if (p.kind === 'livre' ? sellerId !== null : sellerId === null) return { state: g, error: p.kind === 'livre' ? 'O jogador tem clube.' : 'O jogador está livre: use a contratação de jogador livre.' };
  if (sellerId === p.buyerId) return { state: g, error: 'O jogador já é do clube comprador.' };
  if (!g.teams[p.buyerId]) return { state: g, error: 'Clube comprador inválido.' };
  const closed = transferBlock(g, p.kind === 'livre' ? 'livre' : p.kind === 'emprestimo' ? 'emprestimo' : 'comum', { urgent: g.teams[p.buyerId].players.length < 18 });
  if (closed) return { state: g, error: closed };
  if (userIs(g, p.buyerId)) { const ban = fairplayBlock(g); if (ban) return { state: g, error: ban }; }
  if (activeDeals(g, p.playerId).some((d) => d.buyerId === p.buyerId && d.kind !== 'troca' && p.kind !== 'troca')) return { state: g, error: 'Já existe uma negociação em andamento por este jogador.' };
  if (lockedPlayers(g).has(p.playerId)) return { state: g, error: 'O jogador já está em uma negociação aprovada.' };
  if (loanedNow(g, p.playerId)) return { state: g, error: 'Jogador emprestado não pode ser negociado.' };
  const t: DealTerms = { ...p.terms, fee: Math.max(0, Math.round(p.terms.fee)) };
  if (!installmentsOk(t)) return { state: g, error: 'As parcelas não somam o valor negociado.' };
  for (const id of t.swapPlayerIds ?? []) {
    const sl = locate(g, id);
    if (!sl || sl.clubId !== p.buyerId) return { state: g, error: 'Um jogador da troca não pertence ao clube comprador.' };
    if (lockedPlayers(g).has(id) || loanedNow(g, id)) return { state: g, error: 'Um jogador da troca já está comprometido em outra negociação.' };
  }
  const day = today(g);
  const toUser = userIs(g, sellerId);
  const id = `${p.buyerId}:${p.playerId}:${p.kind}:${day}`;
  if ((g.deals ?? []).some((d) => d.id === id) || (g.dealLog ?? []).some((d) => d.id === id)) return { state: g, error: 'Esta proposta já foi feita hoje.' };
  const deal: Deal = {
    id, kind: p.kind, playerId: p.playerId, sellerId, buyerId: p.buyerId, terms: t,
    state: toUser ? 'recebida' : 'enviada', turn: sellerId === null ? 'jogador' : 'vendedor', createdDay: day, deadlineDay: day + DEAL_LIFE, round: 0, reason: p.reason,
    answerDay: userIs(g, p.buyerId) ? day + 1 + (hashString(id) % 2) : day,
    history: [step(g, 'comprador', 'proposta', `${g.clubs[p.buyerId].name} propõe ${fmt(t.fee)}${t.swapPlayerIds?.length ? ` + ${t.swapPlayerIds.length} jogador(es)` : ''}${t.installments ? ` em ${t.installments.length} parcelas` : ''} por ${l.player.name}.`, t.fee)],
  };
  let s: GameState = { ...g, deals: [...(g.deals ?? []), deal] };
  if (toUser) s = notifyPhone(news(s, `📨 ${g.clubs[p.buyerId].name} faz proposta por ${l.player.name}: ${fmt(t.fee)}${t.swapPlayerIds?.length ? ` + ${t.swapPlayerIds.length} jogador(es)` : ''}.`, 'info'), 'noticias', `${g.clubs[p.buyerId].name} quer ${p.kind === 'emprestimo' ? 'emprestar' : 'comprar'} ${l.player.name}.`);
  else if (userIs(g, p.buyerId)) s = news(s, `📤 Proposta enviada ao ${g.clubs[sellerId!]?.name ?? 'clube'} por ${l.player.name}: ${fmt(t.fee)}. Resposta em até ${deal.answerDay! - day || 1} dia(s).`, 'info');
  return { state: s, deal };
}

/* ---------- encerramento e arquivo ---------- */

function archive(g: GameState, d: Deal, state: DealState, note: string): GameState {
  const l = locate(g, d.playerId);
  const rec: DealRecord = { id: d.id, kind: d.kind, playerId: d.playerId, playerName: l?.player.name ?? d.history[0]?.note.split(' por ').pop()?.replace('.', '') ?? d.playerId, sellerId: d.sellerId, buyerId: d.buyerId, fee: d.terms.fee, state, day: today(g), summary: note };
  const notable = (l?.player.strength ?? 0) >= 66 || d.terms.fee >= 1_000_000 || userIs(g, d.buyerId) || userIs(g, d.sellerId);
  const log = notable || state === 'concluida' ? [rec, ...(g.dealLog ?? [])].slice(0, MAX_DEAL_LOG) : g.dealLog;
  return { ...g, deals: (g.deals ?? []).filter((x) => x.id !== d.id), dealLog: log };
}
function close(g: GameState, d: Deal, state: Exclude<DealState, 'concluida'>, note: string, by: DealStep['by'] = 'sistema'): GameState {
  const l = locate(g, d.playerId);
  let s = archive(g, { ...d, history: [...d.history, step(g, by, state, note)] }, state, note);
  const mine = userIs(g, d.buyerId) || userIs(g, d.sellerId);
  if (mine) s = notifyPhone(news(s, `${state === 'recusada' ? '❌' : state === 'expirada' ? '⌛' : '🚫'} ${note}`, state === 'recusada' ? 'bad' : 'info'), 'noticias', note);
  else if (state === 'recusada' && l && l.player.strength >= 74 && d.terms.fee >= 1_000_000) s = news(s, `🙅 ${note}`, 'info'); // clube recusa proposta por um destaque
  return s;
}

/* ---------- conclusão atômica ---------- */

export interface ExecResult { state: GameState; ok: boolean; reason?: string }

/**
 * Conclui a transferência: confere TUDO antes de mexer em qualquer coisa. Se algo falhar, devolve o estado original e o motivo.
 * Movimentos (jogador, dinheiro, parcelas, cláusulas, contrato, histórico) são aplicados juntos num único estado novo.
 */
export function executeDeal(g: GameState, dealId: string, opts: { force?: boolean } = {}): ExecResult {
  const d = dealOf(g, dealId);
  const fail = (reason: string): ExecResult => ({ state: g, ok: false, reason });
  if (!d) return fail('Negociação já encerrada ou inexistente.');
  if (d.state !== 'aceita-jogador') return fail('Faltam aprovações (clube ou jogador).');
  if ((g.dealLog ?? []).some((r) => r.id === d.id && r.state === 'concluida')) return fail('Negociação já concluída anteriormente.');
  const l = locate(g, d.playerId);
  if (!l || l.clubId !== d.sellerId) return fail('O jogador não pertence mais ao clube vendedor.');
  const buyer = g.teams[d.buyerId];
  if (!buyer) return fail('Clube comprador inválido.');
  const seller = d.sellerId ? g.teams[d.sellerId] : undefined;
  if (d.sellerId && !seller) return fail('Clube vendedor inválido.');
  if (!opts.force) {
    const closed = transferBlock(g, d.kind === 'livre' ? 'livre' : d.kind === 'emprestimo' ? 'emprestimo' : 'comum', { urgent: buyer.players.length < 18 });
    if (closed) return fail(closed);
  }
  if (userIs(g, d.buyerId)) { const ban = fairplayBlock(g); if (ban) return fail(ban); }
  if (lockedPlayers(g, d.id).has(d.playerId)) return fail('O jogador está em outra negociação aprovada.');
  if (loanedNow(g, d.playerId)) return fail('Jogador emprestado.');
  const t = d.terms;
  if (!installmentsOk(t)) return fail('As parcelas não somam o valor negociado.');
  const day = today(g);
  // elencos
  const swaps = (t.swapPlayerIds ?? []).map((id) => locate(g, id));
  if (swaps.some((x) => !x || x.clubId !== d.buyerId)) return fail('Um jogador da troca não pertence ao comprador.');
  if (swaps.some((x) => x && (lockedPlayers(g, d.id).has(x.player.id) || loanedNow(g, x.player.id)))) return fail('Um jogador da troca está comprometido em outra negociação.');
  const swapPlayers = swaps.map((x) => x!.player);
  const maxSquad = aiIs(g, d.buyerId) ? AI_MAX_SQUAD + 1 : MAX_SQUAD;
  const buyerAfter = [...buyer.players.filter((p) => !swapPlayers.some((s) => s.id === p.id)), l.player];
  if (buyerAfter.length > maxSquad && d.kind !== 'livre') return fail('O elenco do comprador ficaria grande demais.');
  if (d.kind === 'livre' && buyer.players.length >= maxSquad) return fail('Elenco cheio.');
  if (!rosterOk(buyerAfter) && buyer.players.length >= 18 && d.kind !== 'livre') { /* comprador pode ficar desbalanceado por posição numa troca: só bloqueia se ficar inválido */ }
  if (swapPlayers.length && !rosterOk(buyerAfter)) return fail('A troca deixaria o elenco do comprador inválido.');
  const sellerAfter = seller ? [...seller.players.filter((p) => p.id !== d.playerId), ...swapPlayers] : [];
  if (seller && (!rosterOk(sellerAfter) || sellerAfter.length > (aiIs(g, d.sellerId) ? AI_MAX_SQUAD + 3 : MAX_SQUAD))) return fail('O elenco do vendedor ficaria inválido.');
  // dinheiro
  const cashNow = d.kind === 'livre' ? 0 : cashDue(t, day);
  const later = d.kind === 'livre' ? 0 : termsTotal(t) - cashNow;
  if (!canAfford(g, d.buyerId, cashNow, later)) return fail('O clube comprador não tem condições de pagar.');
  const wageNow = t.wage ?? defaultContract(g, d.buyerId, l.player).wage;
  if (aiIs(g, d.buyerId) && d.kind !== 'emprestimo' && !wageFits(g, d.buyerId, wageNow * 0.7)) return fail('O salário não cabe na folha do clube comprador.');

  // ---- aplica ----
  let s: GameState = g;
  const teams = { ...g.teams };
  const years = t.years ?? defaultContract(g, d.buyerId, l.player).years;
  const loan = d.kind === 'emprestimo' ? t.loan! : undefined;
  const origContract = l.player.contract;
  const fullWage = origContract?.wage ?? (d.sellerId ? baseWage(g, d.sellerId, l.player) : wageNow);
  const moved: Player = loan
    ? { ...l.player, contract: { wage: Math.round(fullWage * (1 - loan.originWagePct)), until: g.season } }
    : { ...l.player, contract: { wage: wageNow, until: g.season + years - 1 } };
  if (seller) {
    const left = [...seller.players.filter((p) => p.id !== d.playerId), ...swapPlayers.map((p) => ({ ...p, contract: p.contract ?? undefined }))];
    teams[d.sellerId!] = userIs(g, d.sellerId) ? repairLineup({ ...seller, players: left }) : { ...seller, players: left, lineup: autoLineup(left, seller.formation) };
  }
  teams[d.buyerId] = userIs(g, d.buyerId) ? repairLineup({ ...buyer, players: buyerAfter.map((p) => (p.id === moved.id ? moved : p)) }) : { ...buyer, players: buyerAfter.map((p) => (p.id === moved.id ? moved : p)), lineup: autoLineup(buyerAfter.map((p) => (p.id === moved.id ? moved : p)), buyer.formation) };
  s = { ...s, teams };
  const budgets = { ...s.budgets };
  if (cashNow > 0 && d.sellerId) { budgets[d.buyerId] = (budgets[d.buyerId] ?? 0) - cashNow; budgets[d.sellerId] = (budgets[d.sellerId] ?? 0) + cashNow; }
  s = { ...s, budgets };
  if (d.sellerId && later > 0) s = { ...s, debts: [...(s.debts ?? []), ...debtsFor(d.id, d.playerId, d.buyerId, d.sellerId, t, day)] };
  if (d.kind === 'livre') s = { ...s, freeAgents: (s.freeAgents ?? []).filter((p) => p.id !== d.playerId) };
  // cláusulas de revenda devidas por uma venda anterior (paga uma única vez)
  if (d.sellerId && d.kind !== 'emprestimo') s = payResaleClauses(s, d.playerId, d.sellerId, t.fee + swapPlayers.reduce((a, p) => a + marketValue(s, d.buyerId, p), 0));
  if (d.sellerId && d.kind !== 'emprestimo' && t.clauses?.length) s = { ...s, clauses: [...(s.clauses ?? []), ...clausesFor(s, d.id, d.playerId, d.sellerId, d.buyerId, t)] };
  // empréstimo: registro com as condições e compatibilidade com as listas existentes
  if (loan && d.sellerId) {
    s = { ...s, loanDeals: [...(s.loanDeals ?? []), { dealId: d.id, playerId: d.playerId, originId: d.sellerId, hostId: d.buyerId, season: s.season, fromDay: day, untilDay: loan.untilDay, fullWage, originWagePct: loan.originWagePct, fee: loan.fee, buyOption: loan.buyOption, buyObligation: loan.buyObligation, obligationGames: loan.obligationGames, apps: 0, origContract }] };
    if (userIs(g, d.sellerId)) s = { ...s, loans: [...s.loans, { playerId: d.playerId, hostClubId: d.buyerId, season: s.season }] };
    else if (userIs(g, d.buyerId)) s = { ...s, loansIn: [...(s.loansIn ?? []), { playerId: d.playerId, ownerClubId: d.sellerId, season: s.season }] };
    else s = { ...s, aiLoans: [...(s.aiLoans ?? []), { playerId: d.playerId, ownerId: d.sellerId, hostId: d.buyerId, season: s.season }] };
  }
  // anti-repetição da IA e limpeza de listas
  if (aiIs(g, d.buyerId) || aiIs(g, d.sellerId)) s = { ...s, aiMoves: { ...(s.aiMoves ?? {}), [d.playerId]: { season: s.season, round: s.round, from: d.sellerId ?? '', to: d.buyerId } } };
  if (s.listed?.[d.playerId]) { const { [d.playerId]: _x, ...rest } = s.listed; s = { ...s, listed: rest }; }
  if (s.mood?.[d.playerId]) { const { [d.playerId]: _x, ...rest } = s.mood; s = { ...s, mood: rest }; }
  if (userIs(g, d.sellerId)) s = { ...s, transferList: s.transferList.filter((x) => x !== d.playerId), loanList: s.loanList.filter((x) => x !== d.playerId) };
  // registro do usuário (histórico oficial de transferências e fair play)
  const rec = (kind: Transfer['kind'], pl: Player, from: string, to: string, fee: number): Transfer => ({ kind, season: s.season, round: s.round, playerId: pl.id, playerName: pl.name, pos: pl.pos, strength: pl.strength, fromClubId: from, toClubId: to, fee });
  const logs: Transfer[] = [];
  if (userIs(g, d.buyerId)) logs.push(rec(loan ? 'loanin' : 'buy', l.player, d.sellerId ?? '', d.buyerId, t.fee));
  if (userIs(g, d.sellerId)) logs.push(rec(loan ? 'loan' : 'sale', l.player, d.sellerId!, d.buyerId, t.fee));
  if (userIs(g, d.buyerId) || userIs(g, d.sellerId)) for (const sp of swapPlayers) logs.push(rec(userIs(g, d.buyerId) ? 'sale' : 'buy', sp, d.buyerId, d.sellerId ?? '', 0));
  if (logs.length) s = { ...s, transfers: [...s.transfers, ...logs] };
  // outras negociações pelo mesmo jogador (ou por jogadores da troca) caem
  for (const o of (s.deals ?? []).filter((x) => x.id !== d.id && (x.playerId === d.playerId || (x.terms.swapPlayerIds ?? []).some((id) => id === d.playerId || swapPlayers.some((p) => p.id === id)) || swapPlayers.some((p) => p.id === x.playerId)))) {
    s = close(s, o, 'cancelada', `${s.clubs[o.buyerId]?.name ?? 'O comprador'} perde a disputa: ${l.player.name} fechou com o ${s.clubs[d.buyerId].name}.`);
  }
  const text = d.kind === 'emprestimo' ? `🤝 ${s.clubs[d.buyerId].name} recebe ${l.player.name} por empréstimo do ${s.clubs[d.sellerId!].name}.`
    : d.kind === 'livre' ? `🆓 ${s.clubs[d.buyerId].name} contrata o jogador livre ${l.player.name} (overall ${l.player.strength}).`
    : d.kind === 'troca' ? `🔄 Troca: ${l.player.name} vai para o ${s.clubs[d.buyerId].name}; ${swapPlayers.map((p) => p.name).join(', ')} ${swapPlayers.length > 1 ? 'vão' : 'vai'} para o ${s.clubs[d.sellerId!].name}${t.fee ? ` (+ ${fmt(t.fee)})` : ''}.`
    : `✍️ ${s.clubs[d.buyerId].name} anuncia ${l.player.name} (overall ${l.player.strength}), do ${s.clubs[d.sellerId!].name}, por ${fmt(t.fee)}${t.installments ? ` em ${t.installments.length} parcelas` : ''}${d.reason && aiIs(g, d.buyerId) ? ` (${d.reason})` : ''}.`;
  const mine = userIs(g, d.buyerId) || userIs(g, d.sellerId);
  const star = l.player.strength >= 74 || t.fee >= 10_000_000;
  if (mine) s = notifyPhone(news(s, text, userIs(g, d.buyerId) ? 'good' : 'info'), 'noticias', text.replace(/^\S+\s/, ''));
  else if ((star || l.player.strength >= 70 || t.fee >= 3_000_000) && (s.aiNewsDay?.day === day ? s.aiNewsDay.n : 0) < AI_NEWS_PER_DAY) {
    s = { ...news(s, text, 'info'), aiNewsDay: { day, n: (s.aiNewsDay?.day === day ? s.aiNewsDay.n : 0) + 1 } };
  }
  s = { ...s, market: [{ season: s.season, round: s.round, text: text.replace(/^\S+\s/, '') }, ...(s.market ?? [])].slice(0, 60) };
  s = archive(s, { ...d, history: [...d.history, step(s, 'sistema', 'concluida', text)] }, 'concluida', text);
  if (userIs(g, d.buyerId) && d.kind !== 'emprestimo' || (userIs(g, d.buyerId) && d.kind === 'emprestimo')) s = afterSigning(s);
  return { state: s, ok: true };
}

/* ---------- máquina de estados ---------- */

/**
 * Faz o próximo passo da negociação que cabe à IA (clube vendedor, comprador da IA ou jogador). Para quando a vez é do usuário,
 * quando ainda não chegou o dia da resposta ou quando a negociação termina. `steps` limita o laço (sem loops infinitos).
 */
export function advanceDeal(g: GameState, dealId: string, steps = 12): GameState {
  let s = g;
  const ctx = profileCtx(s);
  for (let i = 0; i < steps; i++) {
    const d = dealOf(s, dealId);
    if (!d || !isActive(d)) return s;
    const day = today(s);
    if (day > d.deadlineDay) return close(s, d, 'expirada', `A proposta do ${s.clubs[d.buyerId]?.name} por ${locate(s, d.playerId)?.player.name ?? 'jogador'} expirou sem resposta.`);
    const l = locate(s, d.playerId);
    if (!l || l.clubId !== d.sellerId) return close(s, d, 'cancelada', `${s.clubs[d.buyerId]?.name} encerra a negociação: o jogador não está mais disponível.`);
    const turn = d.turn ?? 'vendedor';
    if (d.state === 'aceita-jogador') return executeAndClose(s, d);
    if (turn === 'vendedor') {
      if (userIs(s, d.sellerId)) return s;                       // a vez do usuário
      if ((d.answerDay ?? day) > day) return s;                  // ainda não respondeu
      s = put(s, { ...d, state: 'em-analise' });
      const a = sellerAnswer(s, dealOf(s, dealId)!, ctx);
      const base = dealOf(s, dealId)!;
      if (a.action === 'recusar') return close(s, base, 'recusada', a.note, 'vendedor');
      if (a.action === 'aceitar') { s = put(s, { ...base, state: 'aceita-clube', clubOk: true, turn: 'jogador', history: [...base.history, step(s, 'vendedor', 'aceita', a.note)] }); continue; }
      s = put(s, { ...base, state: 'contraproposta', terms: a.terms!, round: base.round + 1, turn: 'comprador', answerDay: day + (userIs(s, base.buyerId) ? 0 : 0), deadlineDay: day + DEAL_LIFE, history: [...base.history, step(s, 'vendedor', 'contraproposta', a.note, a.terms!.fee)] });
      if (userIs(s, base.buyerId)) return notifyPhone(news(s, `↩️ ${a.note}`, 'info'), 'noticias', a.note);
      continue;
    }
    if (turn === 'comprador') {
      if (userIs(s, d.buyerId)) return s;                        // a vez do usuário
      const b = buyerAnswer(s, d);
      if (b.action === 'cancelar') return close(s, d, 'cancelada', b.note, 'comprador');
      if (b.action === 'aceitar') { s = put(s, { ...d, state: 'aceita-clube', clubOk: true, turn: 'jogador', history: [...d.history, step(s, 'comprador', 'aceita', b.note)] }); continue; }
      s = put(s, { ...d, state: userIs(s, d.sellerId) ? 'aguardando' : 'enviada', terms: b.terms!, round: d.round + 1, turn: 'vendedor', answerDay: day, deadlineDay: day + DEAL_LIFE, history: [...d.history, step(s, 'comprador', 'contraproposta', b.note, b.terms!.fee)] });
      if (userIs(s, d.sellerId)) return notifyPhone(news(s, `↩️ ${b.note}`, 'info'), 'noticias', b.note);
      continue;
    }
    // vez do jogador
    const p = playerDecision(s, d, ctx);
    if (p.action === 'recusar') return close(s, d, 'recusada', p.note, 'jogador');
    if (p.action === 'pedir-mais') {
      const extra = (p.wage ?? 0) - (d.terms.wage ?? 0);
      if (userIs(s, d.buyerId)) { // o usuário decide se paga o salário pedido
        s = put(s, { ...d, state: 'contraproposta', clubOk: true, terms: { ...d.terms, wage: p.wage }, turn: 'comprador', history: [...d.history, step(s, 'jogador', 'pede-salario', p.note)] });
        return notifyPhone(news(s, `💬 ${p.note}`, 'info'), 'noticias', p.note);
      }
      if (aiIs(s, d.buyerId) && wageFits(s, d.buyerId, extra + (p.wage ?? 0) * 0.7) && d.round < MAX_ROUNDS) {
        s = put(s, { ...d, terms: { ...d.terms, wage: p.wage }, round: d.round + 1, history: [...d.history, step(s, 'jogador', 'pede-salario', p.note), step(s, 'comprador', 'aceita-salario', `${s.clubs[d.buyerId].name} paga o salário pedido.`)] });
        continue;
      }
      return close(s, d, 'cancelada', `${s.clubs[d.buyerId].name} desiste: o salário pedido por ${l.player.name} não cabe na folha.`, 'comprador');
    }
    s = put(s, { ...d, state: 'aceita-jogador', playerOk: true, history: [...d.history, step(s, 'jogador', 'aceita', p.note)] });
  }
  return s;
}

function executeAndClose(g: GameState, d: Deal): GameState {
  const r = executeDeal(g, d.id);
  if (r.ok) return r.state;
  return close(g, d, 'cancelada', `Negociação cancelada: ${r.reason}`, 'sistema');
}

/* ---------- ações do usuário ---------- */

/** Aceita a contraproposta (você comprando) ou a proposta recebida (você vendendo). */
export function userAccept(g: GameState, dealId: string): GameState {
  const d = dealOf(g, dealId);
  if (!d || !isActive(d)) return g;
  const mineSeller = userIs(g, d.sellerId), mineBuyer = userIs(g, d.buyerId);
  const waiting = (mineSeller && d.turn === 'vendedor') || (mineBuyer && d.turn === 'comprador');
  if (!waiting) return g;
  if (d.state === 'contraproposta' && d.clubOk && mineBuyer) { // aceitou o salário pedido pelo jogador
    const s = put(g, { ...d, state: 'aceita-jogador', playerOk: true, history: [...d.history, step(g, 'comprador', 'aceita-salario', 'Você aceitou o salário pedido pelo jogador.')] });
    return advanceDeal(s, dealId);
  }
  const s = put(g, { ...d, state: 'aceita-clube', clubOk: true, turn: 'jogador', history: [...d.history, step(g, mineSeller ? 'vendedor' : 'comprador', 'aceita', mineSeller ? 'Você aceitou a proposta.' : 'Você aceitou a contraproposta.')] });
  return advanceDeal(s, dealId);
}

export function userRefuse(g: GameState, dealId: string): GameState {
  const d = dealOf(g, dealId);
  if (!d || !isActive(d)) return g;
  return close(g, d, 'recusada', userIs(g, d.sellerId) ? `Você recusou a proposta do ${g.clubs[d.buyerId].name}.` : `Você recusou a contraproposta do ${g.clubs[d.sellerId!]?.name}.`, userIs(g, d.sellerId) ? 'vendedor' : 'comprador');
}

export function userCancel(g: GameState, dealId: string): GameState {
  const d = dealOf(g, dealId);
  if (!d || !isActive(d) || !(userIs(g, d.buyerId) || userIs(g, d.sellerId))) return g;
  return close(g, d, 'cancelada', 'Você cancelou a negociação.', userIs(g, d.buyerId) ? 'comprador' : 'vendedor');
}

/** Faz uma contraproposta (muda valor, pagamento, troca, cláusulas, salário…). A outra parte responde no próximo dia. */
export function userCounter(g: GameState, dealId: string, patch: Partial<DealTerms>): { state: GameState; error?: string } {
  const d = dealOf(g, dealId);
  if (!d || !isActive(d)) return { state: g, error: 'Negociação encerrada.' };
  const mineSeller = userIs(g, d.sellerId), mineBuyer = userIs(g, d.buyerId);
  if (!((mineSeller && d.turn === 'vendedor') || (mineBuyer && d.turn === 'comprador'))) return { state: g, error: 'Não é a sua vez de responder.' };
  if (d.round >= MAX_ROUNDS) return { state: close(g, d, 'cancelada', 'Sem acordo: limite de contrapropostas atingido.'), error: 'Limite de contrapropostas atingido.' };
  const terms: DealTerms = { ...d.terms, ...patch, fee: Math.max(0, Math.round(patch.fee ?? d.terms.fee)) };
  if (!installmentsOk(terms)) return { state: g, error: 'As parcelas não somam o valor negociado.' };
  for (const id of terms.swapPlayerIds ?? []) { const sl = locate(g, id); if (!sl || sl.clubId !== d.buyerId || lockedPlayers(g, d.id).has(id)) return { state: g, error: 'Jogador da troca indisponível.' }; }
  const day = today(g);
  const next: Deal = { ...d, terms, round: d.round + 1, state: 'aguardando', turn: mineBuyer ? 'vendedor' : 'comprador', clubOk: false, answerDay: day + 1, deadlineDay: day + DEAL_LIFE, history: [...d.history, step(g, mineBuyer ? 'comprador' : 'vendedor', 'contraproposta', `Você propôs ${fmt(terms.fee)}${terms.installments ? ` em ${terms.installments.length} parcelas` : ''}.`, terms.fee)] };
  return { state: put(g, next) };
}

/* ---------- processamento diário ---------- */

/** Todo dia: as respostas que chegaram, prazos vencidos e janela fechada. */
export function dealsTick(g: GameState): GameState {
  if (!g.deals?.length) return g;
  let s = g;
  const day = today(s);
  const closed = !!transferBlock(s, 'comum');
  for (const d of [...(s.deals ?? [])]) {
    const cur = dealOf(s, d.id);
    if (!cur) continue;
    if (closed && cur.kind !== 'livre') { s = close(s, cur, 'expirada', `A janela fechou: a proposta do ${s.clubs[cur.buyerId]?.name} por ${locate(s, cur.playerId)?.player.name ?? 'jogador'} perdeu a validade.`); continue; }
    if (day > cur.deadlineDay) { s = close(s, cur, 'expirada', `A proposta do ${s.clubs[cur.buyerId]?.name} por ${locate(s, cur.playerId)?.player.name ?? 'jogador'} expirou sem resposta.`); continue; }
    s = advanceDeal(s, cur.id);
  }
  return s;
}

/** Negociações em que você deve agir (para avisos e abas). */
export const dealsForUser = (g: GameState) => (g.deals ?? []).filter((d) => isActive(d) && (userIs(g, d.buyerId) || userIs(g, d.sellerId)));
export const dealsWaitingUser = (g: GameState) => dealsForUser(g).filter((d) => (userIs(g, d.sellerId) && d.turn === 'vendedor') || (userIs(g, d.buyerId) && d.turn === 'comprador'));
