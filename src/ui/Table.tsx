import { useState } from 'react';
import { divisionTable, PROMOTION_SLOTS, RELEGATION_SLOTS, userDivisionIndex } from '../engine/game';
import type { GameState } from '../engine/types';

/** Zona de cada posição: Série A tem Libertadores (1–4), Sul-Americana (5–6) e rebaixamento; as demais, acesso e rebaixamento. */
function zone(divIndex: number, divCount: number, pos: number, size: number): '' | 'lib' | 'sul' | 'acc' | 'rel' {
  if (divIndex < divCount - 1 && pos >= size - RELEGATION_SLOTS) return 'rel';
  if (divIndex === 0) return pos < 4 ? 'lib' : pos < 6 ? 'sul' : '';
  return pos < PROMOTION_SLOTS ? 'acc' : '';
}

export function Table({ game }: { game: GameState }) {
  const mineIndex = userDivisionIndex(game);
  const [idx, setIdx] = useState(mineIndex);
  const division = game.divisions[idx];
  const rows = divisionTable(game, division.id);
  const n = rows.length;
  const count = game.divisions.length;

  return (
    <>
      <div className="chips" role="tablist" aria-label="Divisão">
        {game.divisions.map((d, i) => (
          <button key={d.id} role="tab" aria-selected={i === idx} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)}>
            {d.name}{i === mineIndex ? ' ★' : ''}
          </button>
        ))}
      </div>
      <table className="table">
        <thead><tr><th>#</th><th className="l">Clube</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const c = game.clubs[r.clubId];
            return (
              <tr key={r.clubId} className={`${r.clubId === game.userClubId ? 'mine' : ''} ${zone(idx, count, i, n)}`}>
                <td>{i + 1}</td>
                <td className="l"><span className="dot" style={{ background: c.primaryColor }} /><span className="cname">{c.name}</span></td>
                <td><b>{r.points}</b></td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.gd}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="legend">
        {idx === 0 && <><i className="k lib" /> Libertadores <i className="k sul" /> Sul-Americana </>}
        {idx > 0 && <><i className="k acc" /> Acesso (sobem {PROMOTION_SLOTS}) </>}
        {idx < count - 1 && <><i className="k rel" /> Rebaixamento (descem {RELEGATION_SLOTS})</>}
      </p>
    </>
  );
}
