import type { V3 } from './world';

/* Câmera em perspectiva (transmissão de TV): fica ao lado do campo, alta, olhando para o centro e acompanhando a bola. */
export interface Camera { px: number; py: number; pz: number; rx: number; ry: number; rz: number; ux: number; uy: number; uz: number; fx: number; fy: number; fz: number; focal: number; cx: number; cy: number }
export interface Projected { x: number; y: number; scale: number; depth: number }

const norm = (a: [number, number, number]): [number, number, number] => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: number[], b: number[]): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** `camX` = ponto do campo (no comprimento) para onde a câmera olha; `span` = quantos metros cabem na largura da tela no centro do campo. */
export function makeCamera(width: number, height: number, camX: number, span = 38): Camera {
  const pos: [number, number, number] = [camX, -19, 17], target: [number, number, number] = [camX, 27, 0];
  const f = norm([target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]]);
  const r = norm(cross(f, [0, 0, 1])), u = cross(r, f);
  const dist = Math.hypot(target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]);
  return { px: pos[0], py: pos[1], pz: pos[2], rx: r[0], ry: r[1], rz: r[2], ux: u[0], uy: u[1], uz: u[2], fx: f[0], fy: f[1], fz: f[2], focal: (width / 2) * (dist / (span / 2)), cx: width / 2, cy: height * 0.55 };
}

/** Ponto do mundo (metros) na tela (pixels). `scale` = pixels por metro naquele ponto (para desenhar raios). null se estiver atrás da câmera. */
export function project(c: Camera, p: V3): Projected | null {
  const dx = p.x - c.px, dy = p.y - c.py, dz = p.z - c.pz;
  const z = dx * c.fx + dy * c.fy + dz * c.fz;
  if (z < 0.5) return null;
  const x = dx * c.rx + dy * c.ry + dz * c.rz, y = dx * c.ux + dy * c.uy + dz * c.uz;
  const s = c.focal / z;
  return { x: c.cx + x * s, y: c.cy - y * s, scale: s, depth: z };
}
