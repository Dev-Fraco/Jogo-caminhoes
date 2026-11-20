import { strikeDelay, type ActKind } from './anim';
import { positionsOf, type PlayState, type Pt, type Side } from '../pitch';
import { BALL_R, CENTER, L, MID_Y, SX, SY, W, clamp, dist2, goalXOf, hash, holderOf, isHolding, kickTo, scheduleKick, sgnOf, startAct, toWorld, type Agent, type World } from './world';

/* =====================================================================
   O "cérebro" do jogo corrido: entre os lances da narração (gol, defesa, falta...), os 22 jogadores decidem sozinhos o que fazer.
   - quem está com a bola avalia os companheiros (progresso, espaço livre, linha de passe) e passa, ou conduz a bola desviando do marcador;
   - os companheiros mais perto oferecem opção (triângulos), os atacantes buscam as costas da defesa sem ficar em impedimento;
   - o marcador mais perto pressiona, o segundo cobre; na dividida há desarme (carrinho ou de pé) e a bola muda de dono; passes podem ser interceptados;
   - a bola solta é disputada pelos mais perto; o goleiro se posiciona na bissetriz entre a bola e o gol;
   - quem vai fazer o próximo lance da narração (o autor do gol, da finalização...) recebe a bola no caminho: a jogada nasce do jogo.
   O resultado nunca depende daqui: é só a encenação entre os lances.
   ===================================================================== */

export interface Brain {
  /** próximo instante de decisão */ next: number;
  passAt: number; gotAt: number; tackleAt: number; lastTouch: Side | 'none';
  /** quem deve receber a bola para fazer o próximo lance da narração */ focus: { side: Side; slot: number } | null;
  /** lado que vai atacar em breve (o próximo lance é dele): ganha mais a bola */ bias: Side | 'none';
  /** desarme em andamento */ tackle: { at: number; tackler: number; victim: number; ok: boolean } | null;
  /** passe que será interceptado */ icept: { who: number; x: number; y: number } | null;
  /** reposição depois da bola sair (tiro lateral): quem vai cobrar e quando */ restart: { at: number; taker: number; x: number; y: number } | null;
  stats: { passes: number; tackles: number; intercepts: number; dribbles: number };
}
export const newBrain = (): Brain => ({ next: 0, passAt: -9, gotAt: -9, tackleAt: -9, lastTouch: 'none', focus: null, bias: 'none', tackle: null, icept: null, restart: null, stats: { passes: 0, tackles: 0, intercepts: 0, dribbles: 0 } });

export const THINK = 0.25;
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const logical = (w: World, x: number, y: number): Pt => (w.flip ? { x: (L - x) / SX, y: (W - y) / SY } : { x: x / SX, y: y / SY });
type BallT = World['ball'] & { target?: number };
const sideAgents = (w: World, s: Side) => w.agents.filter((a) => a.side === s && a.off !== 'gone' && a.off !== 'walking');
const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1; const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); };

/** Dá a bola a um jogador (ele a domina). */
export function giveBall(w: World, a: Agent, control = true) {
  const b = w.ball as BallT;
  b.mode = 'carried'; b.carrier = a.id; b.target = undefined; b.v = { x: 0, y: 0, z: 0 }; b.lastSide = a.side;
  w.brain.lastTouch = a.side; w.brain.gotAt = w.t; w.brain.icept = null;
  w.flow.carrier = a.id; w.flow.side = a.side; w.flow.st = { ...w.flow.st, possession: a.side };
  if (control && (!a.act || a.act.t0 + a.act.dur < w.t)) startAct(w, a, w.ball.p.z > 1.1 ? 'control_chest' : 'control', 1);
}

