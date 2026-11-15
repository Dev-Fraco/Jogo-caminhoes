import { useState } from 'react';
import { audio } from '../audio/audio';
import { FingerButton } from './AccountGate';
import { formatDay } from '../engine/calendar';
import { FIBRA_MONTHLY, fibraUntil, phoneOf, PLAN_PRICE, planUntil } from '../engine/phone';
import { setAutoDebit } from '../engine/bank';
import { FINGER, balanceOf, bankOf, boletoTotal, brl, clubCharge, hasBank, myPixKey, openBoletos, payBoleto, payPix, quotePix, registerBank, MIN_PASSWORD } from '../engine/bank';
import type { BankTx, Boleto, GameState, PixCharge } from '../engine/types';
import { copyText, pasteText } from './clipboard';
import { AppHead, AppTabs } from './AppKit';
import { ClubBadge } from './ClubBadge';

interface Props { game: GameState; onChange: (g: GameState) => void; onHome?: () => void }
type View = { name: 'home' } | { name: 'pix' } | { name: 'confirm'; key: string; charge: PixCharge } | { name: 'boletos' } | { name: 'boleto'; boleto: Boleto } | { name: 'statement' } | { name: 'club' } | { name: 'receipt'; tx: BankTx; detail: string; to: string };

/** App do Banco: cadastro, saldo do treinador, Pix (colar a chave, conferir, confirmar com a senha), boletos, extrato e comprovantes. */
export function BankApp({ game, onChange, onHome }: Props) {
  const [view, setView] = useState<View>({ name: 'home' });
  if (!hasBank(game)) return <Register game={game} onChange={onChange} />;
  const go = (v: View) => setView(v);
  const home = () => setView({ name: 'home' });
  const tab = view.name === 'home' ? 'banco' : view.name === 'pix' || view.name === 'confirm' || view.name === 'club' ? 'pix' : view.name === 'statement' || view.name === 'receipt' ? 'hist' : 'banco';
  return (
    <>
      <div className="ph-app-screen bk bk2">
        {view.name === 'home' && <BankHome game={game} go={go} onChange={onChange} />}
        {view.name === 'pix' && <PixScreen game={game} go={go} back={home} />}
        {view.name === 'club' && <ClubPix game={game} onChange={onChange} go={go} back={home} />}
        {view.name === 'confirm' && <Confirm game={game} onChange={onChange} keyText={view.key} charge={view.charge} go={go} back={() => go({ name: 'pix' })} />}
        {view.name === 'boletos' && <Boletos game={game} go={go} back={home} />}
        {view.name === 'boleto' && <BoletoPay game={game} onChange={onChange} boleto={view.boleto} go={go} back={() => go({ name: 'boletos' })} />}
        {view.name === 'statement' && <Statement game={game} back={home} />}
        {view.name === 'receipt' && <Receipt game={game} tx={view.tx} detail={view.detail} to={view.to} done={home} />}
      </div>
      <AppTabs items={[
        { icon: '🏠', label: 'Início', onClick: () => onHome?.() },
        { icon: '🏛️', label: 'Banco', on: tab === 'banco', onClick: home },
        { icon: '💠', label: 'Pix', on: tab === 'pix', onClick: () => go({ name: 'pix' }) },
        { icon: '🧾', label: 'Histórico', on: tab === 'hist', onClick: () => go({ name: 'statement' }) },
      ]} />
    </>
  );
}

const Back = ({ onClick }: { onClick: () => void }) => <button className="bk-back" onClick={onClick}>‹ Voltar</button>;

