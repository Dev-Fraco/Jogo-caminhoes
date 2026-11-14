import { useState } from 'react';
import { COMPS, CONTINENTALS, groupTable, type Comp } from '../engine/continental';
import { clubOf } from '../engine/lookup';
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
  const [view, setView] = useState<'div' | 'cup' | Comp | 'mundial'>('div');
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
          <button key={d.id} role="tab" aria-selected={view === 'div' && i === idx} className={view === 'div' && i === idx ? 'on' : ''} onClick={() => { setIdx(i); setView('div'); }}>
            {d.name}{i === mineIndex ? ' ★' : ''}
          </button>
        ))}
        {game.cup && <button role="tab" aria-selected={view === 'cup'} className={view === 'cup' ? 'on' : ''} onClick={() => setView('cup')}>🏆 Copa</button>}
        {COMPS.map((k) => game[k] && <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{CONTINENTALS[k].icon} {k === 'lib' ? 'Liberta' : 'Champions'}</button>)}
        {game.mundial && <button role="tab" aria-selected={view === 'mundial'} className={view === 'mundial' ? 'on' : ''} onClick={() => setView('mundial')}>🌍 Mundial</button>}
      </div>
      {view === 'cup' && game.cup && <CupView game={game} />}
      {(view === 'lib' || view === 'ucl') && game[view] && <LibView game={game} comp={view} />}
      {view === 'mundial' && game.mundial && <MundialView game={game} />}
      {view === 'div' && <>
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
  const name = (id: string) => clubOf(game, id).name;
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

/** Libertadores: o seu grupo primeiro, depois os outros, e o mata-mata. */
function LibView({ game, comp }: { game: GameState; comp: Comp }) {
  const lib = game[comp]!;
  const name = (id: string) => clubOf(game, id).name;
  const groups = [...lib.groups].sort((a, b) => Number(b.clubIds.includes(game.userClubId)) - Number(a.clubIds.includes(game.userClubId)));
  return (
    <div className="cup-view">
      {lib.championId && <p className="outcome">🏆 Campeão: <b>{name(lib.championId)}</b></p>}
      {[...lib.ko].reverse().map((r) => (
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
      {groups.map((gr) => (
        <section key={gr.id}>
          <h3>Grupo {gr.id.slice(1)}</h3>
          <table className="table">
            <thead><tr><th>#</th><th className="l">Clube</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
            <tbody>
              {groupTable(game, gr).map((r, i) => (
                <tr key={r.clubId} className={`${r.clubId === game.userClubId ? 'mine' : ''} ${i < 2 ? 'acc' : ''}`}>
                  <td>{i + 1}</td><td className="l"><span className="cname">{name(r.clubId)}</span></td>
                  <td><b>{r.points}</b></td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.gd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

/** Mundial de Clubes: semifinais cruzadas e final. */
function MundialView({ game }: { game: GameState }) {
  const m = game.mundial!;
  const name = (id: string) => clubOf(game, id).name;
  return (
    <div className="cup-view">
      {m.championId && <p className="outcome">🏆 Campeão mundial: <b>{name(m.championId)}</b></p>}
      {[...m.ko].reverse().map((r) => (
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
