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

const RING_DEFAULT = 'rgba(255, 255, 255, .55)';

/**
 * Cores do escudo reserva a partir das duas cores do time:
 * - fundo: primaryColor, se for visível no fundo escuro; senão secondaryColor; senão a primária clareada com 30% de branco;
 * - texto da sigla: a "outra" cor do time se tiver bom contraste (>= 4,5); senão branco, ou escuro se o fundo for claro demais;
 * - borda: a "outra" cor do time quando ela aparece (não é quase preta e destaca do fundo); senão um branco translúcido.
 */
export function badgeColors(club: Pick<ClubData, 'primaryColor' | 'secondaryColor'>): { bg: string; fg: string; ring: string } {
  const sec = club.secondaryColor && !isVeryDark(club.secondaryColor) ? club.secondaryColor : undefined;
  const bg = !isVeryDark(club.primaryColor) ? club.primaryColor : sec ?? mixWithWhite(club.primaryColor, 0.3);
  const other = bg === club.primaryColor ? club.secondaryColor : club.primaryColor;
  const fg = other && contrastRatio(other, bg) >= 4.5 ? other
    : contrastRatio(bg, '#FFFFFF') >= 3.5 ? '#FFFFFF' : '#07140C';
  const ring = other && !isVeryDark(other) && contrastRatio(other, bg) >= 1.5 ? other : RING_DEFAULT;
  return { bg, fg, ring };
}

/** Cor de fundo do cabeçalho do jogo (texto branco): a cor do clube que contrasta com o branco; senão a outra; senão o verde do jogo. */
export function headerColor(club: Pick<ClubData, 'primaryColor' | 'secondaryColor'>): string {
  return [club.primaryColor, club.secondaryColor].find((c) => contrastRatio(c, '#FFFFFF') >= 4) ?? '#0B3D2E';
}

/** Cor do clube com transparência, para tingir o cabeçalho (cores muito claras ficam mais suaves). */
export function tintColor(club: Pick<ClubData, 'primaryColor' | 'secondaryColor'>): string {
  const bg = badgeColors(club).bg;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${luminance(bg) > 0.5 ? 0.22 : 0.5})`;
}
