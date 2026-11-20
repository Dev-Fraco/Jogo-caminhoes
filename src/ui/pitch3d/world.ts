import type { FormationId, MatchEvent, Position } from '../../engine/types';
import { onField } from '../../engine/plays';
import { stepCeremony } from './ceremony';
import { giveBall, kickoffFor, newBrain, thinkPlay } from './play';
import type { Cue, WhistleKind } from '../../audio/cues';
import { ACT, strikeDelay, type Act, type ActKind } from './anim';
import type { VarCamId } from './camera';
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
export const SX = L / PITCH_W, SY = W / PITCH_H;

export interface V3 { x: number; y: number; z: number }
export type Mode = 'carried' | 'free';
export interface Ball { p: V3; v: V3; mode: Mode; carrier: number; spin: number; /** sem atrito até este instante (passe rasteiro) */ slideUntil: number; scored: Side | null; /** efeito de curva do chute (m/s², + para a esquerda de quem olha o gol) */ curve?: number; /** último time que tocou na bola (para lateral, tiro de meta e escanteio) */ lastSide?: Side; inNet: Side | null; /** já cruzou a linha de gol (valendo ou não): só a 1ª travessia decide se é gol */ crossed: boolean }
export type AgentState = 'play' | 'dive' | 'celebrate' | 'down' | 'hold';
export interface Agent {
  id: number; side: Side; idx: number; gk: boolean;
  x: number; y: number; vx: number; vy: number; heading: number; gait: number; hop: number; hopV: number;
  tx: number; ty: number; state: AgentState;
  /** olha para esta direção quando está parado (cerimônia: de frente para a câmera) */
  face?: number;
  /** destino imposto por um roteiro (vale até `until`) e limite de velocidade */
  ov?: { x: number; y: number; speed: number; until: number };
  /** ação em curso (chute, passe, carrinho...): é o que o desenhista anima */
  act?: Act;
  /** árbitros: 'ref' (principal), 'ar1' e 'ar2' (assistentes) */
  role?: 'ref' | 'ar1' | 'ar2';
  /** expulso: 'walking' sai do campo, 'gone' já saiu (não joga mais) */
  off?: 'walking' | 'gone';
}
export interface Net { w: number; h: number; d: number[]; dv: number[] }
export interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; c: string; life: number }
export interface Banner { text: string; sub: string; t0: number }
export interface Card { agent: number; kind: 'yellow' | 'red'; until: number }
export type ScriptKind = 'goal' | 'save' | 'miss' | 'corner' | 'foul' | 'injury' | 'offside' | 'goalkick' | 'throw';
export interface Script { kind: ScriptKind; side: Side; t: number; phase: number; shooter: number; ty: number; tz: number; player?: string; data: Record<string, number>; dur: number; /** falta perto do gol (ou pênalti): a cobrança É a finalização que o motor registrou logo em seguida */ then?: Script }
/* ------------------------------ VAR ------------------------------ */
export type VarKind = 'goal' | 'goal-offside' | 'goal-foul' | 'pen' | 'pen-cancel' | 'red-downgrade' | 'id-fix';
interface SnapAgent { x: number; y: number; vx: number; vy: number; heading: number; hop: number; state: AgentState; act?: Act; off?: Agent['off'] }
/** Um quadro gravado do jogo (30 por segundo): a repetição do VAR reproduz estes quadros, o lance real. */
export interface Frame { t: number; ball: { x: number; y: number; z: number; vx: number; vy: number; vz: number }; agents: SnapAgent[]; nets: [number[], number[]] }
export interface VarState {
  stage: 'check' | 'review' | 'decision';
  kind: VarKind;
  /** a decisão desfaz o lance (gol anulado, sem pênalti, cartão trocado) */
  annul: boolean;
  /** tem repetição (revisões que mudam algo); a simples checagem de um gol que vale não tem */
  review: boolean;
  text: string; decision: string;
  clock: number;
  frames: Frame[]; rt: number;
  camList: VarCamId[]; camIdx: number; camOverride: VarCamId | null;
  /** linhas do impedimento: do último defensor e do atacante (x em metros) */
  line?: { def: number; att: number };
  /** quem a câmera acompanha na repetição: a bola ou um jogador (id do agente) */
  focus: 'ball' | number;
  camX: number; jumped: boolean; skip: boolean; reacted?: boolean;
  onDone: () => void;
}

export interface World {
  t: number; ball: Ball; agents: Agent[]; nets: [Net, Net]; script: Script | null; queue: Script[];
  banner: Banner | null; card: Card | null; confetti: Particle[]; camX: number;
  flow: { st: PlayState; tick: number; carrier: number; side: Side | 'none' };
  formations: { home: FormationId; away: FormationId };
  goals: { home: number; away: number };
  /** segundo tempo: os times trocaram de lado (o mandante defende o gol da direita) */
  flip: boolean;
  /** quem joga em cada posição do time (id do jogador), tirado da escalação do motor; vazio = só as posições */
  roster: { home: string[]; away: string[] };
  posOf?: (id: string) => Position | undefined;
  /** a bola sai no instante do contato do pé (e não no começo do movimento) */
  /** equipe de arbitragem: árbitro principal e os dois assistentes (bandeirinhas) */
  refs: Agent[];
  /** lances do motor já encenados junto com outro (cartão da falta, cobrança de falta/pênalti) */
  skip: Set<number>;
  /** quantos apitos o árbitro deu (o áudio acompanha) */
  whistles: number;
  /** largura (m) que a câmera mostra: fecha um pouco perto do gol */
  span: number;
  /** sons a tocar (chute, trave, rede, apito, torcida): quem desenha/ouve esvazia a fila a cada quadro */
  cues: Cue[];
  /** gravação dos últimos segundos e revisão do VAR em andamento (o jogo fica parado enquanto houver revisão) */
  rec: Frame[]; recAcc: number; var: VarState | null; view?: World;
  kickQ: { at: number; to: V3; T: number; ground: boolean; curve: number; target?: number; side?: Side } | null;
  /** cerimônia de entrada e hino antes do apito inicial (o relógio fica parado) */
  ceremony: import('./ceremony').Ceremony | null;
  /** o cérebro do jogo corrido (passes, marcação, desarmes...) */
  brain: import('./play').Brain;
}

export const hash = (n: number) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 8) / 0xffffff; };
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const dist2 = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
/** Direção de ataque (+1 = para o gol da direita). No 2º tempo (`flip`) os times trocam de lado. */
export const sgnOf = (side: Side, flip = false) => ((side === 'home') !== flip ? 1 : -1);
/** x da linha de gol que o time ataca (mandante ataca a direita). */
export const goalXOf = (attacker: Side, flip = false) => ((attacker === 'home') !== flip ? L : 0);
/** Ponto do campo lógico (100 x 64, mandante ataca à direita) para metros; no 2º tempo (`flip`) o campo todo é espelhado. */
export const toWorld = (p: Pt, flip = false): { x: number; y: number } => (flip ? { x: L - p.x * SX, y: W - p.y * SY } : { x: p.x * SX, y: p.y * SY });

export const newNet = (): Net => ({ w: 9, h: 5, d: new Array(45).fill(0), dv: new Array(45).fill(0) });

export function createWorld(homeFormation: FormationId = '4-4-2', awayFormation: FormationId = '4-4-2'): World {
  const agents: Agent[] = [];
  for (const side of ['home', 'away'] as const) for (let i = 0; i < 11; i++) agents.push({ id: agents.length, side, idx: i, gk: i === 0, x: CENTER.x, y: CENTER.y, vx: 0, vy: 0, heading: side === 'home' ? 0 : Math.PI, gait: i * 0.7, hop: 0, hopV: 0, tx: CENTER.x, ty: CENTER.y, state: 'play' });
  const w: World = {
    t: 0, ball: { p: { x: CENTER.x, y: CENTER.y, z: BALL_R }, v: { x: 0, y: 0, z: 0 }, mode: 'free', carrier: -1, spin: 0, slideUntil: 0, scored: null, inNet: null, crossed: false },
    agents, nets: [newNet(), newNet()], script: null, queue: [], banner: null, card: null, confetti: [], camX: CENTER.x,
    flow: { st: playState([], 0, 0), tick: -1, carrier: -1, side: 'none' }, formations: { home: homeFormation, away: awayFormation }, goals: { home: 0, away: 0 }, flip: false, roster: { home: [], away: [] }, kickQ: null, ceremony: null, brain: newBrain(), refs: [], skip: new Set<number>(), whistles: 0, span: SPAN_PLAY, cues: [], rec: [], recAcc: 0, var: null,
  };
  for (const role of ['ref', 'ar1', 'ar2'] as const) w.refs.push({ id: 22 + w.refs.length, side: 'home', idx: 0, gk: false, x: role === 'ref' ? CENTER.x - 6 : role === 'ar1' ? L * 0.3 : L * 0.7, y: role === 'ref' ? MID_Y + 9 : role === 'ar1' ? -1.4 : W + 1.4, vx: 0, vy: 0, heading: 0, gait: 0, hop: 0, hopV: 0, tx: 0, ty: 0, state: 'play', role });
  placeFormation(w, playState([], 0, 0), 0);
  kickoffFor(w, 'home');
  return w;
}

/** Onde cada jogador fica no apito inicial (metros). */
export function kickoffTargets(w: World): { x: number; y: number }[] {
  const st = playState([], 0, 0);
  const hp = positionsOf('home', w.formations.home, st, 0).map((p) => toWorld(p, w.flip)), ap = positionsOf('away', w.formations.away, st, 0).map((p) => toWorld(p, w.flip));
  return w.agents.map((a) => (a.side === 'home' ? hp : ap)[a.idx]);
}

/** Coloca todos nos lugares da formação (sem correr): início, intervalo e saltos no tempo. */
export function placeFormation(w: World, st: PlayState, tick: number) {
  const hp = positionsOf('home', w.formations.home, st, tick).map((p) => toWorld(p, w.flip)), ap = positionsOf('away', w.formations.away, st, tick).map((p) => toWorld(p, w.flip));
  w.agents.forEach((a) => { if (a.off) return; const p = (a.side === 'home' ? hp : ap)[a.idx]; a.x = a.tx = p.x; a.y = a.ty = p.y; a.vx = a.vy = 0; a.state = 'play'; a.ov = undefined; a.hop = 0; a.hopV = 0; });
}

/** Pega a bola ao centro (saída de bola). */
export function ballToCenter(w: World) { Object.assign(w.ball, { p: { x: CENTER.x, y: CENTER.y, z: BALL_R }, v: { x: 0, y: 0, z: 0 }, mode: 'free' as Mode, carrier: -1, scored: null, inNet: null, slideUntil: 0, crossed: false }); }

/* ------------------------------ física da bola ------------------------------ */

