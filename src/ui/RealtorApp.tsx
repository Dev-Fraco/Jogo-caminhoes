import { useState } from 'react';
import { audio } from '../audio/audio';
import { assetsOf, buyHome, priceOf, currentRental, endRent, HOUSES_BUY, HOUSES_RENT, homeById, HOUSE_LOAN, houseQuote, rentHome, resaleValue, sellAsset, type Home } from '../engine/assets';
import { balanceOf, brl } from '../engine/bank';
import type { GameState } from '../engine/types';
import { AppHead, AppTabs, ChargeView, getPending, setPending, Stars } from './AppKit';

interface Props { game: GameState; onChange: (g: GameState) => void; onOpenApp: (id: string) => void; onHome?: () => void }

/** Foto de cada imóvel (as casas e prédios iguais ou parecidos reaproveitam as mesmas imagens). */
const PHOTO: Record<string, number> = {
  'r-kitnet': 1, 'r-quarto-sala': 2, 'r-apto-1q': 3, 'r-casa-2q': 4, 'r-apto-3q': 5, 'r-sobrado': 6, 'r-condominio': 6, 'r-cobertura': 5, 'r-casa-praia': 4, 'r-mansao': 6, 'r-mansao-premium': 6,
  'b-quitinete': 2, 'b-casa-popular': 1, 'b-apto-2q': 3, 'b-condominio': 6, 'b-cobertura': 5, 'b-praia': 4, 'b-mansao': 6, 'b-beira-mar': 6, 'b-fazenda': 4, 'b-castelo': 6,
};
const Photo = ({ id, big }: { id: string; big?: boolean }) => <img className={big ? 'rt-photo big' : 'rt-photo'} src={`assets/ui/house${PHOTO[id] ?? 1}.jpg`} alt="" loading="lazy" draggable={false} />;

/** Corretor de Imóveis: casas para comprar (à vista ou financiadas) e para alugar (R$ 600 a R$ 50 mil por mês). */
export function RealtorApp({ game, onChange, onOpenApp, onHome }: Props) {
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
    <li><button className="rt-row" onClick={() => { setSel(h); setMsg(undefined); }}>
      <Photo id={h.id} />
      <span className="grow"><b>{h.name}</b><small>{h.blurb}</small><Stars n={h.prestige} /></span>
      <b className="rt-price">{h.rent ? `${brl(priceOf(game, h.rent))}/mês` : brl(priceOf(game, h.price!))}</b>
      <i aria-hidden="true">›</i>
    </button></li>
  );

  return (
    <>
    <div className="ph-app-screen rt2">
      <AppHead icon="🏠" title="Corretor de Imóveis" />
      <p className="rt-saldo">Saldo: <b>{brl(balanceOf(game))}</b> <span>•</span> Pagamentos por Pix e boleto.</p>
      <div className="so-pills" role="tablist">
        <button role="tab" aria-selected={tab === 'rent'} className={tab === 'rent' ? 'on blue' : 'blue'} onClick={() => setTab('rent')}>Alugar</button>
        <button role="tab" aria-selected={tab === 'buy'} className={tab === 'buy' ? 'on blue' : 'blue'} onClick={() => setTab('buy')}>Comprar</button>
        <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on blue' : 'blue'} onClick={() => setTab('mine')}>Meus Imóveis</button>
      </div>
      {tab === 'rent' && <ul className="ap-list">{HOUSES_RENT.map((h) => <Row key={h.id} h={h} />)}</ul>}
      {tab === 'buy' && <ul className="ap-list">{HOUSES_BUY.map((h) => <Row key={h.id} h={h} />)}</ul>}
      {tab === 'mine' && (
        <>
          <h3>Moradia alugada</h3>
          {rental ? (
            <ul className="ap-list"><li className="ap-own">
              <Photo id={rental.assetId} />
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
                  <Photo id={o.id} />
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
    <AppTabs items={[
      { icon: '🏠', label: 'Início', onClick: () => onHome?.() },
      { icon: '🏘️', label: 'Imóveis', on: tab !== 'mine', onClick: () => setTab('rent') },
      { icon: '📄', label: 'Contratos', on: tab === 'mine', onClick: () => setTab('mine') },
    ]} />
    </>
  );
}

function HomeDetail({ game, h, back, onStart, msg }: { game: GameState; h: Home; back: () => void; onStart: (m: { type: 'cash' } | { type: 'finance'; installments: number }) => void; msg?: string }) {
  const [mode, setMode] = useState<'cash' | 'finance'>('cash');
  const [n, setN] = useState(HOUSE_LOAN.options[1]);
  const rent = !!h.rent;
  const price = priceOf(game, rent ? h.rent! : h.price!);
  const q = rent ? null : houseQuote(price, n);
  const need = rent ? price : mode === 'cash' ? price : q!.entry;
  return (
    <>
      <button className="bk-back" onClick={back}>‹ Voltar</button>
      <div className="ap-hero"><Photo id={h.id} big /><h2>{h.name}</h2><small>{h.blurb} <Stars n={h.prestige} /></small><b>{rent ? `${brl(price)}/mês` : brl(price)}</b></div>
      {rent ? (
        <div className="ph-card"><p className="bk-sub">Você paga o 1º mês agora por Pix. Depois, um boleto de {brl(price)} chega todo mês (a cada 3 rodadas), com aviso no celular. Atrasar 2 boletos causa despejo.</p></div>
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
