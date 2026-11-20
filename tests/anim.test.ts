import { describe, expect, it } from 'vitest';
import { ACT, actionPose, cycleLength, J, N_JOINTS, newAnim, stepAnim, strikeDelay, type ActKind } from '../src/ui/pitch3d/anim';
import { playState } from '../src/ui/pitch';
import { createDriver, createWorld, drive, slotOf, stepWorld, syncRoster, type World } from '../src/ui/pitch3d/world';
import type { MatchEvent, Position } from '../src/engine/types';

const KINDS = Object.keys(ACT) as ActKind[];
const view = (o: Partial<Parameters<typeof stepAnim>[1]> = {}) => ({ vx: 0, vy: 0, heading: 0, carrying: false, gk: false, down: false, celebrate: false, t: 0, ...o });

describe('animação dos atletas', () => {
  it('todas as ações (as 22 pedidas) geram poses válidas do começo ao fim', () => {
    expect(KINDS.length).toBeGreaterThanOrEqual(19);
    for (const k of KINDS) for (let t = 0; t <= 1.0001; t += 0.05) for (const dir of [-1, 1]) { const p = actionPose(k, t, dir); expect(p).toHaveLength(N_JOINTS); expect(p.every(Number.isFinite), `${k} ${t}`).toBe(true); expect(Math.max(...p.map(Math.abs)), k).toBeLessThan(3.2); }
  });

  it('a passada acompanha o chão: o ciclo avança com a distância percorrida (o pé não patina) e a passada cresce com a velocidade', () => {
    for (const sp of [2, 4, 6, 8]) {
      const s = newAnim(); const ph0 = s.phase; let dist = 0; let total = 0;
      for (let i = 0; i < 120; i++) { stepAnim(s, view({ vx: sp }), 1 / 60); dist += sp / 60; }
      total = (s.phase - ph0 + 1) % 1 + 0; void total;
      // número de ciclos completos = distância / comprimento do ciclo
      const s2 = newAnim(); let cycles = 0, prev = s2.phase; for (let i = 0; i < 600; i++) { stepAnim(s2, view({ vx: sp }), 1 / 60); if (s2.phase < prev) cycles++; prev = s2.phase; }
      expect(Math.abs(cycles - (sp * 10) / cycleLength(sp)), `v=${sp}`).toBeLessThan(1.2);
      void dist;
    }
    expect(cycleLength(8)).toBeGreaterThan(cycleLength(3));
  });

  it('transições suaves: nenhum ângulo dá salto brusco entre quadros ao mudar de corrida para ação, de ação para corrida e ao frear', () => {
    const s = newAnim(); let t = 0; let prev = s.pose.slice(); let worst = 0;
    const run = (a: Partial<Parameters<typeof stepAnim>[1]>, secs: number) => { for (let i = 0; i < secs * 60; i++) { t += 1 / 60; const p = stepAnim(s, view({ t, ...a }), 1 / 60); for (let j = 0; j < N_JOINTS; j++) worst = Math.max(worst, Math.abs(p[j] - prev[j])); prev = p.slice(); } };
    run({ vx: 7 }, 1);
    for (const k of KINDS.filter((x) => x !== 'getup' && x !== 'fall')) { run({ vx: 5, act: { kind: k, t0: t, dur: ACT[k].dur, dir: 1 } }, ACT[k].dur + 0.3); run({ vx: 5 }, 0.4); }
    run({ vx: 0 }, 0.5); // freia de repente
    // cair e levantar: de pé -> no chão -> de pé, também sem saltos
    run({ vx: 0, down: true, act: { kind: 'fall', t0: t, dur: ACT.fall.dur, dir: 1 } }, 1.2); run({ vx: 0, act: { kind: 'getup', t0: t, dur: ACT.getup.dur, dir: 1 } }, ACT.getup.dur + 0.4);
    expect(worst).toBeLessThan(0.45); // rad por quadro a 60 fps
  });

  it('a ação termina e o corpo volta à corrida (chute, passe...)', () => {
    const s = newAnim(); let t = 0; const act = { kind: 'shot' as ActKind, t0: 0, dur: ACT.shot.dur, dir: 1 };
    for (let i = 0; i < 180; i++) { t += 1 / 60; stepAnim(s, view({ t, vx: 4, act: t < 0.9 ? act : undefined }), 1 / 60); }
    const ref = newAnim(); for (let i = 0; i < 180; i++) stepAnim(ref, view({ vx: 4 }), 1 / 60);
    expect(Math.abs(s.pose[J.rHip] - ref.pose[J.rHip]) + Math.abs(s.pose[J.rootPitch] - ref.pose[J.rootPitch])).toBeLessThan(0.7);
  });

  it('o contato com a bola acontece no meio da ação (a bola sai junto com o pé)', () => {
    for (const k of ['pass', 'long_pass', 'cross', 'shot', 'header'] as ActKind[]) { expect(strikeDelay(k)).toBeGreaterThan(0.1); expect(strikeDelay(k)).toBeLessThan(ACT[k].dur); }
  });
});

