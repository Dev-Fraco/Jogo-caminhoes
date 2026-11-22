import type { CSSProperties, KeyboardEvent } from 'react';
import { APP_VERSION, COMMUNITY_URL } from '../version';
import { HomeIcon } from './HomeIcons';
import { isPremium } from '../premium/entitlement';
import './menu.css';
import './home.css';

/** As 8 opções do painel inicial, na ordem de exibição (Sair por último). Não adicione outras. */
export const MENU_OPTIONS = [
  { id: 'novo-jogo', label: 'Novo Jogo', hint: 'Iniciar nova carreira' },
  { id: 'continuar', label: 'Continuar', hint: 'Retomar sua carreira' },
  { id: 'carregar-jogo', label: 'Carregar Jogo', hint: 'Abrir um jogo salvo' },
  { id: 'opcoes', label: 'Opções', hint: 'Idioma, áudio e backups' },
  { id: 'mods', label: 'Mods da Comunidade', hint: 'Ligas, elencos, escudos e mais' },
  { id: 'salao-campeoes', label: 'Salão de Campeões', hint: 'Todos os campeões do jogo' },
  { id: 'creditos', label: 'Créditos', hint: 'Equipe e desenvolvimento' },
  { id: 'sair', label: 'Sair', hint: 'Fechar o jogo' },
] as const;

/** Nomes da faixa inferior da tela inicial: só texto, não são botões. */
export const FEATURES = [
  { id: 'competicoes', label: 'Competição' },
  { id: 'transferencias', label: 'Transferência' },
  { id: 'elenco', label: 'Elenco' },
  { id: 'financas', label: 'Finanças' },
  { id: 'estadio', label: 'Estádio' },
  { id: 'base', label: 'Categoria de Base' },
] as const;

export type MenuOptionId = (typeof MENU_OPTIONS)[number]['id'];

/**
 * >>> TROCAR O WALLPAPER AQUI <<<
 * Foto de fundo de TODAS as telas (treinador no estádio), em public/assets/. Se o arquivo não existir,
 * aparece o fundo desenhado em CSS.
 */
export const HOME_WALLPAPER_URL = 'assets/home-coach.jpg';
/** Cena da tela inicial (treinador pensativo, taça e prancheta tática). */
export const HOME_SCENE_URL = 'assets/home-scene.jpg';

interface Props {
  onSelect: (id: MenuOptionId) => void;
  /** Só visual: quando false, "Continuar" aparece apagado. O clique continua indo para a mesma tela de antes. */
  hasSave?: boolean;
}

const MAIN: ReadonlySet<MenuOptionId> = new Set(['novo-jogo', 'continuar', 'carregar-jogo']);

export function MainMenu({ onSelect, hasSave = true }: Props) {
  // Setas ↑/↓ movem o foco entre os botões do menu (Tab continua funcionando normalmente).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const next = btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length];
    e.preventDefault();
    next.focus();
  };
  const main = MENU_OPTIONS.filter((o) => MAIN.has(o.id));
  const rest = MENU_OPTIONS.filter((o) => !MAIN.has(o.id));

  return (
    <div className="menu home hm">
      <div className="hm-scene" aria-hidden="true"><img src={HOME_SCENE_URL} alt="" /></div>
      <div className="hm-shade" aria-hidden="true" />

      <div className="hm-top">
        <span className="hm-badge">Modo<br />Carreira</span>
        <span className="hm-badge right"><b>Alpha</b><small>v{APP_VERSION}</small></span>
      </div>

      <div className="hm-logo" role="img" aria-label="Vida Real FC">
        <b>VIDA REAL</b>
        <span><i /><em>FC</em><i /></span>
      </div>
      <p className="hm-slogan">O simulador da vida real de um treinador</p>

      <div className="hm-menu" role="navigation" aria-label="Menu principal" onKeyDown={onKeyDown}>
        {main.map((o, i) => {
          const empty = o.id === 'continuar' && !hasSave;
          return (
            <button key={o.id} className={`hm-btn${o.id === 'novo-jogo' ? ' primary' : ''}${empty ? ' is-empty' : ''}`} style={{ '--i': i } as CSSProperties} aria-disabled={empty || undefined} onClick={() => onSelect(o.id)}>
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>

      <div className="hm-sub" role="navigation" aria-label="Mais opções" onKeyDown={onKeyDown}>
        {rest.map((o) => (
          <button key={o.id} className="hm-small" onClick={() => onSelect(o.id)}>
            <span className="hm-ico"><HomeIcon id={o.id} /></span><span>{o.label}</span>{o.id === 'mods' && !isPremium() ? <small className="hm-lock">Premium</small> : null}
          </button>
        ))}
      </div>

      {/* nomes dos recursos: só texto, não clicável */}
      <ul className="hm-feats" aria-label="Recursos do jogo">
        {FEATURES.map((f) => <li key={f.id}>{f.label}</li>)}
      </ul>
      <p className="hm-foot">
        <span className="hm-foot-msg">Baixe os mods da comunidade no nosso grupo do Telegram</span>
        <a className="hm-foot-link" href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer"><span aria-hidden="true">✈️</span> Entrar no grupo do Telegram</a>
      </p>
    </div>
  );
}
