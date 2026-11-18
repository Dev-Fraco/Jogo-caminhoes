import type { FormationId, MatchEvent } from '../../engine/types';
import { PITCH_H, PITCH_W, playState, positionsOf, type PlayState, type Pt, type Side } from '../pitch';

/* =====================================================================
   Mundo 3D da partida ao vivo: campo em metros (105 x 68), jogadores-botão que correm de verdade (aceleração, velocidade máxima,
   frenagem), bola com física (gravidade, quique, atrito, rebote nas traves e no travessão), rede do gol que balança, e roteiros
   para gol, defesa, chute para fora, escanteio, falta/cartão e lesão. O resultado da partida vem do motor: aqui só se encena o que
   a narração já decidiu, e a bola obedece à física (um gol só vale quando ela atravessa a linha entre as traves).
   Sem DOM: dá para testar e simular sem tela.
   ===================================================================== */

export const L = 105, W = 68;
export const GOAL_W = 7.32, GOAL_H = 2.44, GOAL_D = 2.4, POST_R = 0.06;
export const BALL_R = 0.22;
export const G = 9.81;
export const MID_Y = W / 2;
export const CENTER = { x: L / 2, y: MID_Y };
const SX = L / PITCH_W, SY = W / PITCH_H;

export interface V3 { x: number; y: number; z: number }
export type Mode = 'carried' | 'free';
export interface Ball { p: V3; v: V3; mode: Mode; carrier: number; spin: number; /** sem atrito até este instante (passe rasteiro) */ slideUntil: number; scored: Side | null; inNet: Side | null; /** já cruzou a linha de gol (valendo ou não): só a 1ª travessia decide se é gol */ crossed: boolean }
export type AgentState = 'play' | 'dive' | 'celebrate' | 'down' | 'hold';
export interface Agent {
  id: number; side: Side; idx: number; gk: boolean;
  x: number; y: number; vx: number; vy: number; heading: number; gait: number; hop: number; hopV: number;
  tx: number; ty: number; state: AgentState;
  /** destino imposto por um roteiro (vale até `until`) e limite de velocidade */
  ov?: { x: number; y: number; speed: number; until: number };
}
export interface Net { w: number; h: number; d: number[]; dv: number[] }
export interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; c: string; life: number }
export interface Banner { text: string; sub: string; t0: number }
export interface Card { agent: number; kind: 'yellow' | 'red'; until: number }
export type ScriptKind = 'goal' | 'save' | 'miss' | 'corner' | 'foul' | 'injury';
export interface Script { kind: ScriptKind; side: Side; t: number; phase: number; shooter: number; ty: number; tz: number; player?: string; data: Record<string, number>; dur: number }
export interface World {
  t: number; ball: Ball; agents: Agent[]; nets: [Net, Net]; script: Script | null; queue: Script[];
  banner: Banner | null; card: Card | null; confetti: Particle[]; camX: number;
  flow: { st: PlayState; tick: number; carrier: number; side: Side | 'none' };
  formations: { home: FormationId; away: FormationId };
  goals: { home: number; away: number };
  /** segundo tempo: os times trocaram de lado (o mandante defende o gol da direita) */
  flip: boolean;
}

const hash = (n: number) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 8) / 0xffffff; };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist2 = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
/** Direção de ataque (+1 = para o gol da direita). No 2º tempo (`flip`) os times trocam de lado. */
const sgnOf = (side: Side, flip = false) => ((side === 'home') !== flip ? 1 : -1);
/** x da linha de gol que o time ataca (mandante ataca a direita). */
export const goalXOf = (attacker: Side, flip = false) => ((attacker === 'home') !== flip ? L : 0);
/** Ponto do campo lógico (100 x 64, mandante ataca à direita) para metros; no 2º tempo (`flip`) o campo todo é espelhado. */
const toWorld = (p: Pt, flip = false): { x: number; y: number } => (flip ? { x: L - p.x * SX, y: W - p.y * SY } : { x: p.x * SX, y: p.y * SY });

export const newNet = (): Net => ({ w: 9, h: 5, d: new Array(45).fill(0), dv: new Array(45).fill(0) });

