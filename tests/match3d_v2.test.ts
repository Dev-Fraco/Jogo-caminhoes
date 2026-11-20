import { describe, expect, it } from 'vitest';
import { ACT, actionPose, J, N_JOINTS } from '../src/ui/pitch3d/anim';
import { ANIMS, animGroup, animNames, sampleAnim } from '../src/ui/pitch3d/anims';
import { badgeMosaic, MOSAIC_COLS, MOSAIC_ROWS } from '../src/ui/pitch3d/mosaic';
import { CEREMONY, FACE_CAMERA, lineupSpot, skipCeremony, startCeremony } from '../src/ui/pitch3d/ceremony';
import { CENTER, L, W, createWorld, createDriver, drive, isHolding, stepWorld, type World } from '../src/ui/pitch3d/world';
import { makeCamera } from '../src/ui/pitch3d/camera';
import type { MatchEvent } from '../src/engine/types';

const run = (w: World, secs: number, dt = 0.05) => { for (let i = 0; i < secs / dt; i++) stepWorld(w, dt); };

describe('biblioteca de animações', () => {
  it('mais de 100 movimentos, com pelo menos 15 do goleiro, e todos geram poses válidas (sem NaN e em ângulos plausíveis)', () => {
    const all = Object.keys(ACT);
    expect(all.length).toBeGreaterThanOrEqual(100);
    expect(all.filter((k) => k.startsWith('gk_')).length).toBeGreaterThanOrEqual(15);
    for (const g of ['goleiro', 'chute', 'passe', 'dominio', 'drible', 'defesa', 'cabeceio', 'comemoracao', 'reacao', 'lesao', 'bola-parada', 'cerimonia', 'arbitragem']) expect(animGroup(g).length, g).toBeGreaterThanOrEqual(4);
    for (const k of animNames()) for (let t = 0; t <= 1.0001; t += 0.1) for (const dir of [-1, 1]) {
      const p = actionPose(k, t, dir);
      expect(p, k).toHaveLength(N_JOINTS);
      expect(p.every(Number.isFinite), `${k} t=${t}`).toBe(true);
      for (let j = 0; j < N_JOINTS; j++) expect(Math.abs(p[j]), `${k} j=${j}`).toBeLessThan(3.6);
    }
    expect(ACT.anthem_chest.dur).toBeGreaterThan(20);
  });
  it('espelhar (dir -1) troca esquerda e direita', () => {
    const a = sampleAnim('wave_crowd', 0.4, 1), b = sampleAnim('wave_crowd', 0.4, -1);
    expect(a[J.rShP]).toBeCloseTo(b[J.lShP], 6); expect(a[J.lShP]).toBeCloseTo(b[J.rShP], 6);
    expect(ANIMS.gk_dive_low.group).toBe('goleiro');
  });
  it('hino: mão no peito (cotovelo dobrado, braço à frente) e mãos para trás (braços atrás do corpo)', () => {
    const chest = sampleAnim('anthem_chest', 0.5, 1), back = sampleAnim('anthem_back', 0.5, 1);
    expect(chest[J.rElb]).toBeGreaterThan(2); expect(chest[J.rShP]).toBeGreaterThan(0.7);
    expect(back[J.lShP]).toBeLessThan(-0.3); expect(back[J.rShP]).toBeLessThan(-0.3);
  });
});

