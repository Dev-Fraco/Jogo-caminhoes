import { coachSalary } from './finance';
import { seasonOutcome } from './game';
import { makeRng } from './rng';
import type { GameState, NewsItem } from './types';

/** Como foi a temporada para o seu clube (define o que dá para pedir ao negociar o salário). */
export type Standing = 'great' | 'good' | 'meh' | 'bad';
export const STANDING_LABEL: Record<Standing, string> = {
  great: 'Acesso ou título: ótimo momento para pedir aumento.',
  good: 'Temporada boa: dá para pedir um aumento moderado.',
  meh: 'Sem acesso: o aumento possível é pequeno.',
  bad: 'Rebaixamento: a diretoria pode reduzir o seu salário.',
};
/** Aumento máximo que se pode pedir em cada situação. */
export const MAX_RAISE: Record<Standing, number> = { great: 0.4, good: 0.2, meh: 0.05, bad: 0 };
export const RAISE_STEPS: Record<Standing, number[]> = { great: [5, 10, 20, 30, 40], good: [3, 6, 10, 15, 20], meh: [1, 2, 3, 5], bad: [] };

const TOP_BY_EXPECTATION: Record<string, number> = { title: 1, top4: 4, mid: 10, survive: 16 };

export function standingOf(g: GameState): Standing {
  const o = seasonOutcome(g);
  if (o.movement === 'relegated') return 'bad';
  if (o.movement === 'promoted' || o.userPosition === 1) return 'great';
  const goal = TOP_BY_EXPECTATION[g.clubs[g.userClubId].boardExpectation] ?? 10;
  return o.userPosition <= Math.min(goal, 6) ? 'good' : 'meh';
}

/** Chance de aceitarem um pedido de aumento de `pct`% (0–1): cai conforme o pedido se aproxima do máximo; diretoria satisfeita ajuda. */
export function raiseChance(g: GameState, pct: number): number {
  const s = standingOf(g);
  const max = MAX_RAISE[s] * 100;
  if (max <= 0) return 0;
  const ratio = Math.min(1.5, pct / max);
  const base = 0.92 - 0.72 * ratio ** 1.4;
  return Math.max(0.03, Math.min(0.95, base + (g.morale.board - 60) / 250));
}
export const chanceLabel = (c: number) => (c >= 0.7 ? 'Alta' : c >= 0.4 ? 'Média' : 'Baixa');

export const salaryNegotiated = (g: GameState) => !!g.salaryNeg && g.salaryNeg.season === g.season && g.salaryNeg.done;
const note = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const money = (annual: number) => `${(annual / 12).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}/mês`;

export type NegResult = { ok: true; state: GameState; result: 'accepted' | 'counter' | 'refused'; pct: number; text: string } | { ok: false; error: string };

/** Pede aumento no fim da temporada (uma tentativa por temporada). O clube pode aceitar, aceitar só metade ou recusar. */
export function negotiateRaise(g: GameState, pct: number): NegResult {
  if (g.unemployed) return { ok: false, error: 'Você está sem clube.' };
  if (salaryNegotiated(g)) return { ok: false, error: 'Você já negociou nesta temporada.' };
  const s = standingOf(g);
  if (!RAISE_STEPS[s].includes(pct)) return { ok: false, error: 'Esse pedido não é possível agora.' };
  const rng = makeRng(g.seed * 211 + g.season * 17 + pct * 3 + 7);
  const chance = raiseChance(g, pct);
  const roll = rng();
  const before = coachSalary(g);
  let result: 'accepted' | 'counter' | 'refused' = roll < chance ? 'accepted' : roll < chance + 0.25 ? 'counter' : 'refused';
  let given = result === 'accepted' ? pct : result === 'counter' ? Math.max(1, Math.round(pct / 2)) : 0;
  let st = g;
  let text: string;
  if (given > 0) {
    st = { ...st, payMult: (g.payMult ?? 1) * (1 + given / 100) };
    text = result === 'accepted' ? `A diretoria aceitou o aumento de ${given}%! Novo salário: ${money(coachSalary(st))} (antes ${money(before)}).` : `A diretoria fez uma contraproposta e aceitou ${given}% de aumento. Novo salário: ${money(coachSalary(st))}.`;
  } else {
    st = { ...st, morale: { ...g.morale, board: Math.max(0, g.morale.board - (pct >= MAX_RAISE[s] * 70 ? 3 : 1)) } };
    text = 'A diretoria recusou o aumento e achou o pedido exagerado.';
    result = 'refused';
  }
  st = { ...note(st, `💼 Salário: ${text}`, given > 0 ? 'good' : 'bad'), salaryNeg: { season: g.season, done: true, text } };
  return { ok: true, state: st, result, pct: given, text };
}

/** Cortes propostos por quem foi rebaixado: de 10% a 20%. */
const cutPct = (rng: () => number) => 10 + Math.floor(rng() * 11);
export const RELEGATION_CUT_CHANCE = 0.55;
export const DEFEND_CHANCE = 0.5;

/** Rebaixado: tenta convencer a diretoria a manter o salário (50% de chance). Se falhar, o corte vem na certa. */
export function defendSalary(g: GameState): NegResult {
  if (g.unemployed) return { ok: false, error: 'Você está sem clube.' };
  if (salaryNegotiated(g)) return { ok: false, error: 'Você já negociou nesta temporada.' };
  if (standingOf(g) !== 'bad') return { ok: false, error: 'Sem risco de corte agora.' };
  const rng = makeRng(g.seed * 223 + g.season * 19 + 11);
  if (rng() < DEFEND_CHANCE) {
    const text = 'Você convenceu a diretoria: o seu salário foi mantido apesar do rebaixamento.';
    return { ok: true, state: { ...note(g, `💼 Salário: ${text}`, 'good'), salaryNeg: { season: g.season, done: true, text } }, result: 'accepted', pct: 0, text };
  }
  const pct = cutPct(rng);
  const st0: GameState = { ...g, payMult: (g.payMult ?? 1) * (1 - pct / 100) };
  const text = `A diretoria não cedeu e reduziu o seu salário em ${pct}%. Novo salário: ${money(coachSalary(st0))}.`;
  return { ok: true, state: { ...note(st0, `💼 Salário: ${text}`, 'bad'), morale: { ...g.morale, board: Math.max(0, g.morale.board - 2) }, salaryNeg: { season: g.season, done: true, text } }, result: 'refused', pct: -pct, text };
}

/** Na virada da temporada: rebaixado que não negociou tem 55% de chance de levar um corte de 10% a 20%. */
export function settleSalary(g: GameState): GameState {
  if (g.unemployed || g.observer || salaryNegotiated(g)) return g;
  if (standingOf(g) !== 'bad') return g;
  const rng = makeRng(g.seed * 227 + g.season * 23 + 13);
  if (rng() >= RELEGATION_CUT_CHANCE) return g;
  const pct = cutPct(rng);
  const st: GameState = { ...g, payMult: (g.payMult ?? 1) * (1 - pct / 100) };
  return note(st, `💼 Com o rebaixamento, a diretoria reduziu o seu salário em ${pct}% (${money(coachSalary(st))}).`, 'bad');
}
