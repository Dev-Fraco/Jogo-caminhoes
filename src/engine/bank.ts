import { calOf } from './calendar';
import { coachMoneyOf } from './finance';
import { notifyPhone, phoneOf } from './phone';
import type { BankState, BankTx, Boleto, GameState, PayPurpose, PixCharge } from './types';

export const MIN_PASSWORD = 6;
export const PIX_PREFIX = 'vrpix:';
const LATE_FINE = 0.05; // multa de 5% sobre boleto vencido
const MAX_TXS = 80;

export const bankOf = (g: Pick<GameState, 'bank'>): BankState | undefined => g.bank;
/** A conta só existe depois do cadastro (cobranças e boletos podem chegar antes). */
export const hasBank = (g: Pick<GameState, 'bank'>) => !!g.bank?.passHash;
/** Saldo da conta = dinheiro pessoal do treinador (não é o caixa do clube). */
export const balanceOf = (g: GameState) => coachMoneyOf(g);
const abs = (season: number, round: number) => season * 1000 + round;
const hash = (s: string): string => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
export const hashPassword = (p: string) => hash(`vrbank:${p}`);
/** Em vez de digitar a senha, quem ativou a digital nas Configurações do celular pode confirmar com o dedo. */
export const FINGER = '::digital::';
export const checkPassword = (g: GameState, p: string) => hasBank(g) && (g.bank!.passHash === hashPassword(p) || (p === FINGER && !!phoneOf(g).settings.fingerprint));

export type Result<T = object> = ({ ok: true; state: GameState } & T) | { ok: false; error: string };

/** Abre a conta (primeiro acesso ao app do Banco): nome, senha e confirmação. */
export function registerBank(g: GameState, name: string, password: string, confirm: string): Result {
  if (hasBank(g)) return { ok: false, error: 'Você já tem uma conta.' };
  const n = name.trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 40) return { ok: false, error: 'O nome deve ter de 2 a 40 letras.' };
  if (password.length < MIN_PASSWORD) return { ok: false, error: `A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.` };
  if (password !== confirm) return { ok: false, error: 'As senhas não são iguais.' };
  const prev = g.bank ?? { name: '', passHash: '', txs: [], charges: [], boletos: [], seq: 1 };
  return { ok: true, state: { ...g, bank: { ...prev, name: n, passHash: hashPassword(password) } } };
}

/** Chave Pix do treinador (para receber). */
export const myPixKey = (g: GameState) => `${(g.bank?.name || g.coach.name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@vrbank.com`;

const addTx = (b: BankState, g: GameState, kind: BankTx['kind'], title: string, detail: string, amount: number): { bank: BankState; tx: BankTx } => {
  const tx: BankTx = { id: `E${hash(`${b.seq}${g.season}${g.round}${title}`).toUpperCase()}${String(b.seq).padStart(6, '0')}`, kind, title, detail, amount, season: g.season, round: g.round, day: calOf(g).day };
  return { bank: { ...b, seq: b.seq + 1, txs: [tx, ...b.txs].slice(0, MAX_TXS) }, tx };
};

/* ---------- efeitos do pagamento (cada app registra o seu tipo) ---------- */
const HANDLERS: Record<string, (g: GameState, amount: number, p: PayPurpose) => GameState> = {
  /** Pix para o caixa do clube. */
  club: (g, amount) => ({ ...g, budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] + amount } }),
};
/** Os apps (Cassino, Concessionária...) registram aqui o que fazer quando um pagamento é confirmado. */
export function registerPurpose(type: string, fn: (g: GameState, amount: number, p: PayPurpose) => GameState) { HANDLERS[type] = fn; }
const applyPurpose = (g: GameState, amount: number, p: PayPurpose) => (HANDLERS[p.type] ? HANDLERS[p.type](g, amount, p) : g);

/* ---------- Pix ---------- */

/** Um app cria uma cobrança Pix; o usuário copia a chave e paga no Banco. */
export function createCharge(g: GameState, c: { merchant: string; description: string; amount: number; purpose: PayPurpose }): { state: GameState; charge: PixCharge } {
  const b = g.bank ?? { name: g.coach.name, passHash: '', txs: [], charges: [], boletos: [], seq: 1 };
  const id = `C${b.seq}`;
  const charge: PixCharge = { id, key: `${PIX_PREFIX}${hash(`${id}${g.season}${g.round}${c.merchant}${c.amount}`)}${b.seq}`, merchant: c.merchant, description: c.description, amount: Math.round(c.amount), purpose: c.purpose, status: 'open', season: g.season, round: g.round };
  return { state: { ...g, bank: { ...b, seq: b.seq + 1, charges: [charge, ...b.charges].slice(0, 30) } }, charge };
}

