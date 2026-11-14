import type { CSSProperties, KeyboardEvent } from 'react';
import { APP_VERSION, COMMUNITY_LINK } from '../version';
import './menu.css';

/** As 8 opções do painel inicial, na ordem de exibição. Não adicione outras. */
export const MENU_OPTIONS = [
  { id: 'novo-jogo', label: 'Novo Jogo' },
  { id: 'continuar', label: 'Continuar' },
  { id: 'carregar-jogo', label: 'Carregar Jogo' },
  { id: 'opcoes', label: 'Opções' },
  { id: 'sair', label: 'Sair' },
  { id: 'mods', label: 'Mods da Comunidade' },
  { id: 'creditos', label: 'Créditos' },
  { id: 'simular-anos', label: 'Simular Anos' },
] as const;

export type MenuOptionId = (typeof MENU_OPTIONS)[number]['id'];

/**
 * >>> TROCAR O WALLPAPER AQUI <<<
 * Caminho da imagem de fundo, relativo à raiz do app (arquivo em public/assets/).
 * Se o arquivo não existir, o fundo desenhado em CSS (menu.css) aparece no lugar.
 */
export const WALLPAPER_URL = 'assets/wallpaper-menu.jpg';

/** Opções com destaque visual maior. */
const PRIMARY: ReadonlySet<MenuOptionId> = new Set(['novo-jogo', 'continuar']);

interface Props {
  onSelect: (id: MenuOptionId) => void;
  /** Só visual: quando false, "Continuar" aparece apagado. O clique continua indo para a mesma tela de antes. */
  hasSave?: boolean;
}

export function MainMenu({ onSelect, hasSave = true }: Props) {
  // Setas ↑/↓ movem o foco entre os botões (Tab continua funcionando normalmente).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.menu-btn'));
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const next = btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length];
    e.preventDefault();
    next.focus();
  };

  return (
    <div className="menu" style={{ '--menu-wallpaper': `url(${WALLPAPER_URL})` } as CSSProperties}>
      {/* Camadas do fundo, de baixo para cima: arte CSS, foto, escurecimento, vinheta, granulado */}
      <div className="menu-bg" aria-hidden="true">
        <div className="menu-art">
          <span className="beam b1" /><span className="beam b2" /><span className="beam b3" />
          <div className="menu-crowd" />
          <div className="menu-pitch" />
        </div>
        <div className="menu-photo" />
        <div className="menu-overlay" />
        <div className="menu-vignette" />
        <div className="menu-grain" />
        <div className="menu-diagonal" />
      </div>

      <div className="menu-panel">
        <div className="menu-brand">
          <div className="menu-kicker">Modo Carreira <span className="menu-badge">Alpha</span></div>
          <h1>Brasileirão<span>Manager</span></h1>
        </div>

        <div className="menu-list" role="navigation" aria-label="Menu principal" onKeyDown={onKeyDown}>
          {MENU_OPTIONS.map((o, i) => {
            const empty = o.id === 'continuar' && !hasSave;
            return (
              <button
                key={o.id}
                className={`menu-btn${PRIMARY.has(o.id) ? ' is-primary' : ''}${empty ? ' is-empty' : ''}`}
                style={{ '--i': i } as CSSProperties}
                aria-disabled={empty || undefined}
                onClick={() => onSelect(o.id)}
              >
                <span className="menu-label">{o.label}</span>
                <span className="menu-arrow" aria-hidden="true">›</span>
              </button>
            );
          })}
        </div>

        <footer className="menu-foot">
          <span>v{APP_VERSION}</span>
          <span>{COMMUNITY_LINK}</span>
        </footer>
      </div>
    </div>
  );
}