export function createWorld(homeFormation: FormationId = '4-4-2', awayFormation: FormationId = '4-4-2'): World {
  const agents: Agent[] = [];
  for (const side of ['home', 'away'] as const) for (let i = 0; i < 11; i++) agents.push({ id: agents.length, side, idx: i, gk: i === 0, x: CENTER.x, y: CENTER.y, vx: 0, vy: 0, heading: side === 'home' ? 0 : Math.PI, gait: i * 0.7, hop: 0, hopV: 0, tx: CENTER.x, ty: CENTER.y, state: 'play' });
  const w: World = {
    t: 0, ball: { p: { x: CENTER.x, y: CENTER.y, z: BALL_R }, v: { x: 0, y: 0, z: 0 }, mode: 'free', carrier: -1, spin: 0, slideUntil: 0, scored: null, inNet: null, crossed: false },
    agents, nets: [newNet(), newNet()], script: null, queue: [], banner: null, card: null, confetti: [], camX: CENTER.x,
    flow: { st: playState([], 0, 0), tick: -1, carrier: -1, side: 'none' }, formations: { home: homeFormation, away: awayFormation }, goals: { home: 0, away: 0 }, flip: false,
  };
  placeFormation(w, playState([], 0, 0), 0);
  return w;
}

/** Coloca todos nos lugares da formação (sem correr): início, intervalo e saltos no tempo. */
export function placeFormation(w: World, st: PlayState, tick: number) {
  const hp = positionsOf('home', w.formations.home, st, tick).map((p) => toWorld(p, w.flip)), ap = positionsOf('away', w.formations.away, st, tick).map((p) => toWorld(p, w.flip));
  w.agents.forEach((a) => { const p = (a.side === 'home' ? hp : ap)[a.idx]; a.x = a.tx = p.x; a.y = a.ty = p.y; a.vx = a.vy = 0; a.state = 'play'; a.ov = undefined; a.hop = 0; a.hopV = 0; });
}

/** Pega a bola ao centro (saída de bola). */
export function ballToCenter(w: World) { Object.assign(w.ball, { p: { x: CENTER.x, y: CENTER.y, z: BALL_R }, v: { x: 0, y: 0, z: 0 }, mode: 'free' as Mode, carrier: -1, scored: null, inNet: null, slideUntil: 0, crossed: false }); }

/* ------------------------------ física da bola ------------------------------ */

/** Velocidade inicial para a bola sair de `from` e chegar em `to` depois de `T` segundos (parábola, sem resistência). */
export function ballistic(from: V3, to: V3, T: number): V3 {
  return { x: (to.x - from.x) / T, y: (to.y - from.y) / T, z: (to.z - from.z + 0.5 * G * T * T) / T };
}
/** Chuta: a bola vira livre e sai com a velocidade que a leva ao ponto no tempo dado. `ground` = passe rasteiro (rola sem atrito até chegar). */
export function kickTo(w: World, to: V3, T: number, ground = false) {
  const b = w.ball;
  const v = ground ? { x: (to.x - b.p.x) / T, y: (to.y - b.p.y) / T, z: 0 } : ballistic(b.p, to, T);
  b.v = v; b.mode = 'free'; b.carrier = -1; b.slideUntil = ground ? w.t + T : 0;
}

const inMouth = (y: number) => Math.abs(y - MID_Y) <= GOAL_W / 2;

/** Hits na rede: empurra os nós perto do ponto de impacto (para o gráfico da rede balançar). */
function netImpact(net: Net, y: number, z: number, strength: number) {
  for (let i = 0; i < net.w; i++) for (let j = 0; j < net.h; j++) {
    const ny = MID_Y - GOAL_W / 2 + (GOAL_W * i) / (net.w - 1), nz = (GOAL_H * j) / (net.h - 1);
    const k = Math.exp(-((ny - y) ** 2 + (nz - z) ** 2) / 1.6);
    net.dv[i * net.h + j] += strength * k;
  }
}
function stepNet(net: Net, dt: number) {
  for (let i = 0; i < net.w; i++) for (let j = 0; j < net.h; j++) {
    const k = i * net.h + j;
    let nb = 0, c = 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= net.w || b >= net.h) continue; nb += net.d[a * net.h + b]; c++; }
    const lap = c ? nb / c - net.d[k] : 0;
    net.dv[k] += (-38 * net.d[k] + 22 * lap - 3.2 * net.dv[k]) * dt; // mola + vizinhos + amortecimento
  }
  for (let k = 0; k < net.d.length; k++) net.d[k] = clamp(net.d[k] + net.dv[k] * dt, -1.6, 1.6);
}

