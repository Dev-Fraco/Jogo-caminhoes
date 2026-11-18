import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WHISTLE_PATTERNS, WHISTLE_TYPES, type Cue } from '../src/audio/cues';
import { audio, volumes } from '../src/audio/audio';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../src/settings/settings';
import { BALL_R, GOAL_H, GOAL_W, L, MID_Y, createDriver, createWorld, drive, kickTo, stepWorld, type World } from '../src/ui/pitch3d/world';
import { playState } from '../src/ui/pitch';
import type { MatchEvent, Position } from '../src/engine/types';

/* ---------- WebAudio de mentira: conta o que o jogo manda tocar ---------- */
const log = { osc: [] as { type: string; f0: number }[], buffers: 0, gainSets: new Map<string, number[]>() };
class Param { value = 1; constructor(private name: string) {} setValueAtTime(v: number) { this.value = v; } linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} cancelScheduledValues() {} setTargetAtTime(v: number) { const a = log.gainSets.get(this.name) ?? []; a.push(v); log.gainSets.set(this.name, a); this.value = v; } }
let gainN = 0;
class Node { gain = new Param(`g${gainN++}`); frequency = new Param('f'); Q = new Param('q'); detune = new Param('d'); pan = new Param('p'); type = ''; buffer: unknown; loop = false; connect() { return this; } start() {} stop() {} }
class Osc extends Node { constructor() { super(); const self = this; const f = this.frequency; const orig = f.setValueAtTime.bind(f); f.setValueAtTime = (v: number) => { log.osc.push({ type: self.type, f0: v }); orig(v); }; } }
class FakeCtx { currentTime = 0; state = 'running'; sampleRate = 8000; destination = {}; resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); }
  createGain() { return new Node(); } createOscillator() { return new Osc(); } createBiquadFilter() { return new Node(); } createBufferSource() { return new Node(); }
  createBuffer(_c: number, len: number) { log.buffers++; return { getChannelData: () => new Float32Array(len) }; } }

beforeEach(() => { log.osc = []; log.buffers = 0; log.gainSets.clear(); vi.stubGlobal('window', { AudioContext: FakeCtx, setTimeout: (f: () => void) => { void f; return 0; } }); audio.unlock(); });
afterEach(() => vi.unstubAllGlobals());

