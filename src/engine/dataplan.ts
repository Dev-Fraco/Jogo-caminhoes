import { brl, createCharge, registerPurpose } from './bank';
import { notifyPhone, phoneOf, PLAN_PRICE, PLAN_ROUNDS, planLeft } from './phone';
import type { GameState, PixCharge } from './types';

const ABS = 200;
const nowAbs = (g: Pick<GameState, 'season' | 'round'>) => g.season * ABS + g.round;

/** Cobrança Pix do plano mensal (R$ 5.000, internet ilimitada o mês inteiro). Quem já tem plano ativo soma mais um mês no fim dele. */
export function buyPlan(g: GameState): { ok: true; state: GameState; charge: PixCharge } | { ok: false; error: string } {
  if (!g.bank?.passHash) return { ok: false, error: 'Abra sua conta no app Banco para pagar o plano.' };
  const { state, charge } = createCharge(g, { merchant: 'Internet de Chip', description: `Plano mensal ilimitado (${PLAN_ROUNDS} rodadas)`, amount: PLAN_PRICE, purpose: { type: 'data-plan' } });
  return { ok: true, state, charge };
}

registerPurpose('data-plan', (g) => {
  const p = phoneOf(g);
  const base = Math.max(p.plan?.until ?? 0, nowAbs(g));
  const until = base + PLAN_ROUNDS;
  const s: GameState = { ...g, phone: { ...p, plan: { until, warned: false, expiredNotified: false } } };
  return notifyPhone(s, 'internetchip', `Plano ativado: internet ilimitada por ${PLAN_ROUNDS} rodadas (${brl(PLAN_PRICE)}).`);
});

/** A cada rodada: avisa quando o plano está para vencer e quando venceu. */
export function planTick(g: GameState): GameState {
  const plan = phoneOf(g).plan;
  if (!plan) return g;
  const left = planLeft(g);
  let s = g;
  if (left === 0 && !plan.expiredNotified) {
    s = notifyPhone(s, 'internetchip', 'Seu plano de dados venceu: os dados móveis ficaram sem internet. Renove no app Internet de Chip.');
    s = { ...s, phone: { ...phoneOf(s), plan: { ...plan, expiredNotified: true } } };
  } else if (left === 1 && !plan.warned) {
    s = notifyPhone(s, 'internetchip', 'Seu plano de dados vence na próxima rodada. Renove para não ficar sem internet.');
    s = { ...s, phone: { ...phoneOf(s), plan: { ...plan, warned: true } } };
  }
  return s;
}
