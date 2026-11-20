import { Capacitor, registerPlugin } from '@capacitor/core';
import { setPremium } from './entitlement';

/* =====================================================================
   Cobrança do Premium pela Google Play (Play Billing), sem servidor.
   - O plugin nativo (PlayBillingPlugin.java) consulta as compras da conta e confere a assinatura (RSA) de cada uma com a chave pública do Play Console.
   - O estado "Premium" vive só na memória (nunca no save). Quem confirma é a Google; o app só lê.
   - Assinaturas precisam ser confirmadas online ao menos a cada 7 dias (sem servidor não dá para saber o vencimento); o plano vitalício vale para sempre.
   - Só vale na build da loja (VITE_ENFORCE_BILLING=1) e no Android. Nas demais (testes, web, APK de teste) o acesso continua liberado.
   ===================================================================== */

export type PlanId = 'weekly' | 'monthly' | 'lifetime';
export const PRODUCT_IDS: Record<PlanId, string> = { weekly: 'vidareal_weekly', monthly: 'vidareal_monthly', lifetime: 'vidareal_lifetime' };
/** Dias que uma assinatura continua valendo sem conseguir confirmar online. */
export const SUB_GRACE_DAYS = 7;
const DAY = 86_400_000;
const CACHE_KEY = 'vr-billing-cache';
/** Estado de compra da Play: 1 = comprada; 2 = pendente. */
const PURCHASED = 1, PENDING = 2;

export interface StoredPurchase { productId: string; state: number; json: string; signature: string; autoRenewing?: boolean; verified: boolean }
export interface PlayBillingPlugin {
  queryEntitlement(): Promise<{ purchases: StoredPurchase[] }>;
  purchase(o: { plan: PlanId }): Promise<{ purchases: StoredPurchase[] }>;
  verify(o: { json: string; signature: string }): Promise<{ verified: boolean }>;
}

const envFlag = (): boolean => { try { return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ENFORCE_BILLING === '1'; } catch { return false; } };
/** A build exige compra (build da loja)? */
export let ENFORCE_BILLING = envFlag();
/** Só para testes. */
export const setEnforceBilling = (v: boolean): void => { ENFORCE_BILLING = v; };

let plugin: PlayBillingPlugin | null = null;
let nativeOverride: boolean | null = null;
/** Só para testes: troca o plugin (e finge que é Android). */
export function setBillingPlugin(p: PlayBillingPlugin | null, native: boolean | null = p ? true : null): void { plugin = p; nativeOverride = native; }
const isNative = (): boolean => (nativeOverride ?? Capacitor.isNativePlatform());
const api = (): PlayBillingPlugin => plugin ?? (plugin = registerPlugin<PlayBillingPlugin>('PlayBilling'));

/** A cobrança está disponível neste aparelho (build da loja, Android)? */
export const billingAvailable = (): boolean => ENFORCE_BILLING && isNative();

const planOf = (productId: string): PlanId | undefined => (Object.keys(PRODUCT_IDS) as PlanId[]).find((k) => PRODUCT_IDS[k] === productId);

/** Quais compras valem agora. Vitalício: sempre; assinatura: só se confirmada online nos últimos dias. */
export function evaluate(purchases: StoredPurchase[], lastOnlineCheck: number, now = Date.now()): { premium: boolean; plan?: PlanId } {
  const ok = purchases.filter((p) => p.state === PURCHASED && p.verified && planOf(p.productId));
  const life = ok.find((p) => planOf(p.productId) === 'lifetime');
  if (life) return { premium: true, plan: 'lifetime' };
  const sub = ok.find((p) => planOf(p.productId) !== 'lifetime');
  if (sub && now - lastOnlineCheck <= SUB_GRACE_DAYS * DAY) return { premium: true, plan: planOf(sub.productId) };
  return { premium: false };
}

