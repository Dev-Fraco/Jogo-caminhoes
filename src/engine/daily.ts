import { monthlyContracts } from './assets';
import { autoDebitOn, brl, debitNow } from './bank';
import { isPayday, payMonthlySalaries } from './finance';
import { advanceDay, calOf, ensureCalendar, isMatchDay } from './calendar';
import './dataplan';
import { homeBlocked } from './housing';
import './netfibra';
import { FIBRA_MONTHLY, fibraLeft, notifyPhone, phoneOf, PLAN_PRICE, planLeft } from './phone';
import { chipDay } from './shop';
import { windowTick } from './windows';
import type { GameState } from './types';

/** O que acontece a cada dia do calendário: mensalidades (com débito automático no banco), avisos de vencimento, chip e contratos (aluguel e parcelas). */
function dayTick(g: GameState): GameState {
  let s = g;
  const today = calOf(s).day;

  // plano de dados (Internet de Chip)
  const plan = phoneOf(s).plan;
  if (plan) {
    const left = planLeft(s);
    if (left === 0) {
      const paid = autoDebitOn(s) ? debitNow(s, { merchant: 'Internet de Chip', description: 'Plano mensal (débito automático)', amount: PLAN_PRICE, purpose: { type: 'data-plan' } }) : null;
      if (paid) s = notifyPhone(paid, 'banco', `Débito automático: Internet de Chip (${brl(PLAN_PRICE)}).`);
      else if (!plan.expiredNotified) {
        s = notifyPhone({ ...s, phone: { ...phoneOf(s), plan: { ...plan, expiredNotified: true } } }, 'internetchip', autoDebitOn(s) ? 'Débito automático recusado: saldo insuficiente. Os dados móveis ficaram sem plano.' : 'Seu plano de dados venceu. Renove no app Internet de Chip.');
      }
    } else if (left <= 3 && !plan.warned) {
      s = notifyPhone({ ...s, phone: { ...phoneOf(s), plan: { ...plan, warned: true } } }, 'internetchip', autoDebitOn(s) ? `Seu plano de dados renova em ${left} dia(s) por débito automático (${brl(PLAN_PRICE)}).` : `Seu plano de dados vence em ${left} dia(s). Renove no app.`);
    }
  }

  // NetFibra
  const f = phoneOf(s).fibra;
  if (f?.entryPaid && f.ssid) {
    if (f.down !== undefined && f.down <= today) { s = notifyPhone({ ...s, phone: { ...phoneOf(s), fibra: { ...f, down: undefined } } }, 'netfibra', 'A NetFibra voltou ao normal.'); }
    const f2 = phoneOf(s).fibra!;
    const left = fibraLeft(s);
    if (left === 0) {
      const paid = autoDebitOn(s) ? debitNow(s, { merchant: 'NetFibra', description: 'Mensalidade (débito automático)', amount: FIBRA_MONTHLY, purpose: { type: 'netfibra' } }) : null;
      if (paid) s = notifyPhone(paid, 'banco', `Débito automático: NetFibra (${brl(FIBRA_MONTHLY)}).`);
      else if (!f2.expiredNotified) s = notifyPhone({ ...s, phone: { ...phoneOf(s), fibra: { ...f2, expiredNotified: true } } }, 'netfibra', autoDebitOn(s) ? 'Débito automático recusado: saldo insuficiente. O Wi-Fi ficou sem internet.' : 'A mensalidade da NetFibra venceu: o Wi-Fi ficou sem internet. Renove no app.');
    } else if (left <= 3 && !f2.warned) {
      s = notifyPhone({ ...s, phone: { ...phoneOf(s), fibra: { ...f2, warned: true } } }, 'netfibra', autoDebitOn(s) ? `A NetFibra renova em ${left} dia(s) por débito automático (${brl(FIBRA_MONTHLY)}).` : `A mensalidade da NetFibra vence em ${left} dia(s).`);
    }
  }

  if (isPayday(today)) s = payMonthlySalaries(s); // salários dos atletas e do treinador, uma vez por mês
  s = chipDay(s);
  s = windowTick(s);
  return monthlyContracts(s);
}

/** Processa cada dia entre `from` (exclusive) e `to` (inclusive). */
export function processDays(g: GameState, from: number, to: number): GameState {
  let s = g;
  for (let d = from + 1; d <= to; d++) s = dayTick({ ...s, cal: { ...calOf(s), day: d } });
  return s;
}

/** Avança 1 dia no calendário (se não for dia de jogo) e processa o que vence nele. */
export function advanceOneDay(g: GameState): GameState {
  if (homeBlocked(g)) return g; // sem moradia, o tempo não passa
  const before = calOf(g).day;
  const s = advanceDay(g);
  const after = calOf(s).day;
  return after > before ? processDays(s, before, after) : s;
}
/** Avança dia a dia até o próximo jogo. */
export function advanceToMatchDays(g: GameState): GameState {
  let s = ensureCalendar(g);
  for (let i = 0; i < 20 && !isMatchDay(s); i++) s = advanceOneDay(s);
  return s;
}
