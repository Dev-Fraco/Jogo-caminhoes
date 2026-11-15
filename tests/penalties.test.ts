import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { penaltyTakers, shootout, shootoutKicks } from '../src/engine/cup';
import { pendingEvent } from '../src/engine/events';
import { newCareer, playNext } from '../src/engine/game';
import { makeRng } from '../src/engine/rng';
import type { GameState } from '../src/engine/types';

const mk = (seed: number): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, seed);
const keep = (g: GameState): GameState => ({ ...g, morale: { ...g.morale, board: 60 } });

describe('pênaltis cobrança por cobrança', () => {
  it('as cobranças batem com o placar e dão o mesmo resultado de antes', () => {
    for (let s = 1; s <= 200; s++) {
      const a = shootoutKicks(makeRng(s), 70, 60, ['A', 'B', 'C'], ['X', 'Y']);
      expect(a.score[0]).toBe(a.home.filter((k) => k.scored).length);
      expect(a.score[1]).toBe(a.away.filter((k) => k.scored).length);
      expect(a.score[0]).not.toBe(a.score[1]);
      expect(a.home.length).toBe(a.away.length);
      expect(a.home.length).toBeGreaterThanOrEqual(5);
      expect(shootout(makeRng(s), 70, 60)).toEqual(a.score);
      expect(a.home[3].name).toBe('A'); // 4ª cobrança volta ao 1º batedor da lista
      expect(a.away[2].name).toBe('X');
    }
  });
  it('quem bate: os melhores de linha primeiro, goleiro por último', () => {
    const g = mk(2);
    const t = g.teams.palmeiras;
    const names = penaltyTakers(t);
    const byName = new Map(t.players.map((p) => [p.name, p]));
    expect(names.length).toBe(11);
    expect(byName.get(names[10])!.pos).toBe('GK');
    const ovr = names.slice(0, 10).map((n) => byName.get(n)!.strength);
    expect(ovr).toEqual([...ovr].sort((a, b) => b - a));
  });
  it('no jogo do seu clube (copa) o resultado traz as cobranças', () => {
    let found = false;
    for (let seed = 1; seed <= 80 && !found; seed++) {
      let g = mk(seed);
      for (let i = 0; i < 80 && !found; i++) {
        const ev = pendingEvent(g);
        const r = playNext(g);
        const mine = r.results.find((x) => x.homeId === 'palmeiras' || x.awayId === 'palmeiras');
        if (ev?.kind === 'cup' && mine?.pens) {
          found = true;
          expect(mine.penKicks).toBeTruthy();
          expect(mine.penKicks!.home.filter((k) => k.scored).length).toBe(mine.pens[0]);
          expect(mine.penKicks!.away.filter((k) => k.scored).length).toBe(mine.pens[1]);
          expect(mine.penKicks!.home[0].name).toBeTruthy();
        }
        g = keep(r.state);
      }
    }
    expect(found).toBe(true);
  });
});
