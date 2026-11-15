import { describe, expect, it } from 'vitest';
import { baseShape, kitColors, PITCH_H, PITCH_W, playState, positionsOf } from '../src/ui/pitch';
import type { MatchEvent } from '../src/engine/types';

const ev = (minute: number, type: MatchEvent['type'], side: MatchEvent['side']): MatchEvent => ({ minute, type, side, text: '' });

describe('campo com bonecos', () => {
  it('cada formação tem 11 posições dentro do campo', () => {
    for (const f of ['4-4-2', '4-3-3', '3-5-2'] as const) {
      const s = baseShape(f);
      expect(s.length).toBe(11);
      expect(s.every((p) => p.x >= 0 && p.x <= PITCH_W && p.y >= 0 && p.y <= PITCH_H)).toBe(true);
    }
  });
  it('gol: a bola vai ao gol do adversário e só no 1º minuto; depois volta ao centro', () => {
    const e = [ev(10, 'goal', 'home')];
    expect(playState(e, 10, 20).ball.x).toBeGreaterThan(95);
    expect(playState(e, 10, 20).goalNow).toBe('home');
    expect(playState(e, 12, 24).goalNow).toBeNull();
    expect(playState(e, 12, 24).ball).toEqual({ x: 50, y: 32 });
    expect(playState([ev(10, 'goal', 'away')], 10, 20).ball.x).toBeLessThan(5);
  });
  it('quem faz a falta perde a bola e quem ataca avança o time', () => {
    expect(playState([ev(5, 'foul', 'home')], 5, 10).possession).toBe('away');
    const st = playState([ev(5, 'save', 'home')], 5, 10);
    const attacking = positionsOf('home', '4-4-2', st, 10), calm = positionsOf('home', '4-4-2', playState([], 0, 0), 0);
    expect(attacking[8].x).toBeGreaterThan(calm[8].x);
    const defending = positionsOf('away', '4-4-2', st, 10);
    expect(defending.every((p) => p.x >= 1.5 && p.x <= PITCH_W - 1.5 && p.y >= 2 && p.y <= PITCH_H - 2)).toBe(true);
  });
  it('cores parecidas: o visitante usa a secundária', () => {
    expect(kitColors({ primaryColor: '#ff0000', secondaryColor: '#fff' }, { primaryColor: '#f01010', secondaryColor: '#000000' })[1]).toBe('#000000');
    expect(kitColors({ primaryColor: '#ff0000', secondaryColor: '#fff' }, { primaryColor: '#0000ff', secondaryColor: '#000' })[1]).toBe('#0000ff');
  });
});
