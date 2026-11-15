import type { CSSProperties, KeyboardEvent } from 'react';
import { APP_VERSION, COMMUNITY_LINK } from '../version';
import { HomeIcon } from './HomeIcons';
import { HomeLogo } from './HomeLogo';
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

/** Faixa inferior: atalhos para a sua carreira salva (sem jogo salvo, levam ao Novo Jogo). */
export const FEATURES = [
  { id: 'competicoes', label: 'Competições', hint: 'Séries A–D, Copa e estaduais' },
  { id: 'transferencias', label: 'Transferências', hint: 'Contratações e vendas' },
  { id: 'elenco', label: 'Elenco', hint: 'Gerenciar jogadores' },
  { id: 'financas', label: 'Finanças', hint: 'Saldo, salários e investimentos' },
  { id: 'estadio', label: 'Estádio', hint: 'Ampliações e melhorias' },
  { id: 'base', label: 'Categorias de Base', hint: 'Revelar novos talentos' },
  { id: 'perfil', label: 'Perfil do Treinador', hint: 'Carreira, títulos e histórico' },
] as const;

export type MenuOptionId = (typeof MENU_OPTIONS)[number]['id'];

/**
 * >>> TROCAR O WALLPAPER AQUI <<<
 * Foto de fundo de TODAS as telas (treinador no estádio), em public/assets/. Se o arquivo não existir,
 * aparece o fundo desenhado em CSS.
 */
export const HOME_WALLPAPER_URL = 'assets/home-coach.jpg';

/** Opções com destaque visual maior. */
const PRIMARY: ReadonlySet<MenuOptionId> = new Set(['novo-jogo']);

export type FeatureId = (typeof FEATURES)[number]['id'];

interface Props {
  onSelect: (id: MenuOptionId) => void;
  onFeature?: (id: FeatureId) => void;
  /** Só visual: quando false, "Continuar" aparece apagado. O clique continua indo para a mesma tela de antes. */
  hasSave?: boolean;
}

export function MainMenu({ onSelect, onFeature, hasSave = true }: Props) {
  // Setas ↑/↓ movem o foco entre os botões do menu (Tab continua funcionando normalmente).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.menu-btn'));
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const next = btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length];
    e.preventDefault();
    next.focus();
  };

  return (
    <div className="menu home">
      {/* Fundo: arte em CSS (reserva) → foto → escurecimento → vinheta → granulado */}
      <div className="menu-bg" aria-hidden="true">
        <div className="menu-art">
          <span className="beam b1" /><span className="beam b2" /><span className="beam b3" />
          <div className="menu-crowd" />
          <div className="menu-pitch" />
        </div>
        {/* a imagem vai em style inline: url() dentro de variável CSS seria resolvido a partir da pasta do .css e quebraria o caminho */}
        <div className="home-photo" style={{ backgroundImage: `url(${HOME_WALLPAPER_URL})` }} />
        <div className="home-shade" />
        <div className="menu-vignette" />
        <div className="menu-grain" />
      </div>

      <div className="home-stage">
        <div className="home-top">
          <span className="home-tag"><HomeIcon id="pessoa" className="home-tag-ico" />Modo Carreira</span>
          <HomeLogo className="home-logo" />
          <span className="home-ver"><b>Alpha</b><small>v{APP_VERSION}</small></span>
        </div>
        <p className="home-slogan">O simulador da vida real de um treinador</p>

        <div className="home-menu" role="navigation" aria-label="Menu principal" onKeyDown={onKeyDown}>
          {MENU_OPTIONS.map((o, i) => {
            const empty = o.id === 'continuar' && !hasSave;
            return (
              <button
                key={o.id}
                className={`menu-btn${PRIMARY.has(o.id) ? ' is-primary' : ''}${empty ? ' is-empty' : ''}`}
                style={{ '--i': i } as CSSProperties}
                aria-labelledby={`mb-${o.id}`}
                aria-describedby={`mh-${o.id}`}
                aria-disabled={empty || undefined}
                onClick={() => onSelect(o.id)}
              >
                <span className="home-ico"><HomeIcon id={o.id} /></span>
                <span className="home-txt">
                  <strong id={`mb-${o.id}`} className="menu-label">{o.label}</strong>
                  <small id={`mh-${o.id}`}>{o.hint}</small>
                </span>
                <span className="menu-arrow" aria-hidden="true">›</span>
              </button>
            );
          })}
        </div>

        {/* atalhos: abrem a tela da carreira salva (ou o Novo Jogo, se não houver) */}
        <ul className="home-tiles" aria-label="Atalhos da carreira">
          {FEATURES.map((f, i) => (
            <li key={f.id} style={{ '--i': i } as CSSProperties}>
              <button className="home-tile" onClick={() => onFeature?.(f.id)} aria-label={`${f.label}: ${hasSave ? f.hint : 'comece uma carreira'}`}>
                <span className="home-tile-ico"><HomeIcon id={f.id} /></span>
                <strong>{f.label}</strong>
                <small>{f.hint}</small>
              </button>
            </li>
          ))}
        </ul>
        <p className="home-foot">{COMMUNITY_LINK}</p>
      </div>
    </div>
  );
}
