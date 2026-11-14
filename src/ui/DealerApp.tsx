import { useState } from 'react';
import { audio } from '../audio/audio';
import { assetsOf, buyVehicle, resaleValue, sellAsset, vehicleById, vehicleQuote, VEHICLES, VEHICLE_LOAN, type Vehicle, type VehicleKind } from '../engine/assets';
import { balanceOf, brl } from '../engine/bank';
import type { GameState } from '../engine/types';
import { ChargeView, getPending, setPending, Stars } from './AppKit';

interface Props { game: GameState; onChange: (g: GameState) => void; onOpenApp: (id: string) => void }
const KINDS: ('Todos' | VehicleKind)[] = ['Todos', 'Moto', 'Econômico', 'Utilitário', 'Elétrico', 'Esportivo', 'Luxo'];

/** Concessionária: 15 veículos, compra à vista ou financiada (entrada + parcelas em boleto), sempre pagando por Pix. */
export function DealerApp({ game, onChange, onOpenApp }: Props) {
  const [tab, setTab] = useState<'cat' | 'mine'>('cat');
  const [kind, setKind] = useState<(typeof KINDS)[number]>('Todos');
  const [sel, setSel] = useState<Vehicle | null>(() => { const p = getPending('dealer'); return p ? (vehicleById(p.selId) ?? null) : null; });
  const [chargeId, setChargeId] = useState<string | null>(() => getPending('dealer')?.chargeId ?? null);
  const [msg, setMsg] = useState<string | undefined>();
  const owned = assetsOf(game).vehicles;

  if (chargeId) {
    const v = sel;
    return <div className="ph-app-screen"><ChargeView game={game} chargeId={chargeId} onOpenApp={onOpenApp} onDone={() => { setPending('dealer', null); setChargeId(null); setSel(null); setTab('mine'); }} doneText={v ? `${v.name} agora é seu! Veja em "Meus veículos".` : 'Compra concluída.'} /></div>;
  }
  if (sel) return <div className="ph-app-screen"><VehicleDetail game={game} v={sel} back={() => setSel(null)} onStart={(mode) => {
    const r = buyVehicle(game, sel.id, mode);
    if (!r.ok) { setMsg(r.error); audio.sfx('error'); return; }
    onChange(r.state); setPending('dealer', { chargeId: r.charge.id, selId: sel.id }); setChargeId(r.charge.id);
  }} msg={msg} /></div>;

  const list = VEHICLES.filter((v) => kind === 'Todos' || v.kind === kind);
  return (
    <div className="ph-app-screen">
      <h2>🚗 Concessionária</h2>
      <p className="bk-sub">Saldo: <b>{brl(balanceOf(game))}</b> · Todas as compras são pagas por Pix.</p>
      <div className="chips ap-chips" role="tablist">
        <button role="tab" aria-selected={tab === 'cat'} className={tab === 'cat' ? 'on' : ''} onClick={() => setTab('cat')}>Catálogo</button>
        <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Meus veículos ({owned.length})</button>
      </div>
      {tab === 'cat' && (
        <>
          <div className="ap-kinds">{KINDS.map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k}</button>)}</div>
          <ul className="ap-list">
            {list.map((v) => (
              <li key={v.id}><button onClick={() => { setSel(v); setMsg(undefined); }}>
                <span className="ph-ico big">{v.icon}</span>
                <span className="grow"><b>{v.name}</b><small>{v.kind} · <Stars n={v.prestige} /></small></span>
                <b>{brl(v.price)}</b>
              </button></li>
            ))}
          </ul>
        </>
      )}
      {tab === 'mine' && (
        <>
          {owned.length === 0 && <p className="ph-empty">Você ainda não tem veículos.</p>}
          <ul className="ap-list">
            {owned.map((o) => {
              const v = vehicleById(o.id)!;
              const value = resaleValue(o.price, o.season, game.season);
              return (
                <li key={o.id} className="ap-own">
                  <span className="ph-ico big">{v.icon}</span>
                  <span className="grow"><b>{v.name}</b><small>{o.contractId ? '💳 Financiado' : '✔ Quitado'} · vale {brl(value)}</small></span>
                  <button className="ph-btn" disabled={!!o.contractId} onClick={() => { const r = sellAsset(game, 'vehicle', o.id); if (r.ok) { onChange(r.state); audio.sfx('cash'); } }}>Vender</button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function VehicleDetail({ game, v, back, onStart, msg }: { game: GameState; v: Vehicle; back: () => void; onStart: (m: { type: 'cash' } | { type: 'finance'; installments: number }) => void; msg?: string }) {
  const [mode, setMode] = useState<'cash' | 'finance'>('cash');
  const [n, setN] = useState(VEHICLE_LOAN.options[1]);
  const q = vehicleQuote(v.price, n);
  const need = mode === 'cash' ? v.price : q.entry;
  return (
    <>
      <button className="bk-back" onClick={back}>‹ Voltar</button>
      <div className="ap-hero"><span>{v.icon}</span><h2>{v.name}</h2><small>{v.kind} · <Stars n={v.prestige} /></small><b>{brl(v.price)}</b></div>
      <div className="chips ap-chips" role="radiogroup" aria-label="Forma de pagamento">
        <button role="radio" aria-checked={mode === 'cash'} className={mode === 'cash' ? 'on' : ''} onClick={() => setMode('cash')}>À vista</button>
        <button role="radio" aria-checked={mode === 'finance'} className={mode === 'finance' ? 'on' : ''} onClick={() => setMode('finance')}>Financiar</button>
      </div>
      {mode === 'finance' && (
        <div className="ph-card">
          <p className="bk-sub">Entrada de {Math.round(VEHICLE_LOAN.entry * 100)}% por Pix e o resto em parcelas mensais (boleto), com juros de {(VEHICLE_LOAN.rate * 100).toFixed(1).replace('.', ',')}% ao mês. 1 mês = 3 rodadas.</p>
          <div className="ap-kinds">{VEHICLE_LOAN.options.map((o) => <button key={o} className={n === o ? 'on' : ''} onClick={() => setN(o)}>{o}x</button>)}</div>
          <div className="ph-row static"><span className="grow">Entrada (Pix)</span><b>{brl(q.entry)}</b></div>
          <div className="ph-row static"><span className="grow">{n} parcelas de</span><b>{brl(q.monthly)}</b></div>
          <div className="ph-row static"><span className="grow">Total pago</span><b>{brl(q.total)}</b></div>
          <p className="bk-sub">Atrasar 2 boletos faz o banco retomar o veículo.</p>
        </div>
      )}
      <p className="bk-sub">Você paga agora por Pix: <b>{brl(need)}</b> · Saldo: {brl(balanceOf(game))}</p>
      {msg && <p className="ph-pad-msg err" role="alert">{msg}</p>}
      <button className="ph-btn pri bk-wide" onClick={() => onStart(mode === 'cash' ? { type: 'cash' } : { type: 'finance', installments: n })}>Comprar e gerar Pix</button>
    </>
  );
}
