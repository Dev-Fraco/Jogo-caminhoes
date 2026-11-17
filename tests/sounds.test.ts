import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { audio } from '../src/audio/audio';
import { missingSounds, SOUNDS, sounds, type SoundId } from '../src/audio/sounds';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../src/settings/settings';

interface FakeEl { src: string; volume: number; loop: boolean; paused: boolean; currentTime: number; plays: number; play(): Promise<void>; pause(): void }
let made: FakeEl[] = [];
class FakeAudio implements FakeEl {
  volume = 1; loop = false; paused = true; currentTime = 0; plays = 0;
  constructor(public src: string) { made.push(this); }
  play() { this.paused = false; this.plays++; return Promise.resolve(); }
  pause() { this.paused = true; }
}
const el = (id: SoundId) => made.find((e) => e.src.endsWith(SOUNDS[id].file ?? '#none'));
const cfg = (a: Partial<Settings['audio']> = {}): Settings => ({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, ...a } });

beforeEach(() => {
  made = [];
  vi.stubGlobal('Audio', FakeAudio);
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  sounds.stopAll();
  sounds.refresh(cfg());
  sounds.unlock();
  (sounds as unknown as { els: Map<unknown, unknown>; last: Map<unknown, unknown> }).els.clear();
  (sounds as unknown as { last: Map<unknown, unknown> }).last.clear();
});

describe('efeitos sonoros por arquivo', () => {
  it('os arquivos usados existem em public/sounds; faltantes são só chute e rugido', () => {
    for (const id of Object.keys(SOUNDS) as SoundId[]) { const f = SOUNDS[id].file; if (f) expect(existsSync(`public/sounds/${f}`), f).toBe(true); }
    expect(missingSounds().sort()).toEqual(['kick', 'roar']);
  });

  it('cada evento toca o arquivo combinado', () => {
    audio.sfx('click'); expect(el('click')?.plays).toBe(1);
    audio.sfx('back'); expect(el('transition')?.plays).toBe(1);
    audio.sfx('notify'); audio.sfx('cash'); expect(el('notify')?.plays).toBe(1); // cooldown evita repetição
    audio.sfx('error'); expect(el('error')?.plays).toBe(1);
    audio.sfx('whistle'); expect(el('whistle')?.plays).toBe(1);
    audio.sfx('goal'); expect(el('goalCheer')?.plays).toBe(1);
    expect(el('notify')?.plays).toBe(1);
  });

  it('erro não é usado como notificação e notificação não é usada como erro', () => {
    audio.sfx('notify'); audio.sfx('unlock');
    expect(el('error')).toBeUndefined();
    audio.sfx('error'); expect(el('notify')?.plays).toBe(1);
  });

  it('chute e rugido sem arquivo ficam mudos (nada é substituído)', () => {
    audio.kick(); audio.celebrate(true);
    expect(made.map((e) => e.src.split('/').pop())).toEqual([SOUNDS.goalCheer.file]);
    audio.sfx('concede'); expect(made.length).toBe(1);
  });

  it('cooldown evita sobreposição exagerada (cliques rápidos, gols seguidos)', () => {
    audio.sfx('click'); audio.sfx('click'); expect(el('click')?.plays).toBe(1);
    vi.advanceTimersByTime(100); audio.sfx('click'); expect(el('click')?.plays).toBe(2);
    audio.celebrate(); audio.celebrate(); expect(el('goalCheer')?.plays).toBe(1);
  });

  it('apito é cortado no primeiro toque (arquivo tem vários)', () => {
    audio.sfx('whistle'); expect(el('whistle')?.paused).toBe(false);
    vi.advanceTimersByTime(SOUNDS.whistle.maxMs! + 10); expect(el('whistle')?.paused).toBe(true);
  });

  it('torcida e cantos são loops que não reiniciam a cada atualização e param ao sair', () => {
    audio.crowd(true); audio.crowd(true); audio.crowd(true);
    expect(el('ambience')?.plays).toBe(1); expect(el('ambience')?.loop).toBe(true);
    audio.chants(true); expect(el('chants')?.plays).toBe(1);
    audio.celebrate(); // festa por cima da ambiente, sem reiniciá-la
    expect(el('ambience')?.plays).toBe(1);
    audio.stopMatch();
    expect(made.every((e) => e.paused)).toBe(true);
    audio.crowd(true); expect(el('ambience')?.plays).toBe(2); // volta a tocar só se pedirem de novo
  });

  it('não toca nada antes do primeiro toque do usuário e nem na tela de menu sem pedir', () => {
    expect(made.length).toBe(0);
    audio.crowd(false); audio.chants(false); expect(made.length).toBe(0);
  });

  it('volume: por efeito, geral, de efeitos, mudo e liga/desliga', () => {
    audio.sfx('click'); const base = el('click')!.volume;
    expect(base).toBeCloseTo(0.8 * SOUNDS.click.volume);
    expect(sounds.level('ambience')).toBeCloseTo(0.8 * SOUNDS.ambience.volume);
    expect(sounds.level('whistle')).toBeGreaterThan(sounds.level('chants')); // volumes por efeito diferem
    sounds.refresh(cfg({ sfx: 40 })); expect(sounds.level('click')).toBeCloseTo(0.4 * SOUNDS.click.volume);
    sounds.refresh(cfg({ master: 50 })); expect(sounds.level('click')).toBeCloseTo(0.5 * 0.8 * SOUNDS.click.volume);
    sounds.refresh(cfg({ muted: true })); expect(sounds.level('click')).toBe(0);
    sounds.refresh(cfg({ sfxEnabled: false })); expect(sounds.level('error')).toBe(0);
    vi.advanceTimersByTime(1000); expect(audio.sfx('error')).toBeUndefined(); expect(el('error')).toBeUndefined();
  });

  it('desligar os efeitos pausa os loops e ligar de novo retoma', () => {
    audio.crowd(true); expect(el('ambience')?.paused).toBe(false);
    sounds.refresh(cfg({ sfxEnabled: false })); expect(el('ambience')?.paused).toBe(true);
    sounds.refresh(cfg()); expect(el('ambience')?.paused).toBe(false);
  });

  it('o app em segundo plano pausa a torcida e retoma ao voltar', () => {
    audio.crowd(true); sounds.suspend(true); expect(el('ambience')?.paused).toBe(true);
    sounds.suspend(false); expect(el('ambience')?.paused).toBe(false);
  });

  it('configurações antigas (sem sfxEnabled) continuam válidas e com efeitos ligados', () => {
    expect(sanitizeSettings({ audio: { master: 50, music: 10, sfx: 20, muted: false } }).audio.sfxEnabled).toBe(true);
    expect(sanitizeSettings({ audio: { sfxEnabled: false } }).audio.sfxEnabled).toBe(false);
  });
});
