import { fmt } from './dealeval';
import { clubProfile } from './aiprofile';
import { calOf } from './calendar';
import { notifyPhone } from './phone';
import type { ActiveClause, DealClause, Debt, DealTerms, GameState, Installment, NewsItem } from './types';

/* =====================================================================
   Dinheiro das negociações: pagamento à vista ou parcelado (cada parcela vira uma dívida entre clubes, paga no vencimento),
   cláusulas de revenda e bônus (condição, pagamento único, registro).
   ===================================================================== */

const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const involvesUser = (g: GameState, ...ids: (string | null)[]) => !g.unemployed && ids.includes(g.userClubId);
export const MAX_DEBTS_KEPT = 200;

/** Divide o valor em parcelas: a 1ª no dia (entrada), as outras a cada `spacing` dias. A soma é sempre exatamente `total`. */
export function makeInstallments(total: number, n: number, day: number, firstPct = 0.4, spacing = 90): Installment[] | undefined {
  if (n <= 1) return undefined;
  const first = Math.round(total * firstPct / 10_000) * 10_000;
  const rest = n - 1;
  const each = Math.floor((total - first) / rest / 10_000) * 10_000;
  const out: Installment[] = [{ due: day, amount: first }];
  for (let i = 1; i <= rest; i++) out.push({ due: day + spacing * i, amount: each });
  out[out.length - 1].amount += total - out.reduce((s, i) => s + i.amount, 0);
  return out;
}

/** Valor da soma das parcelas (ou o próprio valor, à vista). */
export const termsTotal = (t: DealTerms) => (t.installments?.length ? t.installments.reduce((s, i) => s + i.amount, 0) : t.fee);
/** Parcelas coerentes? (soma = valor negociado, vencimentos em ordem, valores positivos) */
export function installmentsOk(t: DealTerms): boolean {
  if (!t.installments?.length) return true;
  return termsTotal(t) === t.fee && t.installments.every((i, k) => i.amount >= 0 && (k === 0 || i.due >= t.installments![k - 1].due));
}
/** Quanto deve ser pago já (parcelas vencidas até hoje); à vista = tudo. */
export const cashDue = (t: DealTerms, day: number) => (t.installments?.length ? t.installments.filter((i) => i.due <= day).reduce((s, i) => s + i.amount, 0) : t.fee);

/** Dívidas pendentes do clube (o que ele ainda deve a outros). */
export const debtOf = (g: GameState, clubId: string) => (g.debts ?? []).filter((d) => d.debtorId === clubId && d.paidDay === undefined).reduce((s, d) => s + d.amount, 0);
/** Quanto o clube tem a receber. */
export const receivableOf = (g: GameState, clubId: string) => (g.debts ?? []).filter((d) => d.creditorId === clubId && d.paidDay === undefined).reduce((s, d) => s + d.amount, 0);

/** O clube comporta pagar `cashNow` agora e `later` nas parcelas, sem estourar o caixa nem se endividar demais? */
export function canAfford(g: GameState, clubId: string, cashNow: number, later: number): boolean {
  const budget = g.budgets[clubId] ?? 0;
  if (budget < cashNow) return false;
  if (later <= 0) return true;
  const prof = clubProfile(g, clubId);
  return debtOf(g, clubId) + later <= Math.max(0, (budget - cashNow)) * 1.2 + prof.revenue * 0.3;
}

/** Cria as dívidas das parcelas futuras de uma negociação. */
export function debtsFor(dealId: string, playerId: string, debtorId: string, creditorId: string, t: DealTerms, day: number): Debt[] {
  if (!t.installments?.length) return [];
  return t.installments.map((i, k) => ({ id: `${dealId}#${k}`, dealId, playerId, debtorId, creditorId, amount: i.amount, due: i.due, ...(i.due <= day ? { paidDay: day } : {}) })).filter((d) => d.paidDay === undefined);
}

