import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { calOf, matchDayOf } from '../src/engine/calendar';
import { fixturesOfRound, newCareer, playNext, userDivision } from '../src/engine/game';
import { upcomingMatches } from '../src/engine/upcoming';
import type { GameState } from '../src/engine/types';

const mk = (club = 'palmeiras'): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: club, divisions: brazilPyramid(), cup: true }, 4);
const keep = (g: GameState): GameState => ({ ...g, morale: { ...g.morale, board: 60 } });

describe('próximos jogos no calendário', () => {
  it('traz adversários reais com datas crescentes que batem com o calendário', () => {
    const g = mk();
    const list = upcomingMatches(g, 10);
    expect(list.length).toBeGreaterThan(5);
    expect(list.every((m) => m.homeId === 'palmeiras' || m.awayId === 'palmeiras')).toBe(true);
    for (let i = 1; i < list.length; i++) expect(list[i].day).toBeGreaterThan(list[i - 1].day);
    expect(list[0].day).toBeGreaterThanOrEqual(matchDayOf(g.seed, g.season, calOf(g).start, 0));
    expect(list[0].day).toBe(matchDayOf(g.seed, g.season, calOf(g).start, calOf(g).slot)); // o 1º é o próximo evento
    expect(new Set(list.map((m) => m.day)).size).toBe(list.length);
  });
  it('depois do estadual, mostra as rodadas do campeonato do clube', () => {
    let g = mk();
    while (g.estadual?.due) g = keep(playNext(g).state);
    const list = upcomingMatches(g, 6);
    const f = fixturesOfRound(g, g.round, userDivision(g).id).find((x) => x.homeId === 'palmeiras' || x.awayId === 'palmeiras')!;
    expect(list[0].homeId).toBe(f.homeId);
    expect(list[0].awayId).toBe(f.awayId);
    expect(list[0].label).toMatch(/Rodada/);
    expect(list[0].home).toBe(f.homeId === 'palmeiras');
  });
  it('sem clube não há jogos seus', () => {
    expect(upcomingMatches({ ...mk(), unemployed: true })).toEqual([]);
  });
});
