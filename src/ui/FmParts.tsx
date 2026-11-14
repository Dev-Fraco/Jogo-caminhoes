import type { ReactNode } from 'react';
import { myValue } from '../engine/roster';
import type { GameState, Player, Position } from '../engine/types';
import { formatBudget } from '../newgame/format';

export const POS_ONE: Record<Position, string> = { GK: 'Goleiro', DEF: 'Defensor', MID: 'Meio-campista', ATT: 'Atacante' };
const POS_COLOR: Record<Position, string> = { GK: '#f5c542', DEF: '#4da3ff', MID: '#3ddc84', ATT: '#ff6b5d' };

/** Faixa de números do elenco (overall, idade média, valor e jogadores). */
export function StatStrip({ game, compact }: { game: GameState; compact?: boolean }) {
  const players = game.teams[game.userClubId].players;
  const avg = (f: (p: Player) => number) => players.reduce((s, p) => s + f(p), 0) / Math.max(1, players.length);
  const ovr = Math.round(avg((p) => p.strength));
  const age = avg((p) => p.age).toFixed(1).replace('.', ',');
  const value = players.reduce((s, p) => s + myValue(game, p), 0);
  return (
    <div className={`fm-strip ${compact ? 'compact' : ''}`} aria-label="Resumo do elenco">
      <div><small>Overall</small><b>{ovr}</b></div>
      <div><small>Idade média</small><b>{age}</b></div>
      <div><small>Valor do elenco</small><b>{formatBudget(value)}</b></div>
      {!compact && <div><small>Jogadores</small><b>{players.length}</b></div>}
    </div>
  );
}

/** Atalhos em forma de abas (Elenco, Competições, Transferências, Notícias). */
export function QuickTabs({ items }: { items: { icon: string; label: string; on?: boolean; onClick: () => void }[] }) {
  return (
    <div className="fm-tabs" role="navigation" aria-label="Atalhos">
      {items.map((t) => <button key={t.label} className={t.on ? 'on' : ''} onClick={t.onClick}><span aria-hidden="true">{t.icon}</span>{t.label}</button>)}
    </div>
  );
}

/** Cartão com título em caixa-alta, ícone e link "Ver todos". */
export function FmCard({ icon, title, action, onAction, children }: { icon: string; title: string; action?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <section className="fm-card">
      <header><span className="fm-ico" aria-hidden="true">{icon}</span><h3>{title}</h3>{action && <button onClick={onAction}>{action} <i aria-hidden="true">›</i></button>}</header>
      {children}
    </section>
  );
}

/** Retrato do jogador (silhueta colorida pela posição). */
export function Avatar({ pos }: { pos: Position }) {
  const c = POS_COLOR[pos];
  return (
    <svg className="fm-avatar" viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="8" fill={c} opacity=".22" />
      <circle cx="24" cy="18" r="8" fill={c} /><path d="M8 46c1-11 8-16 16-16s15 5 16 16z" fill={c} />
    </svg>
  );
}

/** Nota do jogador no padrão do cartão (verde alto, azul médio). */
export const ovrClass = (n: number) => (n >= 80 ? 'gold' : n >= 65 ? 'green' : n >= 50 ? 'blue' : 'grey');

/** Camisa listrada nas cores do clube, com o escudo no peito. */
export function Jersey({ club }: { club: { primaryColor: string; secondaryColor: string; shortName: string; badge: string } }) {
  const a = club.primaryColor, b = club.secondaryColor;
  return (
    <svg className="fm-jersey" viewBox="0 0 160 170" aria-hidden="true">
      <defs>
        <clipPath id="jc"><path d="M52 8 L10 30 L0 72 L26 82 L34 62 L34 160 Q80 172 126 160 L126 62 L134 82 L160 72 L150 30 L108 8 Q80 30 52 8Z" /></clipPath>
        <linearGradient id="jsh" x1="0" x2="1"><stop offset="0" stopColor="#000" stopOpacity=".35" /><stop offset=".5" stopColor="#fff" stopOpacity=".08" /><stop offset="1" stopColor="#000" stopOpacity=".4" /></linearGradient>
      </defs>
      <g clipPath="url(#jc)">
        <rect width="160" height="170" fill={a} />
        {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={34 + i * 22} y="0" width="11" height="170" fill={b} opacity=".95" />)}
        <rect width="160" height="170" fill="url(#jsh)" />
        <path d="M52 8 Q80 30 108 8 L108 16 Q80 40 52 16Z" fill={b} stroke="#000" strokeOpacity=".3" />
      </g>
      <circle cx="104" cy="58" r="15" fill="#10151c" stroke={b} strokeWidth="2.5" />
      <text x="104" y="62.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff" fontFamily="Inter, sans-serif">{club.shortName.slice(0, 3)}</text>
    </svg>
  );
}

/** Título grande e inclinado de cada tela, com o ícone do assunto. */
export function ScreenTitle({ icon, title, right }: { icon: string; title: string; right?: ReactNode }) {
  return <div className="fm-title"><span aria-hidden="true">{icon}</span><h2>{title}</h2>{right && <div className="fm-title-r">{right}</div>}</div>;
}

/** Sub-abas em botões grandes (Tabela, Jogos...). */
export function SubTabs({ items }: { items: { icon?: string; label: string; on?: boolean; onClick: () => void }[] }) {
  return (
    <div className="fm-sub" role="tablist">
      {items.map((t) => <button key={t.label} role="tab" aria-selected={!!t.on} className={t.on ? 'on' : ''} onClick={t.onClick}>{t.icon && <span aria-hidden="true">{t.icon}</span>}{t.label}</button>)}
    </div>
  );
}
