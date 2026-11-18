import { describe, expect, it } from 'vitest';
import { PITCH_W, playState, positionsOf } from '../src/ui/pitch';
import { FORMATIONS } from '../src/engine/types';
import { L, MID_Y, createDriver, createWorld, drive, goalXOf, stepWorld, type World } from '../src/ui/pitch3d/world';
import type { MatchEvent } from '../src/engine/types';

const ev = (minute: number, type: MatchEvent['type'], side: MatchEvent['side']): MatchEvent => ({ minute, type, side, text: '', player: 'Fulano' });
const gk = (w: World, side: 'home' | 'away') => w.agents[side === 'home' ? 0 : 11];
const run = (w: World, s: number) => { for (let t = 0; t < s; t += 1 / 30) stepWorld(w, 1 / 30); };

describe('goleiros: cada um no gol do seu time', () => {
  it('campo lógico: o mandante defende o gol da esquerda e o visitante o da direita, em todas as formações e situações', () => {
    const states = [playState([], 0, 0), playState([ev(10, 'save', 'home')], 10, 20), playState([ev(10, 'save', 'away')], 10, 20), playState([ev(10, 'goal', 'away')], 10, 21)];
    for (const f of Object.keys(FORMATIONS) as (keyof typeof FORMATIONS)[]) for (const st of states) {
      expect(positionsOf('home', f, st, 3)[0].x, `mandante ${f}`).toBeLessThan(PITCH_W * 0.2);
      expect(positionsOf('away', f, st, 3)[0].x, `visitante ${f}`).toBeGreaterThan(PITCH_W * 0.8);
    }
  });

  it('mundo 3D: um goleiro em cada gol desde o início', () => {
    const w = createWorld('4-4-2', '4-3-3');
    expect(gk(w, 'home').x).toBeLessThan(L * 0.2); expect(gk(w, 'away').x).toBeGreaterThan(L * 0.8);
    expect(Math.abs(gk(w, 'home').y - MID_Y)).toBeLessThan(6); expect(Math.abs(gk(w, 'away').y - MID_Y)).toBeLessThan(6);
  });

  it('no 2º tempo os times trocam de lado e os goleiros também', () => {
    const w = createWorld(); const drv = createDriver(); const events: MatchEvent[] = [];
    drive(w, drv, events, 10); run(w, 3);
    expect(w.flip).toBe(false); expect(gk(w, 'home').x).toBeLessThan(L / 2); expect(gk(w, 'away').x).toBeGreaterThan(L / 2);
    drive(w, drv, events, 44.9); drive(w, drv, events, 46); run(w, 3);
    expect(w.flip).toBe(true); expect(gk(w, 'home').x).toBeGreaterThan(L * 0.8); expect(gk(w, 'away').x).toBeLessThan(L * 0.2);
    expect(goalXOf('home', true)).toBe(0); expect(goalXOf('away', true)).toBe(L);
  });

  it('o goleiro defende o gol certo no 1º e no 2º tempo (gol do mandante, do visitante, antes e depois do intervalo)', () => {
    for (const [minute, side] of [[10, 'home'], [10, 'away'], [60, 'home'], [60, 'away']] as const) {
      const w = createWorld(); const drv = createDriver();
      const events = [ev(minute, 'goal', side)];
      drive(w, drv, events, minute - 3); run(w, 2); drive(w, drv, events, minute); // o lance começa
      const flip = minute > 45, defender = side === 'home' ? 'away' : 'home';
      const goalX = flip ? (side === 'home' ? 0 : L) : (side === 'home' ? L : 0);
      let maxNearGoal = Infinity; let scored: typeof w.ball.scored = null;
      for (let t = 0; t < 8; t += 1 / 30) { stepWorld(w, 1 / 30); maxNearGoal = Math.min(maxNearGoal, Math.abs(gk(w, defender).x - goalX)); scored ??= w.ball.scored; }
      expect(scored, `${minute}/${side}`).toBe(side);                       // o gol é de quem o motor disse
      expect(maxNearGoal, `${minute}/${side}`).toBeLessThan(4);             // e o goleiro de quem sofreu estava lá
      expect(w.goals[side]).toBe(1);
    }
  });
});
