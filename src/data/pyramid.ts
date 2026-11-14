import { CLUBS_DATA } from './clubs';
import { getLeague } from './world';

/** Pirâmide de uma liga (divisão principal → inferiores) com os clubes de cada divisão, pronta para iniciar uma carreira. */
export function pyramidOf(countryId: string, leagueId: string) {
  const league = getLeague(countryId, leagueId);
  if (!league) throw new Error('Liga inexistente');
  return league.divisions.map((d) => ({ id: d.id, name: d.alias ?? d.name, clubs: CLUBS_DATA[d.id] ?? [] }));
}

/** Quantos clubes sobem/descem entre divisões vizinhas em cada liga (padrão: 4). */
const SLOTS: Record<string, number> = { 'premier-league': 3, bundesliga: 2, 'ligue-1': 3, 'primeira-liga': 2, 'serie-a-it': 3, 'la-liga': 3, 'liga-profesional': 2 };
export const slotsOfLeague = (leagueId: string) => SLOTS[leagueId] ?? 4;

/** A pirâmide do Campeonato Brasileiro (Série A → D). */
export function brazilPyramid() {
  return getLeague('BR', 'brasileirao')!.divisions.map((d) => ({ id: d.id, name: d.name, clubs: CLUBS_DATA[d.id] ?? [] }));
}
