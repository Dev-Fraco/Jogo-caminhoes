import type { MatchResult, TableRow } from './types';

export function computeTable(clubs: { id: string; name: string }[], results: MatchResult[]): TableRow[] {
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
  const sorted = [...rows.values()]
    .map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort((x, y) => y.points - x.points || y.won - x.won || y.gd - x.gd || y.gf - x.gf || nameOf.get(x.clubId)!.localeCompare(nameOf.get(y.clubId)!));
  // desempate final: confronto direto (pontos nos jogos entre os clubes empatados em pontos, vitórias, saldo e gols marcados), depois o nome
  const same = (a: TableRow, b: TableRow) => a.points === b.points && a.won === b.won && a.gd === b.gd && a.gf === b.gf;
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && same(sorted[i], sorted[j])) j++;
    if (j - i > 1) {
      const ids = new Set(sorted.slice(i, j).map((r) => r.clubId));
      const h2h = new Map<string, number>([...ids].map((id) => [id, 0]));
      for (const r of results) {
        if (!ids.has(r.homeId) || !ids.has(r.awayId)) continue;
        if (r.homeGoals > r.awayGoals) h2h.set(r.homeId, h2h.get(r.homeId)! + 3);
        else if (r.homeGoals < r.awayGoals) h2h.set(r.awayId, h2h.get(r.awayId)! + 3);
        else { h2h.set(r.homeId, h2h.get(r.homeId)! + 1); h2h.set(r.awayId, h2h.get(r.awayId)! + 1); }
      }
      const run = sorted.slice(i, j).sort((a, b) => h2h.get(b.clubId)! - h2h.get(a.clubId)! || nameOf.get(a.clubId)!.localeCompare(nameOf.get(b.clubId)!));
      sorted.splice(i, j - i, ...run);
    }
    i = j;
  }
  return sorted;
}