/** Um passo da física da bola (dt pequeno). Retorna se tocou na rede. */
function stepBall(w: World, dt: number) {
  const b = w.ball;
  if (b.mode === 'carried') {
    const a = w.agents[b.carrier];
    if (a) {
      const hx = Math.cos(a.heading), hy = Math.sin(a.heading);
      b.p = { x: a.x + hx * 0.85, y: a.y + hy * 0.85, z: BALL_R + Math.abs(Math.sin(a.gait * 2)) * 0.05 };
      b.v = { x: a.vx, y: a.vy, z: 0 };
      b.spin += Math.hypot(a.vx, a.vy) * dt / BALL_R;
      return;
    }
    b.mode = 'free';
  }
  const p = b.p, v = b.v;
  const gx = p.x < L / 2 ? 0 : L, dir = gx === 0 ? -1 : 1; // gol mais próximo e o lado "para dentro" da rede
  v.z -= G * dt;
  const air = p.z > BALL_R + 0.02;
  const drag = air ? 0.03 : (w.t < b.slideUntil ? 0 : 0.55);
  const k = Math.max(0, 1 - drag * dt);
  v.x *= k; v.y *= k;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
  if (p.z < BALL_R) { // chão: quique e rolamento
    p.z = BALL_R;
    if (v.z < -0.8) { v.z = -v.z * 0.58; v.x *= 0.94; v.y *= 0.94; } else v.z = 0;
    if (w.t >= b.slideUntil) { const sp = Math.hypot(v.x, v.y); if (sp > 0) { const f = Math.max(0, sp - (1.6 + 0.25 * sp) * dt) / sp; v.x *= f; v.y *= f; } }
  }
  b.spin += (Math.hypot(v.x, v.y) * dt) / BALL_R;

  // traves e travessão (rebote com perda de energia)
  const bounce = (nx: number, ny: number, nz: number, e: number) => { const vn = v.x * nx + v.y * ny + v.z * nz; if (vn < 0) { v.x -= (1 + e) * vn * nx; v.y -= (1 + e) * vn * ny; v.z -= (1 + e) * vn * nz; } };
  for (const side of [-1, 1]) {
    const py = MID_Y + side * (GOAL_W / 2);
    if (p.z < GOAL_H + 0.1) { // trave: cilindro vertical
      const dx = p.x - gx, dy = p.y - py, d = Math.hypot(dx, dy);
      if (d < BALL_R + POST_R && d > 1e-6) { const nx = dx / d, ny = dy / d; p.x = gx + nx * (BALL_R + POST_R); p.y = py + ny * (BALL_R + POST_R); bounce(nx, ny, 0, 0.62); }
    }
  }
  if (inMouth(p.y)) { // travessão: cilindro horizontal em y
    const dx = p.x - gx, dz = p.z - GOAL_H, d = Math.hypot(dx, dz);
    if (d < BALL_R + POST_R && d > 1e-6) { const nx = dx / d, nz = dz / d; p.x = gx + nx * (BALL_R + POST_R); p.z = GOAL_H + nz * (BALL_R + POST_R); bounce(nx, 0, nz, 0.6); }
  }
  // dentro do gol: rede (fundo, laterais e teto) segura a bola; ela cai e para
  const depth = (p.x - gx) * dir; // positivo = além da linha de gol
  if (depth > 0 && !b.crossed) { // 1ª travessia da linha de gol: só é gol se passou entre as traves e abaixo do travessão (por cima ou ao lado não vale)
    b.crossed = true;
    if (inMouth(p.y) && p.z + BALL_R * 0.5 < GOAL_H) b.scored = (dir === 1) !== w.flip ? 'home' : 'away';
  }
  if (depth < -3) b.crossed = false;
  if (b.scored && depth > 0) {
    b.inNet = b.scored;
    const net = w.nets[dir === 1 ? 1 : 0];
    const hit = (s: number, y: number, z: number) => { if (s > 1.2) netImpact(net, y, z, Math.min(7, s * 0.9)); };
    const damp = Math.max(0, 1 - 2.4 * dt); v.x *= damp; v.y *= damp;
    if (depth > GOAL_D - BALL_R) { hit(Math.abs(v.x), p.y, p.z); p.x = gx + dir * (GOAL_D - BALL_R); v.x = -v.x * 0.12; v.y *= 0.6; }
    const yl = MID_Y - GOAL_W / 2 + BALL_R, yr = MID_Y + GOAL_W / 2 - BALL_R;
    if (p.y < yl) { hit(Math.abs(v.y), p.y, p.z); p.y = yl; v.y = -v.y * 0.1; } else if (p.y > yr) { hit(Math.abs(v.y), p.y, p.z); p.y = yr; v.y = -v.y * 0.1; }
    if (p.z > GOAL_H - BALL_R) { hit(Math.abs(v.z), p.y, p.z); p.z = GOAL_H - BALL_R; v.z = -Math.abs(v.z) * 0.1; }
  }
}

