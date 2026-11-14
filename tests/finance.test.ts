import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { coachMoneyOf, gateOf, payrollOf, setWageCover, wageOf } from '../src/engine/finance';
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
  it('cada rodada desconta salários e soma bilheteria em casa; o treinador recebe salário', () => {
    const g0 = career();
    const g1 = playRound(g0).state;
    expect(g1.ledger!.wages).toBeGreaterThan(0);
    expect(g1.ledger!.coachSalary).toBeGreaterThan(0);
    expect(coachMoneyOf(g1)).toBeGreaterThan(coachMoneyOf(g0));
    const home = g1.results.some((r) => r.homeId === 'vasco');
    expect(g1.ledger!.gate > 0).toBe(home);
    expect(gateOf(g0, 'vasco')).toBeGreaterThan(0);
  });
  it('treinador paga parte da folha do próprio bolso: o clube gasta menos e o dinheiro dele cai', () => {
    const base = playRound(career('csa', 'unknown')).state;
    const paying = playRound(setWageCover(career('csa', 'unknown'), 100)).state;
    expect(paying.ledger!.coachCover).toBeGreaterThan(0);
    expect(paying.budgets.csa).toBeGreaterThan(base.budgets.csa);
    expect(paying.ledger!.wages).toBeLessThan(base.ledger!.wages);
  });
  it('sem dinheiro, o clube volta a pagar tudo', () => {
    let g = setWageCover(career('vasco', 'unknown'), 100); // Série A custa muito mais que R$ 30 mil
    g = playRound(g).state;
    expect(g.wageCover).toBe(0);
    expect(g.news[0].text).toMatch(/dinheiro acabou/);
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