function Register({ game, onChange }: Props) {
  const [name, setName] = useState(game.coach.name);
  const [pass, setPass] = useState('');
  const [conf, setConf] = useState('');
  const [err, setErr] = useState<string | undefined>();
  const submit = () => {
    const r = registerBank(game, name, pass, conf);
    if (!r.ok) { setErr(r.error); audio.sfx('error'); return; }
    onChange(r.state); audio.sfx('unlock');
  };
  return (
    <div className="ph-app-screen bk">
      <div className="bk-logo">🏦</div>
      <h2>Abra sua conta</h2>
      <p className="bk-sub">Cadastre o seu nome e uma senha. Você vai usar a senha para confirmar pagamentos.</p>
      <div className="ph-form">
        <input placeholder="Nome completo" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Nome" />
        <input type="password" placeholder={`Senha (mín. ${MIN_PASSWORD} caracteres)`} value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Senha" />
        <input type="password" placeholder="Confirmar senha" value={conf} onChange={(e) => setConf(e.target.value)} aria-label="Confirmar senha" />
        {err && <p className="ph-pad-msg err" role="alert">{err}</p>}
        <button className="ph-btn pri" onClick={submit}>Criar conta</button>
      </div>
    </div>
  );
}

function BankHome({ game, go, onChange }: { game: GameState; go: (v: View) => void; onChange: (g: GameState) => void }) {
  const [hide, setHide] = useState(false);
  const open = openBoletos(game);
  const late = open.filter((b) => b.status === 'late').length;
  return (
    <>
      <AppHead icon="🏛️" title="Banco" />
      <div className="bk2-card">
        <b className="bk2-hi">Olá, {bankOf(game)!.name.split(' ')[0]} 👋</b>
        <small>Saldo em conta</small>
        <strong>{hide ? 'R$ ••••••' : brl(balanceOf(game))}</strong>
        <button className="bk2-eye" onClick={() => setHide(!hide)} aria-label={hide ? 'Mostrar saldo' : 'Ocultar saldo'} aria-pressed={hide}>{hide ? '👁️' : '🙈'}</button>
      </div>
      <div className="bk2-actions">
        <button onClick={() => go({ name: 'pix' })}><span>💠</span>Pix</button>
        <button onClick={() => go({ name: 'boletos' })}><span>🧾</span>Boletos{open.length > 0 && <em>{open.length}</em>}</button>
        <button onClick={() => go({ name: 'statement' })}><span>📄</span>Extrato</button>
        <button onClick={() => go({ name: 'club' })}><span className="bk2-clubico"><ClubBadge club={game.clubs[game.userClubId]} size={26} /></span>Ajudar o clube</button>
      </div>
      {late > 0 && <p className="ph-pad-msg err" role="alert">⚠️ Você tem {late} {late === 1 ? 'boleto vencido' : 'boletos vencidos'} com multa.</p>}
      <AutoDebit game={game} onChange={onChange} />
      <div className="bk2-h"><h3>Últimas movimentações</h3><button onClick={() => go({ name: 'statement' })}>Ver todas ›</button></div>
      <TxList txs={bankOf(game)!.txs.slice(0, 4)} />
    </>
  );
}

