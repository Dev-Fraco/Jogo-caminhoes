import { makeCamera, project, type Camera, type Projected } from './camera';
import { BALL_R, GOAL_D, GOAL_H, GOAL_W, L, MID_Y, W, goalXOf, VAR_REPLAY_SPEED, type Agent, type V3, type VarState, type World } from './world';

/* Desenho do mundo 3D em canvas 2D com perspectiva real (câmera, profundidade, sombras e ordem de desenho por distância). */

export interface Kit { primary: string; secondary: string; gk: string; short: string; badge: HTMLImageElement | null }
export interface Look { home: Kit; away: Kit; userSide: 'home' | 'away' }

const hash = (n: number) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 8) / 0xffffff; };
const rgb = (h: string): [number, number, number] => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); if (!m) return [128, 128, 128]; const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const shade = (h: string, k: number) => { const [r, g, b] = rgb(h); const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; };
/** Cor do goleiro: amarelo, ou azul-turquesa se o time já usa amarelo. */
export function gkColor(primary: string): string { const [r, g, b] = rgb(primary); return r > 190 && g > 150 && b < 110 ? '#27c4d8' : '#ffd23f'; }

type P = Projected;
const pr = (cam: Camera, x: number, y: number, z: number) => project(cam, { x, y, z });

function polygon(ctx: CanvasRenderingContext2D, pts: (P | null)[], fill?: string, stroke?: string, lw = 1) {
  if (pts.some((p) => !p)) return;
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p!.x, p!.y) : ctx.moveTo(p!.x, p!.y))); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function line3(ctx: CanvasRenderingContext2D, cam: Camera, a: V3, b: V3, color: string, meters: number) {
  const p = project(cam, a), q = project(cam, b);
  if (!p || !q) return;
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, meters * ((p.scale + q.scale) / 2)); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
}
function circlePts(cam: Camera, cx: number, cy: number, z: number, r: number, n = 28, a0 = 0, a1 = Math.PI * 2): (P | null)[] {
  const out: (P | null)[] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push(pr(cam, cx + Math.cos(a) * r, cy + Math.sin(a) * r, z)); }
  return out;
}
function strokePath(ctx: CanvasRenderingContext2D, pts: (P | null)[], color: string, width: number) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); let on = false;
  for (const p of pts) { if (!p) { on = false; continue; } if (!on) { ctx.moveTo(p.x, p.y); on = true; } else ctx.lineTo(p.x, p.y); }
  ctx.stroke();
}

/* ------------------------------ cenário ------------------------------ */
function drawPitch(ctx: CanvasRenderingContext2D, cam: Camera) {
  // gramado em faixas
  const apron = 7;
  polygon(ctx, [pr(cam, -apron, -apron, 0), pr(cam, L + apron, -apron, 0), pr(cam, L + apron, W + apron, 0), pr(cam, -apron, W + apron, 0)], '#1b6b34');
  const stripes = 15;
  for (let i = 0; i < stripes; i++) {
    const x0 = (L * i) / stripes, x1 = (L * (i + 1)) / stripes;
    polygon(ctx, [pr(cam, x0, 0, 0), pr(cam, x1, 0, 0), pr(cam, x1, W, 0), pr(cam, x0, W, 0)], i % 2 ? '#238a41' : '#1f7d3a');
  }
  const wl = 0.14, col = 'rgba(255,255,255,.88)';
  const seg = (x0: number, y0: number, x1: number, y1: number) => line3(ctx, cam, { x: x0, y: y0, z: 0.01 }, { x: x1, y: y1, z: 0.01 }, col, wl);
  seg(0, 0, L, 0); seg(L, 0, L, W); seg(L, W, 0, W); seg(0, W, 0, 0); seg(L / 2, 0, L / 2, W);
  for (const gx of [0, L]) {
    const s = gx === 0 ? 1 : -1;
    const bx = gx + s * 16.5, y0 = MID_Y - 20.16, y1 = MID_Y + 20.16;
    seg(gx, y0, bx, y0); seg(bx, y0, bx, y1); seg(bx, y1, gx, y1);
    const sx = gx + s * 5.5, z0 = MID_Y - 9.16, z1 = MID_Y + 9.16;
    seg(gx, z0, sx, z0); seg(sx, z0, sx, z1); seg(sx, z1, gx, z1);
  }
  strokePath(ctx, circlePts(cam, L / 2, MID_Y, 0.01, 9.15, 40), col, Math.max(1, wl * (pr(cam, L / 2, MID_Y, 0)?.scale ?? 6)));
  for (const gx of [0, L]) { // marca do pênalti e arco da área
    const s = gx === 0 ? 1 : -1;
    const sp = pr(cam, gx + s * 11, MID_Y, 0.01); if (sp) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sp.x, sp.y, Math.max(1.5, 0.25 * sp.scale), 0, 7); ctx.fill(); }
    const a = Math.acos(5.5 / 9.15);
    strokePath(ctx, circlePts(cam, gx + s * 11, MID_Y, 0.01, 9.15, 24, gx === 0 ? -a : Math.PI - a, gx === 0 ? a : Math.PI + a), col, Math.max(1, wl * (sp?.scale ?? 6)));
  }
  const cp = pr(cam, L / 2, MID_Y, 0.01); if (cp) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cp.x, cp.y, Math.max(1.5, 0.25 * cp.scale), 0, 7); ctx.fill(); }
}