/** Saída de bola: o time dá a saída com o atacante do meio, todos nas suas posições. */
export function kickoffFor(w: World, side: Side) {
  const striker = holderOf(w, side, w.formations[side] ? 10 : 10);
  const b = w.ball as BallT;
  b.p = { x: CENTER.x, y: CENTER.y, z: BALL_R }; b.v = { x: 0, y: 0, z: 0 };
  striker.x = CENTER.x - sgnOf(side, w.flip) * 0.9; striker.y = CENTER.y; striker.vx = striker.vy = 0; striker.heading = sgnOf(side, w.flip) > 0 ? 0 : Math.PI;
  giveBall(w, striker, false); w.brain.passAt = w.t - 0.3;
}

/** Estado sintético do jogo (para as posições-base da formação): quem tem a bola e onde ela está. */
const synthState = (w: World, poss: Side | 'none'): PlayState => ({ possession: poss, push: poss === 'none' ? 0.2 : 0.65, ball: logical(w, w.ball.p.x, w.ball.p.y), goalNow: null, carrier: -1 });

/** Um passo de decisão (a cada THINK segundos) quando o jogo está correndo. */
export function thinkPlay(w: World) {
  const br = w.brain;
  if (w.t < br.next || isHolding(w)) return;
  br.next = w.t + THINK;
  const b = w.ball as BallT;
  const A = w.agents.filter((a) => a.off !== 'gone' && a.off !== 'walking');

  // ---- reposição (bola saiu) ----
  if (br.restart) {
    const r = br.restart, taker = w.agents[r.taker];
    taker.ov = { x: r.x, y: r.y, speed: 6.5, until: w.t + 1 };
    if (w.t >= r.at && (dist2(taker.x, taker.y, r.x, r.y) < 0.9 || w.t >= r.at + 4)) { b.p = { x: r.x, y: r.y, z: BALL_R }; b.v = { x: 0, y: 0, z: 0 }; startAct(w, taker, 'throw', 1); br.restart = null; giveBall(w, taker, false); } // o batedor chega correndo à bola
    return;
  }
  // ---- bola fora do campo: reposição pelo adversário de quem tocou por último ----
  if (b.p.x < -0.4 || b.p.x > L + 0.4 || b.p.y < -0.4 || b.p.y > W + 0.4) {
    const spot = { x: clamp(b.p.x, 1.2, L - 1.2), y: b.p.y < MID_Y ? 0.4 : W - 0.4 };
    if (b.p.x < 1.2 || b.p.x > L - 1.2) { spot.y = clamp(b.p.y, 6, W - 6); spot.x = b.p.x < MID_Y ? 6 : L - 6; } // saída pela linha de fundo: o time da defesa repõe da pequena área (simplificado)
    const side = other(br.lastTouch === 'none' ? 'home' : br.lastTouch);
    const taker = sideAgents(w, side).filter((a) => a.idx > 0).sort((p, q) => dist2(p.x, p.y, spot.x, spot.y) - dist2(q.x, q.y, spot.x, spot.y))[0];
    if (taker) { b.mode = 'free'; b.v = { x: 0, y: 0, z: 0 }; b.p = { x: spot.x, y: spot.y, z: BALL_R }; b.carrier = -1; b.target = undefined; br.restart = { at: w.t + 1.4, taker: taker.id, x: spot.x, y: spot.y }; }
    return;
  }

  // ---- desarme em andamento ----
  if (br.tackle && w.t >= br.tackle.at) {
    const t = br.tackle; br.tackle = null;
    const tackler = w.agents[t.tackler], victim = w.agents[t.victim];
    if (t.ok && b.mode === 'carried' && b.carrier === victim.id) { // a bola escapa do dono e o desarmador a domina
      br.stats.tackles++;
      const dir = sgnOf(tackler.side, w.flip);
      const to = { x: clamp(tackler.x + dir * 2.4, 2, L - 2), y: clamp(tackler.y + (hash(w.t * 9) - 0.5) * 3, 2, W - 2), z: BALL_R };
      w.ball.p = { x: (victim.x + tackler.x) / 2, y: (victim.y + tackler.y) / 2, z: BALL_R }; b.carrier = victim.id; kickTo(w, to, 0.55, true); b.target = tackler.id; br.lastTouch = tackler.side; b.carrier = -1;
      w.flow.carrier = tackler.id; w.flow.side = tackler.side; w.flow.st = { ...w.flow.st, possession: tackler.side };
      startAct(w, victim, 'duel', 1);
    }
  }
  // ---- passe que vai ser interceptado ----
  if (br.icept && b.mode === 'free') {
    const a = w.agents[br.icept.who];
    a.ov = { x: br.icept.x, y: br.icept.y, speed: 7.6, until: w.t + 1 };
    if (dist2(b.p.x, b.p.y, a.x, a.y) < 1.5 && b.p.z < 1.8) { br.stats.intercepts++; startAct(w, a, b.p.z > 1 ? 'intercept_jump' : 'intercept_stretch', 1); giveBall(w, a, false); }
  }

  // ---- posse: quem tem a bola ----
  let poss: Side | 'none' = 'none';
  let carrier: Agent | null = null;
  if (b.mode === 'carried') { carrier = w.agents[b.carrier] ?? null; if (carrier) poss = carrier.side; }
  else if (b.target !== undefined) poss = w.agents[b.target]?.side ?? 'none';
  else if (w.flow.side !== 'none') poss = w.flow.side;
  w.flow = { ...w.flow, side: poss, carrier: carrier ? carrier.id : b.target !== undefined ? b.target : -1, st: { ...w.flow.st, possession: poss, ball: logical(w, b.p.x, b.p.y), push: poss === 'none' ? 0.2 : 0.65 } };

  // ---- posições-base de cada time (formação deslocada pelo jogo) ----
  const tick = Math.floor(w.t / 3);
  const st = synthState(w, poss);
  const hp = positionsOf('home', w.formations.home, st, tick).map((p) => toWorld(p, w.flip)), ap = positionsOf('away', w.formations.away, st, tick).map((p) => toWorld(p, w.flip));
  for (const a of A) { const p = (a.side === 'home' ? hp : ap)[a.idx]; a.tx = p.x; a.ty = p.y; if (a.ov && a.ov.until <= w.t) a.ov = undefined; }

  const ballAt = { x: b.p.x, y: b.p.y };
  // ---- goleiros: na bissetriz entre a bola e o gol ----
  for (const s of ['home', 'away'] as Side[]) {
    const gk = holderOf(w, s, 0); if (gk.off || gk === carrier) continue;
    const gx = goalXOf(other(s), w.flip), into = gx === 0 ? 1 : -1; // gol que o goleiro defende e o sentido "para dentro" do campo
    const dBall = Math.abs(ballAt.x - gx);
    if (dBall < 45) { gk.tx = gx + into * clamp(1.6 + dBall * 0.07, 1.6, 7); gk.ty = MID_Y + clamp((ballAt.y - MID_Y) * 0.2, -3.2, 3.2); }
  }

  if (poss === 'none') { chaseLoose(w, A); return; }
  const D: Side = other(poss);
  const dir = sgnOf(poss, w.flip), goalX = goalXOf(poss, w.flip);
  const mine = sideAgents(w, poss), foes = sideAgents(w, D);

  // ---- defesa: pressão e cobertura ----
  const presser = foes.filter((a) => a.idx > 0).sort((p, q) => dist2(p.x, p.y, ballAt.x, ballAt.y) - dist2(q.x, q.y, ballAt.x, ballAt.y));
  if (presser[0]) { const a = presser[0]; a.tx = ballAt.x + (carrier ? carrier.vx * 0.25 : 0) + dir * 1.3; a.ty = ballAt.y + (carrier ? carrier.vy * 0.25 : 0); /* o marcador vem de frente, a ~2 m do portador */ a.ov = { x: a.tx, y: a.ty, speed: 7.2, until: w.t + 0.5 }; }
  if (presser[1]) { const a = presser[1]; a.tx = ballAt.x + Math.sign(goalX - ballAt.x) * 4.5; a.ty = ballAt.y + (MID_Y - ballAt.y) * 0.3; } // cobertura: atrás do que pressiona, no sentido do gol que defende
  // linha de impedimento: o último defensor (sem o goleiro)
  const lastLine = dir > 0 ? Math.max(...foes.filter((a) => a.idx > 0).map((a) => a.x), CENTER.x) : Math.min(...foes.filter((a) => a.idx > 0).map((a) => a.x), CENTER.x);

  // ---- ataque: apoio, triângulos e corridas nas costas da defesa ----
  if (carrier) {
    const ordered = mine.filter((a) => a.idx > 0 && a.id !== carrier!.id).sort((p, q) => dist2(p.x, p.y, carrier!.x, carrier!.y) - dist2(q.x, q.y, carrier!.x, carrier!.y));
    ordered.slice(0, 2).forEach((a, i) => { // os dois mais perto oferecem opção: um à frente-aberto, outro atrás-aberto
      const side = (carrier!.y > MID_Y ? -1 : 1) * (i === 0 ? 1 : -1);
      a.tx = clamp(carrier!.x + dir * (i === 0 ? 6 : -4), 3, L - 3); a.ty = clamp(carrier!.y + side * (i === 0 ? 9 : 7), 4, W - 4);
    });
    for (const a of mine) {
      if (a.idx === 0 || a.id === carrier.id || ordered.slice(0, 2).includes(a)) continue;
      if (a.idx >= 7) { // atacantes e pontas: buscam as costas da defesa, sempre atrás da linha de impedimento
        const want = a.tx + dir * 7;
        a.tx = dir > 0 ? Math.min(want, lastLine - 0.8) : Math.max(want, lastLine + 0.8);
      }
    }
  }
  // desmarcação: ninguém fica colado em um adversário
  for (const a of mine) {
    if (a.idx === 0 || (carrier && a.id === carrier.id)) continue;
    const near = foes.filter((f) => f.idx > 0).sort((p, q) => dist2(p.x, p.y, a.tx, a.ty) - dist2(q.x, q.y, a.tx, a.ty))[0];
    if (near && dist2(near.x, near.y, a.tx, a.ty) < 2.5) a.ty = clamp(a.ty + (a.ty > near.y ? 3 : -3), 2, W - 2);
  }

  if (!carrier) { // bola no ar a caminho de alguém: o destinatário vai buscar
    const tgt = b.target !== undefined ? w.agents[b.target] : undefined;
    if (tgt) { tgt.tx = b.p.x + b.v.x * 0.6; tgt.ty = b.p.y + b.v.y * 0.6; tgt.ov = { x: tgt.tx, y: tgt.ty, speed: 7.4, until: w.t + 0.4 }; }
    return;
  }

  // ---- decisão de quem está com a bola ----
  carrierThink(w, carrier, mine, foes, dir, goalX);
}