/* ------------------------------ jogadores ------------------------------ */

const RUN = 7.4, GK_RUN = 5.6, ACC = 11, WALK = 2.2;
function stepAgent(w: World, a: Agent, dt: number) {
  if (a.state === 'down') { a.vx *= 0.8; a.vy *= 0.8; return; }
  const ov = a.ov && a.ov.until > w.t ? a.ov : undefined;
  if (a.ov && !ov) a.ov = undefined;
  let tx = ov ? ov.x : a.tx, ty = ov ? ov.y : a.ty;
  tx = clamp(tx, 0.5, L - 0.5); ty = clamp(ty, 0.5, W - 0.5);
  const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
  const vmax = ov ? ov.speed : (a.gk ? GK_RUN : RUN);
  const want = a.state === 'hold' ? 0 : Math.min(vmax, d * 2.6, d > 14 ? vmax : Math.max(WALK, d * 1.9)); // chega freando
  const wvx = d > 0.05 ? (dx / d) * want : 0, wvy = d > 0.05 ? (dy / d) * want : 0;
  let ax = wvx - a.vx, ay = wvy - a.vy; const am = Math.hypot(ax, ay), lim = ACC * dt;
  if (am > lim) { ax = (ax / am) * lim; ay = (ay / am) * lim; }
  a.vx += ax; a.vy += ay;
  a.x = clamp(a.x + a.vx * dt, 0.3, L - 0.3); a.y = clamp(a.y + a.vy * dt, 0.3, W - 0.3);
  const sp = Math.hypot(a.vx, a.vy);
  if (sp > 0.5) { let dh = Math.atan2(a.vy, a.vx) - a.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; a.heading += dh * Math.min(1, 9 * dt); }
  a.gait += sp * dt * 1.4;
  // pulinho (corrida e comemoração)
  a.hopV -= 22 * dt; a.hop += a.hopV * dt;
  if (a.hop <= 0) { a.hop = 0; a.hopV = a.state === 'celebrate' ? 5.4 : sp > 1 ? 0 : 0; }
}

/** Repele jogadores muito próximos (não ficam um dentro do outro). */
function separate(w: World) {
  const A = w.agents;
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    let dx = A[j].x - A[i].x, dy = A[j].y - A[i].y, d = Math.hypot(dx, dy); const min = 2.2;
    if (d < 1e-4) { dx = Math.cos(i * 2.4 + j); dy = Math.sin(i * 2.4 + j); d = 1; } // exatamente no mesmo ponto: separa por uma direção fixa
    if (d < min) { const push = Math.min((min - d) / 2, 0.025), nx = dx / d, ny = dy / d; A[i].x -= nx * push; A[i].y -= ny * push; A[j].x += nx * push; A[j].y += ny * push; }
  }
}

/* ------------------------------ fluxo normal (sem lance) ------------------------------ */

const holderOf = (w: World, side: Side, idx: number) => w.agents[(side === 'home' ? 0 : 11) + idx];

/** Atualiza para onde cada jogador corre e quem está com a bola, conforme o estado do jogo naquele instante. */
export function syncFlow(w: World, st: PlayState, tick: number) {
  const prev = w.flow;
  w.flow = { st, tick, carrier: st.possession === 'none' ? -1 : holderOf(w, st.possession, st.carrier).id, side: st.possession };
  const hp = positionsOf('home', w.formations.home, st, tick).map((p) => toWorld(p, w.flip)), ap = positionsOf('away', w.formations.away, st, tick).map((p) => toWorld(p, w.flip));
  for (const a of w.agents) { const p = (a.side === 'home' ? hp : ap)[a.idx]; a.tx = p.x; a.ty = p.y; }
  if (w.script) return;
  const b = w.ball;
  if (w.flow.carrier < 0) { if (prev.carrier >= 0 || b.mode === 'carried') { b.mode = 'free'; b.carrier = -1; } return; }
  if (b.mode === 'carried' && b.carrier === w.flow.carrier) return;
  if (b.mode === 'carried' || b.carrier < 0) { // passe: sai do pé de quem tinha e vai ao novo portador
    const to = w.agents[w.flow.carrier];
    const d = dist2(b.p.x, b.p.y, to.x, to.y);
    if (d > 3 && d < 60) {
      const T = clamp(d / 17, 0.35, 1.5);
      const lead = { x: to.x + to.vx * T * 0.6, y: to.y + to.vy * T * 0.6, z: BALL_R };
      b.mode = 'free';
      kickTo(w, lead, T, d < 38);
      w.flow.carrier = to.id; (b as Ball & { target?: number }).target = to.id;
    } else { b.mode = 'carried'; b.carrier = to.id; }
  }
}

