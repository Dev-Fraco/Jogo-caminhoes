import { useState } from 'react';
import { audio } from '../audio/audio';
import { brl } from '../engine/bank';
import { buyFibra, fibraBill, setupWifi } from '../engine/netfibra';
import { autoDebitOn } from '../engine/bank';
import { formatDay } from '../engine/calendar';
import { FIBRA_ENTRY, FIBRA_MONTHLY, fibraActive, fibraDown, fibraLeft, fibraOf, fibraUntil, netState } from '../engine/phone';
import type { GameState } from '../engine/types';
import { ChargeView, getPending, setPending } from './AppKit';

interface Props { game: GameState; onChange: (g: GameState) => void; onOpenApp: (id: string) => void }

/** NetFibra: Wi-Fi residencial de 1 GB (download e upload), 2x mais rápido que o 5G. Entrada de R$ 50 mil + R$ 100 mil por mês, por Pix. */
export function NetFibraApp({ game, onChange, onOpenApp }: Props) {
  const [chargeId, setChargeId] = useState<string | null>(() => getPending('netfibra')?.chargeId ?? null);
  const [msg, setMsg] = useState<string | undefined>();
  const [ssid, setSsid] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const f = fibraOf(game);
  const active = fibraActive(game);
  const left = fibraLeft(game);
  const net = netState(game);

  if (chargeId) return <div className="ph-app-screen"><ChargeView game={game} chargeId={chargeId} onOpenApp={onOpenApp} onDone={() => { setPending('netfibra', null); setChargeId(null); }} doneText={f?.ssid ? 'Mensalidade paga! A NetFibra está em dia.' : 'Contratação paga! Agora escolha o nome e a senha da sua rede.'} /></div>;

  // pago, mas a rede ainda não foi configurada: pede nome e senha
  if (f?.entryPaid && !f.ssid) {
    const save = () => {
      const r = setupWifi(game, ssid, pass);
      if (!r.ok) { setMsg(r.error); audio.sfx('error'); return; }
      setMsg(undefined); onChange(r.state); audio.sfx('unlock');
    };
    return (
      <div className="ph-app-screen nf">
        <h2>🛜 Configure sua rede</h2>
        <p className="bk-sub">Escolha o nome e a senha do seu Wi-Fi NetFibra. O celular conecta nela automaticamente.</p>
        <div className="ph-form">
          <input placeholder="Nome da rede (ex.: Casa do Mister)" value={ssid} maxLength={24} onChange={(e) => setSsid(e.target.value)} aria-label="Nome da rede" />
          <input type={show ? 'text' : 'password'} placeholder="Senha (mín. 8 caracteres)" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Senha da rede" />
          <label className="nf-show"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar senha</label>
          <button className="ph-btn pri bk-wide" onClick={save}>Criar rede e conectar</button>
        </div>
        {msg && <p className="ph-pad-msg err" role="alert">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="ph-app-screen nf">
      <h2>🛜 NetFibra</h2>
      {f?.ssid && (
        <div className={`ph-card chip-status ${active && !fibraDown(game) ? 'on' : ''}`}>
          <div className="ph-row static"><span className="grow">Rede</span><b>{f.ssid}</b></div>
          <div className="ph-row static"><span className="grow">Situação</span><b className={fibraDown(game) || !active ? 'out' : ''}>{!active ? 'Mensalidade vencida' : fibraDown(game) ? 'Fora do ar (caiu)' : 'No ar'}</b></div>
          {active && <div className="ph-row static"><span className="grow">{autoDebitOn(game) ? 'Próximo débito automático' : 'Mensalidade vence em'}</span><b>{formatDay(fibraUntil(game)!)} · {left} {left === 1 ? 'dia' : 'dias'}</b></div>}
          <div className="ph-row static"><span className="grow">Conexão agora</span><b>{net.label}</b></div>
          {fibraDown(game) && <p className="ph-pad-msg err">A rede caiu. Ligue os dados móveis (5G) para continuar online até ela voltar.</p>}
        </div>
      )}
      <div className="ph-card chip-plan">
        <span className="chip-badge">1 GB</span>
        <h3>Plano NetFibra 1 GB</h3>
        <ul>
          <li>1 GB de download e 1 GB de upload</li>
          <li>2x mais rápida que o chip 5G</li>
          <li>Você escolhe o nome e a senha da sua rede</li>
          <li>Depois da 1ª contratação, a mensalidade sai sozinha do banco todo mês (débito automático)</li>
          <li>De vez em quando a rede pode cair: tenha o 5G de reserva</li>
        </ul>
        <p className="chip-price">{brl(FIBRA_MONTHLY)}<small> / mês</small></p>
        {!f?.entryPaid && <p className="bk-sub">+ entrada de instalação de {brl(FIBRA_ENTRY)} (só na 1ª contratação)</p>}
        <button className="ph-btn pri bk-wide" onClick={() => {
          const r = buyFibra(game);
          if (!r.ok) { setMsg(r.error); audio.sfx('error'); return; }
          setMsg(undefined); onChange(r.state); setPending('netfibra', { chargeId: r.charge.id, selId: 'fibra' }); setChargeId(r.charge.id);
        }}>{f?.entryPaid ? `Renovar · ${brl(fibraBill(game))}` : `Contratar · ${brl(fibraBill(game))} hoje`}</button>
        {msg && <p className="ph-pad-msg err" role="alert">{msg}</p>}
      </div>
    </div>
  );
}
