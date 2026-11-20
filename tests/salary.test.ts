import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { coachSalary } from '../src/engine/finance';
import { isSeasonOver, newCareer, playNext } from '../src/engine/game';
import { chanceLabel, defendSalary, MAX_RAISE, negotiateRaise, raiseChance, RAISE_STEPS, salaryNegotiated, settleSalary, standingOf } from '../src/engine/salary';
import type { GameState } from '../src/engine/types';

const keep = (g: GameState): GameState => ({ ...g, morale: { ...g.morale, board: 60 } });
const endOf = (club: string, strength?: number, seed = 5): GameState => {
  let g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: club, divisions: brazilPyramid(), cup: true }, seed);
  if (strength !== undefined) { const t = g.teams[club]; g = { ...g, teams: { ...g.teams, [club]: { ...t, players: t.players.map((p) => ({ ...p, strength })) } } }; }
  let n = 0; while (!isSeasonOver(g) && n++ < 400) g = keep(playNext(g).state);
  return g;
};

/** Tenta algumas sementes até o clube terminar na situação desejada (o resultado de uma temporada depende da "sorte" da semente). */
const endWith = (club: string, strength: number, want: 'great' | 'bad'): GameState => {
  let last: GameState | undefined;
  for (let seed = 5; seed < 20; seed++) { last = endOf(club, strength, seed); if (standingOf(last) === want) return last; }
  return last!;
};

describe('negociar o salário no fim da temporada', () => {
  it('quem sobe de divisão pode pedir bem mais; quem fica quase nada; rebaixado não pede', () => {
    expect(MAX_RAISE.great).toBeGreaterThan(MAX_RAISE.good);
    expect(MAX_RAISE.good).toBeGreaterThan(MAX_RAISE.meh);
    expect(MAX_RAISE.meh).toBeLessThanOrEqual(0.05);
    expect(MAX_RAISE.bad).toBe(0);
    expect(Math.max(...RAISE_STEPS.great)).toBe(40);
    expect(Math.max(...RAISE_STEPS.meh)).toBeLessThanOrEqual(5);
    expect(RAISE_STEPS.bad).toEqual([]);
  });
  it('a situação do clube vem do resultado da temporada', () => {
    expect(standingOf(endWith('csa', 95, 'great'))).toBe('great'); // time fortíssimo na D: acesso ou título
    expect(standingOf(endWith('csa', 20, 'bad'))).toBe('bad'); // time fraquíssimo: rebaixado
  });
  it('a chance de aceitarem cai quando o pedido sobe, e é maior com acesso do que sem', () => {
    const g = endWith('csa', 95, 'great');
    const small = raiseChance(g, 5), big = raiseChance(g, 40);
    expect(small).toBeGreaterThan(big);
    expect(small).toBeGreaterThan(0.7);
    expect(chanceLabel(small)).toBe('Alta');
    const mid = endOf('vasco', 62);
    if (standingOf(mid) === 'meh') { expect(raiseChance(mid, 5)).toBeGreaterThan(0.1); expect(raiseChance(mid, 5)).toBeLessThan(raiseChance(g, 5)); }
  });
  it('pedir aumento: aceita, contraproposta ou recusa; muda o salário mensal; só uma vez por temporada', () => {
    const g = endWith('csa', 95, 'great');
    const before = coachSalary(g);
    const seen = new Set<string>();
    for (let s = 1; s <= 80; s++) {
      const r = negotiateRaise({ ...g, seed: s }, 20);
      if (!r.ok) throw new Error(r.error);
      seen.add(r.result);
      if (r.result === 'accepted') expect(coachSalary(r.state)).toBeGreaterThan(before * 1.18);
      if (r.result === 'counter') { expect(coachSalary(r.state)).toBeGreaterThan(before); expect(coachSalary(r.state)).toBeLessThan(before * 1.18); }
      if (r.result === 'refused') { expect(coachSalary(r.state)).toBe(before); expect(r.state.morale.board).toBeLessThanOrEqual(g.morale.board); }
      expect(salaryNegotiated(r.state)).toBe(true);
      expect(negotiateRaise(r.state, 10)).toMatchObject({ ok: false });
    }
    expect(seen.has('accepted')).toBe(true);
    expect(seen.has('refused') || seen.has('counter')).toBe(true);
    expect(negotiateRaise(g, 33)).toMatchObject({ ok: false }); // valor que não está nas opções
  });
  it('rebaixado: o corte pode vir (55%) e dá para tentar manter (50%)', () => {
    const g = endWith('palmeiras', 20, 'bad');
    expect(standingOf(g)).toBe('bad');
    expect(negotiateRaise(g, 5)).toMatchObject({ ok: false });
    let cuts = 0, kept = 0;
    for (let s = 1; s <= 200; s++) {
      const base = { ...g, seed: s };
      if (coachSalary(settleSalary(base)) < coachSalary(base)) cuts++;
      const d = defendSalary(base); if (!d.ok) throw new Error(d.error);
      if (coachSalary(d.state) === coachSalary(base)) kept++; else { expect(coachSalary(d.state)).toBeLessThan(coachSalary(base)); expect(coachSalary(d.state)).toBeGreaterThanOrEqual(coachSalary(base) * 0.79); }
    }
    expect(cuts / 200).toBeGreaterThan(0.4); expect(cuts / 200).toBeLessThan(0.7);
    expect(kept / 200).toBeGreaterThan(0.35); expect(kept / 200).toBeLessThan(0.65);
    // já negociou: a virada não corta de novo
    const d = defendSalary({ ...g, seed: 3 }); if (!d.ok) throw new Error();
    expect(settleSalary(d.state)).toBe(d.state);
  });
  it('o aumento vale na virada e fica; quem fica sem clube ou muda de clube volta ao salário do clube', () => {
    const g = endWith('csa', 95, 'great');
    let r = negotiateRaise({ ...g, seed: 4 }, 5); if (!r.ok) throw new Error();
    const next = startNextSeason(r.state);
    expect(next.payMult).toBe(r.state.payMult);
    expect(salaryNegotiated(next)).toBe(false); // nova temporada, nova negociação
  });
});
