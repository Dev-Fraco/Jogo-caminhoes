/** Cores do escudo reserva (círculo com a sigla) quando a imagem do escudo não existe. */
import type { ClubData } from '../data/clubs';

const toRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Luminância relativa (WCAG), 0 = preto, 1 = branco. */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Cor tão escura que some no fundo escuro do jogo (ex.: #000000). */
export const isVeryDark = (hex: string) => luminance(hex) < 0.02;

/** Mistura a cor com branco (amount = 0.3 → 30% branco). */
export const mixWithWhite = (hex: string, amount = 0.3) => toHex(toRgb(hex).map((v) => v + (255 - v) * amount));

/**
 * Fundo e cor do texto do escudo reserva:
 * - primaryColor, se for visível no fundo escuro;
 * - senão secondaryColor (se existir e for visível);
 * - senão a primaryColor clareada com 30% de branco.
 * O texto é branco; só vira escuro quando o fundo é claro demais para o branco ser lido (ex.: amarelo, cinza claro).
 */
export function badgeColors(club: Pick<ClubData, 'primaryColor' | 'secondaryColor'>): { bg: string; fg: string } {
  const sec = club.secondaryColor && !isVeryDark(club.secondaryColor) ? club.secondaryColor : undefined;
  const bg = !isVeryDark(club.primaryColor) ? club.primaryColor : sec ?? mixWithWhite(club.primaryColor, 0.3);
  return { bg, fg: contrastRatio(bg, '#FFFFFF') >= 3.5 ? '#FFFFFF' : '#07140C' };
}