/** Todo dia: quita as parcelas que venceram. O seu clube só paga se tiver saldo (senão fica em atraso e tenta de novo); os da IA pagam no vencimento. */
export function settleDebts(g: GameState): GameState {
  const day = calOf(g).day;
  const list = g.debts ?? [];
  if (!list.some((d) => d.paidDay === undefined && d.due <= day)) return g.debts && list.length > MAX_DEBTS_KEPT ? { ...g, debts: pruneDebts(list) } : g;
  let s = g;
  const budgets = { ...g.budgets };
  const out: Debt[] = list.map((d) => {
    if (d.paidDay !== undefined || d.due > day) return d;
    const userDebtor = involvesUser(g, d.debtorId);
    if (userDebtor && (budgets[d.debtorId] ?? 0) < d.amount) {
      if (!d.late) s = notifyPhone(news(s, `⚠️ Parcela de transferência em atraso: ${fmt(d.amount)} a pagar ao ${g.clubs[d.creditorId]?.name ?? 'clube credor'}. Falta saldo no caixa.`, 'bad'), 'noticias', 'Parcela de transferência em atraso.');
      return { ...d, late: true };
    }
    budgets[d.debtorId] = (budgets[d.debtorId] ?? 0) - d.amount;
    budgets[d.creditorId] = (budgets[d.creditorId] ?? 0) + d.amount;
    if (involvesUser(g, d.debtorId, d.creditorId)) s = news(s, `💳 Parcela de transferência ${userDebtor ? 'paga' : 'recebida'}: ${fmt(d.amount)} ${userDebtor ? 'ao' : 'do'} ${g.clubs[userDebtor ? d.creditorId : d.debtorId]?.name ?? 'clube'}.`, userDebtor ? 'info' : 'good');
    return { ...d, paidDay: day, late: undefined };
  });
  return { ...s, budgets, debts: pruneDebts(out) };
}
/** Mantém o histórico de dívidas sob controle: tudo que está pendente + as últimas pagas. */
function pruneDebts(list: Debt[]): Debt[] {
  const open = list.filter((d) => d.paidDay === undefined);
  const paid = list.filter((d) => d.paidDay !== undefined).sort((a, b) => b.paidDay! - a.paidDay!).slice(0, Math.max(0, MAX_DEBTS_KEPT - open.length));
  return [...open, ...paid];
}

/* ---------- cláusulas ---------- */

/** Cria as cláusulas em vigor de uma negociação concluída (comprador paga bônus; vendedor recebe revenda do comprador). */
export function clausesFor(g: GameState, dealId: string, playerId: string, sellerId: string, buyerId: string, t: DealTerms): ActiveClause[] {
  return (t.clauses ?? []).map((c: DealClause, k) => ({
    id: `${dealId}~${k}`, dealId, playerId, type: c.type, beneficiaryId: sellerId, payerId: buyerId, pct: c.pct, base: c.base ?? 'valor', baseFee: t.fee,
    amount: c.amount, threshold: c.threshold, progress: 0, fromSeason: g.season, untilSeason: c.untilSeason ?? g.season + (c.type === 'revenda' ? 10 : 2),
  }));
}

/** Pagamento imediato entre clubes (o saldo pode ficar negativo no clube que paga; a IA renegocia no fim da temporada). */
function transfer(g: GameState, from: string, to: string, amount: number): GameState {
  return { ...g, budgets: { ...g.budgets, [from]: (g.budgets[from] ?? 0) - amount, [to]: (g.budgets[to] ?? 0) + amount } };
}

/**
 * Venda futura do jogador (`sellerId` vende por `fee`): paga a cláusula de revenda devida a um clube anterior, uma única vez.
 * Base 'valor' = percentual sobre o valor da venda; 'lucro' = só sobre o que passar do valor pago antes.
 */
