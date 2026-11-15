import { fromDay, toDay } from './calendar';
import { DIVISION_INCOME, GATE_SHARE, priceIndex, WAGE_SHARE } from './economy';
import { managed } from './lookup';
import { divisionIndexOf } from './transfers';
import { COUNTRY_ORDER, WORLD_DATA } from '../data/world';
import type { GameState, Morale, NewsItem, Player } from './types';

/** Dinheiro pessoal do treinador no início da carreira, conforme a reputação (R$). */
export const COACH_WALLET: Record<string, number> = { unknown: 30_000, amateur: 80_000, 'semi-pro': 200_000, pro: 500_000, legend: 1_200_000 };
/** Quanto da folha de pagamento o treinador pode assumir. */
export const WAGE_COVER_OPTIONS = [0, 25, 50, 100] as const;
export type WageCover = (typeof WAGE_COVER_OPTIONS)[number];

export interface Ledger { season: number; gate: number; wages: number; coachCover: number; coachSalary: number }
export const emptyLedger = (season: number): Ledger => ({ season, gate: 0, wages: 0, coachCover: 0, coachSalary: 0 });

/** Receita-base anual de um clube (a mesma lógica da receita de fim de temporada, com a posição no meio da tabela). */
export const baseIncome = (divisionIndex: number, reputation: number, infl = 1) =>
  DIVISION_INCOME[Math.min(divisionIndex, DIVISION_INCOME.length - 1)] * (0.6 + 0.2 * reputation) * infl;

/** Overall típico de um elenco do clube (reputação e divisão): salários crescem para quem está acima disso. */
const refStrength = (divisionIndex: number, reputation: number) => [59, 64, 69, 75, 82][Math.min(Math.max(reputation, 1), 5) - 1] - 5 * Math.min(divisionIndex, 3);

const ageFactor = (age: number) => (age <= 20 ? 0.7 : age <= 31 ? 1 : age <= 34 ? 0.85 : 0.6);

/** Salário anual do jogador no clube (R$). Um elenco típico de 24 jogadores custa ~90% da receita-base do clube (corrigida pela inflação). */
/** Salário que o clube pagaria pela fórmula (sem contrato negociado). */
export function baseWage(g: GameState, clubId: string, p: Player): number {
  const idx = divisionIndexOf(g, clubId);
  const rep = g.clubs[clubId].reputation;
  const unit = (WAGE_SHARE * baseIncome(idx, rep, priceIndex(g))) / 24;
  const w = unit * 1.1 ** Math.max(-12, Math.min(12, p.strength - refStrength(idx, rep))) * ageFactor(p.age); // o salário sobe com o overall, mas com teto (senão a folha dispara quando o elenco melhora)
  return Math.max(6_000, Math.round(w / 1_000) * 1_000);
}

/** Salário anual do jogador: o do contrato negociado, se houver; senão a fórmula do clube. */
export const wageOf = (g: GameState, clubId: string, p: Player): number => p.contract?.wage ?? baseWage(g, clubId, p);

export const payrollOf = (g: GameState, clubId: string) => g.teams[clubId].players.reduce((s, p) => s + wageOf(g, clubId, p), 0);
/** Receita de bilheteria em casa por jogo (a torcida animada enche mais o estádio). */
export function gateOf(g: GameState, clubId: string): number {
  const idx = divisionIndexOf(g, clubId);
  const fans = clubId === g.userClubId ? g.morale.fans : 60;
  return Math.round((GATE_SHARE * baseIncome(idx, g.clubs[clubId].reputation, priceIndex(g)) * (0.8 + fans / 250)) / (g.totalRounds / 2) / 1_000) * 1_000;
}
/**
 * Salário MENSAL do treinador por divisão (R$): [mínimo, máximo]; a reputação do clube (1 a 5) escolhe o ponto dentro da faixa.
 * Brasil e América do Sul: Série A de 100 mil a 450 mil. Europa: 1ª divisão de 100 mil a 850 mil. Divisões abaixo pagam bem menos, uma faixa por série.
 */
export const COACH_MONTHLY: Record<'sul' | 'europa', [number, number][]> = {
  sul: [[100_000, 450_000], [35_000, 90_000], [15_000, 40_000], [6_000, 18_000], [2_000, 7_000]],
  europa: [[100_000, 850_000], [45_000, 140_000], [20_000, 60_000], [8_000, 25_000], [3_000, 9_000]],
};
const EUROPE = new Set(['EN', 'ES', 'IT', 'DE', 'FR', 'PT']);
/** Região da liga da carreira (pela 1ª divisão da pirâmide). */
const regionOf = (g: Pick<GameState, 'divisions'>): 'sul' | 'europa' => {
  const first = g.divisions[0]?.id;
  for (const cid of COUNTRY_ORDER) for (const l of WORLD_DATA[cid].leagues) if (l.divisions[0].id === first) return EUROPE.has(cid) ? 'europa' : 'sul';
  return 'sul';
};
/** Salário mensal-base do treinador (sem inflação nem aumentos negociados). */
export function coachMonthlyBase(g: GameState): number {
  const [lo, hi] = COACH_MONTHLY[regionOf(g)][Math.min(divisionIndexOf(g, g.userClubId), 4)];
  const rep = Math.min(5, Math.max(1, g.clubs[g.userClubId]?.reputation ?? 1));
  return lo + ((hi - lo) * (rep - 1)) / 4;
}
/** Salário anual do treinador, pago pelo clube (mensal x 12, com inflação e aumentos negociados). */
export const coachSalary = (g: GameState) => Math.round(((g.payMult ?? 1) * coachMonthlyBase(g) * 12 * priceIndex(g)) / 1_000) * 1_000;

