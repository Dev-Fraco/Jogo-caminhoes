/** Receita de fim de temporada por divisão (A→D), em R$. Valores provisórios até existir um sistema de finanças. */
export const DIVISION_INCOME = [40_000_000, 12_000_000, 5_000_000, 2_000_000];

/** Receita do clube na temporada: base da divisão × reputação, com bônus pela posição final (até +40% para o campeão). */
export function seasonIncome(divisionIndex: number, reputation: number, position: number, size: number): number {
  const base = DIVISION_INCOME[Math.min(divisionIndex, DIVISION_INCOME.length - 1)] * (0.6 + 0.2 * reputation);
  const bonus = 1 + 0.4 * (1 - (position - 1) / Math.max(1, size - 1));
  return Math.round((base * bonus) / 100_000) * 100_000;
}