/** Velocidade inicial para a bola sair de `from` e chegar em `to` depois de `T` segundos (parábola, sem resistência). */
export function ballistic(from: V3, to: V3, T: number): V3 {
  return { x: (to.x - from.x) / T, y: (to.y - from.y) / T, z: (to.z - from.z + 0.5 * G * T * T) / T };
}
/** Chuta: a bola vira livre e sai com a velocidade que a leva ao ponto no tempo dado. `ground` = passe rasteiro (rola sem atrito até chegar). */
export function kickTo(w: World, to: V3, T: number, ground = false, curveM = 0) {
  const b = w.ball;
  const prevHolder = w.agents[b.carrier]; if (prevHolder) b.lastSide = prevHolder.side;
  w.cues.length < 60 && w.cues.push({ k: 'kick', p: 0 }); const kickCue = w.cues[w.cues.length - 1] as { k: 'kick'; p: number };
  // chute com efeito: a bola sai desviada para o lado e a curva a traz de volta ao ponto (desvio máximo de `curveM` metros no meio do caminho)
  const dx = to.x - b.p.x, dy = to.y - b.p.y, dl = Math.hypot(dx, dy) || 1, px = -dy / dl, py = dx / dl;
  const aim = ground || !curveM ? to : { x: to.x - px * curveM, y: to.y - py * curveM, z: to.z };
  const v = ground ? { x: (to.x - b.p.x) / T, y: (to.y - b.p.y) / T, z: 0 } : ballistic(b.p, aim, T);
  b.v = v; b.mode = 'free'; b.carrier = -1; b.slideUntil = ground ? w.t + T : 0;
  if (kickCue?.k === 'kick') kickCue.p = Math.hypot(v.x, v.y, v.z);
  b.curve = ground || !curveM ? 0 : (2 * curveM) / (T * T);
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
  if (air && b.curve) { const hs = Math.hypot(v.x, v.y); if (hs > 1) { v.x += (-v.y / hs) * b.curve * dt; v.y += (v.x / hs) * b.curve * dt; } } // efeito de curva (Magnus): empurra para o lado da direção
  const drag = air ? 0.03 : (w.t < b.slideUntil ? 0 : 0.55);
  const k = Math.max(0, 1 - drag * dt);
  v.x *= k; v.y *= k;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
  if (p.z < BALL_R) { // chão: quique e rolamento
    p.z = BALL_R; if (b.curve && v.z < -0.8) b.curve = 0; // quicou: perde o efeito
    if (v.z < -0.8) { v.z = -v.z * 0.58; v.x *= 0.94; v.y *= 0.94; } else v.z = 0;
    if (w.t >= b.slideUntil) { const sp = Math.hypot(v.x, v.y); if (sp > 0) { const f = Math.max(0, sp - (1.6 + 0.25 * sp) * dt) / sp; v.x *= f; v.y *= f; } }
  }
  b.spin += (Math.hypot(v.x, v.y) * dt) / BALL_R;

  // jogadores: a bola quica e desvia neles (só no jogo corrido; nas encenações dos lances ninguém atrapalha)
  if (!w.script && b.mode === 'free') {
    const tgt = (b as Ball & { target?: number }).target;
    for (const a of w.agents) {
      if (a.id === tgt || a.state === 'down') continue;
      const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy), R = 0.5 + BALL_R;
      if (d < R && p.z < 2.0 && d > 1e-6) {
        const nx = dx / d, ny = dy / d, vn = v.x * nx + v.y * ny;
        if (vn < 0) { v.x -= (1 + 0.35) * vn * nx; v.y -= (1 + 0.35) * vn * ny; v.x *= 0.8; v.y *= 0.8; b.curve = 0; }
        p.x = a.x + nx * R; p.y = a.y + ny * R; // nunca fica dentro do jogador
      }
    }
  }
  // traves e travessão (rebote com perda de energia)
  const bounce = (nx: number, ny: number, nz: number, e: number) => { const vn = v.x * nx + v.y * ny + v.z * nz; if (vn < 0) { if (-vn > 3 && e >= 0.5) cue(w, { k: 'post' }); v.x -= (1 + e) * vn * nx; v.y -= (1 + e) * vn * ny; v.z -= (1 + e) * vn * nz; } };
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
    if (inMouth(p.y) && p.z + BALL_R * 0.5 < GOAL_H) { if (!b.scored) cue(w, { k: 'net', p: Math.hypot(v.x, v.y) }); /* a bola passou da linha: o som da rede */ b.scored = (dir === 1) !== w.flip ? 'home' : 'away'; }
  }
  if (depth < -3) b.crossed = false;
  if (b.scored && depth > 0) {
    b.inNet = b.scored;
    const net = w.nets[dir === 1 ? 1 : 0];
    const hit = (s: number, y: number, z: number) => { if (s > 1.2) { netImpact(net, y, z, Math.min(7, s * 0.9)); cue(w, { k: 'net', p: s }); } };
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
  if (a.off === 'gone') { a.vx = a.vy = 0; return; }
  if (a.state === 'down') { a.vx *= 0.8; a.vy *= 0.8; return; }
  const ov = a.ov && a.ov.until > w.t ? a.ov : undefined;
  if (a.ov && !ov) a.ov = undefined;
  let tx = ov ? ov.x : a.tx, ty = ov ? ov.y : a.ty;
  const ext = w.ceremony ? 14 : a.role || a.off ? 6 : 0; // árbitros, expulsos e a cerimônia (entrada pelo túnel) podem ir além das linhas
  const m = ext || -0.5;
  tx = clamp(tx, -m + 0.5, L + m - 0.5); ty = clamp(ty, -m + 0.5, W + m - 0.5);
  const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
  const vmax = ov ? ov.speed : a.role ? 6.2 : (a.gk ? GK_RUN : RUN);
  const want = a.state === 'hold' ? 0 : Math.min(vmax, d * 2.6, d > 14 ? vmax : Math.max(WALK, d * 1.9)); // chega freando
  const wvx = d > 0.05 ? (dx / d) * want : 0, wvy = d > 0.05 ? (dy / d) * want : 0;
  let ax = wvx - a.vx, ay = wvy - a.vy; const am = Math.hypot(ax, ay), lim = ACC * dt;
  if (am > lim) { ax = (ax / am) * lim; ay = (ay / am) * lim; }
  a.vx += ax; a.vy += ay;
  const bm = ext; // limites do campo (árbitros e expulsos andam por fora)
  a.x = clamp(a.x + a.vx * dt, 0.3 - bm, L - 0.3 + bm); a.y = clamp(a.y + a.vy * dt, 0.3 - bm, W - 0.3 + bm);
  if (a.off === 'walking' && (a.y < -1.2 || a.y > W + 1.2)) a.off = 'gone'; // saiu pela lateral
  const sp = Math.hypot(a.vx, a.vy);
  if (sp > 0.5 && a.state !== 'dive') { let dh = Math.atan2(a.vy, a.vx) - a.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; a.heading += dh * Math.min(1, 9 * dt); }
  if (a.face !== undefined && sp < 0.6) { let df = a.face - a.heading; while (df > Math.PI) df -= 2 * Math.PI; while (df < -Math.PI) df += 2 * Math.PI; a.heading += df * Math.min(1, 4 * dt); } // parado: vira para onde deve olhar
  a.gait += sp * dt * 1.4;
  // pulinho (corrida e comemoração)
  a.hopV -= 22 * dt; a.hop += a.hopV * dt;
  if (a.hop <= 0) { a.hop = 0; a.hopV = a.state === 'celebrate' ? 5.4 : sp > 1 ? 0 : 0; }
}

/** Repele jogadores muito próximos (não ficam um dentro do outro). */
function separate(w: World) {
  const A = w.agents;
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    if (A[i].off === 'gone' || A[j].off === 'gone') continue;
    let dx = A[j].x - A[i].x, dy = A[j].y - A[i].y, d = Math.hypot(dx, dy); const min = 2.2;
    if (d < 1e-4) { dx = Math.cos(i * 2.4 + j); dy = Math.sin(i * 2.4 + j); d = 1; } // exatamente no mesmo ponto: separa por uma direção fixa
    if (d < min) { const push = Math.min((min - d) / 2, 0.025), nx = dx / d, ny = dy / d; A[i].x -= nx * push; A[i].y -= ny * push; A[j].x += nx * push; A[j].y += ny * push; }
  }
}

/* ------------------------------ arbitragem ------------------------------ */

/** Quem apita é sempre o árbitro principal; os assistentes ficam nas laterais, cada um numa metade do campo. */
function stepOfficials(w: World, dt: number) {
  const b = w.ball.p, dirAttack = w.flow.st.possession === 'none' ? 0 : sgnOf(w.flow.st.possession as Side, w.flip);
  const [ref, ar1, ar2] = w.refs;
  if (!ref) return;
  if (!ref.ov) { ref.tx = clamp(b.x - dirAttack * 7, 6, L - 6); ref.ty = clamp(b.y > MID_Y ? b.y - 10 : b.y + 10, 5, W - 5); } // na diagonal, atrás da jogada e do lado oposto
  if (!ar1.ov) { ar1.tx = clamp(b.x, 2, L / 2 + 10); ar1.ty = -1.4; }
  if (!ar2.ov) { ar2.tx = clamp(b.x, L / 2 - 10, L - 2); ar2.ty = W + 1.4; }
  for (const r of w.refs) { stepAgent(w, r, dt); if (r.role !== 'ref') r.heading = Math.abs(r.vx) > 0.4 ? (r.vx > 0 ? 0 : Math.PI) : (r.y < MID_Y ? Math.PI / 2 : -Math.PI / 2); }
}
const cue = (w: World, c: Cue) => { if (w.cues.length < 60) w.cues.push(c); };
const whistle = (w: World, kind: WhistleKind = 'foul') => { w.refs[0].act = { kind: 'ref_whistle', t0: w.t, dur: ACT.ref_whistle.dur, dir: 1 }; w.whistles++; cue(w, { k: 'whistle', v: kind }); };
/** O assistente que cuida da metade do campo onde está a bola. */
const arFor = (w: World, x: number) => (x < L / 2 ? w.refs[1] : w.refs[2]);

/* ------------------------------ fluxo normal (sem lance) ------------------------------ */

export const holderOf = (w: World, side: Side, idx: number) => w.agents[(side === 'home' ? 0 : 11) + idx];

/** Inicia uma ação no atleta (o desenhista anima a partir de `act`). */
export function startAct(w: World, a: Agent, kind: ActKind, dir = 1, dur?: number) { a.act = { kind, t0: w.t, dur: dur ?? ACT[kind].dur, dir }; }
/** Agenda o chute para o instante do contato do pé com a bola. */
export function scheduleKick(w: World, delay: number, to: V3, T: number, ground: boolean, curve = 0, target?: number, side?: Side) { w.kickQ = { at: w.t + delay, to, T, ground, curve, target, side }; }

