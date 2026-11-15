import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/audio';
import { baseWage } from '../engine/finance';
import { SPOT_LABEL } from '../engine/types';
import { spotOf } from '../engine/squad';
import { fairplayBlock, fairplayWarning } from '../engine/fairplay';
import { dirClub, MAX_TALKS_PER_ROUND, negotiate, quote, talksLeft, type NegotiationResult } from '../engine/market';
import type { GameState } from '../engine/types';
import { formatBudget } from '../newgame/format';

const brl = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));

interface Props { game: GameState; clubId: string; playerId: string; onChange: (g: GameState) => void; onClose: () => void; onDone: (msg: string) => void }

/** Negociação de uma contratação: valor da transferência (para o clube), salário e duração do contrato (para o jogador). */
export function NegotiationSheet({ game, clubId, playerId, onChange, onClose, onDone }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const q = quote(game, clubId, playerId);
  const club = dirClub(game, clubId);
  const [fee, setFee] = useState(q?.askFee ?? 0);
  const [wage, setWage] = useState(q ? Math.round(baseWage(game, game.userClubId, q.player) / 1_000) * 1_000 : 0);
  const [years, setYears] = useState(q ? Math.min(q.yearsMax, Math.max(q.yearsMin, 3)) : 3);
  const [res, setRes] = useState<NegotiationResult | null>(null);
  useEffect(() => { box.current?.focus(); }, []);
  if (!q || !club) return null;
  const p = q.player;
  const budget = game.budgets[game.userClubId];
  const left = talksLeft(game, playerId);

  const send = () => {
    const r = negotiate(game, clubId, playerId, { fee, wage, years });
    setRes(r);
    if (r.blocked) { audio.sfx('error'); return; }
    onChange(r.state);
    if (r.deal) { audio.sfx('cash'); onDone(`${p.name} é o novo reforço do clube! ${brl(fee)} · ${brl(wage)} por ano · ${years} ${years === 1 ? 'ano' : 'anos'}.${fairplayBlock(r.state) ?? fairplayWarning(r.state) ? ` ${fairplayBlock(r.state) ?? fairplayWarning(r.state)}` : ''}`); }
    else audio.sfx('error');
  };
  const step = (v: number, pct: number) => Math.max(0, Math.round((v * (1 + pct)) / (v > 1_000_000 ? 10_000 : 1_000)) * (v > 1_000_000 ? 10_000 : 1_000));

  return (
    <div className="ps-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ps ng" ref={box} role="dialog" aria-modal="true" aria-labelledby="ng-title" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="ps-head">
          <span className="ps-ovr">{p.strength}</span>
          <div className="grow">
            <h2 id="ng-title">{p.name}</h2>
            <p>{SPOT_LABEL[spotOf(p)]} · {p.age} anos · {club.name} ({club.flag} {club.divisionName})</p>
            <p>Valor de mercado: <b>{formatBudget(q.price)}</b> · Preço pedido: <b>{formatBudget(q.askFee)}</b></p>
          </div>
          <button className="ps-x" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>

        {(fairplayBlock(game) || fairplayWarning(game)) && <p className="un-warn" role="alert">{fairplayBlock(game) ?? fairplayWarning(game)}</p>}
        <p className="ng-budget">Orçamento do clube: <b>{formatBudget(budget)}</b> · Negociações restantes nesta rodada: <b>{left}/{MAX_TALKS_PER_ROUND}</b></p>

        <fieldset className="ng-box">
          <legend>🏟️ Valor da transferência ({club.name})</legend>
          <div className="ng-input">
            <button onClick={() => setFee(step(fee, -0.05))} aria-label="Diminuir 5%">−</button>
            <input inputMode="numeric" aria-label="Valor da transferência" value={fee.toLocaleString('pt-BR')} onChange={(e) => setFee(num(e.target.value))} />
            <button onClick={() => setFee(step(fee, 0.05))} aria-label="Aumentar 5%">+</button>
          </div>
          {res?.club.text && <p className={`ng-say ${res.club.ok ? 'ok' : 'no'}`}>{res.club.text}{res.club.counter ? <button className="ng-counter" onClick={() => setFee(res.club.counter!)}>Aceitar {brl(res.club.counter)}</button> : null}</p>}
        </fieldset>

        <fieldset className="ng-box">
          <legend>📝 Contrato do jogador</legend>
          <label className="ng-lbl">Salário por ano <small>({brl(wage / 12)} por mês)</small></label>
          <div className="ng-input">
            <button onClick={() => setWage(step(wage, -0.05))} aria-label="Diminuir 5%">−</button>
            <input inputMode="numeric" aria-label="Salário por ano" value={wage.toLocaleString('pt-BR')} onChange={(e) => setWage(num(e.target.value))} />
            <button onClick={() => setWage(step(wage, 0.05))} aria-label="Aumentar 5%">+</button>
          </div>
          <label className="ng-lbl">Duração do contrato</label>
          <div className="ng-years" role="radiogroup" aria-label="Duração">
            {[1, 2, 3, 4, 5].map((y) => <button key={y} role="radio" aria-checked={years === y} className={years === y ? 'on' : ''} onClick={() => setYears(y)}>{y} {y === 1 ? 'ano' : 'anos'}</button>)}
          </div>
          {res?.player.text && <p className={`ng-say ${res.player.ok ? 'ok' : 'no'}`}>{res.player.text}{res.player.counter ? <button className="ng-counter" onClick={() => setWage(res.player.counter!)}>Aceitar {brl(res.player.counter)}</button> : null}</p>}
        </fieldset>

        {res?.blocked && <p className="ng-say no" role="alert">{res.blocked}</p>}
        <button className="primary" onClick={send} disabled={left === 0}>Enviar proposta</button>
        <button className="btn ps-close" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
