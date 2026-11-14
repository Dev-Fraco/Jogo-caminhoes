import type { Club, MatchResult, TableRow } from './types';

export function computeTable(clubs: Club[], results: MatchResult[]): TableRow[] {
  const rows = new Map<string, TableRow>(
    clubs.map((c) => [c.id, { clubId: c.id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }]),
  );
  for (const r of results) {
    const h = rows.get(r.homeId)!, a = rows.get(r.awayId)!;
    h.played++; a.played++;
    h.gf += r.homeGoals; h.ga += r.awayGoals;
    a.gf += r.awayGoals; a.ga += r.homeGoals;
    if (r.homeGoals > r.awayGoals) { h.won++; a.lost++; h.points += 3; }
    else if (r.homeGoals < r.awayGoals) { a.won++; h.lost++; a.points += 3; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  const nameOf = new Map(clubs.map((c) => [c.id, c.name]));
  return [...rows.values()]
    .map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort((x, y) =>
      y.points - x.points || y.won - x.won || y.gd - x.gd || y.gf - x.gf ||
      nameOf.get(x.clubId)!.localeCompare(nameOf.get(y.clubId)!),
    );
}
