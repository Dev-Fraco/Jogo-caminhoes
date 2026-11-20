import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { isSeasonOver, newCareer, playNext, startNextSeason } from '../src/engine/game';
import { isSuperYear, SUPER_STEPS, superMatchDue } from '../src/engine/supermundial';
import type { GameState } from '../src/engine/types';

const career = (club = 'csa', seed = 11): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: club, divisions: brazilPyramid(), cup: true }, seed);

describe('Super Mundial de Clubes (a cada 4 anos, 16 clubes)', () => {
  it('só acontece nos anos do Super Mundial (a cada 4 temporadas)', () => {
    expect([2026, 2030, 2034].every(isSuperYear)).toBe(true);
    expect([2027, 2028, 2029, 2031].some(isSuperYear)).toBe(false);
  });
  it('2026: 16 clubes (4 da Libertadores, 4 da Champions, 4 da África, 4 da Arábia), 4 grupos de 4, quartas, semifinal e final', () => {
    let g = career();
    let guard = 0;
    while (g.round <= g.totalRounds && guard++ < 400) g = playNext(g).state;
    while (!isSeasonOver(g) && guard++ < 600) g = playNext(g).state;
    const sm = g.superMundial!;
    expect(sm).toBeTruthy();
    expect(sm.entrants).toHaveLength(16);
    expect(new Set(sm.entrants).size).toBe(16);
    expect(sm.entrants.filter((id) => id.startsWith('afr-'))).toHaveLength(4);
    expect(sm.entrants.filter((id) => id.startsWith('ara-'))).toHaveLength(4);
    expect(sm.entrants.filter((id) => g.lib!.groups.some((x) => x.clubIds.includes(id)))).toHaveLength(4);
    expect(sm.entrants.filter((id) => g.ucl!.groups.some((x) => x.clubIds.includes(id)))).toHaveLength(4);
    expect(sm.entrants).toContain(g.lib!.championId); expect(sm.entrants).toContain(g.ucl!.championId);
    expect(sm.groups).toHaveLength(4);
    for (const gr of sm.groups) { expect(gr.clubIds).toHaveLength(4); expect(gr.matches).toHaveLength(6); expect(gr.matches.every((m) => m.homeGoals !== undefined)).toBe(true); }
    expect(sm.ko.map((r) => r.ties.length)).toEqual([4, 2, 1]);
    expect(sm.ko.map((r) => r.name)).toEqual(SUPER_STEPS.slice(3));
    expect(sm.championId).toBeTruthy(); expect(sm.due).toBe(false);
    expect(sm.entrants).toContain(sm.championId);
    expect(g.otherCups!.africa.at(-1)!.season).toBe(2026); expect(g.otherCups!.arab).toHaveLength(1);
    const n = startNextSeason(g);
    expect(n.history.at(-1)!.superChampionId).toBe(sm.championId);
    expect(n.superMundial).toBeUndefined();
    expect(n.otherCups!.africa).toHaveLength(1); // a história das copas da África e da Arábia continua
  }, 300_000);
  it('temporadas fora do ciclo não têm Super Mundial, mas as copas da África e da Arábia seguem com campeão', () => {
    let g = career('csa', 5);
    g = { ...g, season: 2027 };
    let guard = 0;
    while (g.round <= g.totalRounds && guard++ < 400) g = playNext(g).state;
    while (!isSeasonOver(g) && guard++ < 600) g = playNext(g).state;
    expect(g.superMundial).toBeUndefined();
    expect(g.otherCups!.africa.at(-1)!.season).toBe(2027);
  }, 300_000);
  it('os últimos 4 campeões valem: com 3 temporadas de histórico, os campeões passados entram (inclusive o seu clube)', () => {
    let g = career('palmeiras', 3);
    let guard = 0;
    while (g.round < g.totalRounds && guard++ < 400) g = playNext(g).state;
    const fake = (season: number, lib: string, ucl: string) => ({ season, libChampionId: lib, uclChampionId: ucl } as unknown as GameState['history'][number]);
    g = { ...g, history: [fake(2023, 'palmeiras', 'en-man-city'), fake(2024, 'flamengo', 'es-real-madrid'), fake(2025, 'cruzeiro', 'bundesliga-bayern')] };
    while (g.round <= g.totalRounds && guard++ < 400) g = playNext(g).state;
    const sm = g.superMundial!;
    expect(sm.entrants).toContain('palmeiras'); expect(sm.entrants).toContain('flamengo'); expect(sm.entrants).toContain('cruzeiro');
    expect(isSeasonOver(g)).toBe(false); // o seu clube joga: a temporada espera
    let games = 0;
    while (!isSeasonOver(g) && guard++ < 800) { if (superMatchDue(g)) games++; g = playNext(g).state; }
    expect(games).toBeGreaterThanOrEqual(3);
    expect(g.superMundial!.championId).toBeTruthy();
  }, 600_000);
});
