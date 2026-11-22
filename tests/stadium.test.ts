import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { newCareer, playNext } from '../src/engine/game';
import { baseIncome, gateOf } from '../src/engine/finance';
import { inflate, priceIndex } from '../src/engine/economy';
import { divisionIndexOf } from '../src/engine/transfers';
import { attendanceAt, bestPrice, BOYCOTT, canUpgrade, capacityStep, comfortCost, expandCost, fairPrice, MAX_COMFORT, setTicketPrice, stadiumOf, ticketPriceOf, upgradeStadium } from '../src/engine/stadium';
import type { GameState } from '../src/engine/types';

const mk = (club = 'palmeiras', seed = 3): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: club, divisions: brazilPyramid(), cup: true }, seed);
const opp = (g: GameState) => Object.keys(g.clubs).find((id) => id !== g.userClubId)!;

describe('estádio', () => {
  it('capacidade e preço justo plausíveis, e o preço justo reproduz a bilheteria de referência', () => {
    const g = mk();
    const st = stadiumOf(g);
    expect(st.capacity).toBeGreaterThan(10_000);
    const fair = fairPrice(g);
    expect(fair).toBeGreaterThan(5);
    const rev = attendanceAt(g, opp(g), fair) * fair;
    expect(rev / gateOf(g, g.userClubId)).toBeGreaterThan(0.8);
    expect(rev / gateOf(g, g.userClubId)).toBeLessThan(1.4);
  });
  it('preço alto afasta a torcida; absurdo = boicote; barato lota', () => {
    const g = mk();
    const o = opp(g), f = fairPrice(g);
    expect(attendanceAt(g, o, f * 1.4)).toBeLessThan(attendanceAt(g, o, f));
    expect(attendanceAt(g, o, f * (BOYCOTT + 0.5))).toBeLessThan(attendanceAt(g, o, f) * 0.15);
    expect(attendanceAt(g, o, f * 0.4)).toBe(stadiumOf(g).capacity);
    expect(attendanceAt(g, o, f * 0.4)).toBeLessThanOrEqual(stadiumOf(g).capacity);
  });
  it('o melhor preço dá mais receita que o justo quando há procura sobrando', () => {
    const g = mk();
    const o = opp(g);
    const best = bestPrice(g, o);
    expect(best * attendanceAt(g, o, best)).toBeGreaterThanOrEqual(fairPrice(g) * attendanceAt(g, o, fairPrice(g)));
  });
  it('jogar em casa registra público e receita, soma ao caixa e ao balanço', () => {
    let g = mk();
    const cash0 = g.budgets[g.userClubId];
    let guard = 0;
    while (stadiumOf(g).log.length === 0 && guard++ < 6) g = playNext(g).state;
    const rec = stadiumOf(g).log[0];
    expect(rec.attendance).toBeGreaterThan(0);
    expect(rec.revenue).toBe(rec.attendance * rec.price);
    expect(g.ledger!.gate).toBeGreaterThanOrEqual(rec.revenue);
    expect(g.budgets[g.userClubId]).not.toBe(cash0);
  });
  it('mudar o preço vale no jogo seguinte e ingresso caro com estádio vazio irrita a torcida', () => {
    let g = setTicketPrice(mk(), 9999);
    expect(ticketPriceOf(g)).toBeLessThanOrEqual(fairPrice(g) * 3);
    const fans0 = g.morale.fans;
    let guard = 0;
    while (stadiumOf(g).log.length === 0 && guard++ < 6) g = playNext(g).state;
    expect(stadiumOf(g).log[0].attendance).toBeLessThan(stadiumOf(g).capacity * 0.2);
    expect(g.morale.fans).toBeLessThan(fans0 + 6);
  });
  it('obras: ampliar e modernizar custam caixa, aumentam capacidade/preço justo e respeitam limites', () => {
    let g = mk();
    const c0 = stadiumOf(g).capacity, p0 = fairPrice(g), cash = g.budgets[g.userClubId];
    expect(canUpgrade(g, 'capacity').ok).toBe(true);
    g = upgradeStadium(g, 'capacity');
    expect(stadiumOf(g).capacity).toBeGreaterThan(c0);
    expect(g.budgets[g.userClubId]).toBeLessThan(cash);
    g = upgradeStadium(g, 'comfort');
    expect(stadiumOf(g).comfort).toBe(1);
    expect(fairPrice(g)).toBeGreaterThan(p0 * 0.9 * (c0 / stadiumOf(g).capacity));
    const broke = { ...g, budgets: { ...g.budgets, [g.userClubId]: 0 } };
    expect(canUpgrade(broke, 'capacity').ok).toBe(false);
    expect(upgradeStadium(broke, 'capacity')).toBe(broke);
    let m = g; for (let i = 0; i < 40; i++) m = upgradeStadium({ ...m, budgets: { ...m.budgets, [m.userClubId]: 1e12 } }, 'comfort');
    expect(stadiumOf(m).comfort).toBe(MAX_COMFORT); // 25 etapas
  });
  it('preços menores: modernização em 25 etapas baratas e arquibancada a R$ 450 por lugar; cada etapa valoriza muito o ingresso', () => {
    const g = mk();
    expect(MAX_COMFORT).toBe(25);
    const baseline = baseIncome(divisionIndexOf(g, g.userClubId), g.clubs[g.userClubId].reputation, priceIndex(g));
    expect(comfortCost(g)).toBeLessThanOrEqual(Math.round(0.02 * baseline / 10_000) * 10_000 + 10_000); // ~1,8% da receita-base por etapa (era 6% a 30%)
    expect(expandCost(g)).toBeLessThanOrEqual(Math.round((capacityStep(g) * inflate(g, 450)) / 10_000) * 10_000);
    // cada etapa aumenta o preço justo em ~7% e a procura; no nível máximo a bilheteria é várias vezes maior
    const p0 = fairPrice(g);
    const g10 = { ...g, stadium: { ...stadiumOf(g), comfort: 10 } }, g25 = { ...g, stadium: { ...stadiumOf(g), comfort: 25 } };
    expect(fairPrice(g10) / p0).toBeGreaterThan(1.6);
    expect(fairPrice(g25) / p0).toBeGreaterThan(2.6);
    const rev = (x: typeof g) => { const price = fairPrice(x); return price * attendanceAt(x, Object.keys(x.teams).find((id) => id !== x.userClubId)!, price); };
    expect(rev(g25) / rev(g)).toBeGreaterThan(2.5);
    // custo cresce de leve a cada nível, mas o total das 25 etapas fica perto de 1 receita-base
    let cost = 0, m = g;
    for (let i = 0; i < 25; i++) { cost += comfortCost(m); m = upgradeStadium({ ...m, budgets: { ...m.budgets, [m.userClubId]: 1e12 } }, 'comfort'); }
    expect(cost).toBeLessThan(1.3 * baseline);
  });
});