/** A bola que viajou num passe é recebida por quem era o destino quando chega perto. */
function receive(w: World) {
  const b = w.ball as Ball & { target?: number };
  if (b.mode !== 'free' || w.script || b.target === undefined) return;
  const a = w.agents[b.target];
  if (a && dist2(b.p.x, b.p.y, a.x, a.y) < 1.4 && b.p.z < 1.2) { b.mode = 'carried'; b.carrier = a.id; b.target = undefined; }
  else if (Math.hypot(b.v.x, b.v.y) < 0.4 && b.p.z <= BALL_R + 0.01 && a) { /* parou antes: o jogador vai buscar */ a.tx = b.p.x; a.ty = b.p.y; if (dist2(b.p.x, b.p.y, a.x, a.y) < 2.2) { b.mode = 'carried'; b.carrier = a.id; b.target = undefined; } }
}

/* ------------------------------ roteiros dos lances ------------------------------ */

const FORWARDS = [8, 9, 10, 7];
/** Começa a encenação de um lance da narração. Gols interrompem tudo; os outros esperam o roteiro em curso. */
export function triggerEvent(w: World, e: MatchEvent, ix: number) {
  const side: Side = e.side === 'none' ? 'home' : e.side;
  const att: Side = e.type === 'foul' || e.type === 'yellow' || e.type === 'red' || e.type === 'injury' ? side : side; // lado do time do lance
  const sh = FORWARDS[Math.floor(hash(ix * 5 + 1) * FORWARDS.length)];
  const sc: Script = { kind: 'goal', side: att, t: 0, phase: 0, shooter: sh, ty: 0, tz: 0, player: e.player, data: {}, dur: 4 };
  const sgn = Math.sign(hash(ix * 13 + 7) - 0.5) || 1;
  if (e.type === 'goal') {
    sc.kind = 'goal'; sc.ty = MID_Y + sgn * (2.9 + hash(ix * 3) * 0.55); sc.tz = 0.35 + hash(ix * 9 + 2) * 1.85;
    if (w.script) { endScript(w, false); } w.queue = []; // gol corta qualquer outra encenação
  } else if (e.type === 'save') { sc.kind = 'save'; sc.ty = MID_Y + sgn * (0.6 + hash(ix * 3) * 1.8); sc.tz = 0.3 + hash(ix * 9 + 2) * 1.2; sc.dur = 3.2; }
  else if (e.type === 'miss') { sc.kind = 'miss'; const over = hash(ix * 3) > 0.5; sc.ty = over ? MID_Y + sgn * (GOAL_W / 2 - 1) : MID_Y + sgn * (GOAL_W / 2 + 1.5 + hash(ix) * 3); sc.tz = over ? GOAL_H + 0.7 + hash(ix * 9) * 2 : 0.5 + hash(ix * 9) * 1.4; sc.dur = 3; }
  else if (e.type === 'corner') { sc.kind = 'corner'; sc.ty = sgn > 0 ? 0.4 : W - 0.4; sc.dur = 3.4; }
  else if (e.type === 'foul' || e.type === 'yellow' || e.type === 'red') { sc.kind = 'foul'; sc.dur = 1.5; sc.data.card = e.type === 'yellow' ? 1 : e.type === 'red' ? 2 : 0; sc.shooter = 1 + Math.floor(hash(ix * 7) * 10); }
  else if (e.type === 'injury') { sc.kind = 'injury'; sc.dur = 2.6; sc.shooter = 1 + Math.floor(hash(ix * 7) * 10); }
  else return;
  if (w.script && e.type !== 'goal') { if (w.queue.length < 3) w.queue.push(sc); return; }
  beginScript(w, sc);
}

