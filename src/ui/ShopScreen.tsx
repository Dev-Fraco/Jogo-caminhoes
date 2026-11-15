import { useState } from 'react';
import { audio } from '../audio/audio';
import { coachMoneyOf } from '../engine/finance';
import { appsUsed, CHIPS, chipBlocked, chipLeft, chipNumberOf, chipOf, modelOf, ownsPhone, PHONE_MODELS, phoneOf, type ChipId, type PhoneModel } from '../engine/phone';
import { brl0, buyChip, buyPhoneCash, buyPhonePix } from '../engine/shop';
import type { GameState } from '../engine/types';
import { ChargeView, getPending, setPending } from './AppKit';
import { ScreenTitle } from './FmParts';

/** Desenho dos chips: Morto (roxo, boneco de palito de braços e pernas abertos), Escuro (vermelho, nome com 3 raios sobre o "o") e Toim (azul, 3 linhas vermelhas no canto inferior direito). */
export function ChipArt({ id, size = 120 }: { id: ChipId; size?: number }) {
  const w = 120, h = 80;
  const base = { Morto: '#7a3fd0', Escuro: '#d12a2a', Toim: '#1f5fd8' }[id === 'morto' ? 'Morto' : id === 'escuro' ? 'Escuro' : 'Toim'];
  const oX = 100, oY = 56; // o texto ocupa x 12–108 (textLength fixo), então o "o" final fica por volta de x 100
  const ray = (deg: number) => { const a = (deg * Math.PI) / 180; const r1 = 9, r2 = 16; return <line key={deg} x1={oX + Math.sin(a) * r1} y1={oY - 6 - Math.cos(a) * r1} x2={oX + Math.sin(a) * r2} y2={oY - 6 - Math.cos(a) * r2} stroke="#fff" strokeWidth="3" strokeLinecap="round" />; };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={size} height={(size * h) / w} role="img" aria-label={`Chip ${id}`} className="chip-art">
      <path d="M8 2h86l18 18v52a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z" fill={base} stroke="#000" strokeOpacity=".35" strokeWidth="1.5" />
      <path d="M8 2h86l18 18v6H2V8a6 6 0 0 1 6-6z" fill="#fff" opacity=".08" />
      {id === 'morto' && (
        <g stroke="#fff" strokeWidth="3.6" strokeLinecap="round" fill="none">
          <circle cx="60" cy="24" r="7" fill="#fff" stroke="none" />
          <line x1="60" y1="31" x2="60" y2="52" />
          <line x1="60" y1="36" x2="40" y2="28" /><line x1="60" y1="36" x2="80" y2="28" />
          <line x1="60" y1="52" x2="44" y2="70" /><line x1="60" y1="52" x2="76" y2="70" />
        </g>
      )}
      {id === 'escuro' && (
        <g>
          <text x="12" y="66" fontSize="23" fontWeight="800" fill="#fff" fontFamily="Inter, Arial, sans-serif" textLength="96" lengthAdjust="spacingAndGlyphs">Escuro</text>
          {[0, 30, 60].map(ray)}
        </g>
      )}
      {id === 'toim' && (
        <g fill="#e02020">
          {[0, 1, 2].map((i) => <rect key={i} x={w - 4 - w * 0.1} y={h - 8 - 7 * (3 - i) - 2 * (2 - i) + 7} width={w * 0.1} height="5" rx="1" />)}
        </g>
      )}
    </svg>
  );
}

function PhoneArt({ m }: { m: PhoneModel }) {
  return (
    <svg viewBox="0 0 60 100" width="56" height="94" aria-hidden="true" className="shop-phone">
      <rect x="3" y="2" width="54" height="96" rx="9" fill={m.color} stroke="#000" strokeOpacity=".4" strokeWidth="2" />
      <rect x="8" y="9" width="44" height="80" rx="5" fill="#0b1220" />
      <rect x="8" y="9" width="44" height="80" rx="5" fill="url(#g)" opacity=".0" />
      <rect x="10" y="12" width="40" height="40" rx="4" fill={m.color} opacity=".55" />
      <circle cx="30" cy="6" r="1.6" fill="#000" opacity=".6" />
      <rect x="20" y="93" width="20" height="2" rx="1" fill="#fff" opacity=".4" />
      {m.price >= 28_000 && <circle cx="45" cy="18" r="4" fill="#fff" opacity=".35" />}
    </svg>
  );
}

interface Props { game: GameState; onChange: (g: GameState) => void; onOpenPhone: () => void }

