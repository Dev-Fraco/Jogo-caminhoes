import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/audio';
import { balanceOf, brl } from '../engine/bank';
import { casinoOf, COLORS, depositCharge, MIN_BET, MIN_DEPOSIT, PAYOUT, placeBet, withdraw } from '../engine/casino';
import type { CasinoColor, GameState } from '../engine/types';
import { ChargeView, getPending, setPending } from './AppKit';

interface Props { game: GameState; onChange: (g: GameState) => void; onOpenApp: (id: string) => void }
const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const css = (c: CasinoColor) => COLORS.find((x) => x.id === c)!.css;
const label = (c: CasinoColor) => COLORS.find((x) => x.id === c)!.label;

/** Cassino: escolha 1 cor (azul, preto ou vermelho), aposte e veja o sorteio. 33% de chance, acertou paga 2x. O saldo vem de um depósito por Pix. */
export function CasinoApp({ game, onChange, onOpenApp }: Props) {
  const c = casinoOf(game);
  const [tab, setTab] = useState<'play' | 'deposit' | 'history'>('play');
  const [color, setColor] = useState<CasinoColor | null>(null);
  const [stake, setStake] = useState('');
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState<string | undefined>();
  const [chargeId, setChargeId] = useState<string | null>(() => getPending('casino')?.chargeId ?? null);
  // sorteio: enquanto gira, o saldo mostrado é o antigo
  const [spin, setSpin] = useState<{ active: boolean; lit: number; drawn?: CasinoColor; won?: boolean; stake?: number; shownBalance: number } | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  if (chargeId) {
    return <div className="ph-app-screen"><ChargeView game={game} chargeId={chargeId} onOpenApp={onOpenApp} onDone={() => { setPending('casino', null); setChargeId(null); setTab('play'); }} doneText="O valor já está no seu saldo do Cassino. Boa sorte!" /></div>;
  }

  const startSpin = () => {
    setErr(undefined);
    if (!color) { setErr('Escolha uma cor.'); audio.sfx('error'); return; }
    const roll = Math.random();
    const r = placeBet(game, color, num(stake), roll);
    if (!r.ok) { setErr(r.error); audio.sfx('error'); return; }
    onChange(r.state);
    const old = c.balance;
    setSpin({ active: true, lit: 0, shownBalance: old });
    let ticks = 0;
    const idx = COLORS.findIndex((x) => x.id === r.bet.drawn);
    timer.current = window.setInterval(() => {
      ticks++;
      const lit = ticks < 22 ? ticks % 3 : idx; // gira e vai parando na cor sorteada
      if (ticks < 14) audio.sfx('click');
      if (ticks >= 24) {
        if (timer.current) window.clearInterval(timer.current);
        setSpin({ active: false, lit: idx, drawn: r.bet.drawn, won: r.won, stake: r.bet.stake, shownBalance: r.state.casino!.balance });
        audio.sfx(r.won ? 'goal' : 'error');
      } else setSpin((s) => (s ? { ...s, lit } : s));
    }, ticks < 10 ? 90 : 150);
  };

  const doDeposit = () => {
    const r = depositCharge(game, num(amount));
    if (!r.ok) { setErr(r.error); audio.sfx('error'); return; }
    onChange(r.state); setPending('casino', { chargeId: r.charge.id, selId: 'deposit' }); setChargeId(r.charge.id); setErr(undefined);
  };

  const balanceShown = spin ? spin.shownBalance : c.balance;
  return (
    <div className="ph-app-screen cs">
      <h2>🎰 Cassino</h2>
      <div className="cs-bal"><small>Saldo no Cassino</small><b>{brl(balanceShown)}</b></div>
      <div className="chips ap-chips" role="tablist">
        {([['play', 'Jogar'], ['deposit', 'Depósito'], ['history', 'Histórico']] as const).map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); setErr(undefined); }} disabled={!!spin?.active}>{l}</button>)}
      </div>

      {tab === 'play' && (
        <>
          <p className="bk-sub">Escolha <b>1 cor</b>. Cada cor tem 33% de chance e, se acertar, paga <b>{PAYOUT}x</b> (aposte R$ 30.000 e leve R$ 60.000).</p>
          <div className="cs-wheel" aria-live="polite">
            {COLORS.map((x, i) => (
              <div key={x.id} className={`cs-slot ${spin && spin.lit === i ? 'lit' : ''} ${spin && !spin.active && spin.drawn === x.id ? 'win' : ''}`} style={{ background: x.css }}>{x.label}</div>
            ))}
          </div>
          {spin?.active && <p className="cs-msg">Sorteando…</p>}
          {spin && !spin.active && (
            <p className={`cs-msg ${spin.won ? 'in' : 'out'}`} role="status">{spin.won ? `🎉 Saiu ${label(spin.drawn!)}! Você ganhou ${brl(spin.stake! * PAYOUT)}!` : `Saiu ${label(spin.drawn!)}. Você perdeu ${brl(spin.stake!)}.`}</p>
          )}
          <p className="ph-label">Sua cor</p>
          <div className="cs-pick" role="radiogroup" aria-label="Cor">
            {COLORS.map((x) => <button key={x.id} role="radio" aria-checked={color === x.id} className={color === x.id ? 'on' : ''} style={{ background: x.css }} onClick={() => setColor(x.id)} disabled={!!spin?.active}>{x.label}</button>)}
          </div>
          <div className="ph-form">
            <input inputMode="decimal" placeholder={`Valor da aposta (mín. R$ ${MIN_BET})`} value={stake} onChange={(e) => { setStake(e.target.value); setErr(undefined); }} aria-label="Valor da aposta" disabled={!!spin?.active} />
            <div className="ap-kinds">{[1000, 5000, 30000].map((v) => <button key={v} onClick={() => setStake(String(v))} disabled={!!spin?.active}>{brl(v).replace(',00', '')}</button>)}<button onClick={() => setStake(String(Math.floor(c.balance)))} disabled={!!spin?.active || c.balance < MIN_BET}>Tudo</button></div>
            {err && <p className="ph-pad-msg err" role="alert">{err}</p>}
            <button className="ph-btn pri bk-wide" onClick={startSpin} disabled={!!spin?.active}>Apostar</button>
            {c.balance <= 0 && <p className="bk-sub">Sem saldo no Cassino. Vá em "Depósito" para colocar dinheiro por Pix.</p>}
          </div>
          <p className="bk-sub">⚠️ Dinheiro fictício do jogo, mas aposte com responsabilidade: a casa sempre leva vantagem.</p>
        </>
      )}

      {tab === 'deposit' && (
        <>
          <p className="bk-sub">Seu saldo no banco: <b>{brl(balanceOf(game))}</b>. O depósito é feito por Pix: você informa o valor, copia a chave e paga no app do Banco.</p>
          <div className="ph-form">
            <input inputMode="decimal" placeholder={`Valor do depósito (mín. R$ ${MIN_DEPOSIT.toLocaleString('pt-BR')})`} value={amount} onChange={(e) => { setAmount(e.target.value); setErr(undefined); }} aria-label="Valor do depósito" />
            {err && <p className="ph-pad-msg err" role="alert">{err}</p>}
            <button className="ph-btn pri bk-wide" onClick={doDeposit}>Prosseguir</button>
          </div>
          <h3>Sacar</h3>
          <div className="ph-card">
            <p className="bk-sub">Leve o saldo do Cassino de volta para a sua conta.</p>
            <button className="ph-btn" disabled={c.balance < 1} onClick={() => { const r = withdraw(game, c.balance); if (r.ok) { onChange(r.state); audio.sfx('cash'); } }}>Sacar tudo ({brl(c.balance)})</button>
          </div>
        </>
      )}

      {tab === 'history' && (
        <>
          <div className="so-stats">
            <div><b>{brl(c.deposited).replace(',00', '')}</b><small>depositado</small></div>
            <div><b>{brl(c.wagered).replace(',00', '')}</b><small>apostado</small></div>
            <div><b>{brl(c.won).replace(',00', '')}</b><small>ganho</small></div>
          </div>
          {c.bets.length === 0 && <p className="ph-empty">Nenhuma aposta ainda.</p>}
          <ul className="so-posts">
            {c.bets.slice(0, 20).map((b) => (
              <li key={b.id}>
                <span className="cs-dot" style={{ background: css(b.color) }} />
                <span className="grow"><b>Apostou {label(b.color)} · saiu {label(b.drawn)}</b><small>Temp. {b.season}, rodada {b.round}</small></span>
                <b className={b.payout > 0 ? 'in' : 'out'}>{b.payout > 0 ? `+ ${brl(b.payout - b.stake)}` : `− ${brl(b.stake)}`}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
