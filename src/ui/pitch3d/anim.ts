/* =====================================================================
   Animação dos atletas: poses (ângulos das articulações) calculadas por código, com transições suaves.
   Nada aqui conhece o three.js: é uma função do que o mundo está fazendo (velocidade, aceleração, ação em curso) para os ângulos.
   Eixos do boneco (de frente para +X): ângulo de quadril/ombro positivo = perna/braço para frente; joelho positivo = dobra para trás.
   ===================================================================== */

/** Ações originais (poses calculadas por código); as demais (mais de 130) vêm da biblioteca por quadros-chave (anims.ts). */
export type BaseKind =
  | 'pass' | 'pass_first' | 'long_pass' | 'cross' | 'shot' | 'header' | 'control' | 'tackle' | 'duel' | 'jump' | 'aerial'
  | 'celebrate' | 'complain' | 'fall' | 'getup' | 'wall'
  | 'gk_dive' | 'gk_catch' | 'gk_ready'
  | 'throw' | 'ref_whistle' | 'ref_card' | 'ref_point' | 'ref_advantage' | 'flag_up' | 'flag_corner' | 'flag_horizontal';
export type ActKind = BaseKind | (string & {});

/** Duração de cada ação (segundos de jogo) e o instante do contato com a bola (0 a 1), para a bola sair junto com o pé/cabeça. */
const BASE_ACT: Record<BaseKind, { dur: number; strike: number }> = {
  pass: { dur: 0.55, strike: 0.42 }, pass_first: { dur: 0.4, strike: 0.4 }, long_pass: { dur: 0.75, strike: 0.46 }, cross: { dur: 0.75, strike: 0.46 },
  shot: { dur: 0.7, strike: 0.45 }, header: { dur: 0.9, strike: 0.5 }, control: { dur: 0.6, strike: 0.3 },
  tackle: { dur: 0.9, strike: 0.4 }, duel: { dur: 0.7, strike: 0.5 }, jump: { dur: 0.8, strike: 0.5 }, aerial: { dur: 0.9, strike: 0.5 },
  celebrate: { dur: 2.2, strike: 0 }, complain: { dur: 1.6, strike: 0 }, fall: { dur: 0.7, strike: 0 }, getup: { dur: 1.2, strike: 0 }, wall: { dur: 1.4, strike: 0.6 },
  gk_dive: { dur: 1.0, strike: 0.4 }, gk_catch: { dur: 0.6, strike: 0.3 }, gk_ready: { dur: 1.0, strike: 0 },
  throw: { dur: 0.9, strike: 0.5 }, ref_whistle: { dur: 0.9, strike: 0 }, ref_card: { dur: 1.6, strike: 0 }, ref_point: { dur: 1.4, strike: 0 }, ref_advantage: { dur: 1.4, strike: 0 },
  flag_up: { dur: 1.8, strike: 0 }, flag_corner: { dur: 1.6, strike: 0 }, flag_horizontal: { dur: 1.6, strike: 0 },
};
export const ACT: Record<ActKind, { dur: number; strike: number }> = { ...Object.fromEntries(Object.entries(ANIMS).map(([k, v]) => [k, { dur: v.dur, strike: v.strike }])), ...BASE_ACT };
/** Atraso entre o início da ação e o contato com a bola (s). */
export const strikeDelay = (k: ActKind) => ACT[k].dur * ACT[k].strike;

export interface Act { kind: ActKind; t0: number; dur: number; /** -1/+1: lado do mergulho, perna de chute... */ dir: number }

export { J, N_JOINTS, newPose, type Pose } from './joints';
import { J, N_JOINTS, newPose, type Pose } from './joints';
import { ANIMS, hasAnim, sampleAnim } from './anims';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (x: number) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 -> 1 -> 0 entre `a` e `b` (subida e descida suaves). */
const bump = (p: number, a: number, peak: number, b: number) => (p < peak ? smooth((p - a) / (peak - a)) : smooth(1 - (p - peak) / (b - peak)));

/** Passada: o ciclo (esquerda-direita) avança com a distância percorrida, para o pé não "patinar" no gramado. Metros por ciclo completo (dois passos). */
export const cycleLength = (speed: number) => 1.9 + 0.5 * speed;

