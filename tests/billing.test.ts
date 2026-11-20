import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buyPlan, evaluate, initBilling, PRODUCT_IDS, refreshEntitlement, restorePurchases, setBillingPlugin, setEnforceBilling, SUB_GRACE_DAYS, type PlayBillingPlugin, type StoredPurchase } from '../src/premium/billing';
import { isPremium, setPremium } from '../src/premium/entitlement';

const DAY = 86_400_000;
const buy = (plan: keyof typeof PRODUCT_IDS, o: Partial<StoredPurchase> = {}): StoredPurchase => ({ productId: PRODUCT_IDS[plan], state: 1, json: `{"productId":"${PRODUCT_IDS[plan]}","token":"x"}`, signature: 'sig', verified: true, ...o });

/** Plugin de mentira: `online` liga/desliga a internet; `bad` lista as assinaturas que NÃO batem com a chave da Google. */
function fake(purchases: StoredPurchase[], opts: { online?: boolean; bad?: Set<string>; onPurchase?: () => StoredPurchase[] } = {}) {
  const st = { online: opts.online ?? true, purchases };
  const p: PlayBillingPlugin = {
    queryEntitlement: async () => { if (!st.online) throw new Error('query-failed:3'); return { purchases: st.purchases }; },
    purchase: async () => { const r = opts.onPurchase?.() ?? st.purchases; st.purchases = r; return { purchases: r }; },
    verify: async ({ json }) => ({ verified: !(opts.bad?.has(json)) }),
  };
  return { p, st };
}

beforeEach(() => { const m = new Map<string, string>(); vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }); setEnforceBilling(true); setPremium(true); });
afterEach(() => { setBillingPlugin(null, null); setEnforceBilling(false); setPremium(true); vi.unstubAllGlobals(); });

describe('regras das compras (puras)', () => {
  it('vitalício vale sempre; assinatura vale só se confirmada online nos últimos 7 dias; compra pendente ou não verificada não vale', () => {
    const now = 1_000 * DAY;
    expect(evaluate([buy('lifetime')], 0, now)).toEqual({ premium: true, plan: 'lifetime' });
    expect(evaluate([buy('monthly')], now - 3 * DAY, now).premium).toBe(true);
    expect(evaluate([buy('weekly')], now - SUB_GRACE_DAYS * DAY, now).premium).toBe(true);
    expect(evaluate([buy('monthly')], now - (SUB_GRACE_DAYS + 1) * DAY, now).premium).toBe(false);
    expect(evaluate([buy('lifetime', { state: 2 })], now, now).premium).toBe(false);          // pendente
    expect(evaluate([buy('monthly', { verified: false })], now, now).premium).toBe(false);    // assinatura da Google não confere
    expect(evaluate([{ ...buy('monthly'), productId: 'outro_produto' }], now, now).premium).toBe(false);
    expect(evaluate([], now, now).premium).toBe(false);
  });
});

describe('consulta à Google Play', () => {
  it('sem compras: grátis. Com compra verificada: Premium. O acesso só existe na memória (nada vai para o save)', async () => {
    const f = fake([]); setBillingPlugin(f.p);
    expect(await refreshEntitlement()).toMatchObject({ premium: false, source: 'play' });
    f.st.purchases = [buy('monthly')];
    expect(await initBilling()).toMatchObject({ premium: true, plan: 'monthly', source: 'play' });
    expect(isPremium()).toBe(true);
  });
  it('build sem cobrança (testes, web, APK de teste): tudo liberado e a Play nem é consultada', async () => {
    setEnforceBilling(false);
    const q = vi.fn(); setBillingPlugin({ queryEntitlement: q, purchase: q, verify: q });
    expect(await refreshEntitlement()).toEqual({ premium: true, source: 'disabled' });
    expect(q).not.toHaveBeenCalled();
  });
  it('fora do Android a cobrança não existe: build da loja na web fica grátis', async () => {
    setBillingPlugin(null, false);
    expect(await refreshEntitlement()).toMatchObject({ premium: false, source: 'none' });
  });
  it('sem internet: assinatura guardada vale por 7 dias e depois não; vitalício vale para sempre; editar o arquivo guardado invalida', async () => {
    const f = fake([buy('weekly'), buy('lifetime', { json: '{"x":1}' })]);
    setBillingPlugin(f.p);
    const t0 = 5_000 * DAY;
    await refreshEntitlement(t0);                             // consulta online e guarda
    f.st.online = false;
    expect(await refreshEntitlement(t0 + 2 * DAY)).toMatchObject({ premium: true, source: 'cache' });
    // só a assinatura, sem vitalício
    const g = fake([buy('weekly')]); setBillingPlugin(g.p);
    await refreshEntitlement(t0); g.st.online = false;
    expect((await refreshEntitlement(t0 + 6 * DAY)).premium).toBe(true);
    expect((await refreshEntitlement(t0 + 9 * DAY)).premium).toBe(false);
    // vitalício offline por muito tempo
    const h = fake([buy('lifetime')]); setBillingPlugin(h.p);
    await refreshEntitlement(t0); h.st.online = false;
    expect((await refreshEntitlement(t0 + 400 * DAY)).premium).toBe(true);
    // arquivo adulterado: a assinatura da Google não confere mais
    const bad = new Set([buy('lifetime').json]);
    const k = fake([buy('lifetime')], { bad }); setBillingPlugin(k.p);
    await refreshEntitlement(t0); k.st.online = false;
    expect((await refreshEntitlement(t0 + DAY)).premium).toBe(false);
  });
  it('sem internet e sem nada guardado: grátis', async () => {
    setBillingPlugin(fake([], { online: false }).p);
    expect(await refreshEntitlement()).toMatchObject({ premium: false, source: 'none' });
  });
});

describe('comprar e restaurar', () => {
  it('compra concluída libera o Premium; cancelada, pendente e não verificada não liberam e mostram a mensagem certa', async () => {
    const f = fake([], { onPurchase: () => [buy('lifetime')] }); setBillingPlugin(f.p);
    expect(await buyPlan('lifetime')).toMatchObject({ ok: true, premium: true });
    expect(isPremium()).toBe(true);
    setPremium(false);
    const pend = fake([], { onPurchase: () => [buy('monthly', { state: 2 })] }); setBillingPlugin(pend.p);
    expect(await buyPlan('monthly')).toMatchObject({ ok: true, premium: false, message: expect.stringContaining('pendente') });
    const cancel: PlayBillingPlugin = { queryEntitlement: async () => ({ purchases: [] }), verify: async () => ({ verified: true }), purchase: async () => { throw new Error('cancelled'); } };
    setBillingPlugin(cancel);
    expect(await buyPlan('weekly')).toMatchObject({ ok: false, premium: false, message: 'Compra cancelada.' });
    const unv = fake([], { onPurchase: () => [buy('monthly', { verified: false })] }); setBillingPlugin(unv.p);
    expect(await buyPlan('monthly')).toMatchObject({ ok: false, premium: false });
  });
  it('restaurar compras: acha a compra da conta; sem compra diz que não encontrou', async () => {
    setBillingPlugin(fake([buy('monthly')]).p);
    expect(await restorePurchases()).toMatchObject({ ok: true, premium: true });
    setPremium(false);
    setBillingPlugin(fake([]).p);
    expect(await restorePurchases()).toMatchObject({ ok: false, message: 'Nenhuma compra encontrada nesta conta.' });
  });
  it('fora do app da loja não dá para comprar', async () => {
    setEnforceBilling(false);
    expect(await buyPlan('monthly')).toMatchObject({ ok: false });
  });
});