/** Posição (0 a 10) de um jogador na formação do time, pelo id; -1 se não estiver em campo ou se a escalação não é conhecida. */
export function slotOf(w: World, side: Side, pid?: string): number { return pid ? w.roster[side].indexOf(pid) : -1; }
/** Escalação (ids) -> posições da formação: goleiro, defensores, meias e atacantes, na ordem em que o time se desenha. */
export function slotsFrom(ids: string[], posOf: (id: string) => Position | undefined): string[] {
  const out: string[] = [];
  for (const pos of ['GK', 'DEF', 'MID', 'ATT'] as Position[]) for (const id of ids) if (posOf(id) === pos) out.push(id);
  return out.length === ids.length ? out : ids.slice();
}
/** Atualiza quem joga em cada posição conforme os lances até `upTo` (início, lesões com substituição, mudanças táticas, expulsões). */
export function syncRoster(w: World, events: MatchEvent[], upTo: number, markGone = false) {
  if (!w.posOf || !events.some((e) => e.type === 'kickoff' && e.lineups)) return;
  const f = onField(events, upTo, true); // expulsos continuam na posição (o time joga com um a menos), só deixam de aparecer
  w.roster = { home: slotsFrom(f.home, w.posOf), away: slotsFrom(f.away, w.posOf) };
  if (markGone) { // salto no tempo: quem já foi expulso não está em campo
    for (const a of w.agents) a.off = undefined;
    for (let i = 0; i < upTo && i < events.length; i++) { const e = events[i]; if (e.type === 'red' && e.pid && e.side !== 'none') { const k = slotOf(w, e.side, e.pid); if (k >= 0) holderOf(w, e.side, k).off = 'gone'; } }
  }
}

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
      const passer = w.agents[b.carrier];
      const kind: ActKind = d > 34 ? 'long_pass' : T < 0.6 ? 'pass_first' : 'pass';
      if (passer && !w.kickQ) { startAct(w, passer, kind, hash(passer.id * 5 + Math.floor(w.t)) > 0.3 ? 1 : -1); scheduleKick(w, strikeDelay(kind), lead, T, d < 38, d > 22 ? (hash(passer.id + Math.floor(w.t * 3)) - 0.5) * 3 : 0, to.id); }
      else if (!passer) { b.mode = 'free'; kickTo(w, lead, T, d < 38); (b as Ball & { target?: number }).target = to.id; }
      w.flow.carrier = to.id;
    } else { b.mode = 'carried'; b.carrier = to.id; }
  }
}

/** A bola que viajou num passe é recebida por quem era o destino quando chega perto. */
export function receive(w: World) {
  const b = w.ball as Ball & { target?: number };
  if (b.mode !== 'free' || w.script || b.target === undefined) return;
  const a = w.agents[b.target];
  if (a && dist2(b.p.x, b.p.y, a.x, a.y) < 1.4 && b.p.z < 1.2) giveBall(w, a);
  else if (Math.hypot(b.v.x, b.v.y) < 0.4 && b.p.z <= BALL_R + 0.01 && a) { /* parou antes: o jogador vai buscar */ a.tx = b.p.x; a.ty = b.p.y; if (dist2(b.p.x, b.p.y, a.x, a.y) < 2.2) { b.mode = 'carried'; b.carrier = a.id; b.target = undefined; } }
}

/* ------------------------------ roteiros dos lances ------------------------------ */

const FORWARDS = [8, 9, 10, 7];
/** Começa a encenação de um lance da narração. Gols interrompem tudo; os outros esperam o roteiro em curso. */
export interface TriggerCtx {
  /** o cartão que o motor registrou logo depois desta falta (1 amarelo, 2 vermelho) */
  card?: 1 | 2;
  /** a finalização que o motor registrou logo depois (cobrança de falta perto do gol ou pênalti) */
  follow?: { e: MatchEvent; ix: number };
  /** vantagem: o time que sofreu a falta ataca em seguida e o árbitro deixa o jogo seguir */
  adv?: boolean;
  /** VAR: gol que vai ser anulado (e quem causou), pênalti que vai ser cancelado, revisão de cartão */
  varKind?: 'goal-offside' | 'goal-foul'; varTarget?: string;
  cancel?: boolean;
  cardPid?: string; varCard?: 'red-downgrade' | 'id-fix';
}
/** A partida fica com o relógio parado enquanto um lance é encenado (gol, falta, escanteio...), durante o VAR e enquanto há lances esperando a vez: nenhum lance se perde nem se atropela. */
export const isHolding = (w: World): boolean => !!w.script || !!w.var || w.queue.length > 0 || !!w.ceremony;

/** Monta (e, se não for "dry", começa) a encenação de um lance da narração. Gols interrompem tudo; os outros esperam o roteiro em curso. */
export function triggerEvent(w: World, e: MatchEvent, ix: number, ctx: TriggerCtx = {}, dry = false): Script | undefined {
  const side: Side = e.side === 'none' ? 'home' : e.side;
  const att: Side = side; // lado do time do lance
  const real = slotOf(w, side, e.pid), sh = real > 0 ? real : FORWARDS[Math.floor(hash(ix * 5 + 1) * FORWARDS.length)]; // quem fez o lance é o jogador do motor (se a escalação é conhecida)
  const sc: Script = { kind: 'goal', side: att, t: 0, phase: 0, shooter: sh, ty: 0, tz: 0, player: e.player, data: {}, dur: 4 };
  const sgn = Math.sign(hash(ix * 13 + 7) - 0.5) || 1;
  if (e.type === 'goal') {
    sc.data.header = e.how === 'header' ? 1 : 0; sc.data.pen = e.pen ? 1 : 0; sc.data.varKind = ctx.varKind === 'goal-offside' ? 1 : ctx.varKind === 'goal-foul' ? 2 : 0;
    const vt = slotOf(w, side, ctx.varTarget); sc.data.varTarget = vt > 0 ? vt : 0;
    sc.kind = 'goal'; sc.ty = MID_Y + sgn * (2.9 + hash(ix * 3) * 0.55); sc.tz = 0.35 + hash(ix * 9 + 2) * 1.85;
    if (!dry) {
      if ((w.script?.kind === 'goal' || w.var) && !(w.script?.kind === 'foul')) { w.queue.push(sc); return sc; } // outro gol na mesma hora: espera a vez (cada gol é mostrado inteiro, com VAR e comemoração)
      if (w.script?.kind === 'foul' && w.script.data.adv === 1) { w.queue = [...w.queue.filter((q) => q.kind === 'goal'), sc]; return sc; } // vantagem: a falta é sinalizada e, em seguida, vem o lance do ataque
      const waiting = w.queue.filter((q) => q.kind === 'goal'); w.queue = [];
      if (w.script) { endScript(w, false); }
      w.queue = waiting; // o gol corta qualquer outra encenação, mas não os gols que já esperavam
    }
  } else if (e.type === 'save') { sc.kind = 'save'; sc.data.pen = e.pen ? 1 : 0; sc.ty = MID_Y + sgn * (0.6 + hash(ix * 3) * 1.8); sc.tz = 0.3 + hash(ix * 9 + 2) * 1.2; sc.dur = 3.2; }
  else if (e.type === 'miss') { sc.kind = 'miss'; sc.data.pen = e.pen ? 1 : 0; sc.data.post = e.how === 'post' ? 1 : 0; const over = hash(ix * 3) > 0.5; sc.ty = over ? MID_Y + sgn * (GOAL_W / 2 - 1) : MID_Y + sgn * (GOAL_W / 2 + 1.5 + hash(ix) * 3); sc.tz = over ? GOAL_H + 0.7 + hash(ix * 9) * 2 : 0.5 + hash(ix * 9) * 1.2; sc.dur = 3; }
  else if (e.type === 'corner') { sc.kind = 'corner'; sc.ty = sgn > 0 ? 0.4 : W - 0.4; sc.dur = 3.4; sc.data.taker = real > 0 ? real : 7; }
  else if (e.type === 'foul' || e.type === 'yellow' || e.type === 'red') {
    sc.kind = 'foul'; sc.dur = 9; sc.data.card = ctx.card ?? (e.type === 'yellow' ? 1 : e.type === 'red' ? 2 : 0); sc.data.pen = e.pen ? 1 : 0; sc.data.adv = ctx.adv ? 1 : 0; sc.data.cancel = ctx.cancel ? 1 : 0; sc.data.varCard = ctx.varCard === 'red-downgrade' ? 1 : ctx.varCard === 'id-fix' ? 2 : 0;
    const cs = slotOf(w, side, ctx.cardPid); sc.data.cardSlot = cs > 0 ? cs : 0;
    sc.shooter = real > 0 ? real : 1 + Math.floor(hash(ix * 7) * 10); const vs = slotOf(w, side === 'home' ? 'away' : 'home', e.victimId); sc.data.victim = vs > 0 ? vs : 1 + Math.floor(hash(ix * 9) * 10);
    if (ctx.follow && !ctx.adv && !w.script && !dry) { // a cobrança é a própria finalização que o motor registrou: mesma jogada, mesmo resultado
      const th = triggerEvent(w, ctx.follow.e, ctx.follow.ix, {}, true);
      if (th && th.side !== side) { sc.then = th; w.skip.add(ctx.follow.ix); }
    }
  } else if (e.type === 'offside') { sc.kind = 'offside'; sc.dur = 9; sc.shooter = real > 0 ? real : 8; }
  else if (e.type === 'injury') { sc.kind = 'injury'; sc.dur = 2.6; sc.shooter = real > 0 ? real : 1 + Math.floor(hash(ix * 7) * 10); }
  else return undefined;
  if (dry) return sc;
  if (w.script && e.type !== 'goal') { if (w.queue.length < 8) w.queue.push(sc); return sc; }
  beginScript(w, sc);
  return sc;
}

/** Todos param (ficam onde estão) até `secs` segundos: jogo interrompido. Expulsos seguem andando para fora. */
function holdEveryone(w: World, secs: number) { for (const a of w.agents) if (a.off !== 'gone' && a.off !== 'walking') a.ov = { x: a.x, y: a.y, speed: 1, until: w.t + secs }; }