/** Corrida contínua: da parada à velocidade máxima, tudo numa só função (amplitudes crescem com a velocidade). `phase` em ciclos. */
export function locomotion(phase: number, speed: number, lean: number, roll: number, dribble: boolean): Pose {
  const p = newPose(), s = clamp(speed, 0, 9.5), k = smooth(s / 1.2); // k: 0 parado -> 1 andando
  const a = phase * Math.PI * 2, sw = Math.sin(a), sw2 = Math.sin(a + Math.PI);
  const hipAmp = k * clamp(0.18 + 0.075 * s, 0, 0.82), kneeAmp = k * clamp(0.25 + 0.16 * s, 0, 1.55);
  p[J.rootY] = -k * (0.02 + 0.004 * s) * (1 + Math.cos(a * 2)) * 0.5 - (s > 6 ? 0.03 : 0); // sobe e desce a cada passo
  p[J.rootPitch] = clamp(0.03 + s * 0.026, 0, 0.3) * k + lean;
  p[J.rootRoll] = roll;
  p[J.spineTwist] = -sw * k * 0.12;
  p[J.spinePitch] = 0.04 * k;
  for (const [hip, knee, ank, ph, sh, el, sA] of [[J.lHip, J.lKnee, J.lAnk, sw, J.lShP, J.lElb, sw2], [J.rHip, J.rKnee, J.rAnk, sw2, J.rShP, J.rElb, sw]] as const) {
    p[hip] = ph * hipAmp; // perna à frente quando o seno é positivo
    const back = Math.max(0, Math.cos(a + (hip === J.lHip ? 0 : Math.PI) + 0.6)); // dobra o joelho quando a perna vai para trás/sobe
    p[knee] = kneeAmp * (0.15 + 0.85 * back) * (ph < 0.2 ? 1 : 0.55);
    p[ank] = -0.15 * ph * k;
    p[sh] = sA * k * clamp(0.2 + 0.1 * s, 0, 1.0) * (dribble ? 0.55 : 1);
    p[el] = k * (0.35 + 0.075 * s) * (dribble ? 1.15 : 1);
  }
  p[J.lShA] = p[J.rShA] = 0.12 + k * 0.05; p[J.lHipA] = p[J.rHipA] = 0.04;
  if (k < 1) { p[J.lKnee] += 0.06; p[J.rKnee] += 0.06; } // parado: joelhos levemente dobrados
  return p;
}

