import * as THREE from 'three';
import { L, W } from '../world';

/** Margem de gramado em volta das linhas (m) que também entra na textura. */
export const APRON = 8;
const hash = (n: number) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 8) / 0xffffff; };

/** Quantas listras de corte (alternam dois tons de verde) e o tamanho da textura por qualidade. */
export const GRASS_PX = { low: 1024, medium: 2048, high: 3072 } as const;

/** Gramado + marcações oficiais em uma textura só: listras de corte, manchas suaves, milhares de pontinhos de grama e linhas brancas
 *  (campo 105 x 68 m; área 40,32 x 16,5; pequena área 18,32 x 5,5; marca do pênalti a 11 m; círculo e arco de 9,15 m; escanteios de 1 m). */
export function makePitchTexture(quality: keyof typeof GRASS_PX): THREE.CanvasTexture {
  const px = GRASS_PX[quality], totalW = L + APRON * 2, totalH = W + APRON * 2;
  const cw = px, ch = Math.round(px * (totalH / totalW));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d')!;
  const sx = cw / totalW, sy = ch / totalH;
  // mundo (x ao longo, y largura) -> pixels (o topo da imagem é o lado de lá: y grande)
  const X = (x: number) => (x + APRON) * sx, Y = (y: number) => (totalH - (y + APRON)) * sy;
  g.fillStyle = '#2b8a40'; g.fillRect(0, 0, cw, ch);
  // faixas de corte (cada uma com 7 m): dois tons, com o brilho "para lá e para cá" do cortador
  const stripe = 7, n = Math.ceil(totalW / stripe);
  for (let i = 0; i < n; i++) {
    const x0 = -APRON + i * stripe;
    g.fillStyle = i % 2 ? 'rgba(46,150,70,.55)' : 'rgba(12,70,32,.5)';
    g.fillRect(X(x0), 0, stripe * sx + 1, ch);
  }
  // manchas largas (densidade e tom variando de um ponto a outro do campo)
  for (let i = 0; i < 70; i++) {
    const x = hash(i * 3 + 1) * cw, y = hash(i * 7 + 2) * ch, r = (3 + hash(i * 11 + 3) * 9) * sx;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = hash(i * 13 + 4) > 0.5;
    grd.addColorStop(0, dark ? 'rgba(8,55,25,.22)' : 'rgba(120,190,70,.16)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // pequenas lâminas vistas de cima: traços curtos e finos em várias tonalidades
  const blades = quality === 'low' ? 30000 : quality === 'medium' ? 90000 : 170000;
  for (let i = 0; i < blades; i++) {
    const x = hash(i * 5 + 11) * cw, y = hash(i * 9 + 5) * ch, a = hash(i * 17 + 7) * Math.PI * 2, l = (0.06 + hash(i * 19 + 3) * 0.14) * sx;
    const t = hash(i * 23 + 9);
    g.strokeStyle = t < 0.35 ? 'rgba(10,60,25,.35)' : t < 0.75 ? 'rgba(60,150,55,.30)' : 'rgba(150,210,90,.26)';
    g.lineWidth = Math.max(0.5, 0.012 * sx);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // linhas brancas
  const lw = 0.17 * sx; // 12 cm reais; um pouco mais grosso para aparecer bem no celular
  g.strokeStyle = 'rgba(255,255,255,.95)'; g.fillStyle = 'rgba(255,255,255,.95)'; g.lineWidth = lw; g.lineCap = 'butt';
  const seg = (x0: number, y0: number, x1: number, y1: number) => { g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke(); };
  g.strokeRect(X(0), Y(W), L * sx, W * sy);
  seg(L / 2, 0, L / 2, W);
  const MID = W / 2;
  for (const gx of [0, L]) {
    const s = gx === 0 ? 1 : -1;
    const bx = gx + s * 16.5, y0 = MID - 20.16, y1 = MID + 20.16; // grande área 40,32 x 16,5
    seg(gx, y0, bx, y0); seg(bx, y0, bx, y1); seg(bx, y1, gx, y1);
    const sxp = gx + s * 5.5, z0 = MID - 9.16, z1 = MID + 9.16;   // pequena área 18,32 x 5,5
    seg(gx, z0, sxp, z0); seg(sxp, z0, sxp, z1); seg(sxp, z1, gx, z1);
    g.beginPath(); g.arc(X(gx + s * 11), Y(MID), 0.11 * sx * 1.6, 0, Math.PI * 2); g.fill(); // marca do pênalti
    const a = Math.acos(5.5 / 9.15); // meia-lua da área: parte do círculo de 9,15 m que fica fora da grande área
    g.beginPath(); g.arc(X(gx + s * 11), Y(MID), 9.15 * sx, gx === 0 ? -a : Math.PI - a, gx === 0 ? a : Math.PI + a); g.stroke();
  }
  g.beginPath(); g.arc(X(L / 2), Y(MID), 9.15 * sx, 0, Math.PI * 2); g.stroke(); // círculo central
  g.beginPath(); g.arc(X(L / 2), Y(MID), 0.11 * sx * 1.6, 0, Math.PI * 2); g.fill();
  const corner = (cx: number, cy: number, a0: number) => { g.beginPath(); for (let k = 0; k <= 12; k++) { const a = a0 + (k / 12) * (Math.PI / 2); const px = X(cx + Math.cos(a)), py = Y(cy + Math.sin(a)); if (k) g.lineTo(px, py); else g.moveTo(px, py); } g.stroke(); }; // arco de 1 m
  corner(0, 0, 0); corner(L, 0, Math.PI / 2); corner(L, W, Math.PI); corner(0, W, -Math.PI / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = quality === 'high' ? 8 : quality === 'medium' ? 4 : 1;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Bola de futebol: textura de gomos (12 pentágonos pretos e 20 hexágonos brancos, o "icosaedro truncado"), calculada ponto a ponto. */
export function makeBallTexture(size = 512): THREE.CanvasTexture {
  const w = size, h = size / 2;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!, img = g.createImageData(w, h);
  const phi = (1 + Math.sqrt(5)) / 2;
  const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const verts: number[][] = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) { verts.push(norm([0, a, b]), norm([a, b, 0]), norm([b, 0, a])); }
  // centros das 20 faces (hexágonos): somas de trios de vértices vizinhos
  const faces: number[][] = [];
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) for (let k = j + 1; k < verts.length; k++) {
    const d = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const e = d(verts[i], verts[j]); // vizinhos no icosaedro: produto escalar ~ 0,447
    if (Math.abs(e - 0.4472) < 0.02 && Math.abs(d(verts[j], verts[k]) - 0.4472) < 0.02 && Math.abs(d(verts[i], verts[k]) - 0.4472) < 0.02) faces.push(norm([verts[i][0] + verts[j][0] + verts[k][0], verts[i][1] + verts[j][1] + verts[k][1], verts[i][2] + verts[j][2] + verts[k][2]]));
  }
  const centers = [...verts.map((v) => ({ v, pent: true })), ...faces.map((v) => ({ v, pent: false }))];
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * Math.PI * 2, p = [cl * Math.cos(lon), sl, cl * Math.sin(lon)];
      let b1 = -2, b2 = -2, pent = false;
      for (const ct of centers) { const d = p[0] * ct.v[0] + p[1] * ct.v[1] + p[2] * ct.v[2]; if (d > b1) { b2 = b1; b1 = d; pent = ct.pent; } else if (d > b2) b2 = d; }
      const seam = b1 - b2 < 0.018; // costura entre gomos
      const v = seam ? 70 : pent ? 24 : 246;
      const o = (y * w + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
