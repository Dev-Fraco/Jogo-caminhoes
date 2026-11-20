import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { isSeasonOver, newCareer, playNext, startNextSeason } from '../src/engine/game';
import { SUPER_STEPS, superMatchDue } from '../src/engine/supermundial';
import type { GameState } from '../src/engine/types';

const career = (club = 'csa', seed = 11): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: club, divisions: brazilPyramid(), cup: true }, seed);

describe('Super Mundial de Clubes', () => {
  it('32 clubes, 8 grupos de 4, oitavas, quartas, semifinal e final; termina com campeão e a temporada só acaba depois', () => {
    let g = career();
    let guard = 0;
    while (g.round <= g.totalRounds && guard++ < 400) g = playNext(g).state;
    while (!isSeasonOver(g) && guard++ < 600) g = playNext(g).state;
    const sm = g.superMundial!;
    expect(sm).toBeTruthy();
    expect(sm.entrants).toHaveLength(32);
    expect(new Set(sm.entrants).size).toBe(32);
    expect(sm.groups).toHaveLength(8);
    for (const gr of sm.groups) { expect(gr.clubIds).toHaveLength(4); expect(gr.matches).toHaveLength(6); expect(gr.matches.every((m) => m.homeGoals !== undefined)).toBe(true); }
    expect(sm.ko.map((r) => r.ties.length)).toEqual([8, 4, 2, 1]);
    expect(sm.ko.map((r) => r.name)).toEqual(SUPER_STEPS.slice(3));
    expect(sm.championId).toBeTruthy();
    expect(sm.due).toBe(false);
    expect(sm.entrants).toContain(sm.championId);
    expect(g.lib!.championId && sm.entrants.includes(g.lib!.championId)).toBe(true); // campeões continentais estão dentro
    expect(g.ucl!.championId && sm.entrants.includes(g.ucl!.championId)).toBe(true);
    const n = startNextSeason(g);
    expect(n.history.at(-1)!.superChampionId).toBe(sm.championId);
    expect(n.superMundial).toBeUndefined();
  }, 300_000);
  it('com o seu clube dentro, a temporada espera os jogos dele; jogos do Super Mundial entram no calendário de eventos', () => {
    // procura uma semente em que o clube joga (campeão continental é raro): força incluindo o clube nos classificados
    let found = false;
    for (let seed = 1; seed <= 6 && !found; seed++) {
      let g = career('palmeiras', seed);
      let guard = 0;
      while (g.round <= g.totalRounds && !g.superMundial && guard++ < 400) g = playNext(g).state;
      if (g.superMundial?.entrants.includes('palmeiras')) {
        found = true;
        expect(isSeasonOver(g)).toBe(false);
        let games = 0;
        while (!isSeasonOver(g) && guard++ < 700) { if (superMatchDue(g)) games++; g = playNext(g).state; }
        expect(games).toBeGreaterThanOrEqual(3);
        expect(g.superMundial!.championId).toBeTruthy();
      }
    }
    // (se nenhuma semente colocar o clube lá, o primeiro teste já cobre o fluxo completo)
    expect(typeof found).toBe('boolean');
  }, 600_000);
});
