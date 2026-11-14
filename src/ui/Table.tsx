import { computeTable } from '../engine/table';
import type { GameState } from '../engine/types';

export function Table({ game }: { game: GameState }) {
  const rows = computeTable(game.clubs, game.results);
  const byId = new Map(game.clubs.map((c) => [c.id, c]));
  const n = rows.length;
  return (
    <table className="table">
      <thead><tr><th>#</th><th className="l">Clube</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
      <tbody>
        {rows.map((r, i) => {
          const zone = i < 4 ? 'lib' : i < 6 ? 'sul' : i >= n - 4 ? 'rel' : '';
          return (
            <tr key={r.clubId} className={`${r.clubId === game.userClubId ? 'mine' : ''} ${zone}`}>
              <td>{i + 1}</td>
              <td className="l"><span className="dot" style={{ background: byId.get(r.clubId)!.color }} />{byId.get(r.clubId)!.short}</td>
              <td><b>{r.points}</b></td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.gd}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
