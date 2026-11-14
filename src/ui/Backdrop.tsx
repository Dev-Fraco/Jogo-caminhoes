import { HOME_WALLPAPER_URL } from './MainMenu';

/** Fundo das telas (assistente de Novo Jogo, Opções, carreira...): estádio em CSS + foto do treinador + escurecimento + vinheta + granulado. */
export function Backdrop() {
  return (
    <div className="menu-bg" aria-hidden="true">
      <div className="menu-art">
        <span className="beam b1" /><span className="beam b2" /><span className="beam b3" />
        <div className="menu-crowd" />
        <div className="menu-pitch" />
      </div>
      <div className="home-photo" style={{ backgroundImage: `url(${HOME_WALLPAPER_URL})` }} />
      <div className="menu-overlay" />
      <div className="menu-vignette" />
      <div className="menu-grain" />
    </div>
  );
}
