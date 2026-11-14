import { createCharge, creditAccount, registerPurpose } from './bank';
import type { CasinoBet, CasinoColor, CasinoState, GameState, PixCharge } from './types';

export const COLORS: { id: CasinoColor; label: string; css: string }[] = [
  { id: 'azul', label: 'Azul', css: '#1e6bff' },
  { id: 'preto', label: 'Preto', css: '#17181c' },
  { id: 'vermelho', label: 'Vermelho', css: '#e5262d' },
];
/** Cada cor sai com 1/3 de chance (33%) e paga 2x o valor apostado. */
export const PAYOUT = 2;
export const MIN_DEPOSIT = 1_000;
export const MIN_BET = 100;

export const EMPTY_CASINO: CasinoState = { balance: 0, bets: [], deposited: 0, wagered: 0, won: 0 };
export const casinoOf = (g: Pick<GameState, 'casino'>): CasinoState => g.casino ?? EMPTY_CASINO;

type Fail = { ok: false; error: string };

/** Depósito: gera a cobrança Pix; o saldo do Cassino só sobe quando o Banco confirma o pagamento. */
export function depositCharge(g: GameState, amount: number): { ok: true; state: GameState; charge: PixCharge } | Fail {
  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) return { ok: false, error: `Depósito mínimo: R$ ${MIN_DEPOSIT.toLocaleString('pt-BR')},00.` };
  if (amount > 50_000_000) return { ok: false, error: 'Valor alto demais para um depósito.' };
  const { state, charge } = createCharge(g, { merchant: 'Cassino', description: 'Depósito no Cassino', amount: Math.round(amount), purpose: { type: 'casino-deposit' } });
  return { ok: true, state, charge };
}

registerPurpose('casino-deposit', (g, amount) => {
  const c = casinoOf(g);
  return { ...g, casino: { ...c, balance: c.balance + amount, deposited: c.deposited + amount } };
});

/** Aposta em uma cor. `roll` (0 a 1) decide a cor sorteada; a interface usa Math.random(). */
export function placeBet(g: GameState, color: CasinoColor, stake: number, roll: number): { ok: true; state: GameState; bet: CasinoBet; won: boolean } | Fail {
  const c = casinoOf(g);
  if (!COLORS.some((x) => x.id === color)) return { ok: false, error: 'Escolha uma cor.' };
  if (!Number.isFinite(stake) || stake < MIN_BET) return { ok: false, error: `Aposta mínima: R$ ${MIN_BET},00.` };
  stake = Math.round(stake);
  if (stake > c.balance) return { ok: false, error: 'Saldo do Cassino insuficiente. Faça um depósito.' };
  const drawn = COLORS[Math.min(2, Math.floor(roll * 3))].id;
  const won = drawn === color;
  const payout = won ? stake * PAYOUT : 0;
  const bet: CasinoBet = { id: `A${c.bets.length + 1}`, color, drawn, stake, payout, season: g.season, round: g.round };
  const next: CasinoState = { ...c, balance: c.balance - stake + payout, wagered: c.wagered + stake, won: c.won + payout, bets: [bet, ...c.bets].slice(0, 50) };
  return { ok: true, state: { ...g, casino: next }, bet, won };
}

/** Saque: o saldo do Cassino volta para a conta do banco. */
export function withdraw(g: GameState, amount: number): { ok: true; state: GameState } | Fail {
  const c = casinoOf(g);
  amount = Math.round(amount);
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, error: 'Informe o valor do saque.' };
  if (amount > c.balance) return { ok: false, error: 'Saldo do Cassino insuficiente.' };
  const s = creditAccount({ ...g, casino: { ...c, balance: c.balance - amount } }, 'Saque do Cassino', 'Cassino → conta', amount);
  return { ok: true, state: s };
}