function beginScript(w: World, sc: Script) {
  w.script = sc;
  const b = w.ball;
  if (sc.kind === 'goal' || sc.kind === 'save' || sc.kind === 'miss') {
    const shooter = holderOf(w, sc.side, sc.shooter);
    const gx = goalXOf(sc.side, w.flip), sgn = sgnOf(sc.side, w.flip);
    const spot = { x: gx - sgn * (sc.kind === 'goal' ? 15 + hash(sc.shooter) * 3 : 13 + hash(sc.shooter * 3) * 6), y: clamp(shooter.y, 18, 50) };
    // chega à jogada: a bola vai ao atacante, que conduz até o ponto do chute
    b.mode = 'carried'; b.carrier = shooter.id; b.scored = null; b.inNet = null; b.crossed = false;
    const far = dist2(shooter.x, shooter.y, spot.x, spot.y);
    if (far > 11) { const k = 11 / far; shooter.x = spot.x + (shooter.x - spot.x) * k; shooter.y = spot.y + (shooter.y - spot.y) * k; shooter.vx = shooter.vy = 0; } // o ataque já vinha sendo construído: ele aparece perto do ponto do chute
    shooter.ov = { x: spot.x, y: spot.y, speed: 6.2, until: w.t + 3 };
    sc.data.sx = spot.x; sc.data.sy = spot.y;
    // o resto do time acompanha a jogada: atacantes chegam perto da área e defensores recuam (quem estava longe já vinha correndo: aparece a ~12 m do ponto)
    for (const a of w.agents) {
      if (a.id === shooter.id || a.idx === 0) continue;
      const att = a.side === sc.side;
      if (att ? a.idx < 5 : a.idx > 6) continue;
      const tx = att ? gx - sgn * (16 + (a.idx % 4) * 4) : gx - sgn * (7 + (a.idx % 3) * 3), ty = clamp(MID_Y + (((a.idx * 29) % 9) - 4) * 4, 8, 60);
      const dd = dist2(a.x, a.y, tx, ty);
      if (dd > 12) { const k = 12 / dd; a.x = tx + (a.x - tx) * k; a.y = ty + (a.y - ty) * k; a.vx = a.vy = 0; }
      a.ov = { x: tx, y: ty, speed: 6.5, until: w.t + 3 };
    }
  } else if (sc.kind === 'corner') {
    const gx = goalXOf(sc.side, w.flip), sgn = sgnOf(sc.side, w.flip);
    const taker = holderOf(w, sc.side, 7);
    taker.ov = { x: gx - sgn * 0.8, y: sc.ty, speed: 8, until: w.t + 2.5 };
    sc.shooter = 7;
    sc.data.cx = gx - sgn * 0.5;
    b.mode = 'free'; b.v = { x: 0, y: 0, z: 0 }; b.slideUntil = 0; b.p = { x: gx - sgn * 0.3, y: sc.ty, z: BALL_R }; b.carrier = -1;
  } else if (sc.kind === 'foul') {
    const who = holderOf(w, sc.side, sc.shooter);
    for (const a of w.agents) { a.ov = { x: a.x, y: a.y, speed: 1, until: w.t + 1.4 }; }
    const bp = w.flow.st.ball; const spot = toWorld(bp, w.flip);
    b.mode = 'free'; b.v = { x: 0, y: 0, z: 0 }; b.p = { x: spot.x, y: spot.y, z: BALL_R }; b.carrier = -1;
    if (sc.data.card) w.card = { agent: who.id, kind: sc.data.card === 2 ? 'red' : 'yellow', until: w.t + 1.6 };
  } else if (sc.kind === 'injury') {
    holderOf(w, sc.side, sc.shooter).state = 'down';
  }
}

function endScript(w: World, restart: boolean) {
  const sc = w.script;
  w.script = null;
  for (const a of w.agents) { if (a.state !== 'play') a.state = 'play'; a.ov = undefined; }
  if (sc && restart) {
    if (sc.kind === 'goal') { w.goals[sc.side]++; placeFormation(w, playState([], 0, 0), 0); ballToCenter(w); w.flow.carrier = -1; }
    else if (sc.kind === 'miss') { ballToCenter(w); }
  }
  w.ball.scored = null; w.ball.inNet = null; w.ball.crossed = false;
  const next = w.queue.shift();
  if (next) beginScript(w, next);
}