export const findCharge = (g: GameState, key: string): PixCharge | undefined => g.bank?.charges.find((c) => c.key === key.trim() && c.status === 'open');

/** Confere a chave colada: mostra para quem e quanto vai o Pix (ainda sem pagar). */
export function quotePix(g: GameState, key: string): { ok: true; charge: PixCharge } | { ok: false; error: string } {
  if (!hasBank(g)) return { ok: false, error: 'Abra sua conta no banco primeiro.' };
  const k = key.trim();
  if (!k) return { ok: false, error: 'Cole ou digite a chave Pix.' };
  if (k === myPixKey(g)) return { ok: false, error: 'Essa é a sua própria chave.' };
  const c = findCharge(g, k);
  if (!c) return { ok: false, error: g.bank!.charges.some((x) => x.key === k && x.status === 'paid') ? 'Essa cobrança já foi paga.' : 'Chave Pix não encontrada.' };
  return { ok: true, charge: c };
}

/** Confirma o Pix com a senha do banco: desconta do saldo, gera o comprovante e aplica o efeito (ex.: crédito no app). */
export function payPix(g: GameState, key: string, password: string): Result<{ tx: BankTx; charge: PixCharge }> {
  const q = quotePix(g, key);
  if (!q.ok) return q;
  if (!checkPassword(g, password)) return { ok: false, error: 'Senha incorreta.' };
  const c = q.charge;
  if (balanceOf(g) < c.amount) return { ok: false, error: 'Saldo insuficiente.' };
  const { bank, tx } = addTx(g.bank!, g, 'pix', `Pix enviado — ${c.merchant}`, c.description, -c.amount);
  const paid: PixCharge = { ...c, status: 'paid' };
  let s: GameState = { ...g, coachMoney: balanceOf(g) - c.amount, bank: { ...bank, charges: bank.charges.map((x) => (x.id === c.id ? paid : x)) } };
  s = applyPurpose(s, c.amount, c.purpose);
  return { ok: true, state: s, tx, charge: paid };
}

/** Cobrança para o caixa do clube (o treinador ajuda o clube do próprio bolso). */
export function clubCharge(g: GameState, amount: number): Result<{ charge: PixCharge }> {
  if (!hasBank(g)) return { ok: false, error: 'Abra sua conta no banco primeiro.' };
  if (!Number.isFinite(amount) || amount < 100) return { ok: false, error: 'Valor mínimo: R$ 100,00.' };
  const { state, charge } = createCharge(g, { merchant: g.clubs[g.userClubId].name, description: 'Aporte no caixa do clube', amount, purpose: { type: 'club' } });
  return { ok: true, state, charge };
}

/** Recebimento de dinheiro na conta (ex.: prêmio de aposta, venda de bem). */
export function creditAccount(g: GameState, title: string, detail: string, amount: number): GameState {
  const b = g.bank ?? { name: g.coach.name, passHash: '', txs: [], charges: [], boletos: [], seq: 1 };
  const { bank } = addTx(b, g, 'income', title, detail, amount);
  return { ...g, coachMoney: balanceOf(g) + amount, bank };
}

/* ---------- Boletos ---------- */