/** Pose de uma ação em `t` de 0 a 1. `dir` troca o lado (perna de chute, direção do mergulho). Soma-se ao corpo todo; o peso de entrada/saída é aplicado fora. */
export function actionPose(kind: ActKind, t: number, dir: number): Pose {
  if (!(kind in BASE_ACT) && hasAnim(kind)) return sampleAnim(kind, t, dir >= 0 ? 1 : -1);
  const p = newPose(), d = dir >= 0 ? 1 : -1;
  const kickHip = d > 0 ? J.rHip : J.lHip, kickKnee = d > 0 ? J.rKnee : J.lKnee, kickAnk = d > 0 ? J.rAnk : J.lAnk;
  const planHip = d > 0 ? J.lHip : J.rHip, planKnee = d > 0 ? J.lKnee : J.rKnee;
  const armOut = (a: number) => { p[J.lShA] = a; p[J.rShA] = a; };
  const kick = (back: number, fwd: number, bendBack: number, lean: number) => { // chute: perna vai para trás, estala para frente e termina alta
    const bk = smooth(t / 0.42), st = smooth((t - 0.42) / 0.16), fo = smooth((t - 0.58) / 0.42), w = t < 0.42 ? -bk : t < 0.58 ? lerp(-1, 1, st) : 1 - fo; // w: -1 perna atrás, +1 chute
    p[kickHip] = t < 0.42 ? -back * bk : t < 0.58 ? lerp(-back, fwd, st) : fwd * (1 - fo);
    p[kickKnee] = t < 0.42 ? bendBack * bk : t < 0.58 ? lerp(bendBack, 0.15, st) : lerp(0.15, bendBack * 0.3, fo);
    p[kickAnk] = 0.4 * Math.max(0, w);
    p[planHip] = -0.12 * bump(t, 0, 0.45, 1); p[planKnee] = 0.35 * bump(t, 0, 0.45, 1);
    p[J.rootPitch] = lean * bump(t, 0.1, 0.55, 1); p[J.spineTwist] = d * -0.3 * (w < 0 ? -w : 1 - w * 0.5); p[J.headPitch] = 0.25 * bump(t, 0, 0.45, 0.9);
    armOut(0.9 * bump(t, 0, 0.5, 1)); p[J.lShP] = 0.4 * bump(t, 0, 0.5, 1) * d; p[J.rShP] = -0.4 * bump(t, 0, 0.5, 1) * d;
  };
  switch (kind) {
    case 'pass': kick(0.7, 0.8, 1.0, 0.05); break;
    case 'pass_first': kick(0.35, 0.65, 0.5, 0.0); break;
    case 'long_pass': kick(1.0, 1.15, 1.35, -0.18); break;
    case 'cross': kick(0.9, 1.05, 1.5, -0.12); p[J.spineTwist] *= 1.4; break;
    case 'shot': kick(1.15, 1.25, 1.7, 0.16); break;
    case 'header': case 'aerial': case 'jump': {
      const up = Math.sin(clamp(t, 0, 1) * Math.PI);
      p[J.rootY] = 0.62 * up; p[J.lKnee] = p[J.rKnee] = 1.0 * up; p[J.lHip] = 0.5 * up; p[J.rHip] = -0.25 * up; // pula, joelhos recolhidos
      if (kind === 'jump') { p[J.lShP] = p[J.rShP] = 2.5 * up; armOut(0.3 * up); break; }
      p[J.spinePitch] = (t < 0.5 ? -0.5 * smooth(t / 0.5) : lerp(-0.5, 0.5, smooth((t - 0.5) / 0.2))) * (kind === 'header' ? 1 : 0.5); // arqueia e cabeceia
      p[J.headPitch] = kind === 'header' ? 0.5 * bump(t, 0.4, 0.55, 0.75) : -0.2;
      armOut(1.1 * up); p[J.lElb] = p[J.rElb] = 0.7 * up; if (kind === 'aerial') { p[J.rShP] = 2.4 * up; p[J.lShP] = 0.8 * up; }
      break;
    }
    case 'control': { // domina a bola: recolhe a perna para amortecer
      const e = bump(t, 0, 0.35, 1);
      p[J.rHip] = 0.75 * e; p[J.rKnee] = 0.65 * e; p[J.rAnk] = 0.25 * e; p[J.lKnee] = 0.3 * e; p[J.rootPitch] = -0.1 * e; p[J.spinePitch] = 0.12 * e; p[J.headPitch] = 0.35 * e;
      armOut(0.6 * e); break;
    }
    case 'tackle': { // carrinho: desce, cai de lado e estica uma perna à frente
      const e = bump(t, 0, 0.35, 0.95), hold = bump(t, 0.1, 0.4, 0.8);
      p[J.rootY] = -0.62 * e; p[J.rootPitch] = -1.15 * e * d; p[J.rootRoll] = 0.25 * e * d;
      p[kickHip] = 1.45 * e; p[kickKnee] = 0.1; p[planHip] = 0.2 * e; p[planKnee] = 1.5 * e;
      armOut(0.9 * hold); p[J.lShP] = p[J.rShP] = -0.4 * hold; break;
    }
    case 'duel': { // dividida de ombro: corpo inclinado, braços semiabertos, empurrando
      const e = bump(t, 0, 0.35, 1) + 0.05 * Math.sin(t * 28);
      p[J.rootPitch] = 0.38 * e; p[J.rootY] = -0.08 * e; p[J.lKnee] = p[J.rKnee] = 0.7 * e; p[J.lHip] = 0.45 * e; p[J.rHip] = -0.3 * e; p[J.spineTwist] = 0.35 * e * d;
      p[J.lShA] = p[J.rShA] = 0.9 * e; p[J.lElb] = p[J.rElb] = 1.0 * e; p[J.rShP] = -0.5 * e; p[J.lShP] = 0.3 * e; break;
    }
    case 'celebrate': {
      const hop = Math.abs(Math.sin(t * Math.PI * 5));
      p[J.rootY] = 0.28 * hop; p[J.lShP] = p[J.rShP] = 2.6; armOut(0.35 + 0.25 * Math.sin(t * 20)); p[J.lElb] = p[J.rElb] = 0.4 + 0.3 * hop;
      p[J.lKnee] = p[J.rKnee] = 0.5 * hop + 0.2; p[J.spinePitch] = -0.12; p[J.headPitch] = -0.25; p[J.spineTwist] = 0.25 * Math.sin(t * 10);
      break;
    }
    case 'complain': { // reclama: braços abertos, palmas para cima, cabeça balançando
      const e = bump(t, 0, 0.18, 1);
      p[J.lShA] = p[J.rShA] = 1.1 * e; p[J.lShP] = p[J.rShP] = 0.7 * e; p[J.lElb] = p[J.rElb] = 1.3 * e; p[J.headYaw] = Math.sin(t * 16) * 0.5 * e; p[J.headPitch] = -0.15 * e;
      p[J.spinePitch] = 0.1 * e; p[J.rootY] = -0.02 * e; break;
    }
    case 'fall': { // cai para a frente e fica no chão
      const e = smooth(t / 0.9);
      p[J.rootPitch] = 1.5 * e; p[J.rootY] = -1.05 * e; p[J.lShP] = p[J.rShP] = 1.6 * e; p[J.lElb] = p[J.rElb] = 0.3 * e; p[J.lKnee] = 0.5 * e; p[J.rKnee] = 0.3 * e; p[J.rootRoll] = 0.3 * e * d; p[J.headPitch] = -0.6 * e;
      break;
    }
    case 'getup': { // levanta: de bruços -> apoio nos joelhos e mãos -> em pé
      const e = 1 - smooth(t);
      p[J.rootPitch] = 1.5 * e; p[J.rootY] = -1.05 * e; p[J.lShP] = p[J.rShP] = 1.6 * e; p[J.lKnee] = p[J.rKnee] = (0.5 + 1.0 * Math.sin(t * Math.PI)) * e; p[J.headPitch] = -0.6 * e;
      break;
    }
    case 'wall': { // barreira: mãos protegendo, pés juntos e pulinho na hora da cobrança
      const e = bump(t, 0, 0.2, 1), hop = bump(t, 0.5, 0.65, 0.8);
      p[J.lShP] = p[J.rShP] = 0.5 * e; p[J.lShA] = p[J.rShA] = -0.05 * e; p[J.lElb] = p[J.rElb] = 0.9 * e; p[J.lKnee] = p[J.rKnee] = 0.25 * e + 0.5 * hop;
      p[J.rootY] = 0.3 * hop; p[J.rootPitch] = 0.1 * e; break;
    }
    case 'gk_ready': { p[J.rootPitch] = 0.22; p[J.rootY] = -0.12; p[J.lKnee] = p[J.rKnee] = 0.7; p[J.lHip] = p[J.rHip] = 0.35; p[J.lShP] = p[J.rShP] = 0.7; armOut(0.6); p[J.lElb] = p[J.rElb] = 0.8; break; }
    case 'gk_dive': { // mergulho: salta de lado com os braços esticados e cai
      const up = bump(t, 0, 0.45, 1), flat = smooth(t / 0.5);
      p[J.rootRoll] = d * 1.45 * flat; p[J.rootY] = 0.35 * Math.sin(clamp(t * 1.4, 0, 1) * Math.PI) - 0.2 * flat; p[J.lShP] = p[J.rShP] = 2.5 * up; armOut(0.25 * up);
      p[J.lKnee] = 0.5 * up; p[J.rKnee] = 0.2 * up; p[J.lHip] = 0.3 * up; p[J.rootPitch] = 0.15 * up; break;
    }
    case 'throw': { // lateral: bola atrás da cabeça e para a frente
      const back = smooth(t / 0.35), fwd = smooth((t - 0.4) / 0.2);
      p[J.lShP] = p[J.rShP] = lerp(1.0, 3.1, back) * (1 - fwd) + 1.3 * fwd; p[J.lElb] = p[J.rElb] = 1.2 * (1 - fwd) + 0.2 * fwd; p[J.spinePitch] = -0.35 * back * (1 - fwd) + 0.35 * fwd; p[J.lKnee] = p[J.rKnee] = 0.2; break;
    }
    case 'ref_whistle': { const e = bump(t, 0, 0.25, 1); p[J.rShP] = 1.9 * e; p[J.rElb] = 2.3 * e; p[J.headPitch] = 0.1 * e; break; }
    case 'ref_card': { const e = bump(t, 0, 0.2, 1); p[J.rShP] = 3.0 * e; p[J.rShA] = 0.12 * e; p[J.rElb] = 0.05 * e; p[J.spinePitch] = -0.08 * e; break; }
    case 'ref_point': { const e = bump(t, 0, 0.2, 1); p[J.rShP] = 1.5 * e; p[J.rElb] = 0.05 * e; p[J.spineTwist] = -0.2 * e; break; }
    case 'ref_advantage': { const e = bump(t, 0, 0.2, 1), sw = Math.sin(t * 9) * 0.12; p[J.lShP] = (1.2 + sw) * e; p[J.rShP] = (1.2 - sw) * e; p[J.lShA] = p[J.rShA] = 0.25 * e; p[J.lElb] = p[J.rElb] = 0.15 * e; break; }
    case 'flag_up': { const e = bump(t, 0, 0.15, 1); p[J.rShP] = 3.0 * e; p[J.rShA] = 0.1 * e; p[J.rElb] = 0.05 * e; break; }
    case 'flag_corner': { const e = bump(t, 0, 0.15, 1); p[J.rShP] = 0.75 * e; p[J.rShA] = 0.55 * e; p[J.rElb] = 0.05 * e; break; }
    case 'flag_horizontal': { const e = bump(t, 0, 0.15, 1); p[J.rShP] = 1.5 * e; p[J.rElb] = 0.05 * e; break; }
    case 'gk_catch': { const e = bump(t, 0, 0.35, 1); p[J.lShP] = p[J.rShP] = 1.2 * e; p[J.lElb] = p[J.rElb] = 1.2 * e; p[J.rootPitch] = 0.2 * e; p[J.lKnee] = p[J.rKnee] = 0.4 * e; break; }
  }
  return p;
}

