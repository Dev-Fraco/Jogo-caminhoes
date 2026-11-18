import { HoldScan } from './AppKit';
import { useState } from 'react';
import { audio } from '../audio/audio';
import { confirmCode, requestCode } from '../engine/accounts';
import { chipNumberOf, phoneOf, appById } from '../engine/phone';
import type { GameState } from '../engine/types';

/** Criar conta no app: o número do chip recebe um código por SMS para liberar o app. */
export function AccountGate({ game, app, onChange }: { game: GameState; app: string; onChange: (g: GameState) => void }) {
  const info = appById(app);
  const pending = phoneOf(game).pendingCode?.app === app;
  const [number, setNumber] = useState(chipNumberOf(game) ?? '');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | undefined>();
  const [sent, setSent] = useState(pending);
  const send = () => {
    const r = requestCode(game, app, number);
    if (!r.ok) { setErr(r.error); audio.sfx('error'); return; }
    setErr(undefined); setSent(true); setCode(''); onChange(r.state); audio.sfx('notify');
  };
  const confirm = () => {
    const r = confirmCode(game, app, code);
    if (!r.ok) { setErr(r.error); setCode(''); audio.sfx('error'); return; }
    setErr(undefined); onChange(r.state); audio.sfx('unlock');
  };
  return (
    <div className="ph-app-screen ph-gate">
      <span className="ph-ico big">{info?.icon ?? '📱'}</span>
      <h2>Criar conta no {info?.name ?? 'app'}</h2>
      {!sent ? (
        <>
          <p>Informe o número do seu chip. Vamos enviar um código de confirmação por SMS.</p>
          <input inputMode="tel" placeholder="(DD) 9XXXX-XXXX" value={number} onChange={(e) => setNumber(e.target.value)} aria-label="Número do celular" />
          <button className="ph-btn pri bk-wide" onClick={send}>Enviar código por SMS</button>
        </>
      ) : (
        <>
          <p>Enviamos um SMS com 6 dígitos para <b>{phoneOf(game).pendingCode?.number ?? number}</b>. Abra a notificação ou o app Mensagens › SMS.</p>
          <input inputMode="numeric" maxLength={6} placeholder="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && confirm()} aria-label="Código de confirmação" />
          <button className="ph-btn pri bk-wide" onClick={confirm} disabled={code.length < 6}>Confirmar</button>
          <button className="ph-link" onClick={send}>Reenviar código</button>
        </>
      )}
      {err && <p className="ph-pad-msg err" role="alert">{err}</p>}
    </div>
  );
}

/** Botão de digital: confirma no lugar da senha (só aparece se a digital estiver ativada nas Configurações). Segure por 1 s. */
export function FingerButton({ game, onOk, label = '👆 Segure para usar a digital' }: { game: GameState; onOk: () => void; label?: string }) {
  if (!phoneOf(game).settings.fingerprint) return null;
  return <HoldScan variant="button" label={label} onDone={onOk} />;
}
