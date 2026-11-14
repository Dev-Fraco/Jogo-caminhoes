import { WALLPAPER_URL } from './MainMenu';

/** Fundo do menu (estádio à noite + escurecimento + vinheta + granulado), reaproveitando as classes de menu.css. */
export function Backdrop() {
  return (
    <div className="menu-bg" aria-hidden="true">
      <div className="menu-art">
        <span className="beam b1" /><span className="beam b2" /><span className="beam b3" />
        <div className="menu-crowd" />
        <div className="menu-pitch" />
      </div>
      <div className="menu-photo" style={{ backgroundImage: `url(${WALLPAPER_URL})` }} />
      <div className="menu-overlay" />
      <div className="menu-vignette" />
      <div className="menu-grain" />
    </div>
  );
}