/** Bola solta: os dois mais perto (um de cada time) disputam; quem chega primeiro domina. */
function chaseLoose(w: World, A: Agent[]) {
  const b = w.ball;
  const by = (s: Side) => A.filter((a) => a.side === s && a.idx > 0).sort((p, q) => dist2(p.x, p.y, b.p.x, b.p.y) - dist2(q.x, q.y, b.p.x, b.p.y))[0];
  const sp = Math.hypot(b.v.x, b.v.y);
  const aim = { x: b.p.x + b.v.x * 0.5, y: b.p.y + b.v.y * 0.5 };
  const cands = (['home', 'away'] as Side[]).map(by).filter(Boolean) as Agent[];
  for (const a of cands) a.ov = { x: aim.x, y: aim.y, speed: 7.4, until: w.t + 0.5 };
  const gks = [holderOf(w, 'home', 0), holderOf(w, 'away', 0)].filter((g) => dist2(g.x, g.y, b.p.x, b.p.y) < 9);
  const first = [...cands, ...gks].find((a) => dist2(a.x, a.y, b.p.x, b.p.y) < 1.1 && b.p.z < 1.5 && sp < 9);
  if (first) giveBall(w, first);
}

/** O que o portador faz: passa (para quem tem espaço e linha livre) ou conduz a bola desviando do marcador. */
function carrierThink(w: World, c: Agent, mine: Agent[], foes: Agent[], dir: number, goalX: number) {
  const br = w.brain;
  const near = foes.filter((f) => f.idx > 0).sort((p, q) => dist2(p.x, p.y, c.x, c.y) - dist2(q.x, q.y, c.x, c.y));
  const pressure = near[0] ? dist2(near[0].x, near[0].y, c.x, c.y) : 99;
  const held = w.t - br.gotAt;
  const acting = !!c.act && c.act.t0 + c.act.dur > w.t && /pass|control|throw|cross|clear/.test(c.act.kind);

  // desarme: o marcador mais perto tenta tirar a bola (carrinho se o portador está em velocidade)
  if (!acting && near[0] && pressure < 2.2 && w.t - br.tackleAt > 1.1 && held > 0.5 && !br.tackle) {
    const t = near[0]; br.tackleAt = w.t;
    const spd = Math.hypot(c.vx, c.vy), bias = br.bias === 'none' ? 0 : br.bias === t.side ? 0.22 : -0.1;
    const slide = spd > 4.5 && hash(w.t * 3 + t.id) < 0.35;
    const kind: ActKind = slide ? 'tackle' : hash(w.t * 5 + t.id) < 0.5 ? 'tackle_stand' : 'tackle_block';
    startAct(w, t, kind, hash(t.id + w.t) > 0.5 ? 1 : -1);
    br.tackle = { at: w.t + strikeDelay(kind) + 0.05, tackler: t.id, victim: c.id, ok: hash(w.t * 7 + c.id * 3) < 0.34 + bias };
    if (!br.tackle.ok) startAct(w, c, hash(w.t) < 0.5 ? 'dribble_feint_l' : 'dribble_feint_r', 1); // driblou: o desarme falhou
    return;
  }
  if (acting || w.kickQ) return;

  // opções de passe
  const focus = br.focus && br.focus.side === c.side ? holderOf(w, c.side, br.focus.slot) : null;
  let best: { a: Agent; score: number; lane: number } | null = null;
  for (const a of mine) {
    if (a.id === c.id || a.off) continue;
    if (a.idx === 0 && !(pressure < 5 || c.idx <= 2)) continue; // só recua para o goleiro sob pressão
    const d = dist2(a.x, a.y, c.x, c.y);
    if (d < 4.5 || d > 42) continue;
    const progress = ((a.x - c.x) * dir) / 30;
    const open = Math.min(14, ...foes.filter((f) => f.idx > 0).map((f) => dist2(f.x, f.y, a.x, a.y))) / 9;
    const lane = Math.min(10, ...foes.map((f) => segDist(f.x, f.y, c.x, c.y, a.x, a.y)));
    const offside = (dir > 0 ? a.x > Math.max(...foes.filter((f) => f.idx > 0).map((f) => f.x)) : a.x < Math.min(...foes.filter((f) => f.idx > 0).map((f) => f.x))) && Math.abs(a.x - CENTER.x) > 1 && ((a.x - c.x) * dir) > 0 && false; // (impedimento: já evitado nas corridas)
    if (offside) continue;
    const score = 0.9 * progress + 0.55 * clamp(open, 0, 1.3) + 0.8 * clamp(lane / 4, 0, 1.2) - 0.012 * Math.abs(d - 16) + (a.idx >= 7 ? 0.1 : 0) + (focus && a.id === focus.id ? 0.55 : 0) + (a.idx === 0 ? -0.3 : 0) + hash(w.t * 11 + a.id) * 0.18;
    if (!best || score > best.score) best = { a, score, lane };
  }
  const inFinalThird = Math.abs(goalX - c.x) < 24;
  const wantPass = !!best && w.t - br.passAt > 0.7 && held > 0.5 && (pressure < 5 || held > 1.3 || (inFinalThird && held > 0.8) || (best.score > 1.25 && held > 1.0) || (!!focus && best.a.id === focus.id && held > 0.7));
  if (best && wantPass) { doPass(w, c, best.a, foes, best.lane); return; }

  // condução: segue para o gol adversário desviando do marcador; perto da área, toca de lado em vez de entrar sozinho
  const away = near[0] && pressure < 7 ? (c.y > near[0].y ? 1 : -1) : (MID_Y - c.y) * 0.04 > 0 ? 1 : -1;
  const stop = goalX - dir * 20;
  const tx = (dir > 0 ? Math.min(c.x + 9, stop) : Math.max(c.x - 9, stop)), ty = clamp(c.y + away * (pressure < 7 ? 4.5 : 1.2), 4, W - 4);
  c.tx = tx; c.ty = ty; c.ov = { x: tx, y: ty, speed: pressure < 5 ? 6.4 : 5.2, until: w.t + 0.45 };
  if (near[0] && pressure < 4.2 && w.t - br.passAt > 0.9 && hash(Math.floor(w.t * 2) + c.id) < 0.28 && !c.act) { br.stats.dribbles++; startAct(w, c, (['dribble_stepover', 'dribble_feint_l', 'dribble_feint_r', 'dribble_dragback', 'dribble_cruyff', 'dribble_roulette', 'dribble_elastico'] as ActKind[])[Math.floor(hash(w.t * 13 + c.id) * 7)], 1); }
}

