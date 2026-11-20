import { afterEach, describe, expect, it, vi } from 'vitest';
import { AD_FIRST_AFTER_MS, AD_GAP_MS, maybeShowAd, mayShow, setAdsPlugin, setAdsStoreBuild, type AdsPlugin } from '../src/premium/ads';
import { setPremium } from '../src/premium/entitlement';

const fake = (canRequestAds = true, shown = true) => { const calls = { init: 0, show: 0 }; const p: AdsPlugin = { init: async () => { calls.init++; return { canRequestAds }; }, showInterstitial: async () => { calls.show++; return { shown }; } }; return { p, calls }; };
afterEach(() => { setAdsPlugin(null, null); setAdsStoreBuild(null); setPremium(true); vi.restoreAllMocks(); });
const free = (p: AdsPlugin) => { setPremium(false); setAdsStoreBuild(true); setAdsPlugin(p); };
const T0 = Date.now() + 10 * 60_000; // bem depois do início da sessão

describe('anúncios (só no grátis da loja)', () => {
  it('regra de tempo: nunca na partida, nunca logo no começo, respeitando o intervalo', () => {
    expect(mayShow(1_000_000, 0, 0, true)).toBe(false);
    expect(mayShow(AD_FIRST_AFTER_MS - 1, 0, 0, false)).toBe(false);
    expect(mayShow(AD_FIRST_AFTER_MS, 0, 0, false)).toBe(true);
    expect(mayShow(AD_FIRST_AFTER_MS + AD_GAP_MS - 1, 0, AD_FIRST_AFTER_MS, false)).toBe(false);
    expect(mayShow(AD_FIRST_AFTER_MS + AD_GAP_MS, 0, AD_FIRST_AFTER_MS, false)).toBe(true);
  });
  it('Premium, web/teste ou build sem loja: nenhum anúncio e o SDK nem é chamado', async () => {
    const f = fake();
    setPremium(true); setAdsStoreBuild(true); setAdsPlugin(f.p);
    expect(await maybeShowAd('menu', { now: T0 })).toBe(false);
    setPremium(false); setAdsStoreBuild(false);
    expect(await maybeShowAd('menu', { now: T0 })).toBe(false);
    setAdsStoreBuild(true); setAdsPlugin(f.p, false);
    expect(await maybeShowAd('menu', { now: T0 })).toBe(false);
    expect(f.calls.init + f.calls.show).toBe(0);
  });
  it('grátis da loja: mostra, respeita o intervalo e a partida', async () => {
    const f = fake(); free(f.p);
    expect(await maybeShowAd('menu', { now: T0, matchOn: true })).toBe(false);
    expect(await maybeShowAd('menu', { now: T0 })).toBe(true);
    expect(await maybeShowAd('season', { now: T0 + 60_000 })).toBe(false);
    expect(await maybeShowAd('season', { now: T0 + AD_GAP_MS })).toBe(true);
    expect(f.calls.init).toBe(1);
    expect(f.calls.show).toBe(2);
  });
  it('sem consentimento ou sem anúncio pronto: não mostra e não trava o jogo', async () => {
    const a = fake(false); free(a.p);
    expect(await maybeShowAd('menu', { now: T0 })).toBe(false);
    expect(a.calls.show).toBe(0);
    const b = fake(true, false); free(b.p);
    expect(await maybeShowAd('menu', { now: T0 })).toBe(false);
    // se o anúncio não saiu, o intervalo não conta: pode tentar de novo logo
    expect(b.calls.show).toBe(1);
    const c: AdsPlugin = { init: async () => { throw new Error('x'); }, showInterstitial: async () => ({ shown: true }) }; free(c);
    await expect(maybeShowAd('menu', { now: T0 })).resolves.toBe(false);
  });
});
