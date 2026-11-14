import { useEffect, useRef } from 'react';
import type { ClubData } from '../data/clubs';
import { formatBudget } from '../newgame/format';
import { groupByPosition, squadOverall, startingEleven } from '../newgame/squadInfo';
import { ClubBadge } from './ClubBadge';

const tier = (n: number) => (n >= 75 ? 'hi' : n >= 62 ? 'mid' : 'lo');

/** Folha com o elenco do clube (por posição), aberta a partir do cartão na Etapa 3. */
export function SquadSheet({ club, chosen, onChoose, onClose }: { club: ClubData; chosen: boolean; onChoose: () => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const xi = new Set(startingEleven(club.squad).map((p) => p.id));

  useEffect(() => {
    box.current?.focus();
  }, []);

  // Esc fecha; Tab fica preso dentro da folha
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
    <div className="ss-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ss" ref={box} role="dialog" aria-modal="true" aria-labelledby="ss-title" tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="ss-head">
          <ClubBadge club={club} size={64} />
          <div className="ss-id">
            <h2 id="ss-title">{club.name}</h2>
            <p>{club.stadium} · {club.city}</p>
            <p className="ss-stats">
              <span className="cc-swatch" aria-hidden="true"><i style={{ background: club.primaryColor }} /><i style={{ background: club.secondaryColor }} /></span>
              <span>Overall <b>{squadOverall(club.squad)}</b></span>
              <span>Orçamento <b>{formatBudget(club.budget)}</b></span>
              <span><b>{club.squad.length}</b> jogadores</span>
            </p>
          </div>
          <button type="button" className="ss-x" aria-label="Fechar elenco" onClick={onClose}>✕</button>
        </div>

        <div className="ss-body">
          <p className="ss-legend"><span className="ss-dot" aria-hidden="true" /> Titular (melhor time em 4-4-2)</p>
          {groupByPosition(club.squad).map((g) => (
            <section key={g.pos} className="ss-group">
              <h3>{g.label} <small>{g.players.length}</small></h3>
              <ul>
                {g.players.map((p) => (
                  <li key={p.id}>
                    <span className={`ss-dot ${xi.has(p.id) ? 'on' : ''}`} aria-label={xi.has(p.id) ? 'Titular' : 'Reserva'} />
                    <span className="ss-name">{p.name}</span>
                    <span className="ss-age">{p.age} anos</span>
                    <b className={`ss-ovr ${tier(p.strength)}`} title="Overall">{p.strength}</b>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="ss-foot">
          <button type="button" className="nw-btn" onClick={onClose}>Fechar</button>
          <button type="button" className="nw-btn go" onClick={onChoose} disabled={chosen}>{chosen ? 'Clube escolhido ✓' : 'Escolher este clube'}</button>
        </div>
      </div>
    </div>
  );
}
