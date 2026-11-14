import { pyramidOf, slotsOfLeague } from '../data/pyramid';
import { COUNTRY_ORDER, WORLD_DATA } from '../data/world';
import { isSeasonOver, newCareer, simulateToEnd, startNextSeason } from './game';
import type { GameState } from './types';

/** Ligas que dá para simular (todas as divisões têm clubes). */
export function simLeagues(): { countryId: string; leagueId: string; label: string }[] {
  return COUNTRY_ORDER.flatMap((c) => WORLD_DATA[c].leagues.map((l) => ({ countryId: c, leagueId: l.id, label: `${WORLD_DATA[c].flag} ${WORLD_DATA[c].name} — ${l.name}` })));
}

/** Mundo para assistir: sem treinador e sem escolher time. Todos os clubes são da IA. */
export function newObserverWorld(countryId: string, leagueId: string, seed = Date.now() % 2147483647): GameState {
  const divisions = pyramidOf(countryId, leagueId);
  const league = WORLD_DATA[countryId].leagues.find((l) => l.id === leagueId)!;
  const g = newCareer({
    saveName: `Simulação — ${league.name}`, coach: { name: 'Observador', nationality: countryId, reputation: 'unknown' }, difficulty: 'normal', mode: 'sim',
    season: 2026, userClubId: divisions[0].clubs[0].id, divisions, cup: leagueId === 'brasileirao', slots: slotsOfLeague(leagueId), leagueName: league.name,
  }, seed);
  return { ...g, unemployed: true, observer: true };
}

/** Simula uma temporada inteira e passa para a seguinte (as temporadas encerradas ficam em `history`). */
export function simulateOneYear(g: GameState): GameState {
  const done = isSeasonOver(g) ? g : simulateToEnd(g);
  return startNextSeason(done);
}