/** Monta a cobrança: bola no lugar, cobrador atrás dela, barreira a 9,15 m (falta perto do gol), goleiro ajustado e os demais fora da área (pênalti) ou na entrada dela. */
function setupRestart(w: World, sc: Script, fouled: Side, foulSpot: { x: number; y: number }, kind: 'direct' | 'indirect' | 'pen', kickerSlot: number) {
  const defSide: Side = fouled === 'home' ? 'away' : 'home';
  const gx = goalXOf(fouled, w.flip), sg = sgnOf(fouled, w.flip);
  const spot = kind === 'pen' ? { x: gx - sg * 11, y: MID_Y } : foulSpot; // pênalti: da marca, a 11 m do gol
  sc.data.rx = spot.x; sc.data.ry = spot.y;
  const dGoal = Math.abs(gx - spot.x), until = w.t + 14;
  const b = w.ball; b.mode = 'free'; b.v = { x: 0, y: 0, z: 0 }; b.p = { x: spot.x, y: spot.y, z: BALL_R }; b.carrier = -1; b.slideUntil = 0; b.lastSide = fouled;
  const dir = Math.atan2(MID_Y - spot.y, gx - spot.x), cx = Math.cos(dir), cy = Math.sin(dir);
  let kicker = holderOf(w, fouled, kickerSlot);
  if (kicker.off === 'gone' || kicker.state === 'down' || kicker.gk) kicker = w.agents.filter((a) => a.side === fouled && a.idx > 0 && a.state !== 'down' && a.off !== 'gone').sort((p, q) => dist2(p.x, p.y, spot.x, spot.y) - dist2(q.x, q.y, spot.x, spot.y))[0] ?? kicker;
  sc.data.kicker = kicker.idx;
  kicker.ov = { x: spot.x - cx * (kind === 'pen' ? 4 : 3.2), y: spot.y - cy * (kind === 'pen' ? 4 : 3.2), speed: 4, until }; kicker.heading = dir;
  const used = new Set<number>([kicker.id]);
  // barreira
  const wall: Agent[] = [];
  if (kind !== 'pen' && dGoal < 32 && Math.abs(spot.y - MID_Y) < 26) {
    const n = dGoal < 20 ? 5 : dGoal < 26 ? 4 : 3;
    const cands = w.agents.filter((a) => a.side === defSide && a.idx > 0 && a.off !== 'gone' && a.state !== 'down').sort((p, q) => dist2(p.x, p.y, spot.x, spot.y) - dist2(q.x, q.y, spot.x, spot.y)).slice(0, n);
    const wx = spot.x + cx * 9.15, wy = spot.y + cy * 9.15, px = -cy, py = cx;
    cands.forEach((a, i) => { const o = (i - (cands.length - 1) / 2) * 0.82; a.ov = { x: wx + px * o, y: wy + py * o, speed: 6.5, until }; a.heading = dir + Math.PI; wall.push(a); used.add(a.id); });
  }
  sc.data.wallN = wall.length; wall.forEach((a, i) => { sc.data[`wall${i}`] = a.id; });
  // goleiro: pênalti na linha; falta, no lado da trave que a barreira não cobre
  const gkD = holderOf(w, defSide, 0);
  if (gkD.off !== 'gone') gkD.ov = kind === 'pen' ? { x: gx - sg * 0.5, y: MID_Y, speed: 5, until } : { x: gx - sg * 1.0, y: MID_Y + clamp((spot.y - MID_Y) * 0.16, -2.4, 2.4), speed: 5.5, until };
  used.add(gkD.id); used.add(holderOf(w, fouled, 0).id);
  // os demais: no pênalti ficam fora da área e do arco; na falta, na entrada da área
  let k = 0;
  for (const a of w.agents) {
    if (used.has(a.id) || a.off === 'gone' || a.off === 'walking') continue;
    const att = a.side === fouled, i = k++;
    const x = kind === 'pen' ? gx - sg * (21 + (i % 4) * 2) : att ? gx - sg * (13 + (i % 4) * 3) : gx - sg * (7 + (i % 3) * 3.5), y = clamp(MID_Y + (((i * 29) % 11) - 5) * 4.6, 6, W - 6);
    a.ov = { x, y, speed: 6, until };
  }
  // árbitro perto da bola (de lado) ou, no pênalti, na linha da área
  const ref = w.refs[0];
  ref.ov = kind === 'pen' ? { x: gx - sg * 14, y: MID_Y + 13, speed: 6.5, until } : { x: spot.x - cx * 5 + (-cy) * 6, y: spot.y - cy * 5 + cx * 6, speed: 6.5, until };
  return { kicker, wall };
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
    if (sc.data.varKind === 1) { // gol que o VAR vai anular por impedimento: o atacante recebe à frente da linha da defesa
      const line = gx - sgn * 13, attx = line + sgn * 1.4;
      sc.data.line = line; sc.data.attx = attx; spot.x = attx; sc.data.sx = attx; shooter.ov = { x: attx, y: spot.y, speed: 6.2, until: w.t + 3 };
      for (const a of w.agents) if (a.side !== sc.side && a.idx >= 1 && a.idx <= 6) { const ty = clamp(a.y, 6, 62); const dd = dist2(a.x, a.y, line, ty); if (dd > 12) { const k = 12 / dd; a.x = line + (a.x - line) * k; a.y = ty + (a.y - ty) * k; a.vx = a.vy = 0; } a.ov = { x: line, y: ty, speed: 6.5, until: w.t + 3.5 }; }
    } else if (sc.data.varKind === 2) { // gol que o VAR vai anular por falta no início da jogada: um atacante derruba um defensor
      const fouler = sc.data.varTarget && sc.data.varTarget !== sc.shooter ? holderOf(w, sc.side, sc.data.varTarget) : w.agents.filter((a) => a.side === sc.side && a.idx > 4 && a.id !== shooter.id)[0];
      const victim = w.agents.filter((a) => a.side !== sc.side && a.idx > 0 && a.idx <= 6).sort((p, q) => dist2(p.x, p.y, gx - sgn * 26, MID_Y) - dist2(q.x, q.y, gx - sgn * 26, MID_Y))[0];
      if (fouler && victim) {
        const fx = gx - sgn * 27, fy = clamp(victim.y, 12, 56);
        fouler.x = fx; fouler.y = fy; victim.x = fx + sgn * 1.1; victim.y = fy + 0.3; fouler.vx = fouler.vy = victim.vx = victim.vy = 0;
        fouler.heading = sgn > 0 ? 0 : Math.PI; startAct(w, fouler, 'duel', 1); victim.state = 'down'; startAct(w, victim, 'fall', 1);
        fouler.ov = { x: fx, y: fy, speed: 1, until: w.t + 0.8 }; sc.data.fouler = fouler.id; sc.data.fx = fx; sc.data.fy = fy;
      }
    }
  } else if (sc.kind === 'corner') {
    const gx = goalXOf(sc.side, w.flip), sgn = sgnOf(sc.side, w.flip);
    const taker = holderOf(w, sc.side, sc.data.taker || 7);
    taker.ov = { x: gx - sgn * 0.8, y: sc.ty, speed: 8, until: w.t + 2.5 };
    sc.shooter = sc.data.taker || 7;
    sc.data.cx = gx - sgn * 0.5;
    b.mode = 'free'; b.v = { x: 0, y: 0, z: 0 }; b.slideUntil = 0; b.p = { x: gx - sgn * 0.3, y: sc.ty, z: BALL_R }; b.carrier = -1;
  } else if (sc.kind === 'foul') {
    const who = holderOf(w, sc.side, sc.shooter), other: Side = sc.side === 'home' ? 'away' : 'home', victim = holderOf(w, other, sc.data.victim || 1);
    const adv = sc.data.adv === 1, pen = sc.data.pen === 1;
    let spot = sc.data.preset ? { x: sc.data.px, y: sc.data.py } : toWorld(w.flow.st.ball, w.flip);
    if (pen) { const gx = goalXOf(other, w.flip), sg = sgnOf(other, w.flip); spot = { x: gx - sg * 13.5, y: MID_Y + (hash(sc.shooter * 3) - 0.5) * 8 }; } // pênalti: a falta é dentro da grande área
    sc.data.px = spot.x; sc.data.py = spot.y;
    if (sc.data.restartOnly) { // cobrança depois de um gol anulado: o jogo já parou
      holdEveryone(w, 9); b.mode = 'free'; b.v = { x: 0, y: 0, z: 0 }; b.p = { x: spot.x, y: spot.y, z: BALL_R }; b.carrier = -1; b.slideUntil = 0; b.scored = null; b.inNet = null; b.crossed = false;
    } else if (adv) { // vantagem: ninguém para; o árbitro sinaliza com os braços
      startAct(w, who, 'duel', 1);
    } else {
      holdEveryone(w, 9);
      b.mode = 'free'; b.v = { x: 0, y: 0, z: 0 }; b.p = { x: spot.x, y: spot.y, z: BALL_R }; b.carrier = -1; b.slideUntil = 0;
      // o lance: os dois se encontram na bola (a dividida) e o autor da falta derruba o outro
      const face = Math.atan2(victim.y - who.y, victim.x - who.x);
      who.x = spot.x - Math.cos(face) * 1.2; who.y = spot.y - Math.sin(face) * 1.2; victim.x = spot.x + Math.cos(face) * 0.6; victim.y = spot.y + Math.sin(face) * 0.6;
      who.vx = who.vy = victim.vx = victim.vy = 0; who.heading = face; victim.heading = face + Math.PI;
      startAct(w, who, 'tackle', 1);
    }
  } else if (sc.kind === 'offside') {
    const who = holderOf(w, sc.side, sc.shooter), spot = sc.data.preset ? { x: sc.data.px, y: sc.data.py } : toWorld(w.flow.st.ball, w.flip);
    sc.data.px = spot.x; sc.data.py = spot.y;
    holdEveryone(w, 9);
    b.mode = 'free'; b.v = { x: 0, y: 0, z: 0 }; b.p = { x: spot.x, y: spot.y, z: BALL_R }; b.carrier = -1; b.slideUntil = 0; b.scored = null; b.inNet = null; b.crossed = false;
    void who;
  } else if (sc.kind === 'goalkick') {
    const defGoal = goalXOf(sc.side, w.flip), into = defGoal === 0 ? 1 : -1, def: Side = sc.side === 'home' ? 'away' : 'home';
    const spot = { x: defGoal + into * 5, y: MID_Y + (hash(sc.shooter * 7) - 0.5) * 7 };
    sc.data.px = spot.x; sc.data.py = spot.y; sc.data.into = into;
    b.mode = 'free'; b.v = { x: 0, y: 0, z: 0 }; b.p = { x: spot.x, y: spot.y, z: BALL_R }; b.carrier = -1; b.slideUntil = 0; b.scored = null; b.inNet = null; b.crossed = false;
    const gk = holderOf(w, def, 0); gk.ov = { x: spot.x - into * 2.4, y: spot.y, speed: 6, until: w.t + 4 };
    const ar = arFor(w, spot.x); ar.ov = { x: clamp(spot.x, 3, L - 3), y: ar.y < MID_Y ? -1.4 : W + 1.4, speed: 6, until: w.t + 5 };
  } else if (sc.kind === 'throw') {
    const spot = { x: sc.data.px, y: sc.data.py };
    b.mode = 'free'; b.v = { x: 0, y: 0, z: 0 }; b.p = { x: spot.x, y: spot.y, z: BALL_R }; b.carrier = -1; b.slideUntil = 0;
    const taker = w.agents.filter((a) => a.side === sc.side && a.idx > 0 && a.off !== 'gone').sort((p, q) => dist2(p.x, p.y, spot.x, spot.y) - dist2(q.x, q.y, spot.x, spot.y))[0];
    if (taker) { sc.shooter = taker.idx; taker.ov = { x: spot.x, y: spot.y < MID_Y ? spot.y - 0.6 : spot.y + 0.6, speed: 7, until: w.t + 4 }; }
    const ar = arFor(w, spot.x); ar.ov = { x: clamp(spot.x, 3, L - 3), y: spot.y < MID_Y ? -1.4 : W + 1.4, speed: 7, until: w.t + 4 }; ar.act = { kind: 'flag_up', t0: w.t, dur: ACT.flag_up.dur, dir: 1 };
  } else if (sc.kind === 'injury') {
    holderOf(w, sc.side, sc.shooter).state = 'down';
  }
}

