import { COUNTRY_ORDER, WORLD_DATA } from '../data/world';
import type { GameState } from './types';

/** País e liga da carreira (pela 1ª divisão da pirâmide). */
export function homeLeague(g: Pick<GameState, 'divisions'>): { countryId: string; countryName: string; flag: string; leagueName: string } {
  const first = g.divisions[0].id;
  for (const cid of COUNTRY_ORDER) for (const l of WORLD_DATA[cid].leagues) if (l.divisions[0].id === first) return { countryId: cid, countryName: WORLD_DATA[cid].name, flag: WORLD_DATA[cid].flag, leagueName: l.name };
  return { countryId: 'BR', countryName: 'Brasil', flag: '🇧🇷', leagueName: 'Campeonato' };
}

