import { createCharge, registerPurpose } from './bank';
import { coachMoneyOf } from './finance';
import { CHIPS, chipBlocked, DEFAULT_PHONE, notifyPhone, ownsPhone, PHONE_MODELS, phoneOf, type ChipId } from './phone';
import { makeRng } from './rng';
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

const DDDS = ['11', '21', '31', '41', '51', '61', '71', '81', '85', '91'];
/** Número do chip, sorteado na compra: (DD) 9XXXX-XXXX. */
export function newChipNumber(g: GameState): string {
  const n = (phoneOf(g).chipCount ?? 0) + 1;
  const rng = makeRng(g.seed * 977 + g.season * 61 + g.round * 13 + n * 7919);
  const d = (k: number) => Array.from({ length: k }, () => Math.floor(rng() * 10)).join('');
  return `(${DDDS[Math.floor(rng() * DDDS.length)]}) 9${d(4)}-${d(4)}`;
}

/** Chip: comprado na loja, em dinheiro (R$ 2.000). Vem com um número novo e bloqueia depois de 1 ano (uma temporada). */
export function buyChip(g: GameState, id: ChipId): Buy {
  const c = CHIPS.find((x) => x.id === id);
  if (!c) return { ok: false, error: 'Chip não encontrado.' };
  if (!ownsPhone(g)) return { ok: false, error: 'Compre um celular antes.' };
  const p = phoneOf(g);
  if (p.chip === id && !chipBlocked(g)) return { ok: false, error: 'Você já usa este chip.' };
  if (coachMoneyOf(g) < c.price) return { ok: false, error: `Você só tem ${brl0(coachMoneyOf(g))} em dinheiro.` };
  const number = newChipNumber(g);
  const until = g.season * 200 + g.round + g.totalRounds; // 1 ano = 1 temporada
  const s = { ...g, coachMoney: coachMoneyOf(g) - c.price, phone: { ...p, chip: id, chipNumber: number, chipUntil: until, chipCount: (p.chipCount ?? 0) + 1 } };
  return { ok: true, state: notifyPhone(s, 'config', `Chip ${c.name} instalado. Seu número: ${number}. Vale por 1 ano.`) };
}

/** Aviso quando o chip está perto de bloquear e quando bloqueou. */
export function chipTick(g: GameState): GameState {
  const p = phoneOf(g);
  if (!p.chipUntil || !p.chip) return g;
  const left = p.chipUntil - (g.season * 200 + g.round);
  const key = `${p.chipNumber}`;
  const seen = p.chipWarn ?? '';
  const mark = (tag: string, text: string) => notifyPhone({ ...g, phone: { ...p, chipWarn: `${seen}${key}:${tag};` } }, 'config', text);
  if (left <= 0 && !seen.includes(`${key}:b;`)) return mark('b', `Seu chip ${p.chipNumber} foi bloqueado (1 ano). Compre um novo na Mega-zona Luiz.`);
  if (left > 0 && left <= Math.max(3, Math.round(g.totalRounds / 10)) && !seen.includes(`${key}:w;`)) return mark('w', `Seu chip ${p.chipNumber} vai bloquear em ${left} rodada(s). Compre um novo.`);
  return g;
}
