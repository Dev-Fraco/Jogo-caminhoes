import { clubProfile } from './aiprofile';
import { advanceDeal, openDeal } from './deals';
import { fmt, locate } from './dealeval';
import { makeInstallments } from './dealpay';
import { calOf } from './calendar';
import { hashString } from './rng';
import { toDay } from './calendar';
import type { DealClause, DealKind, GameState, LoanTerms } from './types';

/* =====================================================================
   Entrada da IA no motor de negociações: o clube faz uma proposta de verdade (com abertura abaixo do preço pedido, contrapropostas,
   decisão do jogador e conclusão atômica). Nenhum jogador muda de clube sem passar por aqui.
   ===================================================================== */

/** Contadores de tentativas de negociação da IA (para auditoria e testes; custo desprezível). */
export const TRADE_STATS = { tried: 0, ok: 0, byPlayer: new Map<string, number>(), byPair: new Map<string, number>(), reset() { this.tried = 0; this.ok = 0; this.byPlayer.clear(); this.byPair.clear(); } };

export interface TradeSpec {
  kind: DealKind; playerId: string; buyerId: string;
  /** Valor pedido pelo vendedor (o comprador abre abaixo disso). */
  fee: number; reason: string;
  /** Parcelar o pagamento em N vezes. */
  installments?: number;
  swapIds?: string[]; clauses?: DealClause[]; loan?: LoanTerms; wage?: number; years?: number;
}
export interface TradeResult { state: GameState; ok: boolean; pending?: boolean; note?: string }

/** Abertura do comprador: algo abaixo do preço pedido (varia por clube e pela urgência). */
export function openingFee(_g: GameState, buyerId: string, ask: number, urgent: boolean): number {
  const t = (hashString(`${buyerId}:abre`) % 100) / 100;
  const f = urgent ? 0.92 + 0.08 * t : 0.8 + 0.12 * t;
  return Math.max(10_000, Math.round(ask * f / 10_000) * 10_000);
}

/** Fim da temporada em dias (31/12): os empréstimos vencem aí e os jogadores voltam na virada. */
export const seasonEndDay = (g: GameState) => toDay(g.season, 12, 31);

/** Parcelamento que o comprador consegue propor: precisa de caixa para a entrada e da folga de dívida. */
export function installmentPlan(g: GameState, buyerId: string, fee: number): number {
  const prof = clubProfile(g, buyerId);
  const budget = g.budgets[buyerId] ?? 0;
  const entry = fee * 0.4;
  if (budget < entry || prof.financial === 'crise') return 1;
  return fee > budget * 0.5 ? 3 : fee > budget * 0.25 ? 2 : 1;
}

/** A IA tenta fechar a negociação do começo ao fim (todas as rodadas acontecem agora, cada passo registrado no histórico). */
export function aiTrade(g: GameState, spec: TradeSpec): TradeResult {
  const l = locate(g, spec.playerId);
  if (!l) return { state: g, ok: false, note: 'jogador não encontrado' };
  TRADE_STATS.tried++; TRADE_STATS.byPlayer.set(spec.playerId, (TRADE_STATS.byPlayer.get(spec.playerId) ?? 0) + 1); { const k = `${spec.buyerId}>${spec.playerId}`; TRADE_STATS.byPair.set(k, (TRADE_STATS.byPair.get(k) ?? 0) + 1); }
  const day = calOf(g).day;
  const fee = spec.kind === 'livre' ? 0 : openingFee(g, spec.buyerId, spec.fee, spec.reason.includes('falta'));
  const inst = spec.installments && spec.installments > 1 ? makeInstallments(fee, spec.installments, day, 0.4, 90) : undefined;
  const o = openDeal(g, {
    kind: spec.kind, playerId: spec.playerId, buyerId: spec.buyerId, reason: spec.reason,
    terms: { fee, installments: inst, swapPlayerIds: spec.swapIds, clauses: spec.clauses, loan: spec.loan, wage: spec.wage, years: spec.years },
  });
  if (!o.deal) return { state: g, ok: false, note: o.error };
  const dealId = o.deal.id;
  const sellerIsUser = !g.unemployed && o.deal.sellerId === g.userClubId;
  if (sellerIsUser) return { state: o.state, ok: false, pending: true };
  const s = advanceDeal(o.state, dealId);
  const done = (s.dealLog ?? []).find((r) => r.id === dealId);
  if (done?.state === 'concluida') { TRADE_STATS.ok++; return { state: s, ok: true, note: done.summary }; }
  return { state: s, ok: false, pending: (s.deals ?? []).some((d) => d.id === dealId), note: done?.summary ?? `negociação ${fmt(fee)} sem acordo` };
}
