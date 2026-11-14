import { CLUBS_DATA } from './clubs';
import { getLeague } from './world';

/** A pirâmide do Campeonato Brasileiro (Série A → D) com os clubes de cada divisão, pronta para iniciar uma carreira. */
export function brazilPyramid() {
  return getLeague('BR', 'brasileirao')!.divisions.map((d) => ({ id: d.id, name: d.name, clubs: CLUBS_DATA[d.id] ?? [] }));
}