export function payResaleClauses(g: GameState, playerId: string, sellerId: string, fee: number): GameState {
  const list = g.clauses ?? [];
  let s = g;
  const out = list.map((c) => {
    if (c.playerId !== playerId || c.type !== 'revenda' || c.paid || c.beneficiaryId === sellerId || c.payerId !== sellerId) return c;
    if (c.untilSeason !== undefined && s.season > c.untilSeason) return c;
    const base = c.base === 'lucro' ? Math.max(0, fee - c.baseFee) : fee;
    const amount = Math.round(base * (c.pct ?? 0) / 10_000) * 10_000;
    if (amount <= 0) return { ...c, paid: true, paidDay: calOf(s).day };
    s = transfer(s, c.payerId, c.beneficiaryId, amount);
    if (involvesUser(g, c.payerId, c.beneficiaryId)) s = news(s, `📜 Cláusula de revenda: ${fmt(amount)} (${Math.round((c.pct ?? 0) * 100)}% da venda) pagos ao ${s.clubs[c.beneficiaryId]?.name ?? 'clube'}.`, c.beneficiaryId === g.userClubId ? 'good' : 'info');
    return { ...c, paid: true, paidDay: calOf(s).day };
  });
  return { ...s, clauses: out };
}

function payBonus(g: GameState, c: ActiveClause, text: string): [GameState, ActiveClause] {
  let s = transfer(g, c.payerId, c.beneficiaryId, c.amount ?? 0);
  if (involvesUser(g, c.payerId, c.beneficiaryId)) s = news(s, `📜 Bônus: ${text} — ${fmt(c.amount ?? 0)} ${c.beneficiaryId === g.userClubId ? 'recebidos do' : 'pagos ao'} ${s.clubs[c.beneficiaryId === g.userClubId ? c.payerId : c.beneficiaryId]?.name ?? 'clube'}.`, c.beneficiaryId === g.userClubId ? 'good' : 'info');
  return [s, { ...c, paid: true, paidDay: calOf(s).day }];
}

/** Depois de uma rodada: conta partidas como titular dos jogadores com bônus por jogos e paga quando chega ao número combinado. */
export function clauseGames(g: GameState, played: Set<string>): GameState {
  const list = g.clauses ?? [];
  if (!list.some((c) => c.type === 'bonus-jogos' && !c.paid)) return g;
  let s = g;
  const out = list.map((c) => {
    if (c.type !== 'bonus-jogos' || c.paid || !played.has(c.playerId)) return c;
    const stillThere = s.teams[c.payerId]?.players.some((p) => p.id === c.playerId);
    if (!stillThere) return c; // só conta no clube que pagaria o bônus
    const n = (c.progress ?? 0) + 1;
    if (n >= (c.threshold ?? Infinity)) { const [s2, paid] = payBonus(s, { ...c, progress: n }, `${n} partidas pelo ${s.clubs[c.payerId]?.name}`); s = s2; return paid; }
    return { ...c, progress: n };
  });
  return { ...s, clauses: out };
}

/** Fim de temporada: bônus por títulos (clube pagador campeão da liga) e por desempenho (overall alvo), e limpeza das cláusulas vencidas. */
export function clauseSeasonEnd(g: GameState, championIds: string[]): GameState {
  const list = g.clauses ?? [];
  if (!list.length) return g;
  let s = g;
  const out: ActiveClause[] = [];
  for (const c of list) {
    let cur = c;
    if (!cur.paid) {
      const p = s.teams[cur.payerId]?.players.find((x) => x.id === cur.playerId);
      if (cur.type === 'bonus-titulos' && p && championIds.includes(cur.payerId)) [s, cur] = payBonus(s, cur, `${p.name} foi campeão pelo ${s.clubs[cur.payerId]?.name}`);
      else if (cur.type === 'bonus-desempenho' && p && p.strength >= (cur.threshold ?? 999)) [s, cur] = payBonus(s, cur, `${p.name} chegou a ${p.strength} de overall`);
    }
    const expired = cur.untilSeason !== undefined && s.season >= cur.untilSeason;
    if (cur.paid && s.season - (cur.fromSeason) > 3) continue; // pagas há tempo: saem do registro ativo (ficam no histórico das negociações)
    if (!cur.paid && expired) continue; // venceu sem a condição ser cumprida: não há cobrança
    out.push(cur);
  }
  return { ...s, clauses: out };
}