function endScript(w: World, restart: boolean) {
  const sc = w.script;
  w.script = null;
  for (const a of w.agents) { if (a.state === 'down') startAct(w, a, 'getup', 1); if (a.state !== 'play') a.state = 'play'; if (a.off !== 'walking') a.ov = undefined; } // o expulso segue saindo do campo
  for (const r of w.refs) r.ov = undefined;
  if (sc && restart) {
    if (sc.kind === 'goal') { w.goals[sc.side]++; placeFormation(w, playState([], 0, 0), 0); ballToCenter(w); w.flow.carrier = -1; whistle(w, 'restart'); kickoffFor(w, sc.side === 'home' ? 'away' : 'home'); } // tudo volta ao lugar e o jogo recomeça do meio
    else if (sc.kind === 'miss') { w.queue.unshift({ kind: 'goalkick', side: sc.side, t: 0, phase: 0, shooter: sc.shooter, ty: 0, tz: 0, data: {}, dur: 3.4 }); } // bola para fora/na trave: tiro de meta
  }
  w.ball.scored = null; w.ball.inNet = null; w.ball.crossed = false;
  const next = w.queue.shift();
  if (next) beginScript(w, next);
}

const SHOT_V = 26;
/** Tipo de finalização conforme a distância e a altura do chute (e um sorteio fixo do lance). */
function shotKind(sc: Script, d: number): ActKind {
  const r = hash(sc.shooter * 13 + 5);
  if (sc.data.fk) return r < 0.5 ? 'shot_curl' : 'shot_placed';
  if (sc.data.pen) return r < 0.5 ? 'shot_placed' : 'shot_power';
  if (d > 24) return r < 0.45 ? 'shot_power' : r < 0.8 ? 'shot_curl' : 'shot_volley';
  if (sc.tz > 1.5) return r < 0.5 ? 'shot_volley' : r < 0.75 ? 'shot_half_volley' : r < 0.93 ? 'shot_scissor' : 'shot_bicycle';
  return r < 0.3 ? 'shot' : r < 0.5 ? 'shot_placed' : r < 0.65 ? 'shot_toe' : r < 0.8 ? 'shot_chip' : r < 0.9 ? 'shot_half_volley' : 'shot_curl';
}
/** Mergulho do goleiro: baixo, no meio, no alto ou esticado ao máximo, conforme onde vai a bola. */
function diveKind(sc: Script, keeper: Agent): ActKind {
  const far = Math.abs(sc.ty - keeper.y) > 2.3;
  if (sc.kind === 'save' && sc.tz > 1.9 && hash(sc.shooter * 3 + 2) < 0.5) return 'gk_tip_over';
  if (sc.kind === 'save' && sc.tz > 1.2 && hash(sc.shooter * 5 + 1) < 0.18) return hash(sc.shooter) < 0.5 ? 'gk_punch' : 'gk_punch2';
  if (far && sc.tz > 0.9) return 'gk_dive_far';
  return sc.tz < 0.55 ? 'gk_dive_low' : sc.tz > 1.5 ? 'gk_dive_high' : 'gk_dive_mid';
}
function stepScript(w: World, dt: number) {
  const sc = w.script; if (!sc) return;
  sc.t += dt;
  const gx = goalXOf(sc.side, w.flip), sgn = sgnOf(sc.side, w.flip), b = w.ball;
  const keeper = holderOf(w, sc.side === 'home' ? 'away' : 'home', 0);
  const shooter = holderOf(w, sc.side, sc.shooter);
  if (sc.kind === 'goal' || sc.kind === 'save' || sc.kind === 'miss') {
    if (sc.phase === 0) {
      const arrived = dist2(shooter.x, shooter.y, sc.data.sx, sc.data.sy) < 1.2;
      if (arrived || sc.t > 2.2) { // chegou ao ponto do chute: começa o movimento; a bola sai no contato do pé (ou da cabeça)
        const header = sc.kind === 'goal' && sc.data.header === 1;
        sc.phase = 0.5; shooter.ov = { x: shooter.x, y: shooter.y, speed: 1.2, until: w.t + 1 };
        shooter.heading = Math.atan2(MID_Y - shooter.y, gx - shooter.x);
        const sk = header ? (hash(sc.shooter * 3 + 1) < 0.25 ? 'header_dive' : 'header') : shotKind(sc, dist2(shooter.x, shooter.y, gx, MID_Y));
        startAct(w, shooter, sk, hash(sc.shooter + 3) > 0.3 ? 1 : -1);
        sc.data.kickAt = sc.t + strikeDelay(sk);
      }
    } else if (sc.phase === 0.5) {
      if (sc.t >= sc.data.kickAt) {
        sc.phase = 1; sc.data.shot = sc.t;
        const header = sc.kind === 'goal' && sc.data.header === 1;
        if (header) { b.p = { x: b.p.x, y: b.p.y, z: 2.0 }; }
        const to: V3 = { x: gx + sgn * 0.7, y: sc.ty, z: sc.tz };
        const d = Math.hypot(to.x - b.p.x, to.y - b.p.y);
        const T = sc.data.fk ? clamp(d / 16, 1.0, 1.6) : clamp(d / SHOT_V, 0.35, 1.1); // cobrança de falta: sobe mais para passar por cima da barreira
        // o goleiro se joga: no gol ele chega tarde/errado; na defesa chega na bola
        if (sc.kind === 'save') keeper.ov = { x: gx - sgn * 0.8, y: sc.ty, speed: 9, until: w.t + 2 }; else keeper.ov = { x: gx - sgn * 0.8, y: MID_Y + (sc.ty > MID_Y ? 1 : -1) * 1.3, speed: 4.2, until: w.t + 2 };
        keeper.state = 'dive'; keeper.hopV = 4;
        keeper.heading = Math.atan2(b.p.y - keeper.y, b.p.x - keeper.x);
        startAct(w, keeper, diveKind(sc, keeper), Math.sign(-(sc.ty - keeper.y) * Math.cos(keeper.heading)) || 1);
        b.mode = 'carried'; kickTo(w, to, T, false, d > 11 && !header ? (hash(sc.shooter * 17 + Math.floor(sc.ty)) - 0.5) * 6 : 0);
        if (sc.kind !== 'goal') cue(w, { k: 'oh' }); // grande chance: a torcida reage
        sc.data.T = T;
      }
    } else if (sc.phase === 1) {
      if (sc.kind === 'goal' && b.scored && !sc.data.vared) { // a bola entrou: o VAR confere o gol antes de qualquer comemoração
        sc.data.vared = 1;
        const vk = sc.data.varKind;
        startVar(w, { kind: vk === 1 ? 'goal-offside' : vk === 2 ? 'goal-foul' : 'goal', annul: vk > 0, line: vk === 1 ? { def: sc.data.line, att: sc.data.attx } : undefined, focus: vk === 2 && sc.data.fouler !== undefined ? sc.data.fouler : 'ball', onDone: () => { sc.data.vdone = vk > 0 ? 2 : 1; } });
      } else if (sc.kind === 'goal' && b.scored && sc.data.vdone === 2) { // gol anulado: sem comemoração; o jogo recomeça com cobrança para os defensores
        const px = sc.data.varKind === 1 ? sc.data.attx : (sc.data.fx ?? shooter.x), py = sc.data.varKind === 1 ? shooter.y : (sc.data.fy ?? shooter.y);
        const ns: Script = { kind: sc.data.varKind === 1 ? 'offside' : 'foul', side: sc.side, t: 0, phase: 0, shooter: sc.shooter, ty: 0, tz: 0, data: { restartOnly: 1, preset: 1, px, py, victim: 1 }, dur: 9 };
        w.queue.unshift(ns); endScript(w, false);
      } else if (sc.kind === 'goal' && b.scored && sc.data.vdone === 1) { // gol confirmado: comemoração
        sc.phase = 2; sc.data.ce = sc.t;
        keeper.state = 'play';
        const corner = { x: gx - sgn * 9, y: 12 }; // corre para a bandeirinha do lado da câmera (aparece grande na tela)
        shooter.state = 'celebrate'; shooter.ov = { x: corner.x, y: corner.y, speed: 8.8, until: w.t + 3.8 };
        const mates = w.agents.filter((a) => a.side === sc.side && a.idx > 0 && a.id !== shooter.id).sort((a, c) => dist2(a.x, a.y, corner.x, corner.y) - dist2(c.x, c.y, corner.x, corner.y)).slice(0, 5);
        mates.forEach((m, i) => { m.state = 'celebrate'; const ang = (i / 5) * Math.PI * 2; m.ov = { x: corner.x + Math.cos(ang) * 3.4, y: corner.y + Math.sin(ang) * 3.4, speed: 8.6, until: w.t + 3.8 }; });
        w.banner = { text: 'GOOOL!', sub: sc.player ?? '', t0: w.t }; cue(w, { k: 'cheer', big: true });
        for (let i = 0; i < 70; i++) w.confetti.push({ x: corner.x, y: corner.y, z: 2 + hash(i) * 2, vx: (hash(i * 3 + 1) - 0.5) * 9, vy: (hash(i * 5 + 2) - 0.5) * 9, vz: 4 + hash(i * 7 + 3) * 7, c: ['#ffd23f', '#ff4d6d', '#4dd2ff', '#7dff6b', '#ffffff'][i % 5], life: 3 });
        netImpact(w.nets[sgn === 1 ? 1 : 0], b.p.y, b.p.z, 6);
      } else if (sc.t - sc.data.shot > 2.2 && sc.kind === 'goal') { // o motor disse gol: se a física não colocou, assume a bola para dentro da rede
        sc.data.shot = -99; b.p = { x: gx + sgn * 1.2, y: sc.ty, z: 0.6 }; b.v = { x: sgn * 3, y: 0, z: 0 }; b.scored = sc.side;
      } else if (sc.kind === 'save') {
        const T = sc.data.T, near = (dist2(b.p.x, b.p.y, keeper.x, keeper.y) < 2.6 && b.p.z < 2.8) || (b.p.x - gx) * sgn > -0.6; // o goleiro segura a bola antes de ela cruzar a linha (defesa nunca vira gol)
        if ((sc.t - sc.data.shot >= T - 0.04 || near) && b.mode === 'free') { sc.phase = 2; sc.data.ce = sc.t; b.mode = 'carried'; b.carrier = keeper.id; keeper.state = 'play'; startAct(w, keeper, sc.tz < 0.55 ? 'gk_catch_low' : sc.tz > 1.5 ? 'gk_catch_high' : hash(sc.shooter * 5) < 0.5 ? 'gk_catch_chest' : 'gk_catch', 1); }
      } else if (sc.kind === 'miss' && sc.t - sc.data.shot > 1.8) { sc.phase = 2; sc.data.ce = sc.t; }
    } else if (sc.phase === 2) {
      const el = sc.t - sc.data.ce;
      if (sc.kind === 'goal' && el > 1.9 && !sc.data.cele2) { // chegou à bandeirinha: cada autor comemora de um jeito, os companheiros também
        sc.data.cele2 = 1;
        const solo = ['cele_knee_slide', 'cele_point_sky', 'cele_airplane', 'cele_kiss_badge', 'cele_fist', 'cele_dance', 'cele_shush', 'cele_crown', 'cele_prayer', 'cele_heart', 'cele_salute', 'cele_bow'] as const;
        const team = ['cele_hug', 'cele_chest_bump', 'cele_clap', 'celebrate', 'cele_run_arms', 'cele_fist'] as const;
        startAct(w, shooter, solo[Math.floor(hash(sc.shooter * 31 + w.goals.home * 7 + w.goals.away * 13) * solo.length)], 1);
        w.agents.filter((a) => a.state === 'celebrate' && a.id !== shooter.id).forEach((m, i) => startAct(w, m, team[Math.floor(hash(m.id * 7 + i) * team.length)], i % 2 ? 1 : -1));
      }
      if (sc.kind === 'goal' && el < 0.05) { startAct(w, shooter, 'cele_run_arms', 1); }
      if (sc.kind === 'save' && el > 0.7 && b.mode === 'carried') { const to = { x: gx - sgn * 34, y: 10 + hash(sc.shooter * 9) * 46, z: BALL_R }; const dk = (['gk_goal_kick', 'gk_throw_over', 'gk_clear_volley'] as const)[Math.floor(hash(sc.shooter * 11) * 3)]; startAct(w, keeper, dk, 1); scheduleKick(w, strikeDelay(dk), to, 1.6, false); sc.phase = 3; }
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
      if (dist2(shooter.x, shooter.y, sc.data.cx, sc.ty) < 1.2 || sc.t > 1.6) { sc.phase = 0.5; shooter.heading = Math.atan2(MID_Y - shooter.y, gx - sgn * 7.5 - shooter.x); startAct(w, shooter, 'cross', sgn > 0 ? 1 : -1); sc.data.kickAt = sc.t + strikeDelay('cross'); }
    } else if (sc.phase === 0.5) {
      if (sc.t >= sc.data.kickAt) { sc.phase = 1; sc.data.shot = sc.t; kickTo(w, { x: gx - sgn * 7.5, y: MID_Y + (hash(sc.shooter) - 0.5) * 6, z: 1.6 }, 1.25, false, (hash(sc.shooter * 5) - 0.5) * 8); }
    } else if (sc.phase === 1 && !sc.data.air && sc.t - sc.data.shot > 0.85) { // a bola chega na área: disputa de bola no alto
      sc.data.air = 1;
      const spot = { x: gx - sgn * 7.5, y: MID_Y };
      const near = (side: Side, n: number) => w.agents.filter((a) => a.side === side && a.idx > 0).sort((p, q) => dist2(p.x, p.y, spot.x, spot.y) - dist2(q.x, q.y, spot.x, spot.y)).slice(0, n);
      near(sc.side, 2).forEach((a, i) => startAct(w, a, 'aerial', i ? -1 : 1)); near(sc.side === 'home' ? 'away' : 'home', 2).forEach((a, i) => startAct(w, a, 'aerial', i ? 1 : -1));
    } else if (sc.phase === 1 && sc.t - sc.data.shot > 1.6) endScript(w, false);
  } else if (sc.kind === 'foul') {
    const other: Side = sc.side === 'home' ? 'away' : 'home', victim = holderOf(w, other, sc.data.victim || 1), who = shooter, ref = w.refs[0];
    const adv = sc.data.adv === 1, pen = sc.data.pen === 1, card = sc.data.card, px = sc.data.px, py = sc.data.py, ro = sc.data.restartOnly === 1, cancel = sc.data.cancel === 1, varCard = sc.data.varCard;
    const fouled: Side = cancel ? sc.side : other; // pênalti cancelado: a bola fica com os defensores
    const carded = sc.data.cardSlot ? holderOf(w, sc.side, sc.data.cardSlot) : who; // quem recebeu o primeiro cartão (no erro de identificação, não é o autor da falta)
    if (!ro && !sc.data.hit && sc.t >= strikeDelay('tackle')) { sc.data.hit = 1; if (!adv) { victim.state = 'down'; startAct(w, victim, 'fall', 1); } }
    if (!ro && !sc.data.ref && sc.t >= 0.5) {
      sc.data.ref = 1;
      if (adv) startAct(w, ref, 'ref_advantage', 1); else { whistle(w, pen ? 'penalty' : 'foul'); ref.ov = { x: px - 4, y: py + (py < MID_Y ? 5 : -5), speed: 6.5, until: w.t + 4 }; }
    }
    if (adv) { if (sc.t > 1.6) endScript(w, false); }
    else {
      if (pen && !ro && !sc.data.point && sc.t >= 1.0) { sc.data.point = 1; startAct(w, ref, 'ref_point', 1); } // marca do pênalti
      if (pen && !ro && !sc.data.pvar && sc.t >= 1.6) { // o VAR revê o pênalti marcado
        sc.data.pvar = 1; startVar(w, { kind: cancel ? 'pen-cancel' : 'pen', annul: cancel, focus: who.id, onDone: () => { sc.data.vdone = cancel ? 2 : 1; } });
      }
      const waitingPen = pen && !ro && sc.data.vdone === undefined;
      if (card && !ro && !sc.data.cardShown && sc.t >= 1.2) { // o árbitro mostra o cartão
        sc.data.cardShown = 1; cue(w, { k: 'murmur' }); w.card = { agent: carded.id, kind: card === 2 ? 'red' : 'yellow', until: w.t + 1.8 }; startAct(w, ref, 'ref_card', 1); ref.heading = Math.atan2(carded.y - ref.y, carded.x - ref.x);
      }
      if (card && !ro && !sc.data.rant && sc.t >= 1.5) { sc.data.rant = 1; startAct(w, carded, (['complain', 'react_argue', 'react_head_hands', 'react_shrug', 'react_hands_hips'] as const)[Math.floor(hash(sc.shooter * 19 + 3) * 5)], 1); w.agents.filter((a) => a.side === sc.side && a.id !== carded.id && a.idx > 0 && a.off !== 'gone').sort((p, q) => dist2(p.x, p.y, carded.x, carded.y) - dist2(q.x, q.y, carded.x, carded.y)).slice(0, 2).forEach((a) => startAct(w, a, 'complain', 1)); }
      if (varCard && sc.data.cardShown && !sc.data.cvar && sc.t >= 3.0) { // o VAR revê o cartão (vermelho que pode virar amarelo; punido errado)
        sc.data.cvar = 1; startVar(w, { kind: varCard === 1 ? 'red-downgrade' : 'id-fix', annul: true, focus: who.id, onDone: () => { sc.data.vdone = 2; } });
      }
      if (varCard && sc.data.vdone === 2 && !sc.data.finalShown) { // decisão: o cartão certo para o jogador certo
        sc.data.finalShown = 1; sc.data.cardEnd = sc.t; w.card = { agent: who.id, kind: 'yellow', until: w.t + 1.8 }; startAct(w, ref, 'ref_card', 1); ref.heading = Math.atan2(who.y - ref.y, who.x - ref.x);
      }
      if (card === 2 && !varCard && !sc.data.leave && sc.t >= 2.7) { sc.data.leave = 1; who.state = 'play'; who.off = 'walking'; who.ov = { x: clamp(who.x, 3, L - 3), y: who.y < MID_Y ? -4 : W + 4, speed: 3.4, until: w.t + 40 }; } // expulso: sai do campo
      const setupAt = ro ? 0.3 : varCard ? (sc.data.finalShown ? sc.data.cardEnd + 1.6 : 1e9) : card ? 3.0 : pen ? (sc.data.vdone !== undefined ? sc.t : 1e9) : 1.7;
      if (!waitingPen && !sc.data.setup && sc.t >= setupAt) {
        sc.data.setup = 1; if (!ro) { startAct(w, victim, 'getup', 1); victim.state = 'play'; }
        const th = sc.then, kickerSlot = th ? th.shooter : 8;
        setupRestart(w, sc, fouled, { x: px, y: py }, pen && !cancel ? 'pen' : 'direct', kickerSlot);
        const far = Math.max(0, ...Array.from({ length: sc.data.wallN || 0 }, (_, i) => { const m = w.agents[sc.data[`wall${i}`]]; return dist2(m.x, m.y, m.ov?.x ?? m.x, m.ov?.y ?? m.y); }));
        sc.data.kickT = sc.t + clamp(far / 6.5 + 0.8, pen && !cancel ? 2.2 : 2.0, 5.5); // a cobrança espera a barreira se formar
      }
      if (sc.data.setup && !sc.data.kicked && sc.t >= sc.data.kickT) {
        sc.data.kicked = 1; whistle(w, 'restart');
        const kicker = holderOf(w, fouled, sc.data.kicker);
        if (sc.then) { // a cobrança é a finalização do motor: segue como o roteiro de gol/defesa/chute para fora
          const rx = sc.data.rx, ry = sc.data.ry, th = sc.then; th.shooter = kicker.idx; th.phase = 0.5; th.t = 0; th.data.sx = rx; th.data.sy = ry; th.data.fk = pen ? 0 : 1;
          kicker.ov = { x: rx - Math.cos(kicker.heading) * 0.9, y: ry - Math.sin(kicker.heading) * 0.9, speed: 3, until: w.t + 2 };
          startAct(w, kicker, 'shot', 1); th.data.kickAt = strikeDelay('shot');
          for (let i = 0; i < (sc.data.wallN || 0); i++) startAct(w, w.agents[sc.data[`wall${i}`]], 'wall', 1);
          w.ball.lastSide = fouled; w.script = th;
        } else { // cobrança comum: toca para um companheiro e o jogo segue
          const dir = Math.atan2(MID_Y - py, goalXOf(fouled, w.flip) - px);
          const mate = w.agents.filter((a) => a.side === fouled && a.idx > 0 && a.id !== kicker.id && a.off !== 'gone').sort((p, q) => dist2(p.x, p.y, px + Math.cos(dir) * 14, py + Math.sin(dir) * 14) - dist2(q.x, q.y, px + Math.cos(dir) * 14, py + Math.sin(dir) * 14))[0];
          if (mate) { const d = dist2(px, py, mate.x, mate.y), T = clamp(d / 15, 0.5, 1.5); startAct(w, kicker, d > 25 ? 'cross' : 'pass', 1); scheduleKick(w, strikeDelay(d > 25 ? 'cross' : 'pass'), { x: mate.x, y: mate.y, z: BALL_R }, T, d < 30, 0, mate.id, fouled); }
          for (let i = 0; i < (sc.data.wallN || 0); i++) startAct(w, w.agents[sc.data[`wall${i}`]], 'wall', 1);
        }
      }
      if (sc.data.kicked && !sc.then && sc.t - sc.data.kickT > 1.6) endScript(w, false);
    }
  } else if (sc.kind === 'offside') {
    const ar = arFor(w, sc.data.px), ref = w.refs[0], other: Side = sc.side === 'home' ? 'away' : 'home', px = sc.data.px, py = sc.data.py;
    const ro = sc.data.restartOnly === 1;
    if (!ro && !sc.data.flag && sc.t >= 0.1) { sc.data.flag = 1; ar.ov = { x: clamp(px, 3, L - 3), y: ar.y < MID_Y ? -1.4 : W + 1.4, speed: 7, until: w.t + 6 }; startAct(w, ar, 'flag_up', 1); }
    if (!ro && !sc.data.whistle && sc.t >= 1.0) { sc.data.whistle = 1; whistle(w, 'offside'); ref.ov = { x: px - 6, y: py > MID_Y ? py - 8 : py + 8, speed: 6.5, until: w.t + 4 }; }
    if (!sc.data.setup && sc.t >= (ro ? 0.3 : 2.0)) { sc.data.setup = 1; const kn = setupRestart(w, sc, other, { x: px, y: py }, 'indirect', 8); sc.data.kickT = sc.t + 1.8; void kn; }
    if (sc.data.setup && !sc.data.kicked && sc.t >= sc.data.kickT) {
      sc.data.kicked = 1; whistle(w, 'restart');
      const kicker = holderOf(w, other, sc.data.kicker), dir = Math.atan2(MID_Y - py, goalXOf(other, w.flip) - px);
      const mate = w.agents.filter((a) => a.side === other && a.idx > 0 && a.id !== kicker.id && a.off !== 'gone').sort((p, q) => dist2(p.x, p.y, px + Math.cos(dir) * 12, py + Math.sin(dir) * 12) - dist2(q.x, q.y, px + Math.cos(dir) * 12, py + Math.sin(dir) * 12))[0];
      if (mate) { const d = dist2(px, py, mate.x, mate.y), T = clamp(d / 15, 0.5, 1.5); startAct(w, kicker, 'pass', 1); scheduleKick(w, strikeDelay('pass'), { x: mate.x, y: mate.y, z: BALL_R }, T, d < 30, 0, mate.id, other); }
    }
    if (sc.data.kicked && sc.t - sc.data.kickT > 1.6) endScript(w, false);
  } else if (sc.kind === 'goalkick') {
    const def: Side = sc.side === 'home' ? 'away' : 'home', gk = holderOf(w, def, 0), into = sc.data.into, px = sc.data.px;
    if (!sc.data.flag && sc.t >= 0.4) { sc.data.flag = 1; startAct(w, arFor(w, px), 'flag_horizontal', 1); }
    if (!sc.data.kick && sc.t >= 1.6) { sc.data.kick = 1; gk.heading = into === 1 ? 0 : Math.PI; startAct(w, gk, 'long_pass', 1); scheduleKick(w, strikeDelay('long_pass'), { x: px + into * (30 + hash(sc.shooter * 11) * 12), y: 12 + hash(sc.shooter * 13) * 40, z: BALL_R }, 1.7, false, 0, undefined, def); }
    if (sc.t > 3.4) endScript(w, false);
  } else if (sc.kind === 'throw') {
    const taker = holderOf(w, sc.side, sc.shooter), px = sc.data.px, py = sc.data.py;
    if (!sc.data.act && sc.t >= 1.1) {
      sc.data.act = 1; taker.heading = py < MID_Y ? Math.PI / 2 : -Math.PI / 2; startAct(w, taker, 'throw', 1);
      const mate = w.agents.filter((a) => a.side === sc.side && a.idx > 0 && a.id !== taker.id && a.off !== 'gone').sort((p, q) => dist2(p.x, p.y, px, py) - dist2(q.x, q.y, px, py))[0];
      if (mate) scheduleKick(w, strikeDelay('throw'), { x: mate.x, y: mate.y, z: BALL_R }, 0.9, false, 0, mate.id, sc.side);
    }
    if (sc.t > 2.8) endScript(w, false);
  } else if (sc.kind === 'injury') {
    if (!sc.data.fell) { sc.data.fell = 1; startAct(w, shooter, 'fall', 1); }
    if (sc.t > sc.dur) endScript(w, false);
  }
  if (sc.t > 9) endScript(w, sc.kind === 'goal'); // trava de segurança: nunca deixa uma encenação presa
}

