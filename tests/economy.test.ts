import { describe, expect, it } from 'vitest';
import { CUP_PRIZE } from '../src/engine/cup';
import { inflate, nextInflation, PRIZE_SCALE, priceIndex, prize, seasonIncome } from '../src/engine/economy';
import { baseWage, coachSalary, gateOf, payrollOf } from '../src/engine/finance';
import { isSeasonOver, playNext, startNextSeason } from '../src/engine/game';
import { quote } from '../src/engine/market';
import { buyVehicle, priceOf, vehicleById } from '../src/engine/assets';
import { myValue } from '../src/engine/roster';
import { makeRng } from '../src/engine/rng';
import { makeCareer } from './helpers';
import type { GameState } from '../src/engine/types';

const withIndex = (g: GameState, index: number): GameState => ({ ...g, inflation: { index, rate: 0.05, history: [] } });

describe('inflação', () => {
  it('cada ano sorteia uma taxa entre 3,5% e 8,5% e acumula o índice; fica registrada', () => {
    let infl = undefined as ReturnType<typeof nextInflation> | undefined;
    const base = { season: 2026 } as { season: number; inflation?: ReturnType<typeof nextInflation> };
    const rates: number[] = [];
    for (let i = 0; i < 40; i++) { infl = nextInflation({ season: 2026 + i, inflation: infl }, makeRng(i + 1)); rates.push(infl.rate); }
    expect(Math.min(...rates)).toBeGreaterThanOrEqual(0.035);
    expect(Math.max(...rates)).toBeLessThanOrEqual(0.085);
    expect(infl!.index).toBeGreaterThan(3);
    expect(infl!.history.length).toBe(40);
    void base;
  });
  it('a virada de temporada aplica a inflação e avisa nas notícias', () => {
    let g = makeCareer('palmeiras', 4);
    expect(priceIndex(g)).toBe(1);
    while (!isSeasonOver(g)) { g = playNext(g).state; g = { ...g, morale: { ...g.morale, board: 60 } }; }
    const n = startNextSeason(g);
    expect(priceIndex(n)).toBeGreaterThan(1.034);
    expect(priceIndex(n)).toBeLessThan(1.086);
    expect(n.inflation!.history.length).toBe(1);
    expect(n.news.some((x) => /Inflação de/.test(x.text))).toBe(true);
  });
  it('preços, salários, bilheteria, receita e prêmios sobem com o índice', () => {
    const a = makeCareer('palmeiras', 4), b = withIndex(a, 1.5);
    const p = a.teams.palmeiras.players[0];
    expect(myValue(b, p)).toBeGreaterThan(myValue(a, p) * 1.4);
    expect(baseWage(b, 'palmeiras', p)).toBeGreaterThan(baseWage(a, 'palmeiras', p) * 1.45);
    expect(payrollOf(b, 'palmeiras')).toBeGreaterThan(payrollOf(a, 'palmeiras') * 1.4);
    expect(gateOf(b, 'palmeiras')).toBeGreaterThan(gateOf(a, 'palmeiras') * 1.4);
    expect(coachSalary(b)).toBeGreaterThanOrEqual(coachSalary(a) * 1.4);
    expect(seasonIncome(0, 4, 5, 20, 1.5)).toBeGreaterThan(seasonIncome(0, 4, 5, 20, 1) * 1.4);
    expect(prize(b, 10_000_000)).toBeGreaterThan(prize(a, 10_000_000) * 1.4);
    expect(inflate(a, 105_000)).toBe(105_000);
    expect(inflate(b, 105_000)).toBe(160_000);
    // mercado de outras ligas e catálogo de bens
    const ma = quote(a, 'santos', a.teams.santos.players[5].id)!, mb = quote(b, 'santos', a.teams.santos.players[5].id)!;
    expect(mb.price).toBeGreaterThan(ma.price * 1.4);
    expect(priceOf(b, vehicleById('hatch-popular')!.price)).toBe(inflate(b, 70_000));
    const compra = buyVehicle(withIndex({ ...a, coachMoney: 9e6 }, 2), 'hatch-popular', { type: 'cash' });
    if (!compra.ok) throw new Error(compra.error);
    expect(compra.charge.amount).toBe(140_000);
  });
  it('os prêmios encolheram: o campeão da Copa do Brasil leva um quarto do valor antigo', () => {
    const g = makeCareer('palmeiras');
    expect(PRIZE_SCALE).toBe(0.25);
    expect(prize(g, CUP_PRIZE[5])).toBe(15_000_000);
    expect(prize(g, 150_000_000)).toBe(37_500_000); // campeão da Libertadores (antes 150 mi)
  });
  it('dinheiro sob controle: depois de 6 temporadas o caixa de um grande não explode e a IA não fica negativa', () => {
    let g = makeCareer('palmeiras', 5);
    for (let y = 0; y < 4; y++) {
      while (!isSeasonOver(g)) { g = playNext(g).state; g = { ...g, morale: { ...g.morale, board: 60 } }; }
      g = startNextSeason(g);
    }
    const idx = priceIndex(g);
    const ai = Object.entries(g.budgets).filter(([id]) => id !== 'palmeiras').map(([, b]) => b);
    expect(Math.min(...ai)).toBeGreaterThanOrEqual(-60_000_000);
    expect(Math.max(...ai) / idx).toBeLessThan(800_000_000); // antes passava de R$ 1 bi
    const medA = [...g.divisions[0].clubIds].map((id) => g.budgets[id]).sort((x, y) => x - y)[10] / idx;
    expect(medA).toBeLessThan(250_000_000); // antes: ~R$ 400 mi no ano 6
  });
});