const SHOT_V = 26;
function stepScript(w: World, dt: number) {
  const sc = w.script; if (!sc) return;
  sc.t += dt;
  const gx = goalXOf(sc.side, w.flip), sgn = sgnOf(sc.side, w.flip), b = w.ball;
  const keeper = holderOf(w, sc.side === 'home' ? 'away' : 'home', 0);
  const shooter = holderOf(w, sc.side, sc.shooter);
  if (sc.kind === 'goal' || sc.kind === 'save' || sc.kind === 'miss') {
    if (sc.phase === 0) {
      const arrived = dist2(shooter.x, shooter.y, sc.data.sx, sc.data.sy) < 1.2;
      if (arrived || sc.t > 2.2) {
        sc.phase = 1; sc.data.shot = sc.t;
        const to: V3 = { x: gx + sgn * 0.7, y: sc.ty, z: sc.tz };
        const d = Math.hypot(to.x - b.p.x, to.y - b.p.y);
        const T = clamp(d / SHOT_V, 0.35, 1.1);
        // o goleiro se joga: no gol ele chega tarde/errado; na defesa chega na bola
        if (sc.kind === 'save') keeper.ov = { x: gx - sgn * 0.8, y: sc.ty, speed: 9, until: w.t + 2 }; else keeper.ov = { x: gx - sgn * 0.8, y: MID_Y + (sc.ty > MID_Y ? 1 : -1) * 1.3, speed: 4.2, until: w.t + 2 };
        keeper.state = 'dive'; keeper.hopV = 4;
        b.mode = 'carried'; kickTo(w, to, T);
        sc.data.T = T;
      }
    } else if (sc.phase === 1) {
      if (sc.kind === 'goal' && b.scored) { // gol: comemoração
        sc.phase = 2; sc.data.ce = sc.t;
        keeper.state = 'play';
        const corner = { x: gx - sgn * 9, y: 12 }; // corre para a bandeirinha do lado da câmera (aparece grande na tela)
        shooter.state = 'celebrate'; shooter.ov = { x: corner.x, y: corner.y, speed: 8.8, until: w.t + 3.8 };
        const mates = w.agents.filter((a) => a.side === sc.side && a.idx > 0 && a.id !== shooter.id).sort((a, c) => dist2(a.x, a.y, corner.x, corner.y) - dist2(c.x, c.y, corner.x, corner.y)).slice(0, 5);
        mates.forEach((m, i) => { m.state = 'celebrate'; const ang = (i / 5) * Math.PI * 2; m.ov = { x: corner.x + Math.cos(ang) * 3.4, y: corner.y + Math.sin(ang) * 3.4, speed: 8.6, until: w.t + 3.8 }; });
        w.banner = { text: 'GOOOL!', sub: sc.player ?? '', t0: w.t };
        for (let i = 0; i < 70; i++) w.confetti.push({ x: corner.x, y: corner.y, z: 2 + hash(i) * 2, vx: (hash(i * 3 + 1) - 0.5) * 9, vy: (hash(i * 5 + 2) - 0.5) * 9, vz: 4 + hash(i * 7 + 3) * 7, c: ['#ffd23f', '#ff4d6d', '#4dd2ff', '#7dff6b', '#ffffff'][i % 5], life: 3 });
        netImpact(w.nets[sgn === 1 ? 1 : 0], b.p.y, b.p.z, 6);
      } else if (sc.t - sc.data.shot > 2.2 && sc.kind === 'goal') { // o motor disse gol: se a física não colocou, assume a bola para dentro da rede
        sc.data.shot = -99; b.p = { x: gx + sgn * 1.2, y: sc.ty, z: 0.6 }; b.v = { x: sgn * 3, y: 0, z: 0 }; b.scored = sc.side;
      } else if (sc.kind === 'save') {
        const T = sc.data.T, near = dist2(b.p.x, b.p.y, keeper.x, keeper.y) < 1.8 && b.p.z < 2.6;
        if ((sc.t - sc.data.shot >= T - 0.04 || near) && b.mode === 'free') { sc.phase = 2; sc.data.ce = sc.t; b.mode = 'carried'; b.carrier = keeper.id; keeper.state = 'play'; }
      } else if (sc.kind === 'miss' && sc.t - sc.data.shot > 1.8) { sc.phase = 2; sc.data.ce = sc.t; }
    } else if (sc.phase === 2) {
      const el = sc.t - sc.data.ce;
      if (sc.kind === 'save' && el > 0.7 && b.mode === 'carried') { const to = { x: gx - sgn * 34, y: 10 + hash(sc.shooter * 9) * 46, z: BALL_R }; kickTo(w, to, 1.6); sc.phase = 3; }
      else if (sc.kind === 'goal' && el > 3.8) endScript(w, true);
      else if (sc.kind === 'miss' && el > 0.4) endScript(w, true);
      else if (sc.kind === 'save' && el > 2) endScript(w, false);
    } else if (sc.phase === 3 && sc.t > sc.dur + 1.4) endScript(w, false);
  } else if (sc.kind === 'corner') {
    if (sc.phase === 0) {
      // jogadores entram na área
      for (const a of w.agents) {
        if (a.idx === 0 && a.side === sc.side) continue;
        const att = a.side === sc.side, ix = a.idx;
        if (att && ix >= 7 || (!att && ix >= 1 && ix <= 5)) a.ov = { x: gx - sgn * (6 + (ix % 4) * 2.2), y: MID_Y + (((ix * 37) % 9) - 4) * 1.5, speed: 6, until: w.t + 3 };
      }
      if (dist2(shooter.x, shooter.y, sc.data.cx, sc.ty) < 1.2 || sc.t > 1.6) { sc.phase = 1; sc.data.shot = sc.t; kickTo(w, { x: gx - sgn * 7.5, y: MID_Y + (hash(sc.shooter) - 0.5) * 6, z: 1.6 }, 1.25); }
    } else if (sc.phase === 1 && sc.t - sc.data.shot > 1.6) endScript(w, false);
  } else if (sc.kind === 'foul' || sc.kind === 'injury') { if (sc.t > sc.dur) endScript(w, false); }
  if (sc.t > 9) endScript(w, sc.kind === 'goal'); // trava de segurança: nunca deixa uma encenação presa
}

