import { describe, expect, it } from 'vitest';
import { ARP, BPM, MELODY, noteFreq, PROGRESSION, volumes } from '../src/audio/audio';
import { DEFAULT_SETTINGS } from '../src/settings/settings';
import { isSeasonOver, simulateToEnd, divisionTable } from '../src/engine/game';
import { makeCareer } from './helpers';

describe('pular temporada', () => {
  it('simula todas as rodadas de todas as divisões, copas e Mundial; tabelas completas', () => {
    const g = simulateToEnd(makeCareer('palmeiras', 7));
    expect(isSeasonOver(g)).toBe(true);
    expect(g.round).toBe(g.totalRounds + 1);
    for (const d of g.divisions) {
      if (d.format === 'groups' || d.id === 'serie-c') continue; // Séries C e D têm fases (testadas em groups.test.ts e phases.test.ts)
      expect(g.results.filter((r) => r.divisionId === d.id && !r.tie).length).toBe(d.clubIds.length * (d.clubIds.length - 1));
      expect(divisionTable(g, d.id).every((r) => r.played === (d.clubIds.length - 1) * 2)).toBe(true);
    }
    expect(g.lib?.championId).toBeTruthy();
    expect(g.ucl?.championId).toBeTruthy();
    expect(g.mundial?.championId).toBeTruthy();
  });
  it('é idempotente quando a temporada já acabou', () => {
    const g = simulateToEnd(makeCareer());
    expect(simulateToEnd(g)).toBe(g);
  });
});

describe('áudio', () => {
  it('frequências e música', () => {
    expect(noteFreq(69)).toBeCloseTo(440);
    expect(noteFreq(81)).toBeCloseTo(880);
    expect(PROGRESSION.length).toBe(8);
    expect(ARP.length).toBe(8);
    expect(MELODY.length).toBe(PROGRESSION.length);
    expect(MELODY.every((m) => m.length === 8)).toBe(true);
    expect(BPM).toBeGreaterThan(60);
  });
  it('volumes respeitam o mudo e os controles', () => {
    const s = structuredClone(DEFAULT_SETTINGS);
    expect(volumes(s).music).toBeGreaterThan(0);
    s.audio.muted = true;
    expect(volumes(s)).toEqual({ music: 0, sfx: 0, crowd: 0, matchfx: 0, whistle: 0 }); // mudo zera tudo, inclusive torcida, efeitos da partida e apito
    s.audio.muted = false; s.audio.music = 0;
    expect(volumes(s).music).toBe(0);
    expect(volumes(s).sfx).toBeGreaterThan(0);
  });
});

describe('cantos da torcida', () => {
  it('o canto original tem 2 compassos de 4 tempos e vogais válidas', async () => {
    const { CHANT, VOWELS } = await import('../src/audio/audio');
    expect(CHANT.reduce((t, s) => t + s.beats, 0)).toBe(8);
    expect(CHANT.every((s) => s.vowel in VOWELS && s.midi > 40 && s.midi < 90)).toBe(true);
  });
});