/* ------------------------------ VAR: gravação, revisão e repetição ------------------------------ */

const REC_STEP = 1 / 30, REC_KEEP = 8;
function recordFrame(w: World) {
  const all = [...w.agents, ...w.refs];
  w.rec.push({ t: w.t, ball: { x: w.ball.p.x, y: w.ball.p.y, z: w.ball.p.z, vx: w.ball.v.x, vy: w.ball.v.y, vz: w.ball.v.z }, agents: all.map((a) => ({ x: a.x, y: a.y, vx: a.vx, vy: a.vy, heading: a.heading, hop: a.hop, state: a.state, act: a.act, off: a.off })), nets: [w.nets[0].d.slice(), w.nets[1].d.slice()] });
  while (w.rec.length && w.t - w.rec[0].t > REC_KEEP) w.rec.shift();
}

const VAR_TEXT: Record<VarKind, { check: string; confirm: string; annul: string }> = {
  goal: { check: 'Verificando o gol…', confirm: 'GOL CONFIRMADO', annul: 'GOL ANULADO' },
  'goal-offside': { check: 'Possível impedimento no gol…', confirm: 'GOL CONFIRMADO', annul: 'GOL ANULADO · IMPEDIMENTO' },
  'goal-foul': { check: 'Possível falta no início da jogada…', confirm: 'GOL CONFIRMADO', annul: 'GOL ANULADO · FALTA' },
  pen: { check: 'Revisando o pênalti…', confirm: 'PÊNALTI CONFIRMADO', annul: 'SEM PÊNALTI' },
  'pen-cancel': { check: 'Revisando o pênalti…', confirm: 'PÊNALTI CONFIRMADO', annul: 'SEM PÊNALTI' },
  'red-downgrade': { check: 'Revisando o cartão vermelho…', confirm: 'VERMELHO MANTIDO', annul: 'VERMELHO REVISTO · CARTÃO AMARELO' },
  'id-fix': { check: 'Conferindo o jogador punido…', confirm: 'CARTÃO MANTIDO', annul: 'CARTÃO CORRIGIDO' },
};
const VAR_CAM_LIST: Record<VarKind, VarCamId[]> = { goal: [], 'goal-offside': ['high', 'tv'], 'goal-foul': ['close', 'tv'], pen: [], 'pen-cancel': ['close', 'goal'], 'red-downgrade': ['close', 'tv'], 'id-fix': ['close'], };