/** Débito automático: mensalidades que saem sozinhas do saldo no dia do vencimento. */
function AutoDebit({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const on = game.autoDebit !== false;
  const plan = planUntil(game);
  const fibra = fibraUntil(game);
  const contracts = (game.assets?.contracts ?? []).filter((c) => c.nextDay !== undefined);
  const rows: { label: string; day: number; amount: number }[] = [
    ...(plan !== undefined && phoneOf(game).plan ? [{ label: 'Internet de Chip', day: plan, amount: PLAN_PRICE }] : []),
    ...(fibra !== undefined && phoneOf(game).fibra?.ssid ? [{ label: 'NetFibra', day: fibra, amount: FIBRA_MONTHLY }] : []),
    ...contracts.map((c) => ({ label: c.kind === 'rent' ? `Aluguel — ${c.description}` : `Parcela — ${c.description}`, day: c.nextDay!, amount: c.monthly })),
  ].sort((a, b) => a.day - b.day);
  const icon = (label: string) => (label.startsWith('Aluguel') ? '🏠' : label.startsWith('Parcela') ? '🚗' : '📶');
  return (
    <>
      <div className="bk2-h">
        <h3>Débito automático</h3>
        <input className="bk2-switch" type="checkbox" role="switch" checked={on} onChange={(e) => onChange(setAutoDebit(game, e.target.checked))} aria-label="Débito automático" />
      </div>
      {rows.length === 0 ? <p className="hint">Nenhuma mensalidade ativa.</p> : (
        <ul className="bk2-list">{rows.map((r, i) => <li key={i} className="bk2-row"><span className="bk2-tile blue">{icon(r.label)}</span><div className="grow"><b>{r.label}</b><small>{on ? 'Debita em' : 'Vence em'} {formatDay(r.day)}</small></div><b className="out">− {brl(r.amount)}</b></li>)}</ul>
      )}
      <p className="bk2-note">Plano de dados, NetFibra, aluguel e parcelas saem do saldo no dia, sem você pagar.</p>
    </>
  );
}

function TxList({ txs }: { txs: BankTx[] }) {
  if (txs.length === 0) return <p className="ph-empty">Nenhuma movimentação ainda.</p>;
  return (
    <ul className="bk2-list">
      {txs.map((t) => (
        <li key={t.id} className="bk2-row">
          <span className={`bk2-tile ${t.amount >= 0 || t.kind === 'pix' ? 'green' : 'blue'}`}>{t.kind === 'boleto' ? '🧾' : t.kind === 'income' ? '💵' : '💠'}</span>
          <div className="grow"><b>{t.title}</b><small>{t.detail}</small><small>{t.day !== undefined ? formatDay(t.day) : `Temp. ${t.season}, rodada ${t.round}`}</small></div>
          <b className={t.amount < 0 ? 'out' : 'in'}>{t.amount < 0 ? '−' : '+'} {brl(Math.abs(t.amount))}</b>
        </li>
      ))}
    </ul>
  );
}

function PixScreen({ game, go, back }: { game: GameState; go: (v: View) => void; back: () => void }) {
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const next = () => {
    const q = quotePix(game, key);
    if (!q.ok) { setErr(q.error); audio.sfx('error'); return; }
    go({ name: 'confirm', key: key.trim(), charge: q.charge });
  };
  const mine = myPixKey(game);
  return (
    <>
      <Back onClick={back} />
      <h2>💠 Pix</h2>
      <h3>Pagar</h3>
      <div className="ph-card">
        <p className="bk-sub">Cole a chave Pix (a chave aparece no app onde você está comprando ou depositando).</p>
        <input className="ph-search" style={{ letterSpacing: 0 }} placeholder="Chave Pix" value={key} onChange={(e) => { setKey(e.target.value); setErr(undefined); }} aria-label="Chave Pix" />
        <div className="ph-btns"><button className="ph-btn" onClick={async () => { setKey(await pasteText()); setErr(undefined); }}>📋 Colar</button><button className="ph-btn pri" onClick={next}>Prosseguir</button></div>
        {err && <p className="ph-pad-msg err" role="alert">{err}</p>}
      </div>
      <h3>Receber</h3>
      <div className="ph-card">
        <p className="bk-sub">Sua chave Pix</p>
        <b className="bk-key">{mine}</b>
        <button className="ph-btn" onClick={async () => { await copyText(mine); setCopied(true); }}>{copied ? '✔ Copiada' : 'Copiar chave'}</button>
      </div>
    </>
  );
}

function ClubPix({ game, onChange, go, back }: { game: GameState; onChange: (g: GameState) => void; go: (v: View) => void; back: () => void }) {
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState<string | undefined>();
  const next = () => {
    const v = Number(amount.replace(/\./g, '').replace(',', '.'));
    const r = clubCharge(game, v);
    if (!r.ok) { setErr(r.error); audio.sfx('error'); return; }
    onChange(r.state);
    go({ name: 'confirm', key: r.charge.key, charge: r.charge });
  };
  return (
    <>
      <Back onClick={back} />
      <h2>🏟️ Ajudar o clube</h2>
      <p className="bk-sub">Faça um Pix do seu bolso para o caixa do {game.clubs[game.userClubId].name}. Seu saldo: {brl(balanceOf(game))}.</p>
      <div className="ph-form">
        <input inputMode="decimal" placeholder="Valor (R$)" value={amount} onChange={(e) => { setAmount(e.target.value); setErr(undefined); }} aria-label="Valor" />
        {err && <p className="ph-pad-msg err" role="alert">{err}</p>}
        <button className="ph-btn pri" onClick={next}>Prosseguir</button>
      </div>
    </>
  );
}

function Confirm({ game, onChange, keyText, charge, go, back }: { game: GameState; onChange: (g: GameState) => void; keyText: string; charge: PixCharge; go: (v: View) => void; back: () => void }) {
  const [pass, setPass] = useState('');
  const [askPass, setAskPass] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const [fails, setFails] = useState(0);
  const pay = (secret: string = pass) => {
    const r = payPix(game, keyText, secret);
    if (!r.ok) {
      const n = r.error === 'Senha incorreta.' ? fails + 1 : fails;
      setFails(n); setPass(''); setErr(n >= 3 ? 'Muitas tentativas erradas. Volte e tente de novo.' : r.error); audio.sfx('error');
      if (n >= 3) window.setTimeout(back, 1200);
      return;
    }
    onChange(r.state); audio.sfx('cash');
    go({ name: 'receipt', tx: r.tx, detail: r.charge.description, to: r.charge.merchant });
  };
  return (
    <>
      <Back onClick={back} />
      <h2>Confirmar Pix</h2>
      <div className="ph-card bk-confirm">
        <div className="ph-row static"><span className="grow">Valor</span><b className="bk-big">{brl(charge.amount)}</b></div>
        <div className="ph-row static"><span className="grow">Para</span><b>{charge.merchant}</b></div>
        <div className="ph-row static"><span className="grow">Descrição</span><b>{charge.description}</b></div>
        <div className="ph-row static"><span className="grow">Saldo após o Pix</span><b>{brl(balanceOf(game) - charge.amount)}</b></div>
      </div>
      {!askPass ? (
        <button className="ph-btn pri bk-wide" onClick={() => { if (balanceOf(game) < charge.amount) { setErr('Saldo insuficiente.'); audio.sfx('error'); } else { setErr(undefined); setAskPass(true); } }}>Confirmar pagamento</button>
      ) : (
        <div className="ph-form">
          <input type="password" autoFocus placeholder="Senha do banco" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pay()} aria-label="Senha do banco" />
          <button className="ph-btn pri bk-wide" onClick={() => pay()}>Pagar {brl(charge.amount)}</button>
          <FingerButton game={game} onOk={() => pay(FINGER)} label={`👆 Segure para pagar ${brl(charge.amount)} com a digital`} />
        </div>
      )}
      {err && <p className="ph-pad-msg err" role="alert">{err}</p>}
    </>
  );
}