describe('apitos e volumes', () => {
  it('cada apito tem o número certo de toques: início 1 longo, falta 1 curto, intervalo 2, fim 3, pênalti 1 bem longo, impedimento 1', () => {
    expect(WHISTLE_PATTERNS.start).toHaveLength(1); expect(WHISTLE_PATTERNS.foul).toHaveLength(1); expect(WHISTLE_PATTERNS.half).toHaveLength(2); expect(WHISTLE_PATTERNS.end).toHaveLength(3);
    expect(WHISTLE_PATTERNS.penalty).toHaveLength(1); expect(WHISTLE_PATTERNS.offside).toHaveLength(1);
    expect(WHISTLE_PATTERNS.foul[0].dur).toBeLessThan(WHISTLE_PATTERNS.start[0].dur);
    expect(WHISTLE_PATTERNS.penalty[0].dur).toBeGreaterThan(WHISTLE_PATTERNS.start[0].dur);
    for (const p of Object.values(WHISTLE_PATTERNS)) for (let i = 1; i < p.length; i++) expect(p[i].at).toBeGreaterThanOrEqual(p[i - 1].at + p[i - 1].dur); // os toques não se atropelam
    expect(WHISTLE_TYPES.map((t) => t.id)).toEqual(['classic', 'electronic', 'sharp']);
  });

  it('o árbitro toca o apito escolhido: os três tipos soam diferentes e o fim tem 3x os toques do início', () => {
    const freqs: Record<string, number> = {};
    for (const t of ['classic', 'electronic', 'sharp'] as const) { log.osc = []; audio.refWhistle('start', t); freqs[t] = log.osc[0].f0; }
    expect(new Set(Object.values(freqs)).size).toBe(3);
    log.osc = []; audio.refWhistle('start', 'classic'); const one = log.osc.length;
    log.osc = []; audio.refWhistle('end', 'classic'); expect(log.osc.length).toBe(one * 3);
    log.osc = []; audio.refWhistle('half', 'classic'); expect(log.osc.length).toBe(one * 2);
  });

  it('volumes independentes: torcida, efeitos da partida e apito (e o mudo zera tudo)', () => {
    const s = (a: Partial<Settings['audio']>): Settings => ({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, ...a } });
    const v0 = volumes(s({}));
    expect(volumes(s({ crowd: 0 })).crowd).toBe(0); expect(volumes(s({ crowd: 0 })).whistle).toBeCloseTo(v0.whistle); expect(volumes(s({ crowd: 0 })).matchfx).toBeCloseTo(v0.matchfx);
    expect(volumes(s({ whistle: 0 })).whistle).toBe(0); expect(volumes(s({ whistle: 0 })).crowd).toBeCloseTo(v0.crowd);
    expect(volumes(s({ matchfx: 0 })).matchfx).toBe(0); expect(volumes(s({ matchfx: 40 })).matchfx).toBeCloseTo(v0.matchfx / 2);
    expect(volumes(s({ master: 50 })).whistle).toBeCloseTo(v0.whistle / 2);
    const mute = volumes(s({ muted: true })); expect(mute.crowd + mute.matchfx + mute.whistle + mute.music + mute.sfx).toBe(0);
    audio.refresh(s({ whistle: 0 })); expect(log.gainSets.size).toBeGreaterThan(0);
  });

  it('configurações antigas (sem os novos campos) continuam válidas; tipo de apito inválido volta ao clássico', () => {
    const a = sanitizeSettings({ audio: { master: 50, music: 10, sfx: 20, muted: false } }).audio;
    expect([a.crowd, a.matchfx, a.whistle, a.whistleType]).toEqual([80, 80, 80, 'classic']);
    expect(sanitizeSettings({ audio: { whistleType: 'apito-do-bem', crowd: 250 } }).audio).toMatchObject({ whistleType: 'classic', crowd: 100 });
    expect(sanitizeSettings({ audio: { whistleType: 'sharp' } }).audio.whistleType).toBe('sharp');
  });

  it('reações do campo tocam; chute comum em 3x/4x fica em silêncio (e a 1x toca)', () => {
    const play = (c: Cue, speed = 1) => { log.osc = []; log.buffers = 0; audio.cue(c, speed); return log.osc.length + log.buffers; };
    expect(play({ k: 'kick', p: 12 }, 1)).toBeGreaterThan(0);
    vi.stubGlobal('window', { AudioContext: FakeCtx });
    expect(play({ k: 'kick', p: 12 }, 4)).toBe(0);
    for (const c of [{ k: 'post' }, { k: 'net', p: 20 }, { k: 'cheer', big: true }, { k: 'groan' }, { k: 'oh' }, { k: 'murmur' }] as Cue[]) expect(play(c), c.k).toBeGreaterThan(0);
  });
});

