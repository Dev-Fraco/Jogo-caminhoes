import { useState } from 'react';
import { divisionTable, slotsOf, userDivisionIndex } from '../engine/game';
import type { GameState } from '../engine/types';

/** Zona de cada posição: Série A tem Libertadores (1–4), Sul-Americana (5–6) e rebaixamento; as demais, acesso e rebaixamento. */
function zone(divIndex: number, divCount: number, pos: number, size: number, slots: number, brazil: boolean): '' | 'lib' | 'sul' | 'acc' | 'rel' {
  if (divIndex < divCount - 1 && pos >= size - slots) return 'rel';
  if (divIndex === 0) return brazil ? (pos < 4 ? 'lib' : pos < 6 ? 'sul' : '') : '';
  return pos < slots ? 'acc' : '';
}

export function Table({ game }: { game: GameState }) {
  const mineIndex = userDivisionIndex(game);
  const [idx, setIdx] = useState(mineIndex);
  const [showCup, setShowCup] = useState(false);
  const division = game.divisions[idx];
  const rows = divisionTable(game, division.id);
  const n = rows.length;
  const count = game.divisions.length;
  const slots = slotsOf(game);
  const brazil = game.leagueName === undefined;

  return (
    <>
      <div className="chips" role="tablist" aria-label="Divisão">
        {game.divisions.map((d, i) => (
          <button key={d.id} role="tab" aria-selected={!showCup && i === idx} className={!showCup && i === idx ? 'on' : ''} onClick={() => { setIdx(i); setShowCup(false); }}>
            {d.name}{i === mineIndex ? ' ★' : ''}
          </button>
        ))}
        {game.cup && <button role="tab" aria-selected={showCup} className={showCup ? 'on' : ''} onClick={() => setShowCup(true)}>🏆 Copa</button>}
      </div>
      {showCup && game.cup && <CupView game={game} />}
      {!showCup && <>
      <table className="table">
        <thead><tr><th>#</th><th className="l">Clube</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const c = game.clubs[r.clubId];
            return (
              <tr key={r.clubId} className={`${r.clubId === game.userClubId ? 'mine' : ''} ${zone(idx, count, i, n, slots, brazil)}`}>
                <td>{i + 1}</td>
                <td className="l"><span className="dot" style={{ background: c.primaryColor }} /><span className="cname">{c.name}</span></td>
                <td><b>{r.points}</b></td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.gd}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="legend">
        {idx === 0 && brazil && <><i className="k lib" /> Libertadores <i className="k sul" /> Sul-Americana </>}
        {idx > 0 && <><i className="k acc" /> Acesso (sobem {slots}) </>}
        {idx < count - 1 && <><i className="k rel" /> Rebaixamento (descem {slots})</>}
      </p>
      </>}
    </>
  );
}

/** Chaveamento da copa: as fases já sorteadas, da mais recente para a mais antiga; o seu jogo fica em destaque. */
function CupView({ game }: { game: GameState }) {
  const cup = game.cup!;
  const name = (id: string) => game.clubs[id].name;
  return (
    <div className="cup-view">
      {cup.championId && <p className="outcome">🏆 Campeão: <b>{name(cup.championId)}</b></p>}
      {[...cup.rounds].reverse().map((r) => (
        <section key={r.name}>
          <h3>{r.name}</h3>
          <ul className="list">
            {r.ties.map((t) => (
              <li key={t.homeId} className={t.homeId === game.userClubId || t.awayId === game.userClubId ? 'row mine' : 'row'}>
                <span className="grow right">{name(t.homeId)}</span>
                <b className="score">{t.winnerId ? `${t.homeGoals} - ${t.awayGoals}` : 'x'}</b>
                <span className="grow">{name(t.awayId)}{t.pens ? <small> ({t.pens[0]}–{t.pens[1]} pên.)</small> : null}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