function Receipt({ game, tx, detail, to, done }: { game: GameState; tx: BankTx; detail: string; to: string; done: () => void }) {
  return (
    <>
      <div className="bk-ok" aria-hidden="true">✔</div>
      <h2 className="center">{tx.kind === 'boleto' ? 'Boleto pago!' : 'Pix enviado!'}</h2>
      <div className="ph-card bk-receipt" role="group" aria-label="Comprovante">
        <small>COMPROVANTE</small>
        <div className="ph-row static"><span className="grow">Valor</span><b>{brl(Math.abs(tx.amount))}</b></div>
        <div className="ph-row static"><span className="grow">Para</span><b>{to}</b></div>
        <div className="ph-row static"><span className="grow">Descrição</span><b>{detail}</b></div>
        <div className="ph-row static"><span className="grow">De</span><b>{bankOf(game)!.name}</b></div>
        <div className="ph-row static"><span className="grow">Data</span><b>Temporada {tx.season}, rodada {tx.round}</b></div>
        <div className="ph-row static"><span className="grow">ID da transação</span><b className="bk-id">{tx.id}</b></div>
      </div>
      <button className="ph-btn pri bk-wide" onClick={done}>Concluir</button>
    </>
  );
}

function Boletos({ game, go, back }: { game: GameState; go: (v: View) => void; back: () => void }) {
  const list = bankOf(game)!.boletos;
  return (
    <>
      <Back onClick={back} />
      <h2>🧾 Boletos</h2>
      <p className="bk-sub">Boletos aparecem quando você financia um veículo ou um imóvel, ou aluga uma casa.</p>
      {list.length === 0 && <p className="ph-empty">Nenhum boleto.</p>}
      <ul className="bk-tx">
        {list.map((b) => (
          <li key={b.id}>
            <div className="grow"><b>{b.merchant}</b><small>{b.description} · vence na rodada {b.dueRound} (temp. {b.dueSeason})</small><small>{b.status === 'paid' ? '✔ Pago' : b.status === 'late' ? `⚠️ Vencido (multa ${brl(b.fine)})` : 'Em aberto'}</small></div>
            <div className="bk-r"><b>{brl(boletoTotal(b))}</b>{b.status !== 'paid' && <button className="ph-btn pri" onClick={() => go({ name: 'boleto', boleto: b })}>Pagar</button>}</div>
          </li>
        ))}
      </ul>
    </>
  );
}

