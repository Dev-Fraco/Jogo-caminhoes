import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { payPix, registerBank, balanceOf, setAutoDebit } from '../src/engine/bank';
import { addMonths, calOf } from '../src/engine/calendar';
import { processDays } from '../src/engine/daily';
import { buyPlan } from '../src/engine/dataplan';
import { newCareer } from '../src/engine/game';
import { netState, phoneOf, PLAN_PRICE, planActive, planLeft, planUntil, toggleConn } from '../src/engine/phone';
import type { GameState } from '../src/engine/types';

const mk = (): GameState => {
  let g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() }, 4);
  const r = registerBank(g, 'A B', 'segredo1', 'segredo1');
  if (r.ok) g = r.state;
  return { ...g, coachMoney: 100_000 };
};
const pay = (g: GameState) => { const b = buyPlan(g); if (!b.ok) throw new Error(b.error); const r = payPix(b.state, b.charge.key, 'segredo1'); if (!r.ok) throw new Error(r.error); return r.state; };
const days = (g: GameState, n: number) => { const d0 = calOf(g).day; return processDays(g, d0, d0 + n); };
const withChip = (g: GameState): GameState => ({ ...g, phone: { ...phoneOf(g), chip: 'morto', chipNumber: '(11) 91111-2222', chipUntil: calOf(g).day + 400 } });

describe('plano de dados (Internet de Chip)', () => {
  it('sem conta no banco não dá para assinar', () => {
    expect(buyPlan({ ...mk(), bank: undefined }).ok).toBe(false);
  });
  it('custa R$ 5.000 por Pix e vale 1 mês de calendário; dados móveis só funcionam com plano', () => {
    let g = toggleConn(withChip(mk()), 'mobileData');
    expect(netState(g)).toMatchObject({ kind: 'none', speed: 'none' });
    expect(netState(g).label).toMatch(/sem plano/i);
    const cash = balanceOf(g);
    const day = calOf(g).day;
    g = pay(g);
    expect(balanceOf(g)).toBe(cash - PLAN_PRICE);
    expect(planActive(g)).toBe(true);
    expect(planUntil(g)).toBe(addMonths(day, 1));
    expect(planLeft(g)).toBeGreaterThanOrEqual(28);
    expect(planLeft(g)).toBeLessThanOrEqual(31);
    expect(netState(g)).toMatchObject({ kind: '5g', speed: 'fast' });
  });
  it('renovar por Pix soma mais um mês ao que sobrou', () => {
    let g = pay(mk());
    const first = planUntil(g)!;
    g = pay(g);
    expect(planUntil(g)).toBe(addMonths(first, 1));
  });
  it('débito automático: no dia do vencimento o banco desconta e o plano renova sozinho', () => {
    let g = pay(mk());
    const cash = balanceOf(g);
    g = days(g, 31);
    expect(planActive(g)).toBe(true);
    expect(balanceOf(g)).toBe(cash - PLAN_PRICE);
    expect(g.bank!.txs[0].title).toMatch(/Débito automático/);
    expect(phoneOf(g).notifications.some((n) => /Débito automático: Internet de Chip/.test(n.text))).toBe(true);
    g = days(g, 31 + 30);
    expect(balanceOf(g)).toBe(cash - PLAN_PRICE * 3);
  });
  it('sem saldo o plano vence, avisa uma vez e volta a renovar quando houver saldo', () => {
    let g = pay({ ...mk(), coachMoney: 5_100 });
    g = days(g, 40);
    expect(planActive(g)).toBe(false);
    const n = phoneOf(g).notifications.filter((x) => /recusado|venceu/.test(x.text)).length;
    expect(n).toBe(1);
    g = days({ ...g, coachMoney: 50_000 }, 1);
    expect(planActive(g)).toBe(true);
  });
  it('com o débito desligado o plano vence e é preciso renovar na mão; avisa antes', () => {
    let g = setAutoDebit(pay(mk()), false);
    g = days(g, 29);
    expect(phoneOf(g).notifications.some((n) => /vence em/.test(n.text))).toBe(true);
    g = days(g, 5);
    expect(planActive(g)).toBe(false);
    expect(phoneOf(g).notifications[0].text).toMatch(/venceu/);
  });
});
