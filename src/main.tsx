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
import { initBilling } from './premium/billing';
import { initLedger } from './premium/ledger';
import { initAds } from './premium/ads';

// confere o Premium na Google Play (no máximo 2,5 s de espera) antes de montar o jogo; mods e pacotes de elencos só valem no Premium
const billing = Promise.race([Promise.all([initBilling().catch(() => undefined), initLedger()]), new Promise((r) => setTimeout(r, 2500))]);

billing.then(() => {
  applyMods(modsAllowed() ? loadMods() : []);
  return modsAllowed() ? loadInstalledPack() : undefined;
}).finally(() => {
  void initAds(); // (versão grátis da loja: consentimento + SDK de anúncios em segundo plano)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
