import { Capacitor, registerPlugin } from '@capacitor/core';

/* =====================================================================
   Pacote Premium (Play Asset Delivery). No build da loja a parte Premium do jogo (telas do Mundo, copas especiais, vendas ao exterior)
   não vem dentro do app: é um pacote da Play, baixado só depois da compra (ou durante a temporada grátis, que libera tudo).
   Nos demais builds (web, testes, APK de teste) o código continua dentro do app e este módulo não faz nada.
   ===================================================================== */

export interface PremiumPackPlugin {
  status(): Promise<{ ready: boolean }>;
  ensure(): Promise<{ ready: boolean }>;
  addListener(ev: 'progress', cb: (p: { done: number; total: number }) => void): Promise<{ remove: () => Promise<void> }>;
}

const envFlag = (): boolean => { try { return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SPLIT_PREMIUM === '1'; } catch { return false; } };
/** O build separou a parte Premium do app (build da loja)? */
export let SPLIT_PREMIUM = envFlag();
/** Só para testes. */
export const setSplitPremium = (v: boolean): void => { SPLIT_PREMIUM = v; };

let ready = false;
let inflight: Promise<void> | null = null;
let plugin: PremiumPackPlugin | null = null;
let nativeOverride: boolean | null = null;
/** Só para testes. */
export function setPackPlugin(p: PremiumPackPlugin | null, native: boolean | null = p ? true : null): void { plugin = p; nativeOverride = native; ready = false; inflight = null; }
const isNative = (): boolean => (nativeOverride ?? Capacitor.isNativePlatform());
const api = (): PremiumPackPlugin => plugin ?? (plugin = registerPlugin<PremiumPackPlugin>('PremiumPack'));

/** O pacote é necessário neste aparelho? */
export const packNeeded = (): boolean => SPLIT_PREMIUM && isNative();

const listeners = new Set<(pct: number) => void>();
/** Acompanha o download (0 a 100). */
export const onPackProgress = (fn: (pct: number) => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Garante que o pacote Premium está no aparelho (baixa se preciso). Só chamar depois de conferir o portão do Premium. */
export function ensurePack(): Promise<void> {
  if (!packNeeded() || ready) return Promise.resolve();
  if (inflight) return inflight;
  const p = api();
  inflight = (async () => {
    let off: (() => Promise<void>) | undefined;
    try {
      if ((await p.status()).ready) { ready = true; return; }
      off = (await p.addListener('progress', ({ done, total }) => { const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0; listeners.forEach((f) => f(pct)); })).remove;
      const r = await p.ensure();
      if (!r.ready) throw new Error('pack-unavailable');
      ready = true;
    } catch (e) {
      throw new Error(`pack-unavailable:${e instanceof Error ? e.message : String(e)}`);
    } finally { await off?.().catch(() => undefined); inflight = null; }
  })();
  return inflight;
}
