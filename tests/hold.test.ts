import { describe, expect, it } from 'vitest';
import { createDriver, createWorld, drive, isHolding, stepWorld, type World } from '../src/ui/pitch3d/world';
import type { MatchEvent, Position } from '../src/engine/types';

const ev = (minute: number, type: MatchEvent['type'], side: MatchEvent['side'], extra: Partial<MatchEvent> = {}): MatchEvent => ({ minute, type, side, text: '', player: 'x', ...extra });
const hid = (p: string) => Array.from({ length: 11 }, (_, i) => `${p}${i}`);
const posOf = (id: string): Position | undefined => { const i = Number(id.slice(1)); return i === 0 ? 'GK' : i <= 4 ? 'DEF' : i <= 8 ? 'MID' : 'ATT'; };
const kickoff = ev(0, 'kickoff', 'none', { lineups: { home: hid('h'), away: hid('a'), homeFormation: '4-4-2', awayFormation: '4-4-2' } });

/** O mesmo relógio da tela: o minuto só anda quando o campo não está mostrando um lance. */
function playMatch(events: MatchEvent[], untilMinute: number, speedMs = 500) {
  const w = createWorld('4-4-2', '4-4-2'); w.posOf = posOf; const drv = createDriver();
  let minute = 0; const dt = 1 / 30; let holdTime = 0; const frozen: number[] = []; const log: string[] = [];
  let celebrations = 0, wasCelebrating = false, vars = 0, wasVar = false;
  for (let step = 0; step < 30 * 400 && minute < untilMinute; step++) {
    const holding = isHolding(w);
    if (!holding) minute = Math.min(90, minute + (dt * 1000) / speedMs); else { holdTime += dt; frozen.push(minute); }
    if (!w.var) drive(w, drv, events, minute);
    stepWorld(w, dt);
    const cel = w.agents.some((a) => a.state === 'celebrate'); if (cel && !wasCelebrating) { celebrations++; log.push(`festa@${minute.toFixed(1)}`); } wasCelebrating = cel;
    if (w.var && !wasVar) { vars++; log.push(`var:${w.var.kind}`); } wasVar = !!w.var;
  }
  return { w, minute, holdTime, frozen, celebrations, vars, log };
}

describe('o tempo para durante o lance', () => {
  it('gol: o relógio fica parado da jogada até o jogo recomeçar; a festa só vem depois do VAR; o placar sobe e tudo volta ao lugar', () => {
    const events = [kickoff, ev(20, 'goal', 'home', { pid: 'h9', how: 'foot' })];
    const r = playMatch(events, 24);
    expect(r.celebrations).toBe(1); expect(r.vars).toBe(1); expect(r.w.goals.home).toBe(1);
    expect(r.log.indexOf('var:goal')).toBeLessThan(r.log.findIndex((l) => l.startsWith('festa')));       // VAR antes da comemoração
    const during = r.frozen.filter((m) => m >= 19.9 && m <= 20.6); expect(during.length).toBeGreaterThan(100); // ficou parado em torno do minuto do gol
    expect(Math.max(...during) - Math.min(...during)).toBeLessThan(0.05);
    expect(r.holdTime).toBeGreaterThan(8);                                                               // jogada + VAR + comemoração + volta
    expect(isHolding(r.w)).toBe(false);                                                                  // depois, o tempo volta a correr
    expect(r.w.script).toBeNull();
    expect(r.w.agents.every((a) => a.state === 'play')).toBe(true);
  });

  it('dois gols em seguida (mesmo minuto e minuto seguinte): os dois são mostrados inteiros, cada um com VAR e comemoração, e os dois contam', () => {
    const events = [kickoff, ev(20, 'goal', 'home', { pid: 'h9', how: 'foot' }), ev(20, 'goal', 'away', { pid: 'a9', how: 'foot' }), ev(21, 'goal', 'home', { pid: 'h10', how: 'header' })];
    const r = playMatch(events, 25);
    expect(r.celebrations).toBe(3); expect(r.vars).toBe(3); expect(r.w.goals.home).toBe(2); expect(r.w.goals.away).toBe(1);
  });

  it('uma sequência corrida de lances (falta, gol, escanteio, gol anulado, gol) não perde nenhum lance', () => {
    const events = [kickoff, ev(10, 'foul', 'away', { pid: 'a6', victimId: 'h7' }), ev(10, 'goal', 'home', { pid: 'h9', how: 'foot' }), ev(11, 'corner', 'away', { pid: 'a7' }), ev(11, 'goal', 'away', { pid: 'a9', annulled: true, how: 'foot' }), ev(11, 'var', 'away', { pid: 'a9', var: { kind: 'goal-offside', target: 'a9' } }), ev(12, 'goal', 'away', { pid: 'a10', how: 'foot' })];
    const r = playMatch(events, 16);
    expect(r.w.goals.home).toBe(1); expect(r.w.goals.away).toBe(1);   // o gol anulado não conta
    expect(r.vars).toBeGreaterThanOrEqual(3); expect(r.celebrations).toBe(2);
  });

  it('o relógio não anda durante a revisão do VAR, nem na repetição', () => {
    const events = [kickoff, ev(20, 'goal', 'home', { pid: 'h9', annulled: true, how: 'foot' }), ev(20, 'var', 'home', { pid: 'h9', var: { kind: 'goal-offside', target: 'h9' } })];
    const r = playMatch(events, 23); expect(r.w.goals.home).toBe(0); expect(r.celebrations).toBe(0);
    const during = r.frozen.filter((m) => m >= 19.9 && m <= 20.6); expect(Math.max(...during) - Math.min(...during)).toBeLessThan(0.05);
  });
});
