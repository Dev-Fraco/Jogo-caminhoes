import { Capacitor, registerPlugin } from '@capacitor/core';
import { isPremium } from './entitlement';
import { billingAvailable } from './billing';

/* =====================================================================
   Anúncios (AdMob) só na versão grátis da loja. Regras:
   - nada de anúncio no Premium, na web, nos testes e no APK de teste (só no build da loja, no Android);
   - nunca durante a partida: só em pausas naturais (voltar ao menu, virar a temporada);
   - com intervalo mínimo entre anúncios e sem anúncio logo no começo da sessão;
   - o consentimento (LGPD/GDPR) é pedido pelo plugin nativo (Google UMP) antes do primeiro anúncio.
   ===================================================================== */

export interface AdsPlugin {
  init(): Promise<{ canRequestAds: boolean }>;
  /** Mostra o anúncio já carregado (e carrega o próximo). shown=false se não havia anúncio pronto. */
  showInterstitial(): Promise<{ shown: boolean }>;
}

/** Intervalo mínimo entre dois anúncios e espera mínima desde que o app abriu. */
export const AD_GAP_MS = 6 * 60_000;
export const AD_FIRST_AFTER_MS = 4 * 60_000;
export type AdMoment = 'menu' | 'season';

let plugin: AdsPlugin | null = null;
let nativeOverride: boolean | null = null;
let enabledOverride: boolean | null = null;
/** Só para testes. */
export function setAdsPlugin(p: AdsPlugin | null, native: boolean | null = p ? true : null): void { plugin = p; nativeOverride = native; state = { started: Date.now(), last: 0, ready: false, busy: false }; }
export const setAdsStoreBuild = (v: boolean | null): void => { enabledOverride = v; };
const isNative = (): boolean => (nativeOverride ?? Capacitor.isNativePlatform());
const api = (): AdsPlugin => plugin ?? (plugin = registerPlugin<AdsPlugin>('Ads'));

let state = { started: Date.now(), last: 0, ready: false, busy: false };

/** Deve haver anúncios neste aparelho agora? */
export const adsEnabled = (): boolean => (enabledOverride ?? billingAvailable()) && isNative() && !isPremium();

/** Regra pura de quando mostrar. */
export function mayShow(now: number, started: number, last: number, matchOn: boolean): boolean {
  if (matchOn) return false;
  if (now - started < AD_FIRST_AFTER_MS) return false;
  return last === 0 || now - last >= AD_GAP_MS;
}

/** Prepara os anúncios (consentimento + SDK). Seguro de chamar sempre; não faz nada fora da loja/Premium. */
export async function initAds(): Promise<void> {
  if (!adsEnabled() || state.ready) return;
  try { state.ready = (await api().init()).canRequestAds; } catch { state.ready = false; }
}

/** Tenta mostrar um anúncio num momento de pausa. Devolve se mostrou. Nunca durante a partida (`matchOn`). */
export async function maybeShowAd(_moment: AdMoment, opts: { matchOn?: boolean; now?: number } = {}): Promise<boolean> {
  if (!adsEnabled() || state.busy) return false;
  const now = opts.now ?? Date.now();
  if (!mayShow(now, state.started, state.last, !!opts.matchOn)) return false;
  state.busy = true;
  try {
    if (!state.ready) await initAds();
    if (!state.ready) return false;
    const r = await api().showInterstitial();
    if (r.shown) state.last = now;
    return r.shown;
  } catch { return false; } finally { state.busy = false; }
}