/** Começa uma revisão do VAR: o jogo fica parado; mostra a checagem, (se houver) a repetição por algumas câmeras e a decisão; ao fim chama `onDone`. */
export function startVar(w: World, o: { kind: VarKind; annul: boolean; line?: { def: number; att: number }; focus?: 'ball' | number; onDone: () => void }) {
  const t = VAR_TEXT[o.kind], review = o.annul && VAR_CAM_LIST[o.kind].length > 0;
  recordFrame(w); // o quadro atual (instante do lance) entra na repetição
  const frames = w.rec.filter((f) => w.t - f.t <= (o.kind === 'goal-foul' ? 5.5 : 4.5));
  w.var = { stage: 'check', kind: o.kind, annul: o.annul, review, text: t.check, decision: o.annul ? t.annul : t.confirm, clock: 0, frames: frames.length ? frames : [w.rec[w.rec.length - 1]], rt: 0, camList: VAR_CAM_LIST[o.kind], camIdx: 0, camOverride: null, line: o.line, focus: o.focus ?? 'ball', camX: w.camX, jumped: true, skip: false, onDone: o.onDone };
  w.recAcc = 0; cue(w, { k: 'murmur' });
}

export const VAR_REPLAY_SPEED = 0.6;
const frameSpan = (v: VarState) => Math.max(0.5, v.frames[v.frames.length - 1].t - v.frames[0].t);
function stepVar(w: World, dt: number) {
  const v = w.var!; v.clock += dt;
  if (v.skip) { v.skip = false; if (v.stage !== 'decision') { v.stage = 'decision'; v.clock = 0; } else v.clock = 99; }
  if (v.stage === 'check') { if (v.clock >= 1.3) { v.clock = 0; if (v.review) { v.stage = 'review'; v.rt = 0; v.camIdx = 0; v.jumped = true; } else v.stage = 'decision'; } }
  else if (v.stage === 'review') {
    v.rt += dt * VAR_REPLAY_SPEED;
    if (v.rt >= frameSpan(v) + 0.5) { v.camIdx++; v.rt = 0; v.jumped = true; if (v.camIdx >= v.camList.length) { v.stage = 'decision'; v.clock = 0; } }
  }
  if (v.stage === 'decision' && !v.reacted) { v.reacted = true; if (v.annul) cue(w, { k: 'groan' }); else if (v.kind === 'pen') cue(w, { k: 'oh' }); } // a torcida reage à decisão
  if (v.stage === 'decision' && v.clock >= (v.annul ? 2.4 : 1.2)) { const done = v.onDone; w.var = null; done(); }
}

