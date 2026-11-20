import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { calOf } from '../src/engine/calendar';
import { marketTick } from '../src/engine/aimarket';
import { prunePlayerMaps } from '../src/engine/aistate';
import { locate } from '../src/engine/dealeval';
import { newCareer, simulateToEnd } from '../src/engine/game';
import type { GameState } from '../src/engine/types';

const career = (): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, 77);

describe('ETAPA 8 — desempenho e crescimento ao longo das temporadas', () => {
  it('7 temporadas: o save não incha sem limite e o tempo de simular/virar não explode', () => {
    let g = career();
    const size: number[] = [], sim: number[] = [], turn: number[] = [];
    for (let s = 0; s < 7; s++) {
      const t0 = performance.now(); const e = simulateToEnd(g); const t1 = performance.now(); g = startNextSeason(e); const t2 = performance.now();
      size.push(JSON.stringify(g).length); sim.push(t1 - t0); turn.push(t2 - t1);
    }
    expect(size[6] / size[1]).toBeLessThan(1.35);               // antes da limpeza: 1,5x ou mais (conversas de renovação e cansaço acumulavam)
    expect(size[6]).toBeLessThan(4_000_000);
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    expect(Math.max(sim[5], sim[6])).toBeLessThan(med(sim.slice(0, 3)) * 3);   // antes: 2,5x em 10 temporadas e subindo sempre
    expect(Math.max(turn[5], turn[6])).toBeLessThan(med(turn.slice(0, 3)) * 3);
  }, 900_000);

  it('rotinas diárias não repetem: o mercado do mesmo dia roda uma vez só, e a limpeza da virada é idempotente e preserva quem existe', () => {
    let g = career();
    for (let i = 0; i < 40; i++) g = { ...g, cal: { ...calOf(g), day: calOf(g).day + 1 } };
    const a = marketTick(g), b = marketTick(a);
    expect(b).toBe(a);                                          // segundo processamento do mesmo dia não faz nada
    const p = prunePlayerMaps({ ...g, load: { ...(g.load ?? {}), fantasma: 9 }, renewTalks: { fantasma: { day: 1, tries: 1, refusals: 0 } } });
    expect(p.load!.fantasma).toBeUndefined(); expect(p.renewTalks!.fantasma).toBeUndefined();
    expect(prunePlayerMaps(p)).toBe(p);
    const some = g.teams.flamengo.players[0];
    const kept = prunePlayerMaps({ ...g, load: { [some.id]: 3 } });
    expect(kept.load![some.id]).toBe(3);
  });

  it('a busca de jogador livre não refaz o índice inteiro e acha livres e contratados', () => {
    const g = career();
    const free = { id: 'livre-x', name: 'Livre X', pos: 'MID' as const, age: 27, strength: 50 };
    const w = { ...g, freeAgents: [free] };
    expect(locate(w, 'livre-x')).toMatchObject({ clubId: null });
    const p = w.teams.flamengo.players[3];
    expect(locate(w, p.id)).toMatchObject({ clubId: 'flamengo' });
    expect(locate(w, 'nao-existe')).toBeUndefined();
  });
});
