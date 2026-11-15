import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { coachMoneyOf, gateOf, isPayday, nextPayday, payMonthlySalaries, payrollOf, setWageCover, wageOf } from '../src/engine/finance';
import { calOf, fromDay, toDay } from '../src/engine/calendar';
import { processDays } from '../src/engine/daily';
import { isSeasonOver, newCareer, playNext, playRound, startNextSeason } from '../src/engine/game';

const career = (user = 'vasco', rep = 'pro', seed = 4) => newCareer({
  saveName: 't', coach: { name: 'Teste Silva', nationality: 'BR', reputation: rep }, difficulty: 'normal', mode: 'career', season: 2026,
  userClubId: user, divisions: brazilPyramid(), cup: true,
}, seed);

describe('finanças e salários', () => {
  it('folha típica ≈ 55% da receita-base; estrelas ganham mais que reservas', () => {
    const g = career();
    const ps = [...g.teams.vasco.players].sort((a, b) => b.strength - a.strength);
    expect(wageOf(g, 'vasco', ps[0])).toBeGreaterThan(wageOf(g, 'vasco', ps.at(-1)!));
    expect(payrollOf(g, 'vasco')).toBeGreaterThan(5_000_000);
    expect(payrollOf(g, 'csa')).toBeLessThan(payrollOf(g, 'vasco')); // Série D paga bem menos
  });
  it('a rodada só soma bilheteria em casa; os salários saem uma vez por mês, no dia 5', () => {
    const g0 = career();
    const g1 = playRound(g0).state;
    expect(g1.ledger!.wages).toBe(0);
    expect(g1.ledger!.coachSalary).toBe(0);
    const home = g1.results.some((r) => r.homeId === 'vasco');
    expect(g1.ledger!.gate > 0).toBe(home);
    expect(gateOf(g0, 'vasco')).toBeGreaterThan(0);
  });
  it('dia de pagamento: atletas e treinador recebem; 12 pagamentos por ano somam a folha anual', () => {
    expect(isPayday(toDay(2026, 3, 5))).toBe(true);
    expect(isPayday(toDay(2026, 3, 6))).toBe(false);
    expect(fromDay(nextPayday(toDay(2026, 1, 12))).m).toBe(2);
    expect(fromDay(nextPayday(toDay(2026, 1, 3))).d).toBe(5);
    expect(fromDay(nextPayday(toDay(2026, 12, 20))).y).toBe(2027);
    const g0 = career();
    const g1 = payMonthlySalaries(g0);
    expect(g1.ledger!.wages).toBeCloseTo(payrollOf(g0, 'vasco') / 12, -1);
    expect(coachMoneyOf(g1)).toBeGreaterThan(coachMoneyOf(g0));
    expect(g1.budgets.vasco).toBeLessThan(g0.budgets.vasco);
    expect(g1.news[0].text).toMatch(/Dia de pagamento/);
    // passando um ano de calendário saem 12 folhas
    const d0 = calOf(g0).day;
    const y = processDays(g0, d0, d0 + 365);
    expect(y.ledger!.wages).toBeGreaterThan(payrollOf(g0, 'vasco') * 0.9);
    expect(y.ledger!.wages).toBeLessThan(payrollOf(g0, 'vasco') * 1.1);
    // ninguém recebe fora do dia 5
    const mid = processDays(g0, toDay(2026, 2, 6), toDay(2026, 2, 28));
    expect(mid.ledger?.wages ?? 0).toBe(0);
  });
  it('treinador paga parte da folha do próprio bolso: o clube gasta menos e o dinheiro dele cai', () => {
    const base = payMonthlySalaries(career('csa', 'unknown'));
    const paying = payMonthlySalaries(setWageCover(career('csa', 'unknown'), 100));
    expect(paying.ledger!.coachCover).toBeGreaterThan(0);
    expect(paying.budgets.csa).toBeGreaterThan(base.budgets.csa);
    expect(paying.ledger!.wages).toBeLessThan(base.ledger!.wages);
  });
  it('sem dinheiro, o clube volta a pagar tudo', () => {
    let g = setWageCover(career('vasco', 'unknown'), 100); // Série A custa muito mais que R$ 30 mil
    g = payMonthlySalaries(g);
    expect(g.wageCover).toBe(0);
    expect(g.news.some((n) => /dinheiro acabou/.test(n.text))).toBe(true);
  });
  it('caixa no vermelho derruba a moral dos dirigentes', () => {
    const g0 = career('csa');
    const poor = { ...g0, budgets: { ...g0.budgets, csa: -5_000_000 } };
    const g1 = playRound(poor).state;
    expect(g1.morale.board).toBeLessThan(poor.morale.board);
  });
  it('temporada completa roda com finanças; as dívidas da IA são renegociadas na virada (ninguém começa a temporada no negativo)', () => {
    let g = career();
    while (!isSeasonOver(g)) { g = playNext(g).state; g = { ...g, morale: { ...g.morale, board: 60 } }; }
    const next = startNextSeason(g);
    const aiNeg = Object.entries(next.budgets).filter(([id, b]) => id !== 'vasco' && b < 0);
    expect(aiNeg.length).toBeLessThan(6); // sobram só as dívidas criadas pelas compras da janela de transferências
  });
});