describe('mosaico do escudo', () => {
  it('grade completa com o escudo (cor do clube no centro, aro e sigla) e é determinístico', () => {
    const g = badgeMosaic('#c52613', '#ffffff', 'SNA');
    expect(g).toHaveLength(MOSAIC_COLS * MOSAIC_ROWS);
    expect(g.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    const at = (x: number, y: number) => g[y * MOSAIC_COLS + x];
    expect(at(Math.floor(MOSAIC_COLS / 2) - 5, Math.floor(MOSAIC_ROWS / 2))).toBe('#c52613'); // miolo do escudo
    expect(new Set(g).size).toBeGreaterThanOrEqual(4);
    expect(g.filter((c) => c === '#ffffff').length).toBeGreaterThan(20); // aro e letras
    expect(badgeMosaic('#c52613', '#ffffff', 'SNA')).toEqual(g);
    expect(badgeMosaic('#0033a0', '#ffffff', 'CRE')).not.toEqual(g);
  });
});

describe('cerimônia de entrada e hino', () => {
  it('as equipes saem do túnel, alinham de frente para a câmera, cantam o hino (peito e costas) e vão às posições; o relógio fica parado', () => {
    const w = createWorld();
    startCeremony(w);
    expect(isHolding(w)).toBe(true);
    expect(w.agents.every((a) => a.y > W + 2)).toBe(true); // todos começam do lado do túnel, fora do campo
    let anthemSeen = false, chest = 0, back = 0, t = 0;
    while (w.ceremony && t < 90) {
      run(w, 0.5); t += 0.5;
      if (w.ceremony?.stage === 'anthem' && !anthemSeen) { anthemSeen = true; for (const a of w.agents) { const s = lineupSpot(a); expect(Math.hypot(a.x - s.x, a.y - s.y), `jogador ${a.id}`).toBeLessThan(0.8); } }
      if (w.ceremony?.stage === 'anthem' && t > 21) { // meio do hino
        chest = w.agents.filter((a) => a.act?.kind === 'anthem_chest').length; back = w.agents.filter((a) => a.act?.kind === 'anthem_back').length;
        for (const a of w.agents) { const d = Math.abs(((a.heading - FACE_CAMERA + Math.PI * 3) % (Math.PI * 2)) - Math.PI); expect(d, `olhando para a câmera ${a.id}`).toBeLessThan(0.35); }
      }
    }
    expect(anthemSeen).toBe(true);
    expect(chest).toBeGreaterThan(5); expect(back).toBeGreaterThan(5); expect(chest + back).toBe(22);
    expect(w.ceremony).toBeNull(); expect(t).toBeLessThan(CEREMONY.enterMax + CEREMONY.anthem + CEREMONY.brk + 8);
    expect(isHolding(w)).toBe(false);
  });
  it('dá para pular: todos vão direto às posições do apito inicial', () => {
    const w = createWorld(); startCeremony(w); run(w, 3);
    skipCeremony(w);
    expect(w.ceremony).toBeNull();
    expect(w.agents.every((a) => a.x >= 0 && a.x <= L && a.y >= 0 && a.y <= W)).toBe(true);
    expect(w.ball.p.x).toBeCloseTo(CENTER.x, 0);
  });
});

describe('câmera do treinador e campo', () => {
  it('a câmera fica baixa, junto à linha lateral (visão do banco), olhando para o campo', () => {
    const c = makeCamera(1200, 800, 52, 46);
    expect(c.pz).toBeLessThan(12); expect(c.py).toBeGreaterThan(-14); expect(c.py).toBeLessThan(-6);
  });
});

describe('cérebro do jogo corrido (passes, marcação, desarmes)', () => {
  it('em 4min30 de jogo livre: muitos passes, a posse muda de mãos, ninguém sai do campo e a bola fica no jogo', () => {
    const w = createWorld('4-3-3', '4-4-2');
    let oob = 0, aOob = 0, fast = 0, home = 0, away = 0, flips = 0, last = '';
    const prev = new Map<number, [number, number]>();
    for (let i = 0; i < 270 * 20; i++) {
      stepWorld(w, 0.05);
      const b = w.ball; if (b.p.x < -1 || b.p.x > L + 1 || b.p.y < -1 || b.p.y > W + 1) oob++;
      if (w.flow.side === 'home') home++; else if (w.flow.side === 'away') away++;
      if (w.flow.side !== last && w.flow.side !== 'none') { flips++; last = w.flow.side; }
      for (const a of w.agents) { if (a.x < -1 || a.x > L + 1 || a.y < -1 || a.y > W + 1) aOob++; const p = prev.get(a.id); if (p && Math.hypot(a.x - p[0], a.y - p[1]) / 0.05 > 12) fast++; prev.set(a.id, [a.x, a.y]); }
    }
    expect(w.brain.stats.passes).toBeGreaterThan(60);
    expect(flips).toBeGreaterThanOrEqual(6);
    expect(home / (home + away)).toBeGreaterThan(0.2); expect(home / (home + away)).toBeLessThan(0.8);
    expect(oob).toBeLessThan(200); expect(aOob).toBe(0); expect(fast).toBe(0); // (ninguém "teletransporta": nenhum passo acima de 12 m/s)
  }, 120_000);
  it('mistura passes de vários tipos e a posse muda por desarme ou interceptação', () => {
    const w = createWorld('4-4-2', '4-4-2');
    const kinds = new Set<string>();
    for (let i = 0; i < 600 * 20; i++) { stepWorld(w, 0.05); for (const a of w.agents) if (a.act) kinds.add(a.act.kind); }
    expect(w.brain.stats.tackles + w.brain.stats.intercepts).toBeGreaterThan(2);
    expect([...kinds].filter((k) => /^pass|long_pass|cross/.test(k)).length).toBeGreaterThanOrEqual(3);
    expect(kinds.size).toBeGreaterThanOrEqual(10); // variedade de movimentos em campo (domínio, desarmes, dribles...)
  }, 120_000);
  it('a narração continua mandando: o gol do motor acontece e o time que sofreu dá a saída', () => {
    const w = createWorld('4-4-2', '4-4-2'), drv = createDriver();
    const ev: MatchEvent[] = [{ minute: 0, type: 'kickoff', side: 'none', text: 'x' }, { minute: 2, type: 'goal', side: 'home', text: 'gol', player: 'A', score: [1, 0] } as MatchEvent];
    let minute = 0, guard = 0;
    while (w.goals.home === 0 && guard++ < 4000) { if (!isHolding(w)) minute += 0.05 / 3; drive(w, drv, ev, minute); stepWorld(w, 0.05); }
    expect(w.goals.home).toBe(1);
    run(w, 1);
    expect(Math.abs(w.ball.p.x - L / 2)).toBeLessThan(10); // recomeça do meio (a saída já saiu do pé)
    expect(w.flow.side).toBe('away');                                                              // quem sofreu o gol dá a saída
  }, 60_000);
});