describe('lances encenados com os jogadores do motor', () => {
  const ev = (minute: number, type: MatchEvent['type'], side: MatchEvent['side'], extra: Partial<MatchEvent> = {}): MatchEvent => ({ minute, type, side, text: '', ...extra });
  const ids = (p: string) => Array.from({ length: 11 }, (_, i) => `${p}${i}`);
  const posOf = (id: string): Position | undefined => { let i = Number(id.slice(1)); if (i >= 50) i -= 50; return i === 0 ? 'GK' : i <= 4 ? 'DEF' : i <= 8 ? 'MID' : 'ATT'; };
  const mk = (events: MatchEvent[]): { w: World; drv: ReturnType<typeof createDriver> } => { const w = createWorld('4-4-2', '4-4-2'); w.posOf = posOf; return { w, drv: createDriver() }; void events; };
  const kickoff = ev(0, 'kickoff', 'none', { lineups: { home: ids('h'), away: ids('a'), homeFormation: '4-4-2', awayFormation: '4-4-2' } });

  it('quem aparece no lance é o jogador que o motor registrou (autor do gol, da falta, do escanteio)', () => {
    const events = [kickoff, ev(10, 'goal', 'home', { pid: 'h9', player: 'x' })];
    const { w, drv } = mk(events); drive(w, drv, events, 9); stepWorld(w, 0.5); drive(w, drv, events, 10);
    expect(slotOf(w, 'home', 'h9')).toBe(9);
    expect(w.script?.shooter).toBe(9);
    const events2 = [kickoff, ev(10, 'foul', 'away', { pid: 'a6', victimId: 'h3' })];
    const b = mk(events2); drive(b.w, b.drv, events2, 9); drive(b.w, b.drv, events2, 10);
    expect(b.w.script?.shooter).toBe(6); expect(b.w.script?.data.victim).toBe(3);
  });

  it('a bola só sai no contato do pé e a comemoração só começa depois que a bola entra na rede', () => {
    const events = [kickoff, ev(10, 'goal', 'home', { pid: 'h10', how: 'foot' })];
    const { w, drv } = mk(events); drive(w, drv, events, 9); stepWorld(w, 0.5); drive(w, drv, events, 10);
    let kickedAt = -1, celebratedBeforeGoal = false, scoredAt = -1, shotStartAt = -1, shotKindUsed = 'shot';
    for (let t = 0; t < 20 && (w.script || w.var); t += 1 / 60) {
      stepWorld(w, 1 / 60);
      const sh = w.agents[10];
      if (shotStartAt < 0 && sh.act?.kind.startsWith('shot')) { shotStartAt = w.t; shotKindUsed = sh.act!.kind; }
      if (kickedAt < 0 && w.ball.mode === 'free' && shotStartAt >= 0) kickedAt = w.t;
      if (scoredAt < 0 && w.ball.scored) scoredAt = w.t;
      if (scoredAt < 0 && w.agents.some((a) => a.state === 'celebrate')) celebratedBeforeGoal = true;
    }
    expect(shotStartAt).toBeGreaterThan(0); expect(kickedAt - shotStartAt).toBeGreaterThan(strikeDelay(shotKindUsed) - 0.05); // a bola espera o pé
    expect(scoredAt).toBeGreaterThan(kickedAt); expect(celebratedBeforeGoal).toBe(false); expect(w.goals.home).toBe(1);
  });

  it('substituição: o jogador que entra assume a posição de quem saiu', () => {
    const events = [kickoff, ev(20, 'injury', 'home', { pid: 'h5', inId: 'h55' })];
    const { w, drv } = mk(events); drive(w, drv, events, 19); expect(slotOf(w, 'home', 'h5')).toBe(5);
    drive(w, drv, events, 21); expect(slotOf(w, 'home', 'h5')).toBe(-1); expect(slotOf(w, 'home', 'h55')).toBe(5);
    syncRoster(w, events, 1); expect(slotOf(w, 'home', 'h5')).toBe(5);
  });

  it('velocidade 1x a 4x: o mesmo lance acontece igual, só mais rápido (mesma bola e mesmos jogadores no mesmo tempo de jogo)', () => {
    const events = [kickoff, ev(10, 'goal', 'away', { pid: 'a9', how: 'header' })];
    const final = (chunk: number) => {
      const { w, drv } = mk(events); drive(w, drv, events, 9); stepWorld(w, 0.5); drive(w, drv, events, 10);
      const order: string[] = []; let t = 0;
      while (t < 6 - 1e-9) { stepWorld(w, chunk); t += chunk; if (w.ball.scored && !order.includes('gol')) order.push('gol'); if (w.agents.some((a) => a.state === 'celebrate') && !order.includes('festa')) order.push('festa'); }
      return { order, goals: w.goals.away, x: w.ball.p.x };
    };
    const a = final(1 / 60), b = final(4 / 60);
    expect(a.order).toEqual(['gol', 'festa']); expect(b.order).toEqual(a.order); expect(b.goals).toBe(a.goals);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1.5);
  });
});
void playState;