function BoletoPay({ game, onChange, boleto, go, back }: { game: GameState; onChange: (g: GameState) => void; boleto: Boleto; go: (v: View) => void; back: () => void }) {
  const [pass, setPass] = useState('');
  const [err, setErr] = useState<string | undefined>();
  const total = boletoTotal(boleto);
  const pay = (secret: string = pass) => {
    const r = payBoleto(game, boleto.id, secret);
    if (!r.ok) { setErr(r.error); setPass(''); audio.sfx('error'); return; }
    onChange(r.state); audio.sfx('cash');
    go({ name: 'receipt', tx: r.tx, detail: boleto.description, to: boleto.merchant });
  };
  return (
    <>
      <Back onClick={back} />
      <h2>Pagar boleto</h2>
      <div className="ph-card bk-confirm">
        <div className="ph-row static"><span className="grow">Beneficiário</span><b>{boleto.merchant}</b></div>
        <div className="ph-row static"><span className="grow">Descrição</span><b>{boleto.description}</b></div>
        <div className="ph-row static"><span className="grow">Código</span><b className="bk-id">{boleto.code}</b></div>
        <div className="ph-row static"><span className="grow">Valor</span><b>{brl(boleto.amount)}</b></div>
        {boleto.fine > 0 && <div className="ph-row static"><span className="grow">Multa por atraso</span><b className="out">{brl(boleto.fine)}</b></div>}
        <div className="ph-row static"><span className="grow">Total</span><b className="bk-big">{brl(total)}</b></div>
      </div>
      <div className="ph-form">
        <input type="password" placeholder="Senha do banco" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pay()} aria-label="Senha do banco" />
        {err && <p className="ph-pad-msg err" role="alert">{err}</p>}
        <button className="ph-btn pri bk-wide" onClick={() => pay()}>Pagar {brl(total)}</button>
        <FingerButton game={game} onOk={() => pay(FINGER)} label={`👆 Segure para pagar ${brl(total)} com a digital`} />
      </div>
    </>
  );
}

function Statement({ game, back }: { game: GameState; back: () => void }) {
  return (
    <>
      <Back onClick={back} />
      <h2>📄 Extrato</h2>
      <p className="bk-sub">Saldo: <b>{brl(balanceOf(game))}</b></p>
      <TxList txs={bankOf(game)!.txs} />
    </>
  );
}
