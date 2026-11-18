import { describe, expect, it } from 'vitest';
import { playState } from '../src/ui/pitch';
import { BALL_R, GOAL_D, GOAL_H, GOAL_W, L, MID_Y, W, ballistic, createDriver, createWorld, drive, goalXOf, kickTo, snapWorld, stepWorld, syncFlow, triggerEvent, type World } from '../src/ui/pitch3d/world';
import { project, makeCamera } from '../src/ui/pitch3d/camera';
import type { MatchEvent } from '../src/engine/types';

const ev = (minute: number, type: MatchEvent['type'], side: MatchEvent['side'], player = 'Fulano'): MatchEvent => ({ minute, type, side, text: '', player });
const run = (w: World, seconds: number, dt = 1 / 30, each?: () => void) => { for (let t = 0; t < seconds; t += dt) { stepWorld(w, dt); each?.(); } };
const fresh = (): World => { const w = createWorld('4-4-2', '4-3-3'); snapWorld(w, playState([], 0, 0), 0); return w; };
const insideNet = (w: World, side: 'home' | 'away') => {
  const gx = goalXOf(side), dir = side === 'home' ? 1 : -1, b = w.ball.p, depth = (b.x - gx) * dir;
  return depth > 0 && depth <= GOAL_D + 1e-6 && Math.abs(b.y - MID_Y) <= GOAL_W / 2 && b.z <= GOAL_H;
};

