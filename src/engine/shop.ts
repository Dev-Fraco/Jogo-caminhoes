import { createCharge, registerPurpose } from './bank';
import { coachMoneyOf } from './finance';
import { CHIPS, DEFAULT_PHONE, notifyPhone, ownsPhone, PHONE_MODELS, phoneOf, type ChipId } from './phone';
import type { GameState, PixCharge } from './types';

export const brl0 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const modelById = (id: string) => PHONE_MODELS.find((m) => m.id === id);

/** Coloca o aparelho: mantém PIN, configurações e chip; se o novo tem menos memória, remove apps que não cabem. */
function equip(g: GameState, id: string): GameState {
  const m = modelById(id)!;
  const p = phoneOf(g);
  const installed = p.installed.slice(0, m.apps);
  const lost = p.installed.length - installed.length;
  let s: GameState = { ...g, phone: { ...DEFAULT_PHONE, ...p, noPhone: false, model: id, installed } };
  s = notifyPhone(s, 'config', `Novo celular: ${m.name}.${lost > 0 ? ` ${lost} app(s) não couberam na memória e foram removidos.` : ''}`);
  return s;
}

export type Buy = { ok: true; state: GameState } | { ok: false; error: string };

/** Primeira compra: o treinador está sem celular, então paga em dinheiro vivo (da carteira dele), sem Pix. */
export function buyPhoneCash(g: GameState, id: string): Buy {
  const m = modelById(id);
  if (!m) return { ok: false, error: 'Modelo não encontrado.' };
  if (ownsPhone(g)) return { ok: false, error: 'Você já tem celular: a troca é paga por Pix.' };
  if (coachMoneyOf(g) < m.price) return { ok: false, error: `Você só tem ${brl0(coachMoneyOf(g))} em dinheiro.` };
  return { ok: true, state: equip({ ...g, coachMoney: coachMoneyOf(g) - m.price }, id) };
}

/** Troca de celular: paga por Pix (cobrança que se paga no app Banco). */
export function buyPhonePix(g: GameState, id: string): { ok: true; state: GameState; charge: PixCharge } | { ok: false; error: string } {
  const m = modelById(id);
  if (!m) return { ok: false, error: 'Modelo não encontrado.' };
  if (!ownsPhone(g)) return { ok: false, error: 'Sem celular, a compra é em dinheiro.' };
  if (phoneOf(g).model === id) return { ok: false, error: 'Você já tem este aparelho.' };
  if (!g.bank?.passHash) return { ok: false, error: 'Abra sua conta no app Banco para pagar por Pix.' };
  const { state, charge } = createCharge(g, { merchant: 'Mega-zona Luiz', description: m.name, amount: m.price, purpose: { type: 'buy-phone', ref: id } });
  return { ok: true, state, charge };
}
registerPurpose('buy-phone', (g, _amount, p) => (p.ref && modelById(p.ref) ? equip(g, p.ref) : g));

/** Chip: comprado na loja, em dinheiro. Dá acesso aos dados móveis (com plano ativo). */
export function buyChip(g: GameState, id: ChipId): Buy {
  const c = CHIPS.find((x) => x.id === id);
  if (!c) return { ok: false, error: 'Chip não encontrado.' };
  if (!ownsPhone(g)) return { ok: false, error: 'Compre um celular antes.' };
  if (phoneOf(g).chip === id) return { ok: false, error: 'Você já usa este chip.' };
  if (coachMoneyOf(g) < c.price) return { ok: false, error: `Você só tem ${brl0(coachMoneyOf(g))} em dinheiro.` };
  const p = phoneOf(g);
  return { ok: true, state: notifyPhone({ ...g, coachMoney: coachMoneyOf(g) - c.price, phone: { ...p, chip: id } }, 'config', `Chip ${c.name} instalado.`) };
}
