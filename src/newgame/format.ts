import type { BoardExpectation } from '../data/clubs';

/** 120_000_000 → "R$ 120 mi"; 22_500_000 → "R$ 22,5 mi"; 1_200_000_000 → "R$ 1,2 bi". */
export function formatBudget(value: number): string {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
  if (value >= 1e9) return `R$ ${fmt(value / 1e9)} bi`;
  if (value >= 1e6) return `R$ ${fmt(Math.round(value / 1e5) / 10)} mi`;
  return `R$ ${fmt(Math.round(value / 1e3))} mil`;
}

export const EXPECTATION_LABEL: Record<BoardExpectation, string> = {
  title: 'Ganhar o título',
  top4: 'Top 4',
  mid: 'Meio de tabela',
  survive: 'Evitar rebaixamento',
};
