import { ballToCenter, CENTER, kickoffTargets, L, MID_Y, placeFormation, W, type Agent, type World } from './world';
import { playState } from '../pitch';

/* =====================================================================
   Cerimônia antes do jogo: as equipes saem do túnel (lado oposto ao da câmera) em fila e caminham até a linha do meio, viram de frente
   para a câmera e cantam o hino: alguns com a mão no peito, outros com as mãos para trás. A torcida forma o mosaico do escudo do
   mandante. Depois todos vão para as posições do apito inicial. O relógio da partida fica parado até terminar (ou pular).
   ===================================================================== */

export type CeremonyStage = 'enter' | 'anthem' | 'break';
export interface Ceremony { t0: number; stage: CeremonyStage; stageT0: number }
/** Duração (segundos) de cada etapa. A entrada termina quando todos chegam (ou no tempo máximo). */
export const CEREMONY = { enterMax: 22, anthem: 20, brk: 6 };
/** Para a câmera (de frente para o campo, do lado y<0), "olhar para a câmera" = andar para -y. */
export const FACE_CAMERA = -Math.PI / 2;
const WALK = 2.4;
/** Linha onde as equipes se alinham (y do campo, mais perto do lado do túnel que da câmera). */
const lineY = () => MID_Y + 7;

/** Lugar de cada atleta na fila do hino: mandante à esquerda, visitante à direita; goleiro na ponta de fora. */
export function lineupSpot(a: Pick<Agent, 'side' | 'idx'>): { x: number; y: number } {
  const slot = a.idx === 0 ? 0 : a.idx; // 0 = goleiro (ponta externa)
  const step = 1.25;
  return a.side === 'home' ? { x: CENTER.x - 1.0 - (10 - slot) * step, y: lineY() } : { x: CENTER.x + 1.0 + (10 - slot) * step, y: lineY() };
}
/** Mão no peito ou mãos para trás (alternando; o goleiro e o capitão, de peito). */
export const anthemKind = (a: Pick<Agent, 'side' | 'idx'>): 'anthem_chest' | 'anthem_back' => (a.idx === 0 || a.idx === 5 || (a.idx * 5 + (a.side === 'home' ? 1 : 2)) % 3 === 0 ? 'anthem_chest' : 'anthem_back');

/** Começa a cerimônia: todos saem do túnel no lado oposto à câmera. */
export function startCeremony(w: World) {
  w.ceremony = { t0: w.t, stage: 'enter', stageT0: w.t };
  w.script = null; w.queue = []; w.banner = null; w.card = null;
  ballToCenter(w);
  for (const a of w.agents) {
    const spot = lineupSpot(a);
    a.x = CENTER.x + (spot.x - CENTER.x) * 0.18; a.y = W + 3.4 + a.idx * 0.55; // saem em fila do túnel (estreito) e depois abrem na linha a.vx = a.vy = 0; a.heading = FACE_CAMERA; a.face = FACE_CAMERA; a.state = 'play'; a.act = undefined;
    a.tx = spot.x; a.ty = spot.y; a.ov = { x: spot.x, y: spot.y, speed: WALK, until: w.t + 99 };
  }
  const [ref, ar1, ar2] = w.refs;
  if (ref) { ref.x = CENTER.x; ref.y = W + 3.0; ref.heading = FACE_CAMERA; ref.face = FACE_CAMERA; ref.ov = { x: CENTER.x, y: lineY() - 4.5, speed: WALK, until: w.t + 99 }; }
  if (ar1) { ar1.x = CENTER.x - 2; ar1.y = W + 3.0; ar1.face = FACE_CAMERA; ar1.ov = { x: CENTER.x - 17, y: lineY(), speed: WALK, until: w.t + 99 }; }
  if (ar2) { ar2.x = CENTER.x + 2; ar2.y = W + 3.0; ar2.face = FACE_CAMERA; ar2.ov = { x: CENTER.x + 17, y: lineY(), speed: WALK, until: w.t + 99 }; }
  w.camX = CENTER.x; w.span = 62;
}

/** Pula a cerimônia: todos nas posições do apito inicial. */
export function skipCeremony(w: World) {
  if (!w.ceremony) return;
  endCeremony(w);
}

function endCeremony(w: World) {
  w.ceremony = null;
  for (const a of [...w.agents, ...w.refs]) { a.face = undefined; a.ov = undefined; a.act = undefined; }
  placeFormation(w, playState([], 0, 0), 0); ballToCenter(w);
  const [ref, ar1, ar2] = w.refs;
  if (ref) { ref.x = CENTER.x - 6; ref.y = MID_Y + 9; } if (ar1) { ar1.x = L * 0.3; ar1.y = -1.4; } if (ar2) { ar2.x = L * 0.7; ar2.y = W + 1.4; }
}

const arrived = (a: Agent) => !a.ov || Math.hypot(a.ov.x - a.x, a.ov.y - a.y) < 0.35;

/** Um passo da cerimônia (chamado a cada quadro). */
export function stepCeremony(w: World) {
  const c = w.ceremony; if (!c) return;
  const all = [...w.agents, ...w.refs];
  const el = w.t - c.stageT0;
  if (c.stage === 'enter') {
    if (all.every(arrived) || el > CEREMONY.enterMax) { // chegaram: de frente para a câmera, mão no peito ou para trás
      c.stage = 'anthem'; c.stageT0 = w.t;
      for (const a of all) { a.vx = a.vy = 0; a.face = FACE_CAMERA; const kind = a.role ? 'anthem_back' : anthemKind(a); a.act = { kind, t0: w.t, dur: CEREMONY.anthem * 1.25, dir: a.idx % 2 ? 1 : -1 }; if (a.ov) a.ov = { ...a.ov, until: w.t + 99, speed: 1 }; }
    }
  } else if (c.stage === 'anthem') {
    if (el >= CEREMONY.anthem) { // acabou o hino: aplauso rápido e cada um vai para a sua posição
      c.stage = 'break'; c.stageT0 = w.t;
      const tg = kickoffTargets(w);
      for (const a of w.agents) { const p = tg[a.id]; a.face = undefined; a.act = { kind: 'applaud_crowd', t0: w.t, dur: 2.4, dir: 1 }; a.ov = { x: p.x, y: p.y, speed: 3.2, until: w.t + 99 }; }
      for (const a of w.refs) { a.face = undefined; a.act = undefined; }
      const [ref, ar1, ar2] = w.refs;
      if (ref) ref.ov = { x: CENTER.x - 6, y: MID_Y + 9, speed: 3, until: w.t + 99 }; if (ar1) ar1.ov = { x: L * 0.3, y: -1.4, speed: 3, until: w.t + 99 }; if (ar2) ar2.ov = { x: L * 0.7, y: W + 1.4, speed: 3, until: w.t + 99 };
    }
  } else if (el >= CEREMONY.brk) endCeremony(w);
}