function drawStands(ctx: CanvasRenderingContext2D, cam: Camera, w: World, t: number) {
  // placas de publicidade e arquibancada do lado de lá do campo
  const y = W + 3.5;
  const cols = ['#e63946', '#f1faee', '#457b9d', '#ffd23f', '#2a9d8f', '#f4a261'];
  const n = 14;
  for (let i = 0; i < n; i++) { const x0 = -7 + ((L + 14) * i) / n, x1 = -7 + ((L + 14) * (i + 1)) / n; polygon(ctx, [pr(cam, x0, y, 0), pr(cam, x1, y, 0), pr(cam, x1, y, 1.1), pr(cam, x0, y, 1.1)], cols[i % cols.length]); }
  polygon(ctx, [pr(cam, -7, y, 1.1), pr(cam, L + 7, y, 1.1), pr(cam, L + 7, y + 16, 13), pr(cam, -7, y + 16, 13)], '#27304a');
  const goal = !!w.banner;
  for (let r = 0; r < 7; r++) for (let i = 0; i < 70; i++) { // torcida: pontinhos coloridos que pulam no gol
    const x = -6 + (L + 12) * (i / 69), yy = y + 1 + r * 2.1, z = 1.8 + r * 1.55;
    const jump = goal ? Math.abs(Math.sin(t * 9 + i * 0.7 + r)) * 0.55 : Math.abs(Math.sin(t * 1.5 + i + r * 3)) * 0.06;
    const p = pr(cam, x, yy, z + jump); if (!p) continue;
    ctx.fillStyle = ['#ffd23f', '#ff6b6b', '#ffffff', '#5ec8ff', '#9be564'][Math.floor(hash(i * 7 + r * 13) * 5)];
    ctx.globalAlpha = 0.85; ctx.fillRect(p.x - p.scale * 0.35, p.y - p.scale * 0.35, p.scale * 0.7, p.scale * 0.8); ctx.globalAlpha = 1;
  }
}

