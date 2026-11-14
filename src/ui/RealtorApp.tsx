import { useState } from 'react';
import { audio } from '../audio/audio';
import { assetsOf, buyHome, currentRental, endRent, HOUSES_BUY, HOUSES_RENT, homeById, HOUSE_LOAN, houseQuote, rentHome, resaleValue, sellAsset, type Home } from '../engine/assets';
import { balanceOf, brl } from '../engine/bank';
import type { GameState } from '../engine/types';
import { ChargeView, getPending, setPending, Stars } from './AppKit';

interface Props { game: GameState; onChange: (g: GameState) => void; onOpenApp: (id: string) => void }

/** Corretor de Imóveis: casas para comprar (à vista ou financiadas) e para alugar (R$ 600 a R$ 50 mil por mês). */
export function RealtorApp({ game, onChange, onOpenApp }: Props) {
  const [tab, setTab] = useState<'buy' | 'rent' | 'mine'>('rent');
  const [sel, setSel] = useState<Home | null>(() => { const p = getPending('realtor'); return p ? (homeById(p.selId) ?? null) : null; });
  const [chargeId, setChargeId] = useState<string | null>(() => getPending('realtor')?.chargeId ?? null);
  const [msg, setMsg] = useState<string | undefined>();
  const a = assetsOf(game);
  const rental = currentRental(game);

  if (chargeId) return <div className="ph-app-screen"><ChargeView game={game} chargeId={chargeId} onOpenApp={onOpenApp} onDone={() => { setPending('realtor', null); setChargeId(null); setSel(null); setTab('mine'); }} doneText={sel?.rent ? `Aluguel de ${sel.name} confirmado! Os boletos chegam todo mês.` : `${sel?.name ?? 'Imóvel'} agora é seu!`} /></div>;
  if (sel) return <div className="ph-app-screen"><HomeDetail game={game} h={sel} back={() => setSel(null)} msg={msg} onStart={(mode) => {
    const r = sel.rent ? rentHome(game, sel.id) : buyHome(game, sel.id, mode);
    if (!r.ok) { setMsg(r.error); audio.sfx('error'); return; }
    onChange(r.state); setPending('realtor', { chargeId: r.charge.id, selId: sel.id }); setChargeId(r.charge.id);
  }} /></div>;

  const Row = ({ h }: { h: Home }) => (
    <li><button onClick={() => { setSel(h); setMsg(undefined); }}>
      <span className="ph-ico big">{h.icon}</span>
      <span className="grow"><b>{h.name}</b><small>{h.blurb} <Stars n={h.prestige} /></small></span>
      <b>{h.rent ? `${brl(h.rent)}/mês` : brl(h.price!)}</b>
    </button></li>
  );

  return (
    <div className="ph-app-screen">
      <h2>🏠 Corretor de Imóveis</h2>
      <p className="bk-sub">Saldo: <b>{brl(balanceOf(game))}</b> · Pagamentos por Pix e boleto.</p>
      <div className="chips ap-chips" role="tablist">
        <button role="tab" aria-selected={tab === 'rent'} className={tab === 'rent' ? 'on' : ''} onClick={() => setTab('rent')}>Alugar</button>
        <button role="tab" aria-selected={tab === 'buy'} className={tab === 'buy' ? 'on' : ''} onClick={() => setTab('buy')}>Comprar</button>
        <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Meus imóveis</button>
      </div>
      {tab === 'rent' && <ul className="ap-list">{HOUSES_RENT.map((h) => <Row key={h.id} h={h} />)}</ul>}
      {tab === 'buy' && <ul className="ap-list">{HOUSES_BUY.map((h) => <Row key={h.id} h={h} />)}</ul>}
      {tab === 'mine' && (
        <>
          <h3>Moradia alugada</h3>
          {rental ? (
            <ul className="ap-list"><li className="ap-own">
              <span className="ph-ico big">{homeById(rental.assetId)?.icon}</span>
              <span className="grow"><b>{rental.description}</b><small>{brl(rental.monthly)} por mês (boleto)</small></span>
              <button className="ph-btn" onClick={() => { const r = endRent(game); if (r.ok) onChange(r.state); else setMsg(r.error); }}>Encerrar</button>
            </li></ul>
          ) : <p className="ph-empty">Você não está alugando nenhum imóvel.</p>}
          <h3>Imóveis comprados</h3>
          {a.houses.length === 0 && <p className="ph-empty">Você ainda não tem imóveis.</p>}
          <ul className="ap-list">
            {a.houses.map((o) => {
              const h = homeById(o.id)!;
              return (
                <li key={o.id} className="ap-own">
                  <span className="ph-ico big">{h.icon}</span>
                  <span className="grow"><b>{h.name}</b><small>{o.contractId ? '💳 Financiado' : '✔ Quitado'} · vale {brl(resaleValue(o.price, o.season, game.season))}</small></span>
                  <button className="ph-btn" disabled={!!o.contractId} onClick={() => { const r = sellAsset(game, 'house', o.id); if (r.ok) { onChange(r.state); audio.sfx('cash'); } }}>Vender</button>
                </li>
              );
            })}
          </ul>
          {msg && <p className="ph-pad-msg err" role="alert">{msg}</p>}
        </>
      )}
    </div>
  );
}