/** Mega-zona Luiz: loja de celulares e chips. A primeira compra é em dinheiro (você está sem celular); trocas são por Pix. */
export function ShopScreen({ game, onChange, onOpenPhone }: Props) {
  const own = ownsPhone(game);
  const cur = modelOf(game);
  const chip = chipOf(game);
  const wallet = coachMoneyOf(game);
  const [chargeId, setChargeId] = useState<string | null>(() => getPending('shop')?.chargeId ?? null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pickChip, setPickChip] = useState(false);

  if (chargeId) {
    return (
      <>
        <ScreenTitle icon="🛒" title="Mega-zona Luiz" />
        <div className="card shop-pay"><ChargeView game={game} chargeId={chargeId} onOpenApp={() => onOpenPhone()} onDone={() => { setPending('shop', null); setChargeId(null); }} doneText="Pagamento confirmado! O novo celular já é seu." /></div>
      </>
    );
  }

  const speedLabel = (m: PhoneModel) => (m.speed >= 1.5 ? 'Bem lento' : m.speed >= 1.1 ? 'Lento' : m.speed >= .8 ? 'Normal' : m.speed >= .5 ? 'Rápido' : 'Ultra rápido');
  const buy = (m: PhoneModel) => {
    setMsg(null);
    if (!own) {
      const r = buyPhoneCash(game, m.id);
      if (!r.ok) { setMsg({ text: r.error, ok: false }); audio.sfx('error'); return; }
      onChange(r.state); audio.sfx('cash'); setPickChip(true);
      setMsg({ text: `Você comprou o ${m.name} em dinheiro. Agora escolha um chip.`, ok: true });
      return;
    }
    const r = buyPhonePix(game, m.id);
    if (!r.ok) { setMsg({ text: r.error, ok: false }); audio.sfx('error'); return; }
    onChange(r.state); setPending('shop', { chargeId: r.charge.id, selId: m.id }); setChargeId(r.charge.id);
  };
  const buyC = (id: ChipId) => {
    const r = buyChip(game, id);
    if (!r.ok) { setMsg({ text: r.error, ok: false }); audio.sfx('error'); return; }
    onChange(r.state); audio.sfx('cash'); setPickChip(false); setMsg({ text: `Chip ${CHIPS.find((c) => c.id === id)!.name} instalado! Seu número é ${chipNumberOf(r.state)}: use-o para criar conta nos apps e receber o código por SMS. O chip vale 1 ano.`, ok: true });
  };

  return (
    <>
      <ScreenTitle icon="🛒" title="Mega-zona Luiz" />
      <div className="card shop-hero">
        <p><b>Seu dinheiro:</b> {brl0(wallet)}</p>
        {own ? (
          <>
            <p>Seu aparelho: <b>{cur.name}</b> · memória {appsUsed(game)}/{cur.apps >= 99 ? '∞' : cur.apps} apps</p>
            <p>Chip: <b>{chip ? chip.name : chipBlocked(game) ? 'bloqueado' : 'nenhum'}</b>{chipNumberOf(game) && <> · número <b className="shop-num">{chipNumberOf(game)}</b></>}{chip && chipLeft(game) !== undefined && <> · bloqueia em {chipLeft(game)} rodadas</>}</p>
          </>
        ) : (
          <p className="shop-warn">📵 Você está sem celular. Compre um aqui: a primeira compra é em <b>dinheiro</b>, sem Pix.</p>
        )}
        {msg && <p className={`shop-msg ${msg.ok ? 'ok' : 'bad'}`} role="status">{msg.text}</p>}
      </div>

      {pickChip && (
        <section>
          <h3>Escolha seu chip</h3>
          <ChipList onBuy={buyC} current={chip?.id} wallet={wallet} />
        </section>
      )}

      <section>
        <h3>Celulares</h3>
        <ul className="shop-list">
          {PHONE_MODELS.map((m) => {
            const mine = own && phoneOf(game).model === m.id;
            return (
              <li key={m.id} className={`shop-item ${mine ? 'mine' : ''}`}>
                <PhoneArt m={m} />
                <div className="grow">
                  <b>{m.name}</b>
                  <small>{m.ram} RAM · {m.storage}</small>
                  <small>{m.apps >= 99 ? 'Memória de sobra para todos os apps' : `Cabem ${m.apps} apps`} · {speedLabel(m)}</small>
                  <small className="shop-blurb">{m.blurb}</small>
                  <strong className="shop-price">{brl0(m.price)}</strong>
                </div>
                <button className="primary" disabled={mine} onClick={() => buy(m)}>{mine ? 'Seu aparelho' : own ? 'Comprar por Pix' : 'Comprar em dinheiro'}</button>
              </li>
            );
          })}
        </ul>
      </section>

      {!pickChip && own && (
        <section>
          <h3>Chips (dados móveis)</h3>
          <ChipList onBuy={buyC} current={chip?.id} wallet={wallet} />
          <p className="hint">O chip vale 1 ano e traz um número novo: ele recebe o SMS de confirmação para criar conta nos apps. Para os dados móveis, assine o plano no app Internet de Chip.</p>
        </section>
      )}
    </>
  );
}

function ChipList({ onBuy, current, wallet }: { onBuy: (id: ChipId) => void; current?: ChipId; wallet: number }) {
  return (
    <ul className="shop-chips">
      {CHIPS.map((c) => (
        <li key={c.id}>
          <ChipArt id={c.id} />
          <b>{c.name}</b>
          <small>{brl0(c.price)} · dinheiro · vale 1 ano</small>
          <button className="primary" disabled={current === c.id || wallet < c.price} onClick={() => onBuy(c.id)}>{current === c.id ? 'Em uso' : 'Comprar chip'}</button>
        </li>
      ))}
    </ul>
  );
}