/* ------------------------------ gols e rede ------------------------------ */
function drawGoal(ctx: CanvasRenderingContext2D, cam: Camera, w: World, gx: number, back: boolean) {
  const dir = gx === 0 ? -1 : 1, net = w.nets[gx === 0 ? 0 : 1];
  const yl = MID_Y - GOAL_W / 2, yr = MID_Y + GOAL_W / 2, bx = gx + dir * GOAL_D;
  if (back) {
    ctx.globalAlpha = 0.5;
    // fundo da rede com deformação (x para fora conforme o deslocamento)
    const nodeAt = (i: number, j: number): P | null => { const d = net.d[i * net.h + j] ?? 0; const y = yl + (GOAL_W * i) / (net.w - 1), z = (GOAL_H * j) / (net.h - 1); return pr(cam, bx + dir * d * 0.9, y, z * (1 - Math.abs(d) * 0.06)); };
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < net.w; i++) { ctx.lineWidth = Math.max(0.6, 0.02 * 40); ctx.beginPath(); let on = false; for (let j = 0; j < net.h; j++) { const p = nodeAt(i, j); if (!p) continue; if (!on) { ctx.moveTo(p.x, p.y); on = true; } else ctx.lineTo(p.x, p.y); } ctx.stroke(); }
    for (let j = 0; j < net.h; j++) { ctx.beginPath(); let on = false; for (let i = 0; i < net.w; i++) { const p = nodeAt(i, j); if (!p) continue; if (!on) { ctx.moveTo(p.x, p.y); on = true; } else ctx.lineTo(p.x, p.y); } ctx.stroke(); }
    // laterais e teto da rede (ligam o quadro ao fundo)
    for (let k = 0; k <= 4; k++) {
      const z = (GOAL_H * k) / 4, fx = (k / 4) * GOAL_D;
      line3(ctx, cam, { x: gx, y: yl, z }, { x: bx, y: yl, z }, 'rgba(255,255,255,.55)', 0.02); line3(ctx, cam, { x: gx, y: yr, z }, { x: bx, y: yr, z }, 'rgba(255,255,255,.55)', 0.02);
      const xx = gx + dir * fx; line3(ctx, cam, { x: xx, y: yl, z: 0 }, { x: xx, y: yl, z: GOAL_H }, 'rgba(255,255,255,.45)', 0.02); line3(ctx, cam, { x: xx, y: yr, z: 0 }, { x: xx, y: yr, z: GOAL_H }, 'rgba(255,255,255,.45)', 0.02);
      line3(ctx, cam, { x: xx, y: yl, z: GOAL_H }, { x: xx, y: yr, z: GOAL_H }, 'rgba(255,255,255,.4)', 0.02);
    }
    ctx.globalAlpha = 1;
  } else { // quadro: traves e travessão
    const c = '#f5f5f5';
    line3(ctx, cam, { x: gx, y: yl, z: 0 }, { x: gx, y: yl, z: GOAL_H }, c, 0.14); line3(ctx, cam, { x: gx, y: yr, z: 0 }, { x: gx, y: yr, z: GOAL_H }, c, 0.14);
    line3(ctx, cam, { x: gx, y: yl, z: GOAL_H }, { x: gx, y: yr, z: GOAL_H }, c, 0.14);
    line3(ctx, cam, { x: gx, y: yl, z: GOAL_H }, { x: bx, y: yl, z: GOAL_H }, 'rgba(255,255,255,.5)', 0.07); line3(ctx, cam, { x: gx, y: yr, z: GOAL_H }, { x: bx, y: yr, z: GOAL_H }, 'rgba(255,255,255,.5)', 0.07);
  }
}

/* ------------------------------ botões (jogadores) ------------------------------ */
const BR = 1.55, BTH = 0.62; // raio e espessura do botão (m): maiores que o real para ler bem na tela

