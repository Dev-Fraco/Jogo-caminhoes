import { useEffect, useRef, useState } from 'react';
import { setFormation, swapPlayer } from '../engine/game';
import { teamRatings } from '../engine/squad';
import { FORMATIONS, SPOT_LABEL, SPOT_SHORT, type FormationId, type GameState, type Player, type Position } from '../engine/types';
import { spotOf } from '../engine/squad';
import { badgeColors } from './badge';

const POS_ONE: Record<Position, string> = { GK: 'Goleiro', DEF: 'Defensor', MID: 'Meio-campista', ATT: 'Atacante' };
const ROW_Y: Record<Position, number> = { GK: 88, DEF: 68, MID: 44, ATT: 18 };

/** Nome curto para a camisa no campinho: primeiro nome + inicial do sobrenome. */
const shortName = (name: string) => { const [a, ...rest] = name.split(' '); return rest.length ? `${a} ${rest[rest.length - 1][0]}.` : a; };

/** Posição (x, y em %) de cada titular no campinho, conforme a formação (goleiro embaixo, ataque em cima). */
export function pitchLayout(starters: Player[]): { player: Player; x: number; y: number }[] {
  const out: { player: Player; x: number; y: number }[] = [];
  (['GK', 'DEF', 'MID', 'ATT'] as Position[]).forEach((pos) => {
    const row = starters.filter((p) => p.pos === pos);
    row.forEach((player, i) => out.push({ player, x: ((i + 1) / (row.length + 1)) * 100, y: ROW_Y[pos] }));
  });
  return out;
}

/** Folha com os jogadores que podem entrar/sair: troca sempre entre jogadores da mesma posição. */
function SwapSheet({ game, player, onSwap, onClose }: { game: GameState; player: Player; onSwap: (outId: string, inId: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const team = game.teams[game.userClubId];
  const isStarter = team.lineup.includes(player.id);
  const options = team.players.filter((p) => p.pos === player.pos && p.id !== player.id && team.lineup.includes(p.id) !== isStarter).sort((a, b) => b.strength - a.strength);

  useEffect(() => { box.current?.focus(); }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const f = Array.from(box.current!.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="ps-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ps" ref={box} role="dialog" aria-modal="true" aria-labelledby="sw-title" tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="ps-head">
          <span className="ps-ovr">{player.strength}</span>
          <div className="grow">
            <h2 id="sw-title">{player.name}</h2>
            <p>{SPOT_LABEL[spotOf(player)]} · {player.age} anos · {isStarter ? 'Titular' : 'Reserva'}</p>
          </div>
          <button className="ps-x" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>
        <h3 className="sw-h">{isStarter ? 'Substituir por (banco de reservas)' : 'Entra no lugar de (titulares)'}</h3>
        {options.length === 0 ? <p className="hint">Não há {isStarter ? 'reservas' : 'titulares'} da posição {POS_ONE[player.pos].toLowerCase()} para trocar.</p> : (
          <ul className="sw-list">
            {options.map((o) => {
              const diff = (isStarter ? o.strength - player.strength : player.strength - o.strength);
              return (
                <li key={o.id}>
                  <button className="ps-act" onClick={() => onSwap(isStarter ? player.id : o.id, isStarter ? o.id : player.id)}>
                    <strong><span className="sw-o">{o.strength}</span> {o.name}</strong>
                    <small>{o.age} anos · <b className={diff > 0 ? 'up' : diff < 0 ? 'down' : ''}>{diff > 0 ? `+${diff}` : diff} em relação ao ${isStarter ? 'titular' : 'reserva'} atual</b></small>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button className="btn ps-close" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

/** Editar escalação: campinho com os 11 titulares nas posições da formação; toque em um jogador para trocá-lo por um reserva. */
export function Lineup({ game, onChange, onBack }: { game: GameState; onChange: (g: GameState) => void; onBack: () => void }) {
  const team = game.teams[game.userClubId];
  const club = game.clubs[game.userClubId];
  const r = teamRatings(team);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const { bg, fg } = badgeColors(club);

  const starters = team.lineup.map((id) => team.players.find((p) => p.id === id)!).filter(Boolean);
  const bench = team.players.filter((p) => !team.lineup.includes(p.id)).sort((a, b) => b.strength - a.strength);
  const open = team.players.find((p) => p.id === openId) ?? null;
  const layout = pitchLayout(starters);
  const close = () => { setOpenId(null); opener.current?.focus(); };
  const openFor = (p: Player, el: HTMLElement) => { opener.current = el; setNotice(null); setOpenId(p.id); };

  return (
    <>
      <div className="lu-top">
        <button className="ghost" onClick={onBack}>← Início</button>
        <h2>Editar escalação</h2>
      </div>
      <div className="card">
        <label>Formação
          <select value={team.formation} onChange={(e) => { setNotice(null); onChange(setFormation(game, e.target.value as FormationId)); }}>
            {(Object.keys(FORMATIONS) as FormationId[]).map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <div className="ratings">
          <span>GOL <b>{Math.round(r.gk)}</b></span><span>DEF <b>{Math.round(r.def)}</b></span>
          <span>MEI <b>{Math.round(r.mid)}</b></span><span>ATA <b>{Math.round(r.att)}</b></span>
          <span>GERAL <b>{r.overall}</b></span>
        </div>
        <small className="hint">Toque em um jogador do campo para trocá-lo por um reserva da mesma posição.</small>
      </div>

      <div role="status" aria-live="polite">{notice && <p className="tf-notice">{notice}</p>}</div>

      <div className="pitch" role="group" aria-label={`Escalação em ${team.formation}`}>
        <span className="pl-mid" /><span className="pl-circle" /><span className="pl-box top" /><span className="pl-box bottom" />
        {layout.map(({ player: p, x, y }) => (
          <button key={p.id} className="pp" style={{ left: `${x}%`, top: `${y}%`, '--pp-bg': bg, '--pp-fg': fg } as React.CSSProperties}
            aria-label={`${p.name}, ${SPOT_LABEL[spotOf(p)]}, overall ${p.strength}. Trocar jogador`} onClick={(e) => openFor(p, e.currentTarget)}>
            <span className="pp-c">{p.strength}</span>
            <span className="pp-n">{shortName(p.name)}<small className="pp-s">{SPOT_SHORT[spotOf(p)]}</small></span>
          </button>
        ))}
      </div>

      <section>
        <h3>Banco de reservas ({bench.length})</h3>
        <ul className="list">
          {bench.map((p) => (
            <li key={p.id}>
              <button className="row bench" aria-label={`${p.name}, reserva, ${SPOT_LABEL[spotOf(p)]}, overall ${p.strength}. Escolher quem sai`} onClick={(e) => openFor(p, e.currentTarget)}>
                <span className="tag">{SPOT_SHORT[spotOf(p)]}</span>
                <span className="grow">{p.name}<small>{p.age} anos</small></span>
                <b className="str">{p.strength}</b>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {open && <SwapSheet game={game} player={open} onClose={close} onSwap={(outId, inId) => {
        const o = team.players.find((p) => p.id === outId)!, i = team.players.find((p) => p.id === inId)!;
        onChange(swapPlayer(game, outId, inId)); setOpenId(null); setNotice(`✔ ${i.name} entra no lugar de ${o.name}.`);
      }} />}
    </>
  );
}