function HomeDetail({ game, h, back, onStart, msg }: { game: GameState; h: Home; back: () => void; onStart: (m: { type: 'cash' } | { type: 'finance'; installments: number }) => void; msg?: string }) {
  const [mode, setMode] = useState<'cash' | 'finance'>('cash');
  const [n, setN] = useState(HOUSE_LOAN.options[1]);
  const rent = !!h.rent;
  const q = rent ? null : houseQuote(h.price!, n);
  const need = rent ? h.rent! : mode === 'cash' ? h.price! : q!.entry;
  return (
    <>
      <button className="bk-back" onClick={back}>‹ Voltar</button>
      <div className="ap-hero"><span>{h.icon}</span><h2>{h.name}</h2><small>{h.blurb} <Stars n={h.prestige} /></small><b>{rent ? `${brl(h.rent!)}/mês` : brl(h.price!)}</b></div>
      {rent ? (
        <div className="ph-card"><p className="bk-sub">Você paga o 1º mês agora por Pix. Depois, um boleto de {brl(h.rent!)} chega todo mês (a cada 3 rodadas), com aviso no celular. Atrasar 2 boletos causa despejo.</p></div>
      ) : (
        <>
          <div className="chips ap-chips" role="radiogroup" aria-label="Forma de pagamento">
            <button role="radio" aria-checked={mode === 'cash'} className={mode === 'cash' ? 'on' : ''} onClick={() => setMode('cash')}>À vista</button>
            <button role="radio" aria-checked={mode === 'finance'} className={mode === 'finance' ? 'on' : ''} onClick={() => setMode('finance')}>Financiar</button>
          </div>
          {mode === 'finance' && q && (
            <div className="ph-card">
              <p className="bk-sub">Entrada de {Math.round(HOUSE_LOAN.entry * 100)}% por Pix; o resto em parcelas mensais (boleto), juros de {(HOUSE_LOAN.rate * 100).toFixed(1).replace('.', ',')}% ao mês. Atrasar 2 boletos faz o banco retomar o imóvel.</p>
              <div className="ap-kinds">{HOUSE_LOAN.options.map((o) => <button key={o} className={n === o ? 'on' : ''} onClick={() => setN(o)}>{o}x</button>)}</div>
              <div className="ph-row static"><span className="grow">Entrada (Pix)</span><b>{brl(q.entry)}</b></div>
              <div className="ph-row static"><span className="grow">{n} parcelas de</span><b>{brl(q.monthly)}</b></div>
              <div className="ph-row static"><span className="grow">Total pago</span><b>{brl(q.total)}</b></div>
            </div>
          )}
        </>
      )}
      <p className="bk-sub">Você paga agora por Pix: <b>{brl(need)}</b> · Saldo: {brl(balanceOf(game))}</p>
      {msg && <p className="ph-pad-msg err" role="alert">{msg}</p>}
      <button className="ph-btn pri bk-wide" onClick={() => onStart(mode === 'cash' ? { type: 'cash' } : { type: 'finance', installments: n })}>{rent ? 'Alugar e gerar Pix' : 'Comprar e gerar Pix'}</button>
    </>
  );
}
