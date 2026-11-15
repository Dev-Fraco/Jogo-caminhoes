import { brl, createCharge, registerPurpose } from './bank';
import { addMonths, calOf } from './calendar';
import { FIBRA_ENTRY, FIBRA_MONTHLY, fibraUntil, notifyPhone, phoneOf, updatePhoneSettings } from './phone';
import { makeRng } from './rng';
import type { GameState, PixCharge } from './types';

/** Valor da próxima cobrança: a 1ª vez soma a entrada (instalação) à mensalidade. */
export const fibraBill = (g: GameState) => FIBRA_MONTHLY + (phoneOf(g).fibra?.entryPaid ? 0 : FIBRA_ENTRY);

/** Cobrança Pix: entrada de R$ 50.000 (só na contratação) + mensalidade de R$ 100.000. */
export function buyFibra(g: GameState): { ok: true; state: GameState; charge: PixCharge } | { ok: false; error: string } {
  if (!g.bank?.passHash) return { ok: false, error: 'Abra sua conta no app Banco para pagar a NetFibra.' };
  const first = !phoneOf(g).fibra?.entryPaid;
  const { state, charge } = createCharge(g, {
    merchant: 'NetFibra', description: first ? `Contratação: entrada ${brl(FIBRA_ENTRY)} + 1ª mensalidade ${brl(FIBRA_MONTHLY)}` : 'Mensalidade (1 mês)',
    amount: fibraBill(g), purpose: { type: 'netfibra' },
  });
  return { ok: true, state, charge };
}

registerPurpose('netfibra', (g) => {
  const p = phoneOf(g);
  const f = p.fibra;
  const until = addMonths(Math.max(fibraUntil(g) ?? 0, calOf(g).day), 1);
  const s: GameState = { ...g, phone: { ...p, fibra: { ...(f ?? {}), entryPaid: true, until, warned: false, expiredNotified: false, down: undefined } } };
  return notifyPhone(s, 'netfibra', f?.ssid ? 'NetFibra: mensalidade paga.' : 'NetFibra contratada! Abra o app para escolher o nome e a senha da sua rede.');
});

/** Nome e senha da rede (pedidos logo depois de contratar). Conecta o celular nela. */
export function setupWifi(g: GameState, ssid: string, password: string): { ok: true; state: GameState } | { ok: false; error: string } {
  const f = phoneOf(g).fibra;
  if (!f?.entryPaid) return { ok: false, error: 'Contrate o plano primeiro.' };
  const name = ssid.trim();
  if (name.length < 3 || name.length > 24) return { ok: false, error: 'O nome da rede deve ter de 3 a 24 caracteres.' };
  if (password.length < 8) return { ok: false, error: 'A senha deve ter pelo menos 8 caracteres.' };
  let s: GameState = { ...g, phone: { ...phoneOf(g), fibra: { ...f, ssid: name, password } } };
  s = updatePhoneSettings(s, { airplane: false, wifi: true, wifiNet: name });
  return { ok: true, state: notifyPhone(s, 'netfibra', `Rede "${name}" criada e conectada.`) };
}

/** Chance de a NetFibra cair a cada jogo (a rede volta sozinha em 2 a 6 dias). */
export const OUTAGE_CHANCE = 0.2;

/** A cada jogo: a rede cai de vez em quando; passados alguns dias ela volta (o aviso de "voltou" vem do processamento diário). */
export function fibraTick(g: GameState): GameState {
  const f = phoneOf(g).fibra;
  if (!f?.ssid || g.phone?.noPhone) return g;
  const now = calOf(g).day;
  if (f.down !== undefined && f.down > now) return g; // já caída
  if (!fibraUntil(g) || (fibraUntil(g) ?? 0) <= now) return g; // plano vencido: nem cai
  const rng = makeRng(g.seed * 83 + g.season * 29 + g.round * 7 + now);
  if (rng() >= OUTAGE_CHANCE) return g;
  const days = 2 + Math.floor(rng() * 5);
  const s: GameState = { ...g, phone: { ...phoneOf(g), fibra: { ...f, down: now + days } } };
  return notifyPhone(s, 'netfibra', `A NetFibra caiu! Use os dados móveis (5G) por uns ${days} dias.`);
}
