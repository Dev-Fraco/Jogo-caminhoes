import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import './ui/fm.css';
import { applyMods, loadMods } from './data/mods';
import { loadInstalledPack } from './data/packStore';

applyMods(loadMods());

loadInstalledPack().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
