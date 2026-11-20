/* =====================================================================
   Mosaico da torcida: o escudo do clube formado por cartões coloridos nas arquibancadas (cada torcedor ergue um cartão).
   Função pura: devolve uma grade de cores. O escudo é o reserva do jogo (círculo com a sigla nas cores do clube), pois os arquivos de escudo
   ainda não existem; quando existirem, basta trocar `badgeMosaic` por uma amostragem da imagem.
   ===================================================================== */

/** Fonte 3x5 (cada letra = 5 linhas de 3 bits). */
const FONT: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'], G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'], K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'], O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '011'], R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'], W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
};

const hex = (c: string) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
const lum = (c: string) => { const [r, g, b] = hex(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

export const MOSAIC_COLS = 72, MOSAIC_ROWS = 16;

/** Grade `cols` x `rows` (linha a linha, de cima para baixo) de cores em #rrggbb. */
export function badgeMosaic(primary: string, secondary: string, short: string, cols = MOSAIC_COLS, rows = MOSAIC_ROWS): string[] {
  const dark = mix(lum(primary) < 0.3 ? secondary : primary, '#000000', 0.62);
  const body = lum(primary) < 0.12 ? mix(primary, '#ffffff', 0.18) : primary;
  const ring = lum(secondary) < 0.12 ? '#f2f2f2' : secondary;
  const letter = lum(body) > 0.55 ? '#111111' : '#ffffff';
  const out: string[] = new Array(cols * rows).fill(dark);
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2, R = rows / 2 - 0.4;
  // faixas laterais nas cores do clube
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const side = Math.abs(x - cx) > R + 4;
    if (side) out[y * cols + x] = (Math.floor(y / 2) % 2 === 0) ? mix(body, '#000000', 0.35) : mix(ring, '#000000', 0.45);
  }
  // escudo: aro, miolo e sigla
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= R) out[y * cols + x] = d > R - 1.5 ? ring : body;
  }
  const text = short.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'FC';
  const w = text.length * 3 + (text.length - 1), x0 = Math.round(cx - w / 2 + 0.5), y0 = Math.round(cy - 2);
  [...text].forEach((ch, i) => FONT[ch]?.forEach((row, ry) => [...row].forEach((bit, rx) => { if (bit === '1') { const px = x0 + i * 4 + rx, py = y0 + ry; if (px >= 0 && px < cols && py >= 0 && py < rows) out[py * cols + px] = letter; } })));
  return out;
}