const boletoCode = (id: string, amount: number) => { const d = (hash(id + amount) + hash(String(amount))).replace(/\D/g, '0').padEnd(44, '0').slice(0, 44); return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33, 44)}`; };

/** Cria um boleto (financiamento de veículo/imóvel, aluguel...). Avisa no celular. */
export function createBoleto(g: GameState, b: { merchant: string; description: string; amount: number; dueInRounds: number; purpose: PayPurpose }): GameState {
  const bank = g.bank ?? { name: g.coach.name, passHash: '', txs: [], charges: [], boletos: [], seq: 1 };
  const total = g.round + Math.max(1, b.dueInRounds);
  const dueSeason = g.season + Math.floor((total - 1) / g.totalRounds), dueRound = ((total - 1) % g.totalRounds) + 1;
  const id = `B${bank.seq}`;
  const boleto: Boleto = { id, code: boletoCode(id, b.amount), merchant: b.merchant, description: b.description, amount: Math.round(b.amount), dueSeason, dueRound, status: 'open', fine: 0, notified: false, purpose: b.purpose };
  const s = { ...g, bank: { ...bank, seq: bank.seq + 1, boletos: [boleto, ...bank.boletos] } };
  return notifyPhone(s, 'banco', `Novo boleto de ${brl(boleto.amount)} (${b.merchant}). Vence na rodada ${dueRound}.`);
}

export const boletoTotal = (b: Boleto) => b.amount + b.fine;
export const openBoletos = (g: Pick<GameState, 'bank'>) => (g.bank?.boletos ?? []).filter((b) => b.status !== 'paid');

/** Paga o boleto sem pedir senha (pagamento automático autorizado pelo jogador ao pular temporadas). */
function settleBoleto(g: GameState, id: string): Result<{ tx: BankTx; boleto: Boleto }> {
  const b = g.bank?.boletos.find((x) => x.id === id);
  if (!hasBank(g) || !b || b.status === 'paid') return { ok: false, error: 'Boleto não encontrado.' };
  const total = boletoTotal(b);
  if (balanceOf(g) < total) return { ok: false, error: 'Saldo insuficiente.' };
  const { bank, tx } = addTx(g.bank!, g, 'boleto', `Boleto pago — ${b.merchant}`, b.description, -total);
  const paid: Boleto = { ...b, status: 'paid', paidTxId: tx.id };
  let s: GameState = { ...g, coachMoney: balanceOf(g) - total, bank: { ...bank, boletos: bank.boletos.map((x) => (x.id === id ? paid : x)) } };
  s = applyPurpose(s, total, b.purpose);
  return { ok: true, state: s, tx, boleto: paid };
}

export function payBoleto(g: GameState, id: string, password: string): Result<{ tx: BankTx; boleto: Boleto }> {
  if (!hasBank(g) || !g.bank?.boletos.some((x) => x.id === id && x.status !== 'paid')) return { ok: false, error: 'Boleto não encontrado.' };
  if (!checkPassword(g, password)) return { ok: false, error: 'Senha incorreta.' };
  return settleBoleto(g, id);
}

/** Com o pagamento automático ligado, os boletos em aberto são pagos com o saldo (se houver). */
export function autoPayBoletos(g: GameState): GameState {
  if (!g.autoPay || !hasBank(g)) return g;
  let s = g;
  for (const b of g.bank!.boletos.filter((x) => x.status !== 'paid')) { const r = settleBoleto(s, b.id); if (r.ok) s = r.state; }
  return s;
}

/** A cada rodada: avisa boletos que vencem em até 2 rodadas e aplica multa nos vencidos. */
export function tickBoletos(g: GameState): GameState {
  g = autoPayBoletos(g);
  if (!g.bank || !g.bank.boletos.some((b) => b.status !== 'paid')) return g;
  const now = abs(g.season, g.round);
  let s = g;
  const boletos = g.bank.boletos.map((b) => {
    if (b.status === 'paid') return b;
    const due = abs(b.dueSeason, b.dueRound);
    if (now > due && b.status === 'open') {
      const late: Boleto = { ...b, status: 'late', fine: Math.round(b.amount * LATE_FINE) };
      s = notifyPhone(s, 'banco', `Boleto de ${b.merchant} vencido! Multa de ${brl(late.fine)} aplicada.`);
      return late;
    }
    if (!b.notified && now <= due && due - now <= 2 && due - now >= 0) {
      s = notifyPhone(s, 'banco', `O boleto de ${b.merchant} (${brl(b.amount)}) vence na rodada ${b.dueRound}.`);
      return { ...b, notified: true };
    }
    return b;
  });
  return { ...s, bank: { ...s.bank!, boletos } };
}

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ---------- débito automático ---------- */
export const autoDebitOn = (g: GameState) => g.autoDebit !== false && hasBank(g);
export const setAutoDebit = (g: GameState, on: boolean): GameState => ({ ...g, autoDebit: on });

/** Desconta direto do saldo do banco (sem boleto e sem Pix). Devolve null se não houver conta ou saldo. */
export function debitNow(g: GameState, d: { merchant: string; description: string; amount: number; purpose: PayPurpose }): GameState | null {
  if (!hasBank(g) || balanceOf(g) < d.amount) return null;
  const { bank } = addTx(g.bank!, g, 'boleto', `Débito automático — ${d.merchant}`, d.description, -d.amount);
  const s: GameState = { ...g, coachMoney: balanceOf(g) - d.amount, bank };
  return applyPurpose(s, d.amount, d.purpose);
}