describe('sons acompanham o campo', () => {
  const ev = (minute: number, type: MatchEvent['type'], side: MatchEvent['side'], extra: Partial<MatchEvent> = {}): MatchEvent => ({ minute, type, side, text: '', player: 'x', ...extra });
  const hid = (p: string) => Array.from({ length: 11 }, (_, i) => `${p}${i}`);
  const posOf = (id: string): Position | undefined => { const i = Number(id.slice(1)); return i === 0 ? 'GK' : i <= 4 ? 'DEF' : i <= 8 ? 'MID' : 'ATT'; };
  const kickoff = ev(0, 'kickoff', 'none', { lineups: { home: hid('h'), away: hid('a'), homeFormation: '4-4-2', awayFormation: '4-4-2' } });
  const play = (events: MatchEvent[], secs = 40) => {
    const w = createWorld('4-4-2', '4-4-2'); w.posOf = posOf; const drv = createDriver(); drive(w, drv, events, 19); for (let i = 0; i < 20; i++) stepWorld(w, 1 / 30); w.cues = []; drive(w, drv, events, 20);
    const all: { c: Cue; i: number }[] = []; let n = 0;
    for (let t = 0; t < secs && (w.script || w.var || n < 5); t += 1 / 30, n++) { stepWorld(w, 1 / 30); for (const c of w.cues.splice(0)) all.push({ c, i: n }); }
    return { w, all, ks: all.map((x) => x.c.k === 'whistle' ? `whistle:${x.c.v}` : x.c.k) };
  };

  it('gol: chute, bola na rede, o VAR confere (murmúrio) e só então a torcida comemora', () => {
    const { ks } = play([kickoff, ev(20, 'goal', 'home', { pid: 'h9', how: 'foot' })]);
    const iKick = ks.indexOf('kick'), iNet = ks.indexOf('net'), iMur = ks.indexOf('murmur'), iCheer = ks.indexOf('cheer');
    expect(iKick).toBeGreaterThanOrEqual(0); expect(iNet).toBeGreaterThan(iKick); expect(iMur).toBeGreaterThan(-1); expect(iCheer).toBeGreaterThan(iNet); expect(iCheer).toBeGreaterThan(iMur);
    expect(ks.filter((k) => k === 'cheer')).toHaveLength(1);
  });

  it('gol anulado: não há festa; a torcida reclama', () => {
    const { ks } = play([kickoff, ev(20, 'goal', 'home', { pid: 'h9', annulled: true, how: 'foot' }), ev(20, 'var', 'home', { pid: 'h9', var: { kind: 'goal-offside', target: 'h9' } })]);
    expect(ks).not.toContain('cheer'); expect(ks).toContain('groan'); expect(ks).toContain('net');
  });

  it('falta: apito curto, depois o apito da cobrança; pênalti tem apito longo próprio; impedimento tem o seu', () => {
    const foul = play([kickoff, ev(20, 'foul', 'away', { pid: 'a6', victimId: 'h7' })]).ks.filter((k) => k.startsWith('whistle'));
    expect(foul[0]).toBe('whistle:foul'); expect(foul).toContain('whistle:restart');
    const pen = play([kickoff, ev(20, 'foul', 'away', { pid: 'a3', victimId: 'h9', pen: true }), ev(20, 'goal', 'home', { pid: 'h9', pen: true, how: 'foot' })]).ks.filter((k) => k.startsWith('whistle'));
    expect(pen[0]).toBe('whistle:penalty');
    const off = play([kickoff, ev(20, 'offside', 'home', { pid: 'h9' })]).ks.filter((k) => k.startsWith('whistle'));
    expect(off[0]).toBe('whistle:offside');
  });

  it('grande chance: a torcida reage na defesa e no chute para fora', () => {
    expect(play([kickoff, ev(20, 'save', 'home', { pid: 'h9', gkId: 'a0' })]).ks).toContain('oh');
    expect(play([kickoff, ev(20, 'miss', 'home', { pid: 'h9', how: 'wide' })]).ks).toContain('oh');
  });

  it('bola na trave e no travessão fazem o som de trave', () => {
    const w = createWorld('4-4-2', '4-4-2'); w.agents.forEach((a, i) => { a.x = 8 + i * 2; a.y = 3; });
    w.ball.p = { x: L - 6, y: MID_Y + GOAL_W / 2, z: 1 }; w.ball.mode = 'free'; w.ball.v = { x: 18, y: 0, z: 0 }; w.cues = [];
    for (let t = 0; t < 0.6; t += 1 / 60) stepWorld(w, 1 / 60);
    expect(w.cues.some((c) => c.k === 'post')).toBe(true);
    const w2 = createWorld('4-4-2', '4-4-2'); w2.agents.forEach((a, i) => { a.x = 8 + i * 2; a.y = 3; }); w2.ball.p = { x: L - 6, y: MID_Y, z: GOAL_H - 0.7 }; w2.ball.mode = 'free'; w2.ball.v = { x: 20, y: 0, z: 4.3 }; w2.cues = [];
    for (let t = 0; t < 0.6; t += 1 / 60) stepWorld(w2, 1 / 60);
    expect(w2.cues.some((c) => c.k === 'post')).toBe(true);
  });

  it('chute faz o som no instante do contato e a força vem da velocidade da bola', () => {
    const w = createWorld('4-4-2', '4-4-2'); w.ball.p = { x: 50, y: 30, z: BALL_R }; kickTo(w, { x: 80, y: 30, z: 1 }, 1.2);
    const k = w.cues.find((c) => c.k === 'kick') as { k: 'kick'; p: number }; expect(k.p).toBeGreaterThan(15);
    void playState;
  });

  it('o som não tem sobra: depois de saltar no tempo (pular a partida) a fila de sons está vazia', () => {
    const w = createWorld(); w.cues.push({ k: 'groan' }); const drv = createDriver(); drive(w, drv, [kickoff], 0); drive(w, drv, [kickoff], 60);
    expect(w.cues).toEqual([]);
  });
});
