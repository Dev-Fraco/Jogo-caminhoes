import { useEffect, useRef, useState } from 'react';
import { POS_ORDER } from '../engine/game';
import { checkRelease, myValue, releasePlayer, toggleLoanList, toggleTransferList } from '../engine/roster';
import { teamRatings } from '../engine/squad';
import { MAX_SQUAD } from '../engine/transfers';
import { wageOf } from '../engine/finance';
import { contractLeft, renewalQuote } from '../engine/market';
import { renewOffer } from '../engine/contractwatch';
import { potentialOf, TALENT_LABEL, tierOf } from '../engine/potential';
import { SPOT_LABEL, SPOT_SHORT, type GameState, type Player, type Position } from '../engine/types';
import { spotOf } from '../engine/squad';
import { isInjured, remainingLabel, roundsLeft } from '../engine/injuries';
import { ScreenTitle } from './FmParts';
import { Face } from './Face';
import { formatBudget } from '../newgame/format';

const POS_ICON: Record<Position, string> = { GK: '🧤', DEF: '🛡️', MID: '🏟️', ATT: '⚽' };
const POS_LABEL: Record<Position, string> = { GK: 'Goleiros', DEF: 'Defensores', MID: 'Meio-campistas', ATT: 'Atacantes' };
const POS_ONE: Record<Position, string> = { GK: 'Goleiro', DEF: 'Defensor', MID: 'Meio-campista', ATT: 'Atacante' };

interface SheetProps { game: GameState; player: Player; onChange: (g: GameState) => void; onClose: () => void; onDone: (msg: string) => void }