/** Quanto da ação entra na pose: sobe e desce suave nas pontas (as transições não "estalam"). Ações que ficam (cair, mergulho) só entram. */
export function actWeight(kind: ActKind, t: number): number {
  if (kind === 'fall') return smooth(t / 0.18);
  if (kind === 'getup') return 1 - smooth((t - 0.85) / 0.15);
  if (kind === 'celebrate') return smooth(t / 0.1) * (1 - smooth((t - 0.9) / 0.1));
  return smooth(t / 0.15) * (1 - smooth((t - 0.8) / 0.2));
}

/** Estado de animação de um atleta (mantido pelo desenhista entre os quadros). */
export interface AnimState { pose: Pose; phase: number; vx: number; vy: number; heading: number; lean: number; roll: number }
export const newAnim = (seed = 0): AnimState => ({ pose: newPose(), phase: (seed * 0.37) % 1, vx: 0, vy: 0, heading: 0, lean: 0, roll: 0 });

export interface AgentView { vx: number; vy: number; heading: number; carrying: boolean; gk: boolean; down: boolean; celebrate: boolean; act?: Act; t: number }

/** Passo de animação: devolve a pose do quadro. `dt` = tempo de jogo que passou (já na velocidade escolhida: a animação acompanha o jogo). */
export function stepAnim(s: AnimState, a: AgentView, dt: number, snap = false): Pose {
  const speed = Math.hypot(a.vx, a.vy);
  if (dt > 0) {
    s.phase = (s.phase + (speed / cycleLength(speed)) * dt) % 1; // distância percorrida -> ciclo da passada
    // aceleração e curva do corpo: inclina para frente ao acelerar, para trás ao frear, e para dentro da curva
    const ax = (a.vx - s.vx) / dt, ay = (a.vy - s.vy) / dt, hx = Math.cos(a.heading), hy = Math.sin(a.heading);
    const accPar = ax * hx + ay * hy, accSide = -ax * hy + ay * hx;
    s.lean = lerp(s.lean, clamp(accPar * 0.035, -0.28, 0.3), 1 - Math.exp(-8 * dt));
    s.roll = lerp(s.roll, clamp(-accSide * 0.02 - Math.hypot(a.vx, a.vy) * 0.0, -0.22, 0.22) * (speed > 1 ? 1 : 0), 1 - Math.exp(-8 * dt));
  }
  s.vx = a.vx; s.vy = a.vy; s.heading = a.heading;
  let target = locomotion(s.phase, speed, s.lean, s.roll, a.carrying && speed > 1.2);
  if (a.gk && !a.act && speed < 1) { const r = actionPose('gk_ready', 0.5, 1); target = target.map((v, i) => lerp(v, r[i], 0.5)); }
  const act: Act | undefined = a.act ?? (a.celebrate ? { kind: 'celebrate', t0: a.t, dur: 2.2, dir: 1 } : a.down ? { kind: 'fall', t0: a.t - 10, dur: 0.7, dir: 1 } : undefined);
  if (act) {
    const t = clamp((a.t - act.t0) / act.dur, 0, 1), w = act.kind === 'celebrate' && a.celebrate ? 1 : actWeight(act.kind, t);
    const ap = actionPose(act.kind, act.kind === 'celebrate' && a.celebrate ? ((a.t - act.t0) / 2.2) % 1 : act.kind === 'fall' && a.down ? 1 : t, act.dir);
    target = target.map((v, i) => (i === J.rootPitch || i === J.rootY ? lerp(v, ap[i], w) : lerp(v, ap[i], w) ));
  }
  const rate = !act ? 16 : act.kind === 'fall' || act.kind === 'getup' ? 8 : act.kind === 'celebrate' ? 14 : 26; // cair e levantar são movimentos lentos
  const k = snap ? 1 : dt > 0 ? 1 - Math.exp(-rate * dt) : 0; // `snap`: salto no tempo (repetição do VAR): vai direto à pose // suaviza qualquer salto entre poses (troca de corrida para ação etc.)
  for (let i = 0; i < N_JOINTS; i++) s.pose[i] = lerp(s.pose[i], target[i], k);
  return s.pose;
}
