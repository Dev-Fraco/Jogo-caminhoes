import { describe, expect, it } from 'vitest';
import { CLUBS_DATA } from '../src/data/clubs';
import { pyramidOf, slotsOfLeague } from '../src/data/pyramid';
import { getLeague } from '../src/data/world';
import { isSeasonOver, newCareer, playRound, startNextSeason, divisionTable } from '../src/engine/game';

const LEAGUES: [string, string][] = [['AR', 'liga-profesional'], ['EN', 'premier-league'], ['IT', 'serie-a-it'], ['ES', 'la-liga']];

describe('ligas estrangeiras', () => {
  it('cada divisão tem clubes e sigla única', () => {
    for (const [c, l] of LEAGUES) for (const d of getLeague(c, l)!.divisions) {
      const clubs = CLUBS_DATA[d.id];
      expect(clubs?.length, d.id).toBe(d.teams);
      expect(new Set(clubs.map((x) => x.shortName)).size, d.id).toBe(clubs.length);
    }
  });
  it('ids de clube únicos no mundo todo', () => {
    const ids = Object.values(CLUBS_DATA).flat().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it.each(LEAGUES)('carreira completa em %s/%s: temporada, acesso e rebaixamento', (c, l) => {
    const divisions = pyramidOf(c, l);
    const slots = slotsOfLeague(l);
    const user = divisions[1].clubs[0].id;
    let g = newCareer({ saveName: 't', coach: { name: 'Teste Silva', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: user, divisions, slots, leagueName: l }, 7);
    while (!isSeasonOver(g)) g = playRound(g).state;
    expect(divisionTable(g, divisions[0].id).length).toBe(divisions[0].clubs.length);
    const n = startNextSeason(g);
    expect(n.season).toBe(2027);
    n.divisions.forEach((d, i) => expect(d.clubIds.length).toBe(divisions[i].clubs.length));
    expect(new Set(n.divisions.flatMap((d) => d.clubIds)).size).toBe(Object.keys(n.clubs).length);
  });
});