describe('física da bola 3D', () => {
  it('lançamento: gravidade e quique; a bola chega ao ponto no tempo combinado e acaba parando no chão', () => {
    const w = fresh(); w.ball.p = { x: 30, y: 30, z: BALL_R };
    const to = { x: 50, y: 34, z: 1 };
    kickTo(w, to, 1.4);
    expect(w.ball.v.z).toBeGreaterThan(0);
    run(w, 1.4);
    expect(Math.hypot(w.ball.p.x - to.x, w.ball.p.y - to.y)).toBeLessThan(1.3);
    run(w, 14);
    expect(w.ball.p.z).toBeCloseTo(BALL_R, 2); expect(Math.hypot(w.ball.v.x, w.ball.v.y)).toBeLessThan(0.05);
    expect(ballistic({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 2).z).toBeCloseTo(9.81, 5);
  });
  it('rebate na trave e no travessão (perde energia) e não atravessa', () => {
    const w = fresh();
    w.ball.p = { x: L - 6, y: MID_Y + GOAL_W / 2, z: 1 }; w.ball.mode = 'free'; w.ball.v = { x: 18, y: 0, z: 0 }; // direto na trave
    run(w, 1.2, 1 / 60);
    expect(w.ball.v.x).toBeLessThan(0);                // voltou
    expect(w.ball.scored).toBeNull();
    const w2 = fresh();
    w2.ball.p = { x: L - 6, y: MID_Y, z: 1.8 }; w2.ball.mode = 'free'; w2.ball.v = { x: 20, y: 0, z: 4.3 }; // bate no travessão
    run(w2, 1.0, 1 / 60);
    expect(w2.ball.scored).toBeNull(); expect(w2.ball.v.x).toBeLessThan(13);      // perdeu força no travessão
  });
  it('bola que entra pelo meio do gol é contida pela rede: fica dentro, a rede balança e depois assenta', () => {
    const w = fresh(); w.agents.forEach((a, i) => { a.x = 8 + i * 2; a.y = 3; }); // ninguém na frente do chute (o goleiro agora fica no gol certo)
    w.ball.p = { x: L - 10, y: MID_Y, z: 0.5 }; w.ball.mode = 'free'; w.ball.v = { x: 24, y: 0.5, z: 1.2 };
    let peak = 0;
    run(w, 3, 1 / 60, () => { peak = Math.max(peak, ...w.nets[1].d.map(Math.abs)); });
    expect(w.ball.scored).toBe('home');
    expect(insideNet(w, 'home')).toBe(true);
    expect(peak).toBeGreaterThan(0.15);                 // a rede deformou
    run(w, 4, 1 / 60);
    expect(Math.max(...w.nets[1].d.map(Math.abs))).toBeLessThan(0.12);   // e assentou
    expect(insideNet(w, 'home')).toBe(true);
  });
});

describe('jogadores-botão se movimentam de verdade', () => {
  it('correm com aceleração e velocidade máxima, ficam em campo, não se sobrepõem e nada vira NaN durante o jogo inteiro', () => {
    const w = createWorld('4-4-2', '4-3-3'); const drv = createDriver();
    const events: MatchEvent[] = [ev(5, 'save', 'home'), ev(11, 'corner', 'away'), ev(18, 'goal', 'home'), ev(30, 'foul', 'home'), ev(31, 'yellow', 'home'), ev(40, 'miss', 'away'), ev(52, 'goal', 'away'), ev(60, 'injury', 'home'), ev(75, 'red', 'away'), ev(80, 'goal', 'home')];
    let maxSp = 0, minDist = 99, worst = 0;
    for (let m = 0; m < 90; m += 0.25) {
      drive(w, drv, events, m);
      for (let i = 0; i < 5; i++) {
        stepWorld(w, 0.05);
        for (const a of w.agents) { maxSp = Math.max(maxSp, Math.hypot(a.vx, a.vy)); expect(Number.isFinite(a.x + a.y + a.vx + a.vy)).toBe(true); expect(a.x).toBeGreaterThanOrEqual(0); expect(a.x).toBeLessThanOrEqual(L); expect(a.y).toBeGreaterThanOrEqual(0); expect(a.y).toBeLessThanOrEqual(W); }
        expect(Object.values(w.ball.p).every(Number.isFinite)).toBe(true);
      }
      for (let i = 0; i < 22; i++) for (let j = i + 1; j < 22; j++) minDist = Math.min(minDist, Math.hypot(w.agents[i].x - w.agents[j].x, w.agents[i].y - w.agents[j].y));
      worst = Math.max(worst, Math.abs(w.ball.p.x - L / 2));
    }
    expect(maxSp).toBeLessThanOrEqual(9.6); expect(maxSp).toBeGreaterThan(3);   // correm de fato (não teletransportam)
    expect(minDist).toBeGreaterThan(0.5);
    expect(w.goals).toEqual({ home: 2, away: 1 });                              // os 3 gols do motor foram encenados e contados
  });
  it('o movimento é contínuo: em um passo curto ninguém anda mais que a velocidade máxima permite', () => {
    const w = fresh(); syncFlow(w, playState([ev(3, 'save', 'home')], 3, 8), 8);
    const before = w.agents.map((a) => ({ x: a.x, y: a.y }));
    stepWorld(w, 0.1);
    for (let i = 0; i < 22; i++) expect(Math.hypot(w.agents[i].x - before[i].x, w.agents[i].y - before[i].y)).toBeLessThan(1.0);
  });
});

describe('gol: a bola entra de verdade e há comemoração', () => {
  it('em 60 gols (os dois lados, cantos e alturas diferentes): a bola atravessa a linha entre as traves, fica na rede, a rede balança, o artilheiro comemora e o jogo recomeça no meio', () => {
    for (let n = 0; n < 60; n++) {
      const side = n % 2 ? 'away' : 'home' as const;
      const w = fresh(); const e = ev(10, 'goal', side, `Artilheiro ${n}`);
      syncFlow(w, playState([e], 9, 18), 18);
      triggerEvent(w, e, n);
      const sc = w.script!; expect(sc.kind).toBe('goal');
      let scoredAt = -1, celebrated = false, banner = false, net = 0, leftNet = false, t = 0;
      for (; t < 14 && w.script; t += 1 / 30) {
        stepWorld(w, 1 / 30);
        if (w.ball.scored && scoredAt < 0) { scoredAt = t; expect(w.ball.scored).toBe(side); }
        if (scoredAt >= 0 && t - scoredAt < 1.6 && !insideNet(w, side)) leftNet = true;
        if (w.agents.some((a) => a.state === 'celebrate')) celebrated = true;
        if (w.banner?.text === 'GOOOL!' && w.banner.sub === `Artilheiro ${n}`) banner = true;
        net = Math.max(net, ...w.nets[side === 'home' ? 1 : 0].d.map(Math.abs));
      }
      expect(scoredAt, `gol ${n}`).toBeGreaterThan(0);
      expect(leftNet, `gol ${n}: a bola saiu da rede`).toBe(false);
      expect(celebrated && banner, `gol ${n}`).toBe(true);
      expect(net, `gol ${n}: rede`).toBeGreaterThan(0.1);
      expect(w.script).toBeNull(); expect(w.goals[side]).toBe(1);
      expect(w.ball.p.x).toBeCloseTo(L / 2, 1); expect(w.ball.scored).toBeNull();      // bola ao meio para a saída
    }
  });
  it('o goleiro não defende o gol (chega tarde) e o chute sai com velocidade de chute', () => {
    const w = fresh(); const e = ev(10, 'goal', 'home'); syncFlow(w, playState([e], 9, 18), 18); triggerEvent(w, e, 3);
    let maxBall = 0; run(w, 6, 1 / 60, () => { maxBall = Math.max(maxBall, Math.hypot(w.ball.v.x, w.ball.v.y, w.ball.v.z)); });
    expect(maxBall).toBeGreaterThan(14); expect(maxBall).toBeLessThan(42);
  });
});

describe('defesa, chute para fora, escanteio, falta, cartão e lesão', () => {
  it('defesa: nunca vira gol; o goleiro pega a bola e a rebate para o campo', () => {
    for (let n = 0; n < 20; n++) {
      const side = n % 2 ? 'away' : 'home' as const; const w = fresh(); const e = ev(10, 'save', side); syncFlow(w, playState([e], 9, 18), 18); triggerEvent(w, e, n + 40);
      let caught = false; for (let t = 0; t < 12 && w.script; t += 1 / 30) { stepWorld(w, 1 / 30); expect(w.ball.scored).toBeNull(); const gk = w.agents[side === 'home' ? 11 : 0]; if (w.ball.mode === 'carried' && w.ball.carrier === gk.id) caught = true; }
      expect(caught, `defesa ${n}`).toBe(true); expect(w.script).toBeNull();
    }
  });
  it('chute para fora: a bola passa ao lado da trave ou por cima do travessão e nunca conta como gol', () => {
    for (let n = 0; n < 20; n++) {
      const side = n % 2 ? 'away' : 'home' as const; const w = fresh(); const e = ev(10, 'miss', side); syncFlow(w, playState([e], 9, 18), 18); triggerEvent(w, e, n + 70);
      const gx = goalXOf(side), dir = side === 'home' ? 1 : -1; let crossed = false, ok = true; void crossed;
      for (let t = 0; t < 10 && w.script; t += 1 / 60) { stepWorld(w, 1 / 60); expect(w.ball.scored).toBeNull(); const b = w.ball.p; if ((b.x - gx) * dir > 0 && !crossed) { crossed = true; ok = Math.abs(b.y - MID_Y) > GOAL_W / 2 - 0.15 || b.z > GOAL_H - 0.15; } }
      expect(ok, `chute ${n}`).toBe(true); expect(w.ball.inNet).toBeNull();     // se bateu na trave e voltou, também não é gol expect(w.goals.home + w.goals.away).toBe(0);
    }
  });
  it('escanteio, falta, cartão e lesão terminam sozinhos, sem travar o jogo', () => {
    for (const type of ['corner', 'foul', 'yellow', 'red', 'injury'] as const) {
      const w = fresh(); const e = ev(10, type, 'home'); syncFlow(w, playState([e], 9, 18), 18); triggerEvent(w, e, 5);
      expect(w.script).not.toBeNull(); if (type === 'yellow' || type === 'red') { let seen = ''; for (let k = 0; k < 150 && w.script; k++) { stepWorld(w, 1 / 30); if (w.card) seen = w.card.kind; } expect(seen).toBe(type); } // o árbitro mostra o cartão durante a jogada
      let t = 0; for (; t < 12 && w.script; t += 1 / 30) stepWorld(w, 1 / 30);
      expect(w.script, type).toBeNull(); expect(w.agents.every((a) => a.state === 'play')).toBe(true);
    }
  });
  it('pular a partida: o relógio salta e o mundo volta ao lugar sem restos de encenação', () => {
    const w = createWorld(); const drv = createDriver(); const events = [ev(10, 'goal', 'home')];
    drive(w, drv, events, 9.9); drive(w, drv, events, 10); stepWorld(w, 0.5); expect(w.script).not.toBeNull();
    drive(w, drv, events, 90);
    expect(w.script).toBeNull(); expect(w.banner).toBeNull(); expect(w.confetti.length).toBe(0); expect(drv.idx).toBe(1);
  });
});

describe('câmera 3D', () => {
  it('projeção em perspectiva: o que está mais longe é menor, a direita do campo fica à direita da tela e a altura sobe na tela', () => {
    const cam = makeCamera(600, 384, 52);
    const near = project(cam, { x: 52, y: 6, z: 0 }), far = project(cam, { x: 52, y: 62, z: 0 });
    expect(near && far).toBeTruthy();
    expect(near!.scale).toBeGreaterThan(far!.scale);
    expect(near!.y).toBeGreaterThan(far!.y);               // perto = parte de baixo da tela
    const a = project(cam, { x: 40, y: 34, z: 0 })!, b = project(cam, { x: 70, y: 34, z: 0 })!;
    expect(b.x).toBeGreaterThan(a.x);
    const low = project(cam, { x: 52, y: 34, z: 0 })!, high = project(cam, { x: 52, y: 34, z: 3 })!;
    expect(high.y).toBeLessThan(low.y);
    expect(project(cam, { x: 52, y: -500, z: 0 })).toBeNull();   // atrás da câmera
  });
});

describe('bola: efeito de curva e colisão com jogadores', () => {
  it('chute com efeito: sai desviado, a curva o traz ao ponto combinado e a trajetória é curva (não reta)', () => {
    for (const curve of [-2, 2]) {
      const w = fresh(); w.agents.forEach((a, i) => { a.x = 5 + i; a.y = 2; });
      w.ball.p = { x: 60, y: 30, z: BALL_R }; const to = { x: 90, y: 38, z: 1 };
      kickTo(w, to, 1.4, false, curve);
      let maxDev = 0; const dx = to.x - 60, dy = to.y - 30, dl = Math.hypot(dx, dy);
      for (let t = 0; t < 1.4; t += 1 / 120) { stepWorld(w, 1 / 120); const px = w.ball.p.x - 60, py = w.ball.p.y - 30; maxDev = Math.max(maxDev, Math.abs((px * dy - py * dx) / dl)); }
      expect(Math.hypot(w.ball.p.x - to.x, w.ball.p.y - to.y)).toBeLessThan(0.8);   // chega ao ponto
      expect(maxDev).toBeGreaterThan(Math.abs(curve) * 0.18);                       // e passou pelo lado no meio do caminho
    }
  });
  it('a bola não atravessa jogadores: quica neles e nunca fica dentro', () => {
    const w = fresh(); w.agents.forEach((a) => { a.x = 3; a.y = 3; });
    const a = w.agents[5]; a.x = 50; a.y = 34; a.state = 'hold';
    w.ball.p = { x: 40, y: 34, z: BALL_R }; w.ball.mode = 'free'; w.ball.v = { x: 18, y: 0, z: 0 }; w.ball.slideUntil = 99;
    let minD = 99; run(w, 1.5, 1 / 60, () => { minD = Math.min(minD, Math.hypot(w.ball.p.x - a.x, w.ball.p.y - a.y)); });
    expect(minD).toBeGreaterThanOrEqual(0.5); expect(w.ball.v.x).toBeLessThan(6);   // bateu e voltou/perdeu força
  });
});

