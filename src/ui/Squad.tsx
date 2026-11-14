import { useState } from 'react';
import { setFormation, swapPlayer, POS_ORDER } from '../engine/game';
import { teamRatings } from '../engine/squad';
import { FORMATIONS, type FormationId, type GameState, type Player } from '../engine/types';

const POS_LABEL = { GK: 'Goleiros', DEF: 'Defensores', MID: 'Meio-campistas', ATT: 'Atacantes' } as const;

export function Squad({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const team = game.teams[game.userClubId];
  const [sel, setSel] = useState<Player | null>(null);
  const r = teamRatings(team);

  const tap = (p: Player) => {
    const starter = team.lineup.includes(p.id);
    if (!sel) return setSel(p);
    if (sel.id === p.id) return setSel(null);
    if (sel.pos === p.pos && starter !== team.lineup.includes(sel.id)) {
      const [out, inn] = starter ? [p, sel] : [sel, p];
      onChange(swapPlayer(game, out.id, inn.id));
      return setSel(null);
    }
    setSel(p);
  };

  return (
    <>
      <div className="card">
        <label>Formação
          <select value={team.formation} onChange={(e) => { setSel(null); onChange(setFormation(game, e.target.value as FormationId)); }}>
            {(Object.keys(FORMATIONS) as FormationId[]).map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <div className="ratings">
          <span>GOL <b>{Math.round(r.gk)}</b></span><span>DEF <b>{Math.round(r.def)}</b></span>
          <span>MEI <b>{Math.round(r.mid)}</b></span><span>ATA <b>{Math.round(r.att)}</b></span>
          <span>GERAL <b>{r.overall}</b></span>
        </div>
        <small className="hint">{sel ? `Toque em um ${sel.pos === 'GK' ? 'goleiro' : 'jogador'} ${team.lineup.includes(sel.id) ? 'reserva' : 'titular'} da mesma posição para trocar.` : 'Toque em um jogador e depois em outro da mesma posição para trocar titular e reserva.'}</small>
      </div>
      {POS_ORDER.map((pos) => (
        <section key={pos}>
          <h3>{POS_LABEL[pos]}</h3>
          <ul className="list">
            {team.players.filter((p) => p.pos === pos)
              .sort((a, b) => Number(team.lineup.includes(b.id)) - Number(team.lineup.includes(a.id)) || b.strength - a.strength)
              .map((p) => {
                const starter = team.lineup.includes(p.id);
                return (
                  <li key={p.id}>
                    <button className={`row ${sel?.id === p.id ? 'sel' : ''} ${starter ? '' : 'bench'}`} onClick={() => tap(p)}>
                      <span className={`tag ${starter ? 'on' : ''}`}>{starter ? 'T' : 'R'}</span>
                      <span className="grow">{p.name}<small>{p.age} anos</small></span>
                      <b className="str">{p.strength}</b>
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </>
  );
}
