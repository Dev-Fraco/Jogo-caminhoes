import { DIVISION_INCOME } from './economy';
import { divisionIndexOf } from './transfers';
import type { GameState, Morale, NewsItem, Player } from './types';

/** Dinheiro pessoal do treinador no início da carreira, conforme a reputação (R$). */
export const COACH_WALLET: Record<string, number> = { unknown: 30_000, amateur: 80_000, 'semi-pro': 200_000, pro: 500_000, legend: 1_200_000 };
/** Quanto da folha de pagamento o treinador pode assumir. */
export const WAGE_COVER_OPTIONS = [0, 25, 50, 100] as const;
export type WageCover = (typeof WAGE_COVER_OPTIONS)[number];

export interface Ledger { season: number; gate: number; wages: number; coachCover: number; coachSalary: number }
export const emptyLedger = (season: number): Ledger => ({ season, gate: 0, wages: 0, coachCover: 0, coachSalary: 0 });

/** Receita-base anual de um clube (a mesma lógica da receita de fim de temporada, com a posição no meio da tabela). */
export const baseIncome = (divisionIndex: number, reputation: number) =>
  DIVISION_INCOME[Math.min(divisionIndex, DIVISION_INCOME.length - 1)] * (0.6 + 0.2 * reputation);

/** Overall típico de um elenco do clube (reputação e divisão): salários crescem para quem está acima disso. */
const refStrength = (divisionIndex: number, reputation: number) => [59, 64, 69, 75, 82][Math.min(Math.max(reputation, 1), 5) - 1] - 5 * Math.min(divisionIndex, 3);

const ageFactor = (age: number) => (age <= 20 ? 0.7 : age <= 31 ? 1 : age <= 34 ? 0.85 : 0.6);

/** Salário anual do jogador no clube (R$). Um elenco típico de 24 jogadores custa ~55% da receita-base do clube. */
export function wageOf(g: GameState, clubId: string, p: Player): number {
  const idx = divisionIndexOf(g, clubId);
  const rep = g.clubs[clubId].reputation;
  const unit = (0.55 * baseIncome(idx, rep)) / 24;
  const w = unit * 1.12 ** (p.strength - refStrength(idx, rep)) * ageFactor(p.age);
  return Math.max(6_000, Math.round(w / 1_000) * 1_000);
}

export const payrollOf = (g: GameState, clubId: string) => g.teams[clubId].players.reduce((s, p) => s + wageOf(g, clubId, p), 0);
/** Receita de bilheteria em casa por jogo (a torcida animada enche mais o estádio). */
export function gateOf(g: GameState, clubId: string): number {
  const idx = divisionIndexOf(g, clubId);
  const fans = clubId === g.userClubId ? g.morale.fans : 60;
  return Math.round((0.25 * baseIncome(idx, g.clubs[clubId].reputation) * (0.8 + fans / 250)) / (g.totalRounds / 2) / 1_000) * 1_000;
}
/** Salário anual do treinador, pago pelo clube. */
export const coachSalary = (g: GameState) => Math.max(60_000, Math.round(0.04 * baseIncome(divisionIndexOf(g, g.userClubId), g.clubs[g.userClubId].reputation) / 1_000) * 1_000);

export const coachMoneyOf = (g: Pick<GameState, 'coachMoney' | 'coach'>) => g.coachMoney ?? COACH_WALLET[g.coach.reputation] ?? 100_000;
export const wageCoverOf = (g: Pick<GameState, 'wageCover'>) => g.wageCover ?? 0;

/** Muda quanto da folha o treinador paga do próprio bolso (0, 25, 50 ou 100%). */
export function setWageCover(g: GameState, pct: WageCover): GameState {
  return { ...g, wageCover: pct };
}

/** Depois de cada rodada do campeonato: salários de todos os clubes, bilheteria de quem jogou em casa e o salário do treinador. */
export function roundFinance(g: GameState, homeIds: Set<string>): GameState {
  const budgets = { ...g.budgets };
  const ledger = g.ledger && g.ledger.season === g.season ? { ...g.ledger } : emptyLedger(g.season);
  let wallet = coachMoneyOf(g);
  let cover = wageCoverOf(g);
  const news: NewsItem[] = [];
  const say = (text: string, tone: NewsItem['tone']) => news.push({ season: g.season, round: g.round, text, tone });
  const n = g.totalRounds;

  for (const id of Object.keys(g.teams)) {
    let wages = payrollOf(g, id) / n;
    if (id === g.userClubId) {
      const want = wages * cover / 100;
      const paid = Math.min(wallet, want);
      wallet -= paid; wages -= paid; ledger.coachCover += paid;
      if (cover > 0 && paid < want - 1) { cover = 0; say('💸 Seu dinheiro acabou: o clube volta a pagar os salários.', 'bad'); }
      const salary = coachSalary(g) / n;
      wallet += salary; budgets[id] -= salary; ledger.coachSalary += salary;
      ledger.wages += wages;
    }
    budgets[id] -= wages;
    if (homeIds.has(id)) { const gate = gateOf(g, id); budgets[id] += gate; if (id === g.userClubId) ledger.gate += gate; }
    budgets[id] = Math.round(budgets[id]);
  }

  // clube no vermelho: diretoria e elenco reclamam dos salários atrasados
  let morale: Morale = g.morale;
  if (budgets[g.userClubId] < 0) {
    morale = { ...morale, board: Math.max(0, morale.board - 3), team: Math.max(0, morale.team - 2) };
    if (g.round % 4 === 0) say('⚠️ Caixa no vermelho: salários atrasados irritam a diretoria e o elenco.', 'bad');
  }
  return { ...g, budgets, morale, ledger, coachMoney: Math.round(wallet), wageCover: cover, news: [...news, ...g.news].slice(0, 30) };
}

