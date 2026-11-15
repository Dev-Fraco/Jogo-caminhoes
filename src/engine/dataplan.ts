import { brl, createCharge, registerPurpose } from './bank';
import { addMonths, calOf } from './calendar';
import { notifyPhone, phoneOf, planUntil, PLAN_PRICE } from './phone';
import type { GameState, PixCharge } from './types';

/** Cobrança Pix do plano mensal (R$ 5.000, internet ilimitada por 1 mês de calendário). A partir da 1ª vez, a renovação é débito automático no banco. */
export function buyPlan(g: GameState): { ok: true; state: GameState; charge: PixCharge } | { ok: false; error: string } {
  if (!g.bank?.passHash) return { ok: false, error: 'Abra sua conta no app Banco para pagar o plano.' };
  const { state, charge } = createCharge(g, { merchant: 'Internet de Chip', description: 'Plano mensal ilimitado (1 mês)', amount: PLAN_PRICE, purpose: { type: 'data-plan' } });
  return { ok: true, state, charge };
}

/** Pagamento confirmado (Pix ou débito automático): soma 1 mês de calendário ao fim do plano (ou a partir de hoje, se estava vencido). */
registerPurpose('data-plan', (g) => {
  const p = phoneOf(g);
  const base = Math.max(planUntil(g) ?? 0, calOf(g).day);
  const until = addMonths(base, 1);
  const s: GameState = { ...g, phone: { ...p, plan: { until, warned: false, expiredNotified: false } } };
  return notifyPhone(s, 'internetchip', `Plano ativado: internet ilimitada até ${new Date(until * 86_400_000).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} (${brl(PLAN_PRICE)}).`);
});
