import { APP_VERSION, COMMUNITY_LINK } from '../version';

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

export function MainMenu({ onSelect }: { onSelect: (id: MenuOptionId) => void }) {
  return (
    <div className="menu">
      <div className="menu-hero">
        <span className="menu-ball">⚽</span>
        <h1>Brasileirão<br />Manager</h1>
        <p>Modo carreira de treinador</p>
      </div>
      <div className="menu-list" role="navigation" aria-label="Menu principal">
        {MENU_OPTIONS.map((o) => (
          <button key={o.id} className="menu-btn" onClick={() => onSelect(o.id)}>{o.label}</button>
        ))}
      </div>
      <footer className="menu-foot">
        <span>v{APP_VERSION}</span>
        <span>{COMMUNITY_LINK}</span>
      </footer>
    </div>
  );
}