/** Opções de um jogador do seu elenco: listas de transferência e de empréstimo, e dispensa. */
function PlayerSheet({ game, player: p, onChange, onClose, onDone }: SheetProps) {
  const box = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState(false);
  const team = game.teams[game.userClubId];
  const starter = team.lineup.includes(p.id);
  const onSale = game.transferList.includes(p.id), onLoan = game.loanList.includes(p.id);
  const value = myValue(game, p);
  const release = checkRelease(game, p.id, true);
  const left = contractLeft(game, p);
  const rq = renewalQuote(game, p.id);
  const [renewing, setRenewing] = useState(false);
  const [rWage, setRWage] = useState(rq ? rq.wageDemand : 0);
  const [rYears, setRYears] = useState(rq ? Math.max(rq.yearsMin, 2) : 2);
  const [rMsg, setRMsg] = useState<{ text: string; ok: boolean; counter?: number } | null>(null);

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
      <div className="ps" ref={box} role="dialog" aria-modal="true" aria-labelledby="ps-title" tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="ps-head">
          <span className="ps-ovr">{p.strength}</span>
          <div className="grow">
            <h2 id="ps-title">{p.name}</h2>
            <p>{SPOT_LABEL[spotOf(p)]} · {p.age} anos · {starter ? 'Titular' : 'Reserva'}</p>
            {isInjured(game, p.id) && <p className="ps-warn">🤕 Lesionado ({game.injuries?.[p.id]?.kind}): fora por mais {remainingLabel(game, p.id)}{game.injuries?.[p.id]?.severity === 'grave' ? ' · lesão grave' : ''}.</p>}
            <p>Valor de mercado: <b>{formatBudget(value)}</b></p>
            {p.age <= 25 && <p>Potencial: <b>~{Math.round(potentialOf(p) / 5) * 5}</b> · {TALENT_LABEL[tierOf(potentialOf(p))]}</p>}
            {p.formedAt && <p>Formado no <b>{game.clubs[p.formedAt]?.name ?? p.formedAt}</b>{p.formedSeason ? ` (${p.formedSeason})` : ''}</p>}
            {game.mood?.[p.id] && <p className="ps-warn">😠 {game.mood[p.id].want === 'sair' ? 'Quer sair' : 'Pede aumento'}: {game.mood[p.id].reason}</p>}
            <p>Salário: <b>{formatBudget(wageOf(game, game.userClubId, p))}/ano</b> · {left === null ? 'sem contrato fixo' : left <= 1 ? <b className="ps-warn">contrato termina no fim desta temporada</b> : `contrato por mais ${left} temporadas`}</p>
          </div>
          <button className="ps-x" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>

        <div className="ps-actions">
          {!renewing ? (
            <button className="ps-act" onClick={() => { setRenewing(true); setRMsg(null); }}>
              <strong>Renovar contrato</strong>
              <small>Negocie um novo salário e a duração com o jogador.</small>
            </button>
          ) : rq && (
            <div className="ps-confirm" role="group" aria-label="Renovar contrato">
              <p>Salário atual: <b>{formatBudget(rq.current)}</b>/ano. Quanto você oferece por ano?</p>
              <div className="ng-input">
                <button onClick={() => setRWage(Math.max(0, Math.round(rWage * 0.95 / 1000) * 1000))} aria-label="Diminuir 5%">−</button>
                <input inputMode="numeric" aria-label="Novo salário por ano" value={rWage.toLocaleString('pt-BR')} onChange={(e) => setRWage(Number(e.target.value.replace(/\D/g, '')))} />
                <button onClick={() => setRWage(Math.round(rWage * 1.05 / 1000) * 1000)} aria-label="Aumentar 5%">+</button>
              </div>
              <div className="ng-years" role="radiogroup" aria-label="Duração">{[1, 2, 3, 4, 5].map((y) => <button key={y} role="radio" aria-checked={rYears === y} className={rYears === y ? 'on' : ''} onClick={() => setRYears(y)}>{y} {y === 1 ? 'ano' : 'anos'}</button>)}</div>
              {rMsg && <p className={`ng-say ${rMsg.ok ? 'ok' : 'no'}`}>{rMsg.text}{rMsg.counter ? <button className="ng-counter" onClick={() => setRWage(rMsg.counter!)}>Aceitar R$ {rMsg.counter.toLocaleString('pt-BR')}</button> : null}</p>}
              <button className="primary" onClick={() => { const r = renewOffer(game, p.id, rWage, rYears); setRMsg({ text: r.text, ok: r.ok, counter: r.counter?.wage }); if (r.counter?.years) setRYears(r.counter.years); if (r.ok) { onChange(r.state); setRenewing(false); } else if (r.state !== game) onChange(r.state); }}>Propor renovação</button>
              <button className="btn" onClick={() => setRenewing(false)}>Cancelar</button>
            </div>
          )}
          <button className={`ps-act ${onSale ? 'on' : ''}`} onClick={() => { onChange(toggleTransferList(game, p.id)); }}>
            <strong>{onSale ? 'Retirar da lista de transferência' : 'Colocar na lista de transferência'}</strong>
            <small>{onSale ? 'Os clubes deixam de fazer propostas de compra.' : `Outros clubes poderão fazer propostas de compra, em torno de ${formatBudget(value)}.`}</small>
          </button>
          <button className={`ps-act ${onLoan ? 'on' : ''}`} onClick={() => { onChange(toggleLoanList(game, p.id)); }}>
            <strong>{onLoan ? 'Retirar da lista de empréstimo' : 'Colocar na lista de empréstimo'}</strong>
            <small>{onLoan ? 'Os clubes deixam de pedir o jogador emprestado.' : 'Outros clubes pagam uma taxa pelo empréstimo; o jogador volta no fim da temporada.'}</small>
          </button>
          {!asking ? (
            <button className="ps-act danger" disabled={!release.ok} onClick={() => setAsking(true)}>
              <strong>Dispensar jogador</strong>
              <small>{release.ok ? 'O jogador deixa o clube, sem custo e sem compensação.' : release.text}</small>
            </button>
          ) : (
            <div className="ps-confirm" role="alertdialog" aria-label="Confirmar dispensa">
              <p>Dispensar <b>{p.name}</b>? Isso não pode ser desfeito.</p>
              <button className="ps-act danger solid" onClick={() => { onChange(releasePlayer(game, p.id)); onDone(`${p.name} foi dispensado.`); }}><strong>Sim, dispensar</strong></button>
              <button className="btn" onClick={() => setAsking(false)}>Cancelar</button>
            </div>
          )}
        </div>
        <button className="btn ps-close" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

/** Elenco: todos os jogadores do clube; toque em um jogador para ver as opções. */
export function Squad({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const team = game.teams[game.userClubId];
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = team.players.find((p) => p.id === openId) ?? null;
  const loaned = game.loans.map((l) => ({ loan: l, player: game.teams[l.hostClubId]?.players.find((p) => p.id === l.playerId) })).filter((x) => x.player);

  const ratings = teamRatings(team);
  const avgAge = (team.players.reduce((t, p) => t + p.age, 0) / Math.max(1, team.players.length)).toFixed(1).replace('.', ',');
  const squadValue = team.players.reduce((t, p) => t + myValue(game, p), 0);
  const close = () => { setOpenId(null); opener.current?.focus(); };
  const hurtList = team.players.filter((p) => isInjured(game, p.id)).sort((a, b) => roundsLeft(game, b.id) - roundsLeft(game, a.id));

  return (
    <>
      <ScreenTitle icon="👕" title="Elenco" />
      <div className="card sq-top sq-strip">
        <div><small>Overall</small><b>{ratings.overall}</b></div>
        <div><small>Idade média</small><b>{avgAge}</b></div>
        <div><small>Valor do elenco</small><b>{formatBudget(squadValue)}</b></div>
        <div><small>Jogadores</small><b>{team.players.length}/{MAX_SQUAD}</b></div>
        <div><small>À venda</small><b>{game.transferList.length}</b></div>
        <div><small>Emprestados</small><b>{loaned.length}</b></div>
      </div>
      {hurtList.length > 0 && <p className="sq-hurtbar" role="status">🤕 <b>{hurtList.length} {hurtList.length === 1 ? 'lesionado' : 'lesionados'}:</b> {hurtList.slice(0, 4).map((p) => `${p.name} (${remainingLabel(game, p.id)})`).join(', ')}{hurtList.length > 4 ? '…' : ''}</p>}
      <p className="sq-info"><span aria-hidden="true">ℹ️</span> Toque em um jogador para vender, emprestar ou dispensar.</p>
      <div role="status" aria-live="polite">{notice && <p className="tf-notice">{notice}</p>}</div>

      {POS_ORDER.map((pos) => {
        const list = team.players.filter((p) => p.pos === pos)
          .sort((a, b) => Number(team.lineup.includes(b.id)) - Number(team.lineup.includes(a.id)) || b.strength - a.strength);
        const avg = list.length ? Math.round(list.reduce((t, p) => t + p.strength, 0) / list.length) : 0;
        return (
          <section key={pos} className="sq-pos">
            <h3><span className="sq-ico" aria-hidden="true">{POS_ICON[pos]}</span>{POS_LABEL[pos]} <em>MÉDIA: {avg}</em></h3>
            <ul className="sq-grid">
              {list.map((p) => {
                const starter = team.lineup.includes(p.id);
                return (
                  <li key={p.id}>
                    <button className={`sq-card ${pos} ${starter ? '' : 'bench'}`} aria-label={`${p.name}, overall ${p.strength}. Abrir opções`} onClick={(e) => { opener.current = e.currentTarget; setNotice(null); setOpenId(p.id); }}>
                      <span className="sq-top2">
                        <Face id={p.id} age={p.age} size={46} />
                        <span className={`sq-ovr ${p.strength >= 80 ? 'elite' : ''}`}>{p.strength}</span>
                      </span>
                      <span className="sq-role">{SPOT_SHORT[spotOf(p)]} · {starter ? 'TITULAR' : 'RESERVA'}</span>
                      {isInjured(game, p.id) && <em className="sq-hurt" title={`Lesionado: fora por mais ${remainingLabel(game, p.id)}`}>🤕 {remainingLabel(game, p.id)}</em>}
                      <span className="sq-name">{p.name}</span>
                      <span className="sq-meta">{p.age} anos
                        {game.transferList.includes(p.id) && <em className="pill sale">À venda</em>}
                        {game.loanList.includes(p.id) && <em className="pill loan">Empr.</em>}
                      </span>
                      <span className="sq-val">{formatBudget(myValue(game, p))}</span>
                      <span className="sq-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, p.strength)}%` }} /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {loaned.length > 0 && (
        <section>
          <h3>Emprestados (voltam no fim da temporada)</h3>
          <ul className="list">
            {loaned.map(({ loan, player }) => (
              <li key={loan.playerId}><div className="row"><span className="grow">{player!.name}<small>{POS_ONE[player!.pos]} · {game.clubs[loan.hostClubId].name}</small></span><b className="str">{player!.strength}</b></div></li>
            ))}
          </ul>
        </section>
      )}

      {open && <PlayerSheet game={game} player={open} onChange={onChange} onClose={close} onDone={(m) => { setOpenId(null); setNotice(`✔ ${m}`); }} />}
    </>
  );
}