interface Cache { at: number; purchases: StoredPurchase[] }
const readCache = (): Cache | null => { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'); return c && Array.isArray(c.purchases) && typeof c.at === 'number' ? c : null; } catch { return null; } };
const writeCache = (c: Cache | null): void => { try { if (c) localStorage.setItem(CACHE_KEY, JSON.stringify(c)); else localStorage.removeItem(CACHE_KEY); } catch { /* sem armazenamento */ } };

export interface Entitlement { premium: boolean; plan?: PlanId; source: 'disabled' | 'play' | 'cache' | 'none' }

/** Consulta a Play (ou o último resultado guardado, se estiver sem internet) e diz se há Premium. Não altera o estado do jogo. */
export async function refreshEntitlement(now = Date.now()): Promise<Entitlement> {
  if (!ENFORCE_BILLING) return { premium: true, source: 'disabled' };
  if (!isNative()) return { premium: false, source: 'none' };
  try {
    const { purchases } = await api().queryEntitlement();
    writeCache({ at: now, purchases });
    return { ...evaluate(purchases, now, now), source: 'play' };
  } catch {
    const c = readCache();
    if (!c) return { premium: false, source: 'none' };
    // sem internet: cada compra guardada é conferida de novo (a assinatura da Google tem que bater: editar o arquivo invalida)
    const re: StoredPurchase[] = [];
    for (const p of c.purchases) { try { re.push({ ...p, verified: (await api().verify({ json: p.json, signature: p.signature })).verified }); } catch { /* ignora */ } }
    return { ...evaluate(re, c.at, now), source: 'cache' };
  }
}

/** Atualiza o acesso do jogo conforme a Play. */
export async function initBilling(): Promise<Entitlement> {
  const e = await refreshEntitlement();
  if (ENFORCE_BILLING) setPremium(e.premium);
  return e;
}

export interface BuyResult { ok: boolean; premium: boolean; message: string }
const MESSAGES: Record<string, string> = {
  cancelled: 'Compra cancelada.',
  'product-unavailable': 'Este plano não está disponível agora. Tente novamente mais tarde.',
  'unknown-plan': 'Plano desconhecido.',
};
const messageOf = (e: unknown): string => {
  const m = String((e as { message?: string })?.message ?? e);
  const key = Object.keys(MESSAGES).find((k) => m.includes(k));
  return key ? MESSAGES[key] : m.includes('billing-unavailable') ? 'A Google Play não está disponível neste aparelho.' : 'Não foi possível concluir a compra. Tente novamente.';
};

/** Compra um plano. Depois da compra a Play é consultada de novo e o acesso é atualizado. */
export async function buyPlan(plan: PlanId, now = Date.now()): Promise<BuyResult> {
  if (!billingAvailable()) return { ok: false, premium: false, message: 'A cobrança só está disponível no app da Google Play.' };
  try {
    const { purchases } = await api().purchase({ plan });
    if (purchases.some((p) => p.state === PENDING)) return { ok: true, premium: false, message: 'Pagamento pendente. O Premium é liberado assim que a Google Play confirmar.' };
    const e = await initBilling();
    if (!e.premium && purchases.some((p) => p.state === PURCHASED && !p.verified)) return { ok: false, premium: false, message: 'Não foi possível confirmar a compra. Use "Restaurar compras" ou fale com o suporte.' };
    void now;
    return { ok: e.premium, premium: e.premium, message: e.premium ? 'Premium ativado. Obrigado pelo apoio!' : 'A compra ainda não apareceu. Tente "Restaurar compras" em instantes.' };
  } catch (e) { return { ok: false, premium: false, message: messageOf(e) }; }
}

/** Restaurar compras (mesma conta Google, outro aparelho ou reinstalação). */
export async function restorePurchases(): Promise<BuyResult> {
  if (!billingAvailable()) return { ok: false, premium: false, message: 'A restauração só está disponível no app da Google Play.' };
  const e = await initBilling();
  return { ok: e.premium, premium: e.premium, message: e.premium ? 'Premium restaurado.' : e.source === 'none' ? 'Não foi possível consultar a Google Play agora.' : 'Nenhuma compra encontrada nesta conta.' };
}
