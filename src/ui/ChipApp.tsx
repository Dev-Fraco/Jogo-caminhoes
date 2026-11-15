import { useState } from 'react';
import { brl } from '../engine/bank';
import { buyPlan } from '../engine/dataplan';
import { autoDebitOn } from '../engine/bank';
import { formatDay } from '../engine/calendar';
import { chipNumberOf, chipLeft, chipOf, netState, PLAN_PRICE, planActive, planLeft, planUntil } from '../engine/phone';
import type { GameState } from '../engine/types';
import { audio } from '../audio/audio';
import { ChargeView, getPending, setPending } from './AppKit';

interface Props { game: GameState; onChange: (g: GameState) => void; onOpenApp: (id: string) => void }

/** Internet de Chip: plano mensal de R$ 5.000 com internet ilimitada (pago por Pix no Banco). */
export function ChipApp({ game, onChange, onOpenApp }: Props) {
  const [chargeId, setChargeId] = useState<string | null>(() => getPending('chip')?.chargeId ?? null);
  const [msg, setMsg] = useState<string | undefined>();
  const left = planLeft(game);
  const active = planActive(game);
  const net = netState(game);

  if (chargeId) return <div className="ph-app-screen"><ChargeView game={game} chargeId={chargeId} onOpenApp={onOpenApp} onDone={() => { setPending('chip', null); setChargeId(null); }} doneText={`Plano ativado! Ligue os dados móveis no painel rápido para usar o 5G.`} /></div>;

  return (
    <div className="ph-app-screen chip">
      <h2>📲 Internet de Chip</h2>
      <div className={`ph-card chip-status ${active ? 'on' : ''}`}>
        <div className="ph-row static"><span className="grow">Seu plano</span><b>{active ? 'Ativo' : 'Sem plano'}</b></div>
        {active && <div className="ph-row static"><span className="grow">{autoDebitOn(game) ? 'Renova em (débito automático)' : 'Vence em'}</span><b>{formatDay(planUntil(game)!)} · {left} {left === 1 ? 'dia' : 'dias'}</b></div>}
        <div className="ph-row static"><span className="grow">Chip</span><b>{chipOf(game) ? `${chipOf(game)!.name} · ${chipNumberOf(game) ?? '—'}` : 'nenhum / bloqueado'}</b></div>
        {chipLeft(game) !== undefined && chipOf(game) && <div className="ph-row static"><span className="grow">Chip bloqueia em</span><b>{chipLeft(game)} dias</b></div>}
        <div className="ph-row static"><span className="grow">Conexão agora</span><b>{net.label}</b></div>
      </div>
      <div className="ph-card chip-plan">
        <span className="chip-badge">5G</span>
        <h3>Plano Mensal Ilimitado</h3>
        <p className="chip-price">{brl(PLAN_PRICE)}<small> / mês</small></p>
        <ul>
          <li>Internet ilimitada o mês inteiro (1 mês de calendário)</li>
          <li>5G: apps abrem rápido e downloads voam</li>
          <li>1ª contratação por Pix; depois renova sozinho por débito automático no banco</li>
        </ul>
        <button className="ph-btn pri bk-wide" onClick={() => {
          const r = buyPlan(game);
          if (!r.ok) { setMsg(r.error); audio.sfx('error'); return; }
          setMsg(undefined); onChange(r.state); setPending('chip', { chargeId: r.charge.id, selId: 'plan' }); setChargeId(r.charge.id);
        }}>{active ? 'Renovar (+1 mês)' : 'Assinar plano'}</button>
        {msg && <p className="ph-pad-msg err" role="alert">{msg}</p>}
      </div>
      <p className="bk-sub">Os dados móveis só têm internet com plano ativo. Sem plano, use um Wi-Fi grátis (conexão ruim).</p>
    </div>
  );
}