/** Executa o passe: escolhe o tipo (curto, em profundidade, lançamento, de letra...), mira à frente do recebedor e avalia a interceptação. */
function doPass(w: World, c: Agent, to: Agent, foes: Agent[], lane: number) {
  const br = w.brain;
  const d = dist2(c.x, c.y, to.x, to.y);
  const T = clamp(d / 17, 0.35, 1.5);
  const lead = { x: clamp(to.x + to.vx * T * 0.6, 1.5, L - 1.5), y: clamp(to.y + to.vy * T * 0.6, 1.5, W - 1.5), z: BALL_R };
  const dir = sgnOf(c.side, w.flip), ahead = (to.x - c.x) * dir;
  let kind: ActKind;
  if (c.idx === 0) kind = d > 26 ? 'gk_goal_kick' : 'gk_throw_roll';
  else if (d > 32) kind = 'long_pass';
  else if (ahead > 12 && Math.hypot(to.vx, to.vy) > 3) kind = hash(w.t * 3 + c.id) < 0.6 ? 'pass_through' : 'pass_lob';
  else if (d < 9 && hash(w.t * 7 + c.id) < 0.18) kind = 'pass_backheel';
  else if (T < 0.6) kind = 'pass_first';
  else kind = hash(w.t * 5 + c.id) < 0.3 ? 'pass_outside' : 'pass';
  const air = d > 22 || kind === 'pass_lob';
  startAct(w, c, kind, hash(c.id * 5 + Math.floor(w.t)) > 0.3 ? 1 : -1);
  const dly = c.idx === 0 ? 0.3 : strikeDelay(kind);
  scheduleKick(w, dly, lead, T, !air && d < 38, d > 22 ? (hash(c.id + Math.floor(w.t * 3)) - 0.5) * 3 : 0, to.id, c.side);
  br.passAt = w.t; br.stats.passes++; br.lastTouch = c.side;
  w.flow.carrier = to.id; w.flow.side = c.side;
  // interceptação: algum adversário está na linha do passe
  br.icept = null;
  const ic = foes.filter((f) => f.idx > 0).map((f) => ({ f, dd: segDist(f.x, f.y, c.x, c.y, lead.x, lead.y) })).sort((p, q) => p.dd - q.dd)[0];
  if (ic && ic.dd < 2.2 && lane < 2.2 && hash(w.t * 17 + ic.f.id) < 0.32 + (br.bias === ic.f.side ? 0.2 : 0)) {
    const t = clamp(((ic.f.x - c.x) * (lead.x - c.x) + (ic.f.y - c.y) * (lead.y - c.y)) / (d * d || 1), 0.25, 0.85);
    br.icept = { who: ic.f.id, x: c.x + (lead.x - c.x) * t, y: c.y + (lead.y - c.y) * t };
  }
}
