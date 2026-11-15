import { useState } from 'react';
import { brl } from '../engine/bank';
import type { GameState, PixCharge } from '../engine/types';
import { isInstalled } from '../engine/phone';
import { copyText } from './clipboard';

/** Tela "pague por Pix" usada pelos apps: mostra a chave, o valor e leva ao Banco. Quando o Banco confirma, mostra o sucesso. */
export function ChargeView({ game, chargeId, onOpenApp, onDone, doneText }: { game: GameState; chargeId: string; onOpenApp: (id: string) => void; onDone: () => void; doneText: string }) {
  const [copied, setCopied] = useState(false);
  const c: PixCharge | undefined = game.bank?.charges.find((x) => x.id === chargeId);
  if (!c) return <p className="ph-empty">Cobrança não encontrada.</p>;
  if (c.status === 'paid') {
    return (
      <>
        <div className="bk-ok" aria-hidden="true">✔</div>
        <h2 className="center">Pagamento confirmado!</h2>
        <p className="bk-sub center">{doneText}</p>
        <button className="ph-btn pri bk-wide" onClick={onDone}>Continuar</button>
      </>
    );
  }
  const hasBankApp = isInstalled(game, 'banco');
  return (
    <>
      <h2>💠 Pague por Pix</h2>
      <div className="ph-card bk-confirm">
        <div className="ph-row static"><span className="grow">Valor</span><b className="bk-big">{brl(c.amount)}</b></div>
        <div className="ph-row static"><span className="grow">Para</span><b>{c.merchant}</b></div>
        <div className="ph-row static"><span className="grow">Descrição</span><b>{c.description}</b></div>
      </div>
      <p className="bk-sub">Chave Pix (copia e cola)</p>
      <b className="bk-key">{c.key}</b>
      <div className="ph-btns" style={{ marginTop: 8 }}>
        <button className="ph-btn pri" onClick={async () => { await copyText(c.key); setCopied(true); }}>{copied ? '✔ Chave copiada' : '📋 Copiar chave'}</button>
        <button className="ph-btn" onClick={() => onOpenApp('banco')} disabled={!hasBankApp}>🏦 Abrir Banco</button>
      </div>
      {!hasBankApp && <p className="ph-pad-msg err">Instale o app Banco na Loja de Apps para pagar.</p>}
      <ol className="bk-steps">
        <li>Copie a chave Pix.</li>
        <li>Abra o app do Banco → Pix → Colar → Prosseguir.</li>
        <li>Confira o valor, confirme e digite a senha do banco.</li>
        <li>Volte aqui: a compra é liberada na hora.</li>
      </ol>
      <button className="ph-link" onClick={onDone}>Cancelar</button>
    </>
  );
}

/** Guarda a cobrança em andamento de cada app: ao ir ao Banco pagar e voltar, a tela de pagamento continua lá. */
const pending: Record<string, { chargeId: string; selId: string }> = {};
export const getPending = (app: string) => pending[app];
export const setPending = (app: string, v: { chargeId: string; selId: string } | null) => { if (v) pending[app] = v; else delete pending[app]; };

export const Stars = ({ n }: { n: number }) => <span className="ap-stars" aria-label={`Prestígio ${n} de 10`}>{'★'.repeat(Math.ceil(n / 2))}{'☆'.repeat(5 - Math.ceil(n / 2))}</span>;

/** Cabeçalho dos apps do celular: ícone, nome e o brilho azul ao fundo. */
export function AppHead({ icon, title, right }: { icon: string; title: string; right?: React.ReactNode }) {
  return <div className="app-head"><span className="app-head-ico" aria-hidden="true">{icon}</span><h2>{title}</h2>{right && <div className="app-head-r">{right}</div>}</div>;
}

/** Barra de abas de baixo dos apps do celular (a primeira costuma levar ao Início do celular). */
export function AppTabs({ items }: { items: { icon: string; label: string; on?: boolean; onClick: () => void }[] }) {
  return (
    <nav className="app-tabs" aria-label="Menu do aplicativo">
      {items.map((t) => <button key={t.label} className={t.on ? 'on' : ''} aria-current={t.on ? 'page' : undefined} onClick={t.onClick}><span aria-hidden="true">{t.icon}</span><small>{t.label}</small></button>)}
    </nav>
  );
}