function drawButton(ctx: CanvasRenderingContext2D, cam: Camera, a: Agent, kit: Kit, carrierMine: boolean, t: number, w: World) {
  const down = a.state === 'down';
  const lean = Math.min(1, Math.hypot(a.vx, a.vy) / 7);
  const hop = a.hop + (a.state === 'dive' ? 0.1 : 0);
  const bob = Math.abs(Math.sin(a.gait * Math.PI)) * 0.07 * lean;
  const z0 = hop + bob, z1 = z0 + (down ? BTH * 0.45 : BTH);
  const cx = a.x, cy = a.y, ox = a.vx * 0.045, oy = a.vy * 0.045; // inclina para onde corre
  const color = a.gk ? kit.gk : kit.primary;
  const N = 26;
  const bottom = circlePts(cam, cx, cy, z0, BR, N), top = circlePts(cam, cx + ox, cy + oy, z1, BR * 0.97, N);
  if (bottom.some((p) => !p) || top.some((p) => !p)) return;
  // sombra no chão
  const sh = circlePts(cam, cx, cy, 0.005, BR * (1.15 + z0 * 0.2), 20);
  polygon(ctx, sh, `rgba(0,0,0,${Math.max(0.16, 0.42 - z0 * 0.1)})`);
  // lateral do cilindro (só as faces voltadas para a câmera)
  for (let i = 0; i < N; i++) {
    const ang = ((i + 0.5) / N) * Math.PI * 2, nx = Math.cos(ang), ny = Math.sin(ang);
    const toCam = (cam.px - cx) * nx + (cam.py - cy) * ny;
    if (toCam <= 0) continue;
    const k = -0.1 - 0.38 * (1 - Math.max(0, nx * 0.4 - ny * 0.9 + 0.5) / 1.4);
    polygon(ctx, [bottom[i], bottom[i + 1], top[i + 1], top[i]], shade(color, k), shade(color, -0.55), 0.5);
  }
  // face de cima
  ctx.save();
  polygon(ctx, top, undefined, undefined);
  const c0 = project(cam, { x: cx + ox, y: cy + oy, z: z1 });
  if (!c0) { ctx.restore(); return; }
  const g = ctx.createRadialGradient(c0.x - c0.scale * 0.3, c0.y - c0.scale * 0.35, 1, c0.x, c0.y, c0.scale * BR * 1.1);
  g.addColorStop(0, shade(color, 0.32)); g.addColorStop(1, shade(color, -0.12));
  polygon(ctx, top, g as unknown as string, '#07130b', Math.max(1.5, 0.07 * c0.scale)); // contorno escuro (destaca do gramado)
  strokePath(ctx, circlePts(cam, cx + ox, cy + oy, z1 + 0.004, BR * 0.9, 26), kit.secondary, Math.max(1.5, 0.16 * c0.scale)); // aro na cor secundária do clube
  // anel interno e escudo
  const ring = circlePts(cam, cx + ox, cy + oy, z1 + 0.005, BR * 0.74, 22);
  polygon(ctx, ring, 'rgba(0,0,0,.18)', 'rgba(255,255,255,.7)', Math.max(0.8, 0.045 * c0.scale));
  const px = pr(cam, cx + ox + BR * 0.62, cy + oy, z1 + 0.006), py = pr(cam, cx + ox, cy + oy + BR * 0.62, z1 + 0.006);
  if (px && py) {
    ctx.save();
    ctx.transform(px.x - c0.x, px.y - c0.y, c0.x - py.x, c0.y - py.y, c0.x, c0.y); // multiplica a matriz atual (mantém a escala da tela); o eixo y do escudo desce na tela, como no texto
    ctx.beginPath(); ctx.arc(0, 0, 0.98, 0, Math.PI * 2); ctx.clip();
    const u = 1 / BR;
    if (kit.badge && kit.badge.complete && kit.badge.naturalWidth > 0) { ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(-1, -1, 2, 2); ctx.drawImage(kit.badge, -0.86, -0.86, 1.72, 1.72); }
    else { ctx.fillStyle = kit.secondary; ctx.fillRect(-1, -1, 2, 2); ctx.fillStyle = kit.primary; ctx.font = '800 0.7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(kit.short.slice(0, 3), 0, 0.03); }
    void u;
    ctx.restore();
  }
  // marca de direção (para onde o botão olha)
  const hx = Math.cos(a.heading), hy = Math.sin(a.heading);
  const tip = pr(cam, cx + ox + hx * BR * 0.98, cy + oy + hy * BR * 0.98, z1 + 0.01), l = pr(cam, cx + ox + hx * BR * 0.78 - hy * 0.2, cy + oy + hy * BR * 0.78 + hx * 0.2, z1 + 0.01), r = pr(cam, cx + ox + hx * BR * 0.78 + hy * 0.2, cy + oy + hy * BR * 0.78 - hx * 0.2, z1 + 0.01);
  polygon(ctx, [tip, l, r], 'rgba(255,255,255,.85)');
  ctx.restore();
  if (carrierMine) { strokePath(ctx, circlePts(cam, cx, cy, 0.02, BR * 1.5, 24), 'rgba(255,255,255,.85)', 2); }
  if (down) { const p = pr(cam, cx, cy, 2.2); if (p) { ctx.font = `${Math.max(12, p.scale * 1.6)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🤕', p.x, p.y); } }
  void t; void w;
}

function drawBall(ctx: CanvasRenderingContext2D, cam: Camera, w: World) {
  const b = w.ball, c = project(cam, b.p);
  if (!c) return;
  const r = Math.max(4, BALL_R * c.scale * 1.9);
  const shR = BALL_R * (1.2 + b.p.z * 0.25);
  polygon(ctx, circlePts(cam, b.p.x, b.p.y, 0.006, shR, 16), `rgba(0,0,0,${Math.max(0.1, 0.38 - b.p.z * 0.07)})`);
  ctx.save();
  ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.clip();
  const g = ctx.createRadialGradient(c.x - r * 0.35, c.y - r * 0.4, r * 0.1, c.x, c.y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.75, '#e4e4e4'); g.addColorStop(1, '#9a9a9a');
  ctx.fillStyle = g; ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
  ctx.fillStyle = '#1b1b1b';
  for (let k = 0; k < 4; k++) { const a = b.spin + (k * Math.PI * 2) / 4, rr = r * (k % 2 ? 0.5 : 0.62); ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * rr * 0.9, c.y + Math.sin(a * 1.3) * rr * 0.7, r * 0.26, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
}

/* ------------------------------ cena completa ------------------------------ */
export function drawScene(ctx: CanvasRenderingContext2D, w: World, width: number, height: number, look: Look) {
  const cam = makeCamera(width, height, w.camX);
  const sky = ctx.createLinearGradient(0, 0, 0, height); sky.addColorStop(0, '#0e1730'); sky.addColorStop(1, '#16254a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
  drawStands(ctx, cam, w, w.t);
  drawPitch(ctx, cam);
  drawGoal(ctx, cam, w, 0, true); drawGoal(ctx, cam, w, L, true);
  // jogadores e bola, do mais longe para o mais perto
  type Item = { depth: number; draw: () => void };
  const items: Item[] = [];
  for (const a of w.agents) {
    const p = project(cam, { x: a.x, y: a.y, z: 0 }); if (!p) continue;
    const kit = a.side === 'home' ? look.home : look.away;
    const mine = a.side === look.userSide && w.flow.carrier === a.id;
    items.push({ depth: p.depth, draw: () => drawButton(ctx, cam, a, kit, mine, w.t, w) });
  }
  const bp = project(cam, w.ball.p); if (bp) items.push({ depth: bp.depth - 0.4, draw: () => drawBall(ctx, cam, w) });
  items.sort((p, q) => q.depth - p.depth);
  for (const it of items) it.draw();
  drawGoal(ctx, cam, w, 0, false); drawGoal(ctx, cam, w, L, false);
  drawOverlay(ctx, w, width, height, cam);
  void goalXOf;
}

/** Confete, cartão e letreiro de gol (por cima da cena, em 2D): usado também pelo campo em WebGL. */
export function drawOverlay(ctx: CanvasRenderingContext2D, w: World, width: number, height: number, cam: Camera) {
  // confete
  for (const c of w.confetti) { const p = pr(cam, c.x, c.y, c.z); if (!p) continue; ctx.fillStyle = c.c; ctx.fillRect(p.x, p.y, Math.max(2, p.scale * 0.25), Math.max(3, p.scale * 0.4)); }
  // cartão
  if (w.card) { const a = w.agents[w.card.agent], p = pr(cam, a.x, a.y, 3.1); if (p) { const k = p.scale; ctx.fillStyle = w.card.kind === 'red' ? '#e63946' : '#ffd23f'; ctx.fillRect(p.x - k * 0.5, p.y - k * 0.75, k, k * 1.5); ctx.strokeStyle = '#000a'; ctx.lineWidth = 1; ctx.strokeRect(p.x - k * 0.5, p.y - k * 0.75, k, k * 1.5); } }
  // gol: clarão e letreiro
  if (w.banner) {
    const el = w.t - w.banner.t0, a = Math.max(0, 1 - el / 3.2);
    if (el < 0.5) { ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - el / 0.5)})`; ctx.fillRect(0, 0, width, height); }
    const pop = 1 + Math.max(0, 0.35 - el) * 1.8 + Math.sin(el * 7) * 0.03;
    ctx.save(); ctx.globalAlpha = el < 2.4 ? 1 : Math.max(0, 1 - (el - 2.4) / 0.8); void a; ctx.translate(width / 2, height * 0.17); ctx.scale(pop, pop);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.font = `900 ${Math.round(width * 0.105)}px system-ui, sans-serif`; ctx.lineWidth = Math.max(4, width * 0.012); ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffd23f';
    ctx.strokeText(w.banner.text, 0, 0); ctx.fillText(w.banner.text, 0, 0);
    if (w.banner.sub) { ctx.font = `800 ${Math.round(width * 0.042)}px system-ui, sans-serif`; ctx.lineWidth = Math.max(3, width * 0.008); ctx.strokeText(w.banner.sub, 0, width * 0.075); ctx.fillStyle = '#fff'; ctx.fillText(w.banner.sub, 0, width * 0.075); }
    ctx.restore();
  }
}

/** Painel do VAR por cima da cena: selo "VAR", o que está sendo revisado, a repetição (câmera e velocidade) e a decisão final. */
export function drawVarOverlay(ctx: CanvasRenderingContext2D, v: VarState, width: number, height: number, camLabel: string) {
  const review = v.stage === 'review';
  if (review) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, width, height * 0.07); ctx.fillRect(0, height * 0.93, width, height * 0.07); }
  // selo
  const bw = Math.max(44, width * 0.13), bh = bw * 0.46, bx = width * 0.03, by = height * (review ? 0.09 : 0.04);
  ctx.save(); ctx.fillStyle = '#0b1b3a'; ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = Math.max(2, width * 0.006);
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh * 0.25); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd23f'; ctx.font = `900 ${Math.round(bh * 0.66)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VAR', bx + bw / 2, by + bh / 2 + 1);
  // linha de status
  const dots = '.'.repeat(1 + (Math.floor(v.clock * 3) % 3));
  ctx.textAlign = 'left'; ctx.font = `800 ${Math.round(width * 0.036)}px system-ui, sans-serif`; ctx.lineWidth = Math.max(3, width * 0.008); ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
  const status = v.stage === 'check' ? v.text.replace('…', dots) : review ? `REPLAY ▶ ${VAR_REPLAY_SPEED.toString().replace('.', ',')}x · ${camLabel}` : 'DECISÃO DO VAR';
  ctx.strokeText(status, bx + bw + width * 0.02, by + bh / 2); ctx.fillText(status, bx + bw + width * 0.02, by + bh / 2);
  if (review && v.line) { // legenda das linhas do impedimento
    ctx.font = `700 ${Math.round(width * 0.03)}px system-ui, sans-serif`; ctx.fillStyle = '#fff';
    ctx.strokeText('Linha branca: último defensor · Linha vermelha: atacante', bx, by + bh + width * 0.04); ctx.fillText('Linha branca: último defensor · Linha vermelha: atacante', bx, by + bh + width * 0.04);
  }
  ctx.restore();
  if (v.stage === 'decision') { // letreiro da decisão
    const el = v.clock, pop = 1 + Math.max(0, 0.3 - el) * 1.5, ok = !v.annul;
    ctx.save(); ctx.translate(width / 2, height * 0.5); ctx.scale(pop, pop);
    const fs = Math.round(width * (v.decision.length > 22 ? 0.05 : 0.075)); ctx.font = `900 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const tw = ctx.measureText(v.decision).width + width * 0.06;
    ctx.fillStyle = ok ? 'rgba(18,110,52,.92)' : 'rgba(170,24,32,.92)'; ctx.beginPath(); ctx.roundRect(-tw / 2, -fs * 0.8, tw, fs * 1.6, fs * 0.25); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, width * 0.005); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(v.decision, 0, 2); ctx.restore();
  }
}
