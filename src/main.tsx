import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import './ui/fm.css';
import './ui/mock.css';
import './ui/shell.css';
import { applyMods, loadMods } from './data/mods';
import { loadInstalledPack } from './data/packStore';
import { modsAllowed } from './premium/entitlement';

// mods e pacotes de elencos fazem parte do Premium: no grátis não são aplicados
applyMods(modsAllowed() ? loadMods() : []);

(modsAllowed() ? loadInstalledPack() : Promise.resolve()).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
