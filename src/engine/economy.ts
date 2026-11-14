import type { Rng } from './rng';

/** Receita-base de fim de temporada por divisão (A→D), em R$. */
export const DIVISION_INCOME = [40_000_000, 12_000_000, 5_000_000, 2_000_000];

/** Ajustes da economia: os clubes ganhavam dinheiro demais, então a receita de fim de temporada e a bilheteria caíram, a folha subiu e os prêmios encolheram. */
export const SEASON_INCOME_FACTOR = 0.7;
export const GATE_SHARE = 0.2;
export const WAGE_SHARE = 0.9;
export const PRIZE_SCALE = 0.25;

/** Índice de preços (inflação acumulada). Sem inflação registrada vale 1. */
export const priceIndex = (g: { inflation?: { index: number } }) => g.inflation?.index ?? 1;

/** Corrige um valor em reais pela inflação, arredondando como os preços do jogo (para não aparecerem valores quebrados). */
export function inflate(g: { inflation?: { index: number } }, v: number): number {
  if (priceIndex(g) === 1) return v; // sem inflação, o preço é o do catálogo
  const x = v * priceIndex(g);
  const step = x >= 10_000_000 ? 500_000 : x >= 1_000_000 ? 100_000 : x >= 200_000 ? 50_000 : x >= 20_000 ? 10_000 : x >= 2_000 ? 1_000 : 100;
  return Math.max(step, Math.round(x / step) * step);
}

/** Prêmio de competição (R$): valor-base × escala dos prêmios × inflação. */
export const prize = (g: { inflation?: { index: number } }, v: number) => Math.round((v * PRIZE_SCALE * priceIndex(g)) / 10_000) * 10_000;

/** Receita do clube na temporada: base da divisão × reputação, com bônus pela posição final (até +40% para o campeão). */
export function seasonIncome(divisionIndex: number, reputation: number, position: number, size: number, infl = 1): number {
  const base = DIVISION_INCOME[Math.min(divisionIndex, DIVISION_INCOME.length - 1)] * (0.6 + 0.2 * reputation) * SEASON_INCOME_FACTOR * infl;
  const bonus = 1 + 0.4 * (1 - (position - 1) / Math.max(1, size - 1));
  return Math.round((base * bonus) / 100_000) * 100_000;
}

/** Inflação de um ano: entre 3,5% e 8,5%. Devolve o novo estado de inflação. */
export function nextInflation(g: { season: number; inflation?: { index: number; rate: number; history: { season: number; rate: number }[] } }, rng: Rng) {
  const rate = Math.round((0.035 + rng() * 0.05) * 1000) / 1000;
  const prev = g.inflation ?? { index: 1, rate: 0, history: [] };
  return { index: Math.round(prev.index * (1 + rate) * 10_000) / 10_000, rate, history: [...prev.history, { season: g.season, rate }].slice(-60) };
}
