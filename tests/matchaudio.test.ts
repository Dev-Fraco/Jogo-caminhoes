import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WHISTLE_PATTERNS, WHISTLE_TYPES, type Cue } from '../src/audio/cues';
import { audio, volumes } from '../src/audio/audio';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../src/settings/settings';

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