/* ------------------------------ passo geral ------------------------------ */

const SUB = 1 / 90;
export function stepWorld(w: World, dtTotal: number) {
  let left = Math.min(dtTotal, 1.0);
  while (left > 1e-6) {
    const dt = Math.min(SUB, left); left -= dt;
    w.t += dt;
    for (const a of w.agents) stepAgent(w, a, dt);
    separate(w);
    for (let k = 0; k < 3; k++) stepBall(w, dt / 3); // passos finos: o chute não atravessa a trave
    receive(w);
    stepScript(w, dt);
    for (const n of w.nets) stepNet(n, dt);
  }
  w.confetti = w.confetti.map((p) => ({ ...p, x: p.x + p.vx * dtTotal, y: p.y + p.vy * dtTotal, z: Math.max(0, p.z + p.vz * dtTotal), vz: p.vz - 9 * dtTotal, vx: p.vx * 0.99, vy: p.vy * 0.99, life: p.life - dtTotal })).filter((p) => p.life > 0);
  if (w.card && w.card.until < w.t) w.card = null;
  if (w.banner && w.t - w.banner.t0 > 3.4) w.banner = null;
  // câmera segue a bola (suave), sem sair do campo
  const target = clamp(w.ball.p.x, 16, L - 15);
  w.camX += (target - w.camX) * Math.min(1, 3.2 * dtTotal);
}

/** Quando o tempo pula (pular partida, pênaltis): encerra roteiros e põe todos no lugar. */
export function snapWorld(w: World, st: PlayState, tick: number) {
  w.script = null; w.queue = []; w.banner = null; w.card = null; w.confetti = [];
  for (const n of w.nets) { n.d.fill(0); n.dv.fill(0); }
  placeFormation(w, st, tick); ballToCenter(w);
  w.flow = { st, tick, carrier: -1, side: 'none' };
  syncFlow(w, st, tick);
}

/* ------------------------------ ligação com o relógio da partida ------------------------------ */

export interface Driver { idx: number; lastMinute: number; lastTick: number }
export const createDriver = (): Driver => ({ idx: 0, lastMinute: 0, lastTick: -1 });
/** A partir deste minuto (2º tempo) os times jogam com os lados trocados. */
export const SECOND_HALF = 45.5;
const SCRIPTED = new Set(['goal', 'save', 'miss', 'corner', 'foul', 'yellow', 'red', 'injury']);

/**
 * Acompanha o relógio: cada lance da narração que o minuto alcança vira uma encenação; a cada meio minuto o fluxo do jogo se
 * reorganiza. Se o tempo pula (pular partida), a encenação é encerrada e tudo volta ao lugar.
 */
export function drive(w: World, drv: Driver, events: MatchEvent[], minute: number) {
  const tick = Math.floor(minute * 2), mi = Math.floor(minute);
  const flip = minute >= SECOND_HALF;
  if (flip !== w.flip) { w.flip = flip; snapWorld(w, playState(events, mi, tick), tick); drv.idx = events.filter((e) => e.minute <= minute).length; drv.lastTick = tick; drv.lastMinute = minute; return; } // intervalo: os times trocam de lado e todos voltam aos seus lugares
  if (minute < drv.lastMinute - 0.01 || minute - drv.lastMinute > 6) {
    drv.idx = events.filter((e) => e.minute <= minute).length;
    snapWorld(w, playState(events, mi, tick), tick);
    drv.lastTick = tick; drv.lastMinute = minute;
    return;
  }
  while (drv.idx < events.length && events[drv.idx].minute <= minute) { const e = events[drv.idx]; if (SCRIPTED.has(e.type)) triggerEvent(w, e, drv.idx); drv.idx++; }
  if (tick !== drv.lastTick) { syncFlow(w, playState(events, mi, tick), tick); drv.lastTick = tick; }
  drv.lastMinute = minute;
}
