import { describe, expect, it } from 'vitest';
import { playNext } from '../src/engine/game';
import { makeCareer } from './helpers';

describe('sorte da partida', () => {
  it('sem sorte gravada o jogo é o de sempre; com sorte gravada muda e a semente do save volta ao normal', () => {
    const g = makeCareer();
    const a = playNext(g).results.map((r) => `${r.homeGoals}-${r.awayGoals}`).join();
    expect(playNext(g).results.map((r) => `${r.homeGoals}-${r.awayGoals}`).join()).toBe(a);
    const l1 = { ...g, luck: 12345 };
    const r1 = playNext(l1);
    expect(playNext(l1).results).toEqual(r1.results); // mesma sorte, mesmo jogo (fechar e reabrir repete)
    expect(r1.state.seed).toBe(g.seed); expect(r1.state.luck).toBeUndefined();
    const outs = new Set([1, 2, 3, 4, 5, 6].map((n) => JSON.stringify(playNext({ ...g, luck: n * 7919 }).results.map((r) => [r.homeGoals, r.awayGoals]))));
    expect(outs.size).toBeGreaterThan(1);
  });
});