/** O quadro da repetição (posições interpoladas) escrito num "mundo de exibição" que o desenhista usa no lugar do jogo ao vivo. */
export function replayView(w: World): World {
  const v = w.var!; const f0 = v.frames[0], tt = f0.t + Math.min(v.rt, frameSpan(v));
  let i = 0; while (i + 1 < v.frames.length && v.frames[i + 1].t <= tt) i++;
  const a = v.frames[i], b = v.frames[Math.min(i + 1, v.frames.length - 1)], k = b.t > a.t ? Math.min(1, Math.max(0, (tt - a.t) / (b.t - a.t))) : 0;
  const lerp = (x: number, y: number) => x + (y - x) * k;
  if (!w.view) w.view = { ...w, agents: w.agents.map((x) => ({ ...x })), refs: w.refs.map((x) => ({ ...x })), ball: { ...w.ball, p: { ...w.ball.p }, v: { ...w.ball.v } }, nets: [newNet(), newNet()], confetti: [], banner: null, card: null, script: null };
  const rv = w.view, all = [...rv.agents, ...rv.refs];
  all.forEach((x, n) => { const s = a.agents[n], u = b.agents[n]; x.x = lerp(s.x, u.x); x.y = lerp(s.y, u.y); x.vx = s.vx; x.vy = s.vy; x.heading = s.heading; x.hop = s.hop; x.state = s.state; x.act = s.act; x.off = s.off; });
  rv.ball.p.x = lerp(a.ball.x, b.ball.x); rv.ball.p.y = lerp(a.ball.y, b.ball.y); rv.ball.p.z = lerp(a.ball.z, b.ball.z); rv.ball.v.x = a.ball.vx; rv.ball.v.y = a.ball.vy; rv.ball.v.z = a.ball.vz; rv.ball.mode = 'free'; rv.ball.curve = 0;
  rv.nets[0].d = a.nets[0].slice(); rv.nets[1].d = a.nets[1].slice();
  rv.t = tt; rv.var = v; rv.flip = w.flip; rv.flow = w.flow; rv.camX += (rv.ball.p.x - rv.camX) * 0.1;
  return rv;
}
/** Para onde a câmera da repetição olha (a bola ou o jogador do lance). */
export function varFocus(w: World, view: World): V3 { const v = w.var!; if (v.focus === 'ball') return { x: view.ball.p.x, y: view.ball.p.y, z: 1 }; const a = view.agents[v.focus]; return { x: a.x, y: a.y, z: 1 }; }

/* ------------------------------ passo geral ------------------------------ */

/** Largura (m) mostrada pela câmera do treinador: jogo normal e perto do gol (campo grande, bem perto da linha lateral). */
export const SPAN_PLAY = 46, SPAN_GOAL = 34;
const SUB = 1 / 90;
export function stepWorld(w: World, dtTotal: number) {
  if (w.var) { stepVar(w, Math.min(dtTotal, 1.0)); return; } // o jogo fica parado durante a revisão do VAR
  if (w.ceremony) stepCeremony(w); else thinkPlay(w);
  let left = Math.min(dtTotal, 1.0);
  while (left > 1e-6) {
    const dt = Math.min(SUB, left); left -= dt;
    w.t += dt;
    for (const a of w.agents) stepAgent(w, a, dt);
    stepOfficials(w, dt);
    if (!w.ceremony) separate(w);
    for (let k = 0; k < 3; k++) stepBall(w, dt / 3); // passos finos: o chute não atravessa a trave
    if (w.kickQ && w.t >= w.kickQ.at) { const k = w.kickQ; w.kickQ = null; kickTo(w, k.to, k.T, k.ground, k.curve); if (k.side) w.ball.lastSide = k.side; if (k.target !== undefined) (w.ball as Ball & { target?: number }).target = k.target; }
    receive(w);
    stepScript(w, dt);
    for (const n of w.nets) stepNet(n, dt);
    w.recAcc += dt; if (w.recAcc >= REC_STEP) { w.recAcc = 0; recordFrame(w); }
  }
  w.confetti = w.confetti.map((p) => ({ ...p, x: p.x + p.vx * dtTotal, y: p.y + p.vy * dtTotal, z: Math.max(0, p.z + p.vz * dtTotal), vz: p.vz - 9 * dtTotal, vx: p.vx * 0.99, vy: p.vy * 0.99, life: p.life - dtTotal })).filter((p) => p.life > 0);
  if (w.card && w.card.until < w.t) w.card = null;
  if (w.banner && w.t - w.banner.t0 > 3.4) w.banner = null;
  // câmera segue a bola (suave), sem sair do campo
  const target = w.ceremony ? CENTER.x : clamp(w.ball.p.x, 13, L - 11); // o gol fica inteiro no quadro (na cerimônia, o centro do campo)
  w.camX += (target - w.camX) * Math.min(1, 3.2 * dtTotal);
  const nearGoal = w.script?.kind === 'goal' || Math.min(w.ball.p.x, L - w.ball.p.x) < 24; // perto do gol (ou lance de gol): câmera mais fechada
  w.span += ((w.ceremony ? 62 : nearGoal ? SPAN_GOAL : SPAN_PLAY) - w.span) * Math.min(1, 1.6 * dtTotal);
}

/** Quando o tempo pula (pular partida, pênaltis): encerra roteiros e põe todos no lugar. */
export function snapWorld(w: World, st: PlayState, tick: number) {
  w.cues = []; w.skip.clear(); w.var = null; w.rec = []; w.recAcc = 0; w.ceremony = null; for (const a of w.agents) a.face = undefined;
  w.script = null; w.queue = []; w.banner = null; w.card = null; w.confetti = []; w.kickQ = null; for (const a of w.agents) a.act = undefined;
  for (const n of w.nets) { n.d.fill(0); n.dv.fill(0); }
  placeFormation(w, st, tick); ballToCenter(w);
  w.flow = { st, tick, carrier: -1, side: 'none' };
  w.brain = newBrain(); kickoffFor(w, w.flip ? 'away' : 'home');
}

/* ------------------------------ ligação com o relógio da partida ------------------------------ */

export interface Driver { idx: number; lastMinute: number; lastTick: number }
export const createDriver = (): Driver => ({ idx: 0, lastMinute: 0, lastTick: -1 });
/** A partir deste minuto (2º tempo) os times jogam com os lados trocados. */
export const SECOND_HALF = 45.5;
/** O próximo lance da narração (nos próximos minutos): quem vai atacar ganha a bola e o autor do lance recebe o passe. */
function lookahead(w: World, events: MatchEvent[], minute: number) {
  const nx = events.find((e) => e.minute > minute - 0.2 && e.minute <= minute + 1.6 && SCRIPTED.has(e.type) && e.side !== 'none' && !w.skip.has(events.indexOf(e)));
  if (!nx) { w.brain.bias = 'none'; w.brain.focus = null; return; }
  const att: Side = nx.type === 'foul' || nx.type === 'yellow' || nx.type === 'red' || nx.type === 'offside' ? (nx.side === 'home' ? 'away' : 'home') : (nx.side as Side);
  w.brain.bias = att;
  const slot = nx.type === 'goal' || nx.type === 'save' || nx.type === 'miss' ? slotOf(w, att, nx.pid) : -1;
  w.brain.focus = slot > 0 ? { side: att, slot } : null;
}
const SCRIPTED = new Set(['goal', 'save', 'miss', 'corner', 'foul', 'yellow', 'red', 'injury', 'offside']);

/**
 * Acompanha o relógio: cada lance da narração que o minuto alcança vira uma encenação; a cada meio minuto o fluxo do jogo se
 * reorganiza. Se o tempo pula (pular partida), a encenação é encerrada e tudo volta ao lugar.
 */
export function drive(w: World, drv: Driver, events: MatchEvent[], minute: number) {
  const tick = Math.floor(minute * 2), mi = Math.floor(minute);
  const flip = minute >= SECOND_HALF;
  if (flip !== w.flip) { w.flip = flip; snapWorld(w, playState(events, mi, tick), tick); drv.idx = events.filter((e) => e.minute <= minute).length; syncRoster(w, events, drv.idx, true); drv.lastTick = tick; drv.lastMinute = minute; return; } // intervalo: os times trocam de lado e todos voltam aos seus lugares
  if (minute < drv.lastMinute - 0.01 || minute - drv.lastMinute > 6) {
    drv.idx = events.filter((e) => e.minute <= minute).length;
    syncRoster(w, events, drv.idx, true);
    snapWorld(w, playState(events, mi, tick), tick);
    drv.lastTick = tick; drv.lastMinute = minute;
    return;
  }
  while (drv.idx < events.length && events[drv.idx].minute <= minute) {
    const e = events[drv.idx];
    if (w.skip.has(drv.idx)) { w.skip.delete(drv.idx); drv.idx++; continue; } // já encenado junto com outro lance (cartão da falta, cobrança)
    if (SCRIPTED.has(e.type)) {
      const ctx: TriggerCtx = {};
      if (e.type === 'goal' && e.annulled) { // gol que o VAR vai anular: o lance seguinte da lista é a decisão
        const v = events[drv.idx + 1];
        if (v && v.type === 'var' && (v.var?.kind === 'goal-offside' || v.var?.kind === 'goal-foul')) { ctx.varKind = v.var.kind; ctx.varTarget = v.var.target; w.skip.add(drv.idx + 1); }
      }
      if (e.type === 'foul' && e.side !== 'none') { // a falta, o cartão (e a revisão do VAR) e a cobrança (a finalização que o motor registrou em seguida) formam uma jogada só
        let j = drv.idx + 1;
        const v0 = events[j];
        if (e.pen && v0 && v0.type === 'var' && v0.var?.kind === 'pen-cancel') { ctx.cancel = true; w.skip.add(j); j++; } // o VAR cancela o pênalti
        const c = events[j];
        if (c && (c.type === 'yellow' || c.type === 'red') && c.minute === e.minute && (c.pid === e.pid || c.annulled)) {
          ctx.card = c.type === 'red' ? 2 : 1; ctx.cardPid = c.pid; w.skip.add(j); j++;
          const v = events[j];
          if (c.annulled && v && v.type === 'var' && (v.var?.kind === 'red-downgrade' || v.var?.kind === 'id-fix')) { ctx.varCard = v.var.kind; w.skip.add(j); j++; const c2 = events[j]; if (c2 && (c2.type === 'yellow' || c2.type === 'red') && c2.minute === e.minute) { w.skip.add(j); j++; } }
        }
        const f = events[j], fouled: Side = e.side === 'home' ? 'away' : 'home';
        if (!ctx.cancel && f && f.minute === e.minute && f.side === fouled && (f.type === 'goal' || f.type === 'save' || f.type === 'miss') && !f.annulled) { ctx.follow = { e: f, ix: j }; if (!e.pen && hash(drv.idx * 17 + 3) < 0.4) ctx.adv = true; } // vantagem: o time ofendido ataca e o árbitro deixa seguir
      }
      triggerEvent(w, e, drv.idx, ctx);
    }
    drv.idx++;
    if (e.type === 'kickoff' || e.type === 'injury' || e.type === 'tactic') syncRoster(w, events, drv.idx);
  }
  if (tick !== drv.lastTick) { lookahead(w, events, minute); drv.lastTick = tick; }
  drv.lastMinute = minute;
}
