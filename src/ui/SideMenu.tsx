import { useEffect, useRef } from 'react';
import type { GameState } from '../engine/types';
import { ClubBadge } from './ClubBadge';
import { marketBadge } from './MarketDeals';
import { pendingCount } from '../engine/inbox';
import { unreadCount } from '../engine/phone';
import { ownsPhone } from '../engine/phone';
import { GameIcon, MENU_ICON } from './gameIcons';
import { coachOverallInt } from '../engine/coachpay';
import { useExtras } from '../premium/usePremium';

export type MenuTarget = 'home' | 'lineup' | 'squad' | 'youth' | 'table' | 'scorers' | 'hist' | 'calendar' | 'transfers' | 'world' | 'finance' | 'stadium' | 'profile' | 'shop' | 'phone' | 'exit';
interface Item { id: MenuTarget; icon: string; label: string; hint?: string; needsClub?: boolean }
const SECTIONS: { title: string; items: Item[] }[] = [
  { title: 'Meu clube', items: [
    { id: 'home', icon: '🏠', label: 'Início' }, { id: 'lineup', icon: '📋', label: 'Escalação', needsClub: true }, { id: 'squad', icon: '👕', label: 'Elenco', needsClub: true }, { id: 'youth', icon: '🌱', label: 'Categorias de base', needsClub: true },
  ] },
  { title: 'Competições', items: [
    { id: 'table', icon: '📊', label: 'Tabelas e jogos' }, { id: 'world', icon: '🌍', label: 'Mundo' }, { id: 'scorers', icon: '⚽', label: 'Artilharia' }, { id: 'hist', icon: '🏆', label: 'Campeões' }, { id: 'calendar', icon: '🗓️', label: 'Calendário', needsClub: true },
  ] },
  { title: 'Mercado', items: [{ id: 'transfers', icon: '🔁', label: 'Transferências', needsClub: true }] },
  { title: 'Gestão', items: [
    { id: 'finance', icon: '💰', label: 'Finanças', needsClub: true }, { id: 'stadium', icon: '🏟️', label: 'Estádio', needsClub: true }, { id: 'profile', icon: '🧑‍💼', label: 'Treinador' }, { id: 'shop', icon: '🛒', label: 'Loja' }, { id: 'phone', icon: '📱', label: 'Celular' },
  ] },
  { title: 'Jogo', items: [{ id: 'exit', icon: '💾', label: 'Salvar e voltar ao menu inicial' }] },
];

/** Menu lateral: todas as telas do jogo agrupadas, com a tela atual marcada e os avisos (propostas e pendências do celular). */
export function SideMenu({ game, open, current, locked, onClose, onGo }: { game: GameState; open: boolean; current: MenuTarget; locked: boolean; onClose: () => void; onGo: (t: MenuTarget) => void }) {
  const ref = useRef<HTMLElement>(null);
  const extras = useExtras();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    ref.current?.querySelector<HTMLElement>('button.sm-on, button')?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  const club = game.clubs[game.userClubId];
  const badge = (id: MenuTarget) => id === 'transfers' ? marketBadge(game) : id === 'phone' && ownsPhone(game) ? unreadCount(game) + pendingCount(game) : 0;
  return (
    <div className={`sm-root ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="sm-back" onClick={onClose} />
      <aside className="sm-panel" ref={ref} role="dialog" aria-modal="true" aria-label="Menu do jogo">
        <div className="sm-head">
          {game.unemployed ? <span className="sm-nobadge" aria-hidden="true">🧳</span> : <ClubBadge club={club} size={52} />}
          <div><b>{game.unemployed ? 'Sem clube' : club.name}</b><small>{game.coach.name} · overall {coachOverallInt(game)}</small></div>
          <button className="sm-x" onClick={onClose} aria-label="Fechar menu">✕</button>
        </div>
        <nav className="sm-nav">
          {SECTIONS.map((sec) => (
            <section key={sec.title}>
              <h3>{sec.title}</h3>
              {sec.items.map((it) => {
                const off = locked || (!!game.unemployed && !!it.needsClub);
                const b = badge(it.id);
                return (
                  <button key={it.id} className={it.id === current ? 'sm-on' : ''} disabled={off && it.id !== 'exit'} aria-current={it.id === current ? 'page' : undefined} onClick={() => { onClose(); onGo(it.id); }}>
                    <span className="sm-ic" aria-hidden="true">{MENU_ICON[it.id] ? <GameIcon name={MENU_ICON[it.id]} /> : it.icon}</span><span className="sm-lb">{it.label}{it.id === 'world' && extras === 'off' ? <em className="lock-tag" title="Recurso Premium">🔒</em> : null}</span>
                    {b > 0 && <i className="sm-badge" aria-label={`${b} pendências`}>{b}</i>}
                  </button>
                );
              })}
            </section>
          ))}
        </nav>
      </aside>
    </div>
  );
}
