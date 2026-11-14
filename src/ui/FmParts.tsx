import type { ReactNode } from 'react';
import { myValue } from '../engine/roster';
import type { GameState, Player, Position } from '../engine/types';
import { formatBudget } from '../newgame/format';

export const POS_ONE: Record<Position, string> = { GK: 'Goleiro', DEF: 'Defensor', MID: 'Meio-campista', ATT: 'Atacante' };
const POS_COLOR: Record<Position, string> = { GK: '#f5c542', DEF: '#4da3ff', MID: '#3ddc84', ATT: '#ff6b5d' };

/** Faixa de números do elenco (overall, idade média, valor e jogadores). */
export function StatStrip({ game }: { game: GameState }) {
  const players = game.teams[game.userClubId].players;
  const avg = (f: (p: Player) => number) => players.reduce((s, p) => s + f(p), 0) / Math.max(1, players.length);
  const ovr = Math.round(avg((p) => p.strength));
  const age = avg((p) => p.age).toFixed(1).replace('.', ',');
  const value = players.reduce((s, p) => s + myValue(game, p), 0);
  return (
    <div className="fm-strip" aria-label="Resumo do elenco">
      <div><small>Overall</small><b>{ovr}</b></div>
      <div><small>Idade média</small><b>{age}</b></div>
      <div><small>Valor do elenco</small><b>{formatBudget(value)}</b></div>
      <div><small>Jogadores</small><b>{players.length}</b></div>
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
