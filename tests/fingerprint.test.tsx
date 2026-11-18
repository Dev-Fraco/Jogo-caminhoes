import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fingerSoundStart, fingerSoundStop, fingerVolume } from '../src/audio/fingerprint';
import { HOLD_MS } from '../src/ui/AppKit';
import { Phone } from '../src/ui/Phone';
import { saveSettings, DEFAULT_SETTINGS } from '../src/settings/settings';
import { makeCareer } from './helpers';

const plays: { src: string; volume: number }[] = []; let paused = 0;
class FakeAudio { volume = 1; currentTime = 0; preload = ''; constructor(public src: string) {} play() { plays.push({ src: this.src, volume: this.volume }); return Promise.resolve(); } pause() { paused++; } }
const store = new Map<string, string>();
beforeEach(() => { plays.length = 0; paused = 0; store.clear(); vi.stubGlobal('Audio', FakeAudio); vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } }); });
afterEach(() => vi.unstubAllGlobals());

describe('digital: som, 1 segundo e sem "deslize para desbloquear"', () => {
  it('a leitura da digital dura 1 segundo (para entrar no celular e para pagar)', () => {
    expect(HOLD_MS).toBe(1000);
    for (const f of ['src/ui/Phone.tsx', 'src/ui/AppKit.tsx', 'src/ui/AccountGate.tsx', 'src/ui/BankApp.tsx']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/1,5 ?s|1,5 segundo/);
    const css = readFileSync('src/ui/phone.css', 'utf8'); expect(css).not.toMatch(/hold-(fill|bar) 1\.5s/); expect(css).toMatch(/hold-fill 1s/); expect(css).toMatch(/hold-bar 1s/);
  });

  it('o som é o arquivo enviado (digital-91828), em public/sounds, e toca ao começar a leitura; soltar antes o interrompe', () => {
    expect(existsSync('public/sounds/freesound_community-digital-91828.mp3')).toBe(true);
    fingerSoundStart(); expect(plays).toHaveLength(1); expect(plays[0].src).toContain('freesound_community-digital-91828.mp3'); expect(plays[0].volume).toBeGreaterThan(0);
    fingerSoundStop(); expect(paused).toBeGreaterThan(0);
  });

  it('respeita as Opções: volume de efeitos e mudo', () => {
    saveSettings({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, sfx: 40 } }); const v40 = fingerVolume();
    saveSettings({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, sfx: 80 } }); expect(fingerVolume()).toBeGreaterThan(v40);
    saveSettings({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, muted: true } }); expect(fingerVolume()).toBe(0);
    plays.length = 0; fingerSoundStart(); expect(plays).toHaveLength(0);
  });

  it('a tela de bloqueio do celular não tem mais "Deslize para desbloquear": já mostra o PIN (ou o sensor de digital) e a lanterna e a câmera continuam', () => {
    const g = makeCareer('palmeiras', 3);
    const html = renderToStaticMarkup(createElement(Phone, { game: g, onChange: () => {}, onClose: () => {} }));
    expect(html).not.toMatch(/[Dd]eslize/); expect(html).toContain('Crie o seu PIN'); expect(html).toContain('lanterna'); expect(html).toContain('Câmera');
  });
});
