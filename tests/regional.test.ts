import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { isSeasonOver, newCareer, playNext, startNextSeason } from '../src/engine/game';
import { REGIONALS, regionalMatchDue } from '../src/engine/regional';
import { ufOfClub } from '../src/data/estaduais_clubs';
import type { GameState } from '../src/engine/types';

const career = (club: string, seed = 7): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: club, divisions: brazilPyramid(), cup: true }, seed);
const NE = ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'];
const VERDE = ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO', 'DF', 'GO', 'MT', 'MS', 'ES'];
const finish = (g: GameState) => { let guard = 0; while (!isSeasonOver(g) && guard++ < 700) g = playNext(g).state; return g; };

describe('Copa do Nordeste e Copa Verde', () => {
  it('montagem: Nordeste com os 4 melhores de cada um dos 9 estados; Verde com os 2 melhores de cada um dos 12 estados', () => {
    const g = career('palmeiras');
    const ne = g.regionais!.nordeste!, cv = g.regionais!.verde!;
    expect(ne.entrants).toHaveLength(36); expect(cv.entrants).toHaveLength(24);
    for (const uf of NE) expect(ne.entrants.filter((id) => ufOfClub(id) === uf), uf).toHaveLength(4);
    for (const uf of VERDE) expect(cv.entrants.filter((id) => ufOfClub(id) === uf), uf).toHaveLength(2);
    expect(ne.groups).toHaveLength(6); expect(cv.groups).toHaveLength(4);
    for (const gr of ne.groups) { expect(gr.clubIds).toHaveLength(6); expect(gr.matches).toHaveLength(15); }
    for (const gr of cv.groups) { expect(gr.clubIds).toHaveLength(6); expect(gr.matches).toHaveLength(15); }
    expect(new Set(ne.entrants).size).toBe(36);
    // clubes do mesmo estado ficam em grupos diferentes (4 por estado, 6 grupos)
    for (const gr of ne.groups) expect(new Set(gr.clubIds.map((id) => ufOfClub(id))).size).toBe(6);
    expect(REGIONALS.nordeste.states).toEqual(NE);
  });
  it('temporada inteira: as duas copas terminam com campeão (oitavas/quartas/semi/final no Nordeste; quartas/semi/final na Verde) e entram no histórico', () => {
    let g = finish(career('palmeiras'));
    const ne = g.regionais!.nordeste!, cv = g.regionais!.verde!;
    expect(ne.championId).toBeTruthy(); expect(cv.championId).toBeTruthy();
    expect(ne.ko.map((r) => r.ties.length)).toEqual([8, 4, 2, 1]);
    expect(cv.ko.map((r) => r.ties.length)).toEqual([4, 2, 1]);
    expect(ne.entrants).toContain(ne.championId); expect(cv.entrants).toContain(cv.championId);
    for (const gr of ne.groups) expect(gr.matches.every((m) => m.homeGoals !== undefined)).toBe(true);
    const n = startNextSeason(g);
    expect(n.history.at(-1)!.nordesteChampionId).toBe(ne.championId);
    expect(n.history.at(-1)!.verdeChampionId).toBe(cv.championId);
    expect(n.regionais!.nordeste!.championId).toBeUndefined();
    expect(n.regionais!.nordeste!.entrants).toHaveLength(36); // na 2ª temporada vale a classificação final dos estaduais
    expect(n.regionais!.verde!.entrants).toHaveLength(24);
  }, 600_000);
  it('com o seu clube na copa, os jogos aparecem como eventos e a temporada segue até o fim', () => {
    let g = career('bahia', 3); // BA entra no Nordeste
    expect(g.regionais!.nordeste!.entrants).toContain('bahia');
    let seen = 0, guard = 0;
    while (!isSeasonOver(g) && guard++ < 800) { if (regionalMatchDue(g, 'nordeste')) seen++; g = playNext(g).state; }
    expect(seen).toBeGreaterThanOrEqual(5); // as 5 rodadas de grupos
    expect(g.regionais!.nordeste!.championId).toBeTruthy();
  }, 600_000);
});
