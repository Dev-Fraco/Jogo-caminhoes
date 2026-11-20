import * as THREE from 'three';
import type { Look } from '../draw';
import { CENTER, L, W, type World } from '../world';
import { MOSAIC_COLS, MOSAIC_ROWS, badgeMosaic } from '../mosaic';

/* =====================================================================
   Estádio: arquibancadas distantes do campo (a câmera do treinador vê o gramado grande e o estádio ao fundo), torcida de pessoas de verdade
   (corpo com camisa e cabeça com tom de pele, em instancing), túnel dos jogadores e o MOSAICO do escudo do mandante na arquibancada do outro lado.
   ===================================================================== */

const hash = (n: number) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 8) / 0xffffff; };
const T = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
/** Distância entre a linha do campo e o começo da arquibancada: o estádio fica longe do gramado. */
export const STAND_GAP = 15;
const TIER_D = 1.35, TIER_H = 1.2, TIERS = 12;
const SKINS = ['#f1c8a5', '#e0ac7e', '#c68642', '#8d5524', '#5e3a1f', '#ffdbb4'];

export interface Stadium { update(w: World, dt: number): void }
interface Slot { x: number; y: number; z: number; side: 'far' | 'left' | 'right' }

export function createStadium(scene: THREE.Scene, look: Pick<Look, 'home' | 'away'>, crowdStep: number, own: <A extends { dispose(): void }>(o: A) => A): Stadium {
  const standMat = own(new THREE.MeshLambertMaterial({ color: 0x39435f }));
  const wallMat = own(new THREE.MeshLambertMaterial({ color: 0x1d2236 }));
  const slots: Slot[] = [];
  const slotStep = Math.max(0.5, crowdStep);

  /* ---- degraus (um bloco por fileira de cada lado) e fileiras de pessoas ---- */
  const tier = (side: Slot['side'], r: number, from: number, len: number) => {
    const d = STAND_GAP + r * TIER_D, h = 0.9 + r * TIER_H;
    const box = new THREE.Mesh(own(new THREE.BoxGeometry(side === 'far' ? len : TIER_D + 0.05, TIER_H, side === 'far' ? TIER_D + 0.05 : len)), standMat);
    if (side === 'far') { box.position.copy(T(from + len / 2, W + d, h - TIER_H / 2)); }
    else { const x = side === 'left' ? -d : L + d; box.position.copy(T(x, from + len / 2, h - TIER_H / 2)); }
    scene.add(box);
    const n = Math.floor(len / slotStep);
    for (let k = 0; k < n; k++) {
      const u = from + (k + 0.5 + (hash(r * 131 + k * 7 + (side === 'far' ? 1 : side === 'left' ? 2 : 3)) - 0.5) * 0.4) * (len / n);
      if (side === 'far') slots.push({ x: u, y: W + d + (hash(k + r * 5) - 0.5) * 0.3, z: h + 0.05, side });
      else slots.push({ x: side === 'left' ? -d : L + d, y: u, z: h + 0.05, side });
    }
  };
  for (let r = 0; r < TIERS; r++) {
    tier('far', r, -26, L + 52);
    tier('left', r, -22, W + 44);
    tier('right', r, -22, W + 44);
  }
  // paredões ao fundo (fecham o estádio) e a boca do túnel dos jogadores (do lado oposto à câmera)
  const topH = 0.9 + TIERS * TIER_H;
  for (const [x, y, sx, sz, ry] of [[L / 2, W + STAND_GAP + TIERS * TIER_D + 0.5, L + 54, 1, 0], [-STAND_GAP - TIERS * TIER_D - 0.5, W / 2, 1, W + 46, 0], [L + STAND_GAP + TIERS * TIER_D + 0.5, W / 2, 1, W + 46, 0]] as const) {
    const wall = new THREE.Mesh(own(new THREE.BoxGeometry(sx, topH + 6, sz)), wallMat); wall.position.copy(T(x, y, (topH + 6) / 2)); wall.rotation.y = ry; scene.add(wall);
  }
  const tunnelMat = own(new THREE.MeshLambertMaterial({ color: 0x0c0e14 }));
  const tunnelEdge = own(new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  const tn = (sx: number, sy: number, sz: number, x: number, y: number, z: number, mat: THREE.Material = tunnelMat) => { const m = new THREE.Mesh(own(new THREE.BoxGeometry(sx, sz, sy)), mat); m.position.copy(T(x, y, z)); scene.add(m); };
  tn(0.3, 9, 3.2, CENTER.x - 3.6, W + 7.4, 1.6); tn(0.3, 9, 3.2, CENTER.x + 3.6, W + 7.4, 1.6); tn(7.5, 9, 0.3, CENTER.x, W + 7.4, 3.3); tn(7.5, 0.25, 0.25, CENTER.x, W + 2.95, 3.3, tunnelEdge);
  tn(7.5, 0.3, 3.2, CENTER.x, W + 11.9, 1.6); // fundo do túnel

  /* ---- torcida: corpo (camisa), cabeça (pele) e mosaico ---- */
  const n = slots.length;
  const bodies = new THREE.InstancedMesh(own(new THREE.BoxGeometry(0.46, 0.56, 0.3)), own(new THREE.MeshLambertMaterial({ color: 0xffffff })), n);
  const heads = new THREE.InstancedMesh(own(new THREE.IcosahedronGeometry(0.15, 0)), own(new THREE.MeshLambertMaterial({ color: 0xffffff })), n);
  const pal = (c: { primary: string; secondary: string }, i: number) => [c.primary, c.secondary, '#ffffff', c.primary, '#222222'][Math.floor(hash(i * 3 + 11) * 5)];
  const neutral = ['#ffd23f', '#e63946', '#f1faee', '#457b9d', '#2a9d8f', '#f4a261', '#9b5de5', '#ffffff'];
  const m = new THREE.Matrix4(), c = new THREE.Color();
  const base: THREE.Matrix4[] = [], baseHead: THREE.Matrix4[] = [];
  slots.forEach((s, i) => {
    const rnd = hash(i * 17 + 5);
    const fans = s.side === 'left' ? look.home : s.side === 'right' ? look.away : rnd < 0.7 ? look.home : null; // atrás dos gols: cada torcida no seu lado (visitante à direita)
    const col = fans ? pal(fans, i) : neutral[Math.floor(hash(i * 5 + 3) * neutral.length)];
    const bh = 0.28 * (0.9 + hash(i + 3) * 0.2);
    base.push(new THREE.Matrix4().makeTranslation(s.x, s.z + bh, -s.y)); baseHead.push(new THREE.Matrix4().makeTranslation(s.x, s.z + bh * 2 + 0.18, -s.y));
    bodies.setMatrixAt(i, base[i]); bodies.setColorAt(i, c.set(col));
    heads.setMatrixAt(i, baseHead[i]); heads.setColorAt(i, c.set(SKINS[Math.floor(hash(i * 13 + 7) * SKINS.length)]));
  });
  bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true; if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  bodies.frustumCulled = false; heads.frustumCulled = false;
  scene.add(bodies, heads);

  // mosaico: cartões na arquibancada do lado oposto à câmera, formando o escudo do mandante (aparece só na cerimônia)
  const cols = MOSAIC_COLS, rows = MOSAIC_ROWS;
  const rowLen = Math.hypot(TIERS * TIER_D, TIERS * TIER_H) / rows, cw = 1.06; // cada cartão preenche a sua fatia da arquibancada (sem frestas)
  const cellGeo = own(new THREE.PlaneGeometry(cw + 0.02, rowLen + 0.02));
  const mosaic = new THREE.InstancedMesh(cellGeo, own(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })), cols * rows);
  const colors = badgeMosaic(look.home.primary, look.home.secondary, look.home.short, cols, rows);
  const slope = Math.atan2(TIER_H, TIER_D);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -slope);
  const mw = cols * cw;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    // o painel fica à frente das cabeças (1,25 m para fora da arquibancada, na direção da normal) e cobre quem estaria atrás
    const x = CENTER.x - mw / 2 + (k + 0.5) * cw, depth = STAND_GAP + ((rows - 1 - r) + 0.5) * (TIERS * TIER_D) / rows - 1.25 * Math.cos(slope), z = 0.9 + ((rows - 1 - r) + 0.5) * (TIERS * TIER_H) / rows + 1.25 * Math.sin(slope);
    m.compose(T(x, W + depth, z), q, new THREE.Vector3(1, 1, 1));
    mosaic.setMatrixAt(r * cols + k, m); mosaic.setColorAt(r * cols + k, c.set(colors[r * cols + k]));
  }
  mosaic.instanceMatrix.needsUpdate = true; if (mosaic.instanceColor) mosaic.instanceColor.needsUpdate = true;
  mosaic.frustumCulled = false; mosaic.visible = false; scene.add(mosaic);
  void CENTER;

  let jumped = false;
  return {
    update(w) {
      mosaic.visible = !!w.ceremony && w.ceremony.stage !== 'break';
      if (w.banner) { // torcida pula no gol
        for (let i = 0; i < n; i++) { m.copy(base[i]); m.elements[13] += Math.abs(Math.sin(w.t * 9 + i * 0.7)) * 0.4; bodies.setMatrixAt(i, m); m.copy(baseHead[i]); m.elements[13] += Math.abs(Math.sin(w.t * 9 + i * 0.7)) * 0.4; heads.setMatrixAt(i, m); }
        bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true; jumped = true;
      } else if (jumped) {
        for (let i = 0; i < n; i++) { bodies.setMatrixAt(i, base[i]); heads.setMatrixAt(i, baseHead[i]); }
        bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true; jumped = false;
      }
    },
  };
}