export const coachMoneyOf = (g: Pick<GameState, 'coachMoney' | 'coach'>) => g.coachMoney ?? COACH_WALLET[g.coach.reputation] ?? 100_000;
export const wageCoverOf = (g: Pick<GameState, 'wageCover'>) => g.wageCover ?? 0;

/** Muda quanto da folha o treinador paga do próprio bolso (0, 25, 50 ou 100%). */
export function setWageCover(g: GameState, pct: WageCover): GameState {
  return { ...g, wageCover: pct };
}

/** Dia do mês em que saem os salários (dos atletas e do treinador). */
export const PAYDAY = 5;
export const isPayday = (day: number) => fromDay(day).d === PAYDAY;
/** Próximo dia de pagamento a partir de hoje (inclusive). */
export function nextPayday(day: number): number {
  const { y, m, d } = fromDay(day);
  return d <= PAYDAY ? toDay(y, m, PAYDAY) : toDay(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, PAYDAY);
}
/** Parcela mensal de um valor anual. */
export const monthly = (annual: number) => annual / 12;

/** Salários de todo mês: cada clube paga a folha dos atletas e o seu clube paga também o seu salário (que cai na sua conta). Você pode cobrir parte da folha do bolso. */
export function payMonthlySalaries(g: GameState): GameState {
  const budgets = { ...g.budgets };
  const ledger = g.ledger && g.ledger.season === g.season ? { ...g.ledger } : emptyLedger(g.season);
  let wallet = coachMoneyOf(g);
  let cover = wageCoverOf(g);
  const news: NewsItem[] = [];
  const say = (text: string, tone: NewsItem['tone']) => news.push({ season: g.season, round: g.round, text, tone });
  let mineWages = 0, mineSalary = 0;
  const active = new Set([g.userClubId, ...g.divisions.flatMap((d) => d.clubIds)]); // clubes fora da pirâmide não têm folha
  for (const id of Object.keys(g.teams)) {
    if (!active.has(id)) continue;
    let wages = monthly(payrollOf(g, id));
    if (managed(g, id)) {
      const want = wages * cover / 100;
      const paid = Math.min(wallet, want);
      wallet -= paid; wages -= paid; ledger.coachCover += paid;
      if (cover > 0 && paid < want - 1) { cover = 0; say('💸 Seu dinheiro acabou: o clube volta a pagar os salários.', 'bad'); }
      const salary = monthly(coachSalary(g));
      wallet += salary; budgets[id] -= salary; ledger.coachSalary += salary;
      ledger.wages += wages;
      mineWages = wages; mineSalary = salary;
    }
    budgets[id] -= wages;
    budgets[id] = Math.round(budgets[id]);
  }
  if (!g.unemployed && mineWages > 0) say(`💸 Dia de pagamento: o clube pagou ${Math.round(mineWages / 1000).toLocaleString('pt-BR')} mil aos atletas e você recebeu ${Math.round(mineSalary / 1000).toLocaleString('pt-BR')} mil de salário.`, 'info');
  return { ...g, budgets, ledger, coachMoney: Math.round(wallet), wageCover: cover, news: [...news, ...g.news].slice(0, 80) };
}

/** Depois de cada rodada do campeonato: bilheteria de quem jogou em casa e o aviso de caixa no vermelho (os salários agora saem uma vez por mês). */
export function roundFinance(g: GameState, homeIds: Set<string>, userGateSeparate = false): GameState {
  const budgets = { ...g.budgets };
  const ledger = g.ledger && g.ledger.season === g.season ? { ...g.ledger } : emptyLedger(g.season);
  const news: NewsItem[] = [];
  const say = (text: string, tone: NewsItem['tone']) => news.push({ season: g.season, round: g.round, text, tone });

  const active = new Set([g.userClubId, ...g.divisions.flatMap((d) => d.clubIds)]); // clubes fora da pirâmide não têm receita
  for (const id of Object.keys(g.teams)) {
    if (!active.has(id)) continue;
    if (homeIds.has(id) && !(userGateSeparate && id === g.userClubId)) { const gate = gateOf(g, id); budgets[id] += gate; if (managed(g, id)) ledger.gate += gate; }
    budgets[id] = Math.round(budgets[id]);
  }

  // clube no vermelho: diretoria e elenco reclamam dos salários atrasados
  let morale: Morale = g.morale;
  if (!g.unemployed && budgets[g.userClubId] < 0) {
    morale = { ...morale, board: Math.max(0, morale.board - 3), team: Math.max(0, morale.team - 2) };
    if (g.round % 4 === 0) say('⚠️ Caixa no vermelho: salários atrasados irritam a diretoria e o elenco.', 'bad');
  }
  return { ...g, budgets, morale, ledger, news: [...news, ...g.news].slice(0, 80) };
}

