import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { payPix, registerBank, balanceOf } from '../src/engine/bank';
import { buyPlan, planTick } from '../src/engine/dataplan';
import { newCareer, playNext } from '../src/engine/game';
import { netState, phoneOf, PLAN_PRICE, PLAN_ROUNDS, planActive, planLeft, toggleConn } from '../src/engine/phone';
import type { GameState } from '../src/engine/types';

const mk = (): GameState => {
  let g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() }, 4);
  const r = registerBank(g, 'A B', 'segredo1', 'segredo1');
  if (r.ok) g = r.state;
  return { ...g, coachMoney: 100_000 };
};
const pay = (g: GameState) => { const b = buyPlan(g); if (!b.ok) throw new Error(b.error); const r = payPix(b.state, b.charge.key, 'segredo1'); if (!r.ok) throw new Error(r.error); return r.state; };

describe('plano de dados (Internet de Chip)', () => {
  it('sem conta no banco não dá para assinar', () => {
    const g = { ...mk(), bank: undefined };
    const r = buyPlan(g);
    expect(r.ok).toBe(false);
  });
  it('custa R$ 5.000 por Pix e ativa por 3 rodadas; dados móveis só funcionam com plano', () => {
    let g = toggleConn(mk(), 'mobileData');
    expect(netState(g)).toMatchObject({ kind: 'none', speed: 'none' });
    expect(netState(g).label).toMatch(/sem plano/i);
    const cash = balanceOf(g);
    g = pay(g);
    expect(balanceOf(g)).toBe(cash - PLAN_PRICE);
    expect(planActive(g)).toBe(true);
    expect(planLeft(g)).toBe(PLAN_ROUNDS);
    expect(netState(g)).toMatchObject({ kind: '5g', speed: 'fast' });
    expect(phoneOf(g).notifications.some((n) => n.app === 'internetchip')).toBe(true);
  });
  it('renovar soma mais um mês ao que sobrou', () => {
    let g = pay(mk());
    g = pay(g);
    expect(planLeft(g)).toBe(PLAN_ROUNDS * 2);
  });
  it('o plano vence com o passar das rodadas, avisando antes e depois', () => {
    let g = toggleConn(pay(mk()), 'mobileData');
    let guard = 0;
    while (g.estadual?.due && guard++ < 60) g = playNext(g).state;
    const start = g.round;
    g = { ...g, phone: { ...phoneOf(g), plan: { until: g.season * 200 + g.round + 2 } } };
    for (let i = 0; i < 3; i++) g = planTick(playNext(g).state);
    expect(g.round).toBeGreaterThan(start);
    expect(planActive(g)).toBe(false);
    expect(netState(g).speed).toBe('none');
    const texts = phoneOf(g).notifications.filter((n) => n.app === 'internetchip').map((n) => n.text).join(' | ');
    expect(texts).toMatch(/vence na próxima rodada/);
    expect(texts).toMatch(/venceu/);
    expect(planTick(g)).toEqual(g); // não repete o aviso
  });
});
