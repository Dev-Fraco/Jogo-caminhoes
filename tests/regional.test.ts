import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { isSeasonOver, newCareer, playNext } from '../src/engine/game';
import { REGIONALS, regionalMatchDue } from '../src/engine/regional';
import { ufOfClub } from '../src/data/estaduais_clubs';
import type { GameState } from '../src/engine/types';

const career = (club: string, seed = 7): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: club, divisions: brazilPyramid(), cup: true }, seed);
const NE = ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'];
const NORTE = ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'];
const CENTRO = ['DF', 'GO', 'MT', 'MS', 'ES'];
const SS = ['ES', 'MG', 'PR', 'RJ', 'RS', 'SP'];
const finish = (g: GameState) => { let guard = 0; while (!isSeasonOver(g) && guard++ < 700) g = playNext(g).state; return g; };

describe('Copa do Nordeste, Copa Verde e Copa Sul-Sudeste (regras 2026)', () => {
  it('montagem: Nordeste 20 clubes em 4 grupos de 5; Verde 24 clubes em Copa Norte e Copa Centro-Oeste (2 grupos de 6 cada); Sul-Sudeste 12 clubes, 2 por estado, em 2 grupos de 6', () => {
    const g = career('palmeiras');
    const ne = g.regionais!.nordeste!, cv = g.regionais!.verde!, ss = g.regionais!.sulsudeste!;
    expect(ne.entrants).toHaveLength(20); expect(cv.entrants).toHaveLength(24); expect(ss.entrants).toHaveLength(12);
    expect(Object.keys(REGIONALS.nordeste.quota).sort()).toEqual([...NE].sort());
    for (const uf of NE) expect(ne.entrants.filter((id) => ufOfClub(id) === uf), uf).toHaveLength(REGIONALS.nordeste.quota[uf]);
    expect(ne.groups).toHaveLength(4);
    for (const gr of ne.groups) { expect(gr.clubIds).toHaveLength(5); expect(gr.matches).toHaveLength(10); } // turno único: 4 jogos por clube
    // Copa Verde: dois blocos de 12, cada um com 2 grupos de 6
    expect(cv.groups).toHaveLength(4);
    for (const gr of cv.groups) { expect(gr.clubIds).toHaveLength(6); expect(gr.matches).toHaveLength(15); }
    const blocN = [...cv.groups[0].clubIds, ...cv.groups[1].clubIds], blocC = [...cv.groups[2].clubIds, ...cv.groups[3].clubIds];
    expect(blocN.every((id) => NORTE.includes(ufOfClub(id)!))).toBe(true);
    expect(blocC.every((id) => CENTRO.includes(ufOfClub(id)!))).toBe(true);
    expect(blocN).toHaveLength(12); expect(blocC).toHaveLength(12);
    // Sul-Sudeste: 2 por estado; os grupos se enfrentam (6 jogos por clube)
    for (const uf of SS) expect(ss.entrants.filter((id) => ufOfClub(id) === uf), uf).toHaveLength(2);
    expect(ss.groups).toHaveLength(2);
    for (const gr of ss.groups) expect(gr.clubIds).toHaveLength(6);
    const all = ss.groups.flatMap((x) => x.matches);
    expect(all).toHaveLength(36);
    for (const m of all) expect(ss.groups[0].clubIds.includes(m.homeId) !== ss.groups[0].clubIds.includes(m.awayId)).toBe(true); // sempre um de cada grupo
    for (const id of ss.entrants) expect(all.filter((m) => m.homeId === id || m.awayId === id)).toHaveLength(6);
    // o Espírito Santo não repete clube entre Verde e Sul-Sudeste
    expect(cv.entrants.filter((id) => ss.entrants.includes(id))).toEqual([]);
    expect(new Set(ne.entrants).size).toBe(20);
  });
  it('temporada inteira: as três copas terminam com campeão; Verde tem os 2 campeões de bloco; entram no histórico', () => {
    const g = finish(career('palmeiras'));
    const ne = g.regionais!.nordeste!, cv = g.regionais!.verde!, ss = g.regionais!.sulsudeste!;
    for (const r of [ne, cv, ss]) expect(r.championId).toBeTruthy();
    expect(ne.ko.map((r) => r.ties.length)).toEqual([4, 2, 1]);           // quartas, semifinal, final
    expect(cv.ko.map((r) => r.ties.length)).toEqual([8, 4, 2, 1]);        // quartas dos 2 blocos, semifinais, finais de bloco, final
    expect(ss.ko.map((r) => r.ties.length)).toEqual([2, 1]);              // semifinal e final
    expect(cv.blocChampions).toHaveLength(2);
    expect(cv.blocChampions).toContain(cv.championId);
    expect(NORTE.includes(ufOfClub(cv.blocChampions![0])!) || NORTE.includes(ufOfClub(cv.blocChampions![1])!)).toBe(true);
    expect(ne.entrants).toContain(ne.championId); expect(cv.entrants).toContain(cv.championId); expect(ss.entrants).toContain(ss.championId);
    for (const gr of ne.groups) expect(gr.matches.every((m) => m.homeGoals !== undefined)).toBe(true);
    const n = startNextSeason(g);
    expect(n.history.at(-1)!.nordesteChampionId).toBe(ne.championId);
    expect(n.history.at(-1)!.verdeChampionId).toBe(cv.championId);
    expect(n.history.at(-1)!.sulsudesteChampionId).toBe(ss.championId);
    expect(n.regionais!.nordeste!.championId).toBeUndefined();
    expect(n.regionais!.nordeste!.entrants).toHaveLength(20); // na 2ª temporada vale a classificação final dos estaduais
    expect(n.regionais!.verde!.entrants).toHaveLength(24);
    expect(n.regionais!.sulsudeste!.entrants).toHaveLength(12);
    // vaga na Copa do Brasil seguinte: campeão da Nordeste, da Sul-Sudeste e os dois campeões de bloco da Verde
    const inCup = new Set(n.cup!.rounds[0].ties.flatMap((t) => [t.homeId, t.awayId]));
    expect(inCup.size).toBe(64);
    for (const id of [ne.championId!, ss.championId!, ...cv.blocChampions!]) expect(inCup.has(id), id).toBe(true);
  }, 600_000);
  it('com o seu clube na copa, os jogos aparecem como eventos e a temporada segue até o fim', () => {
    const g0 = career('bahia', 3); // BA entra no Nordeste
    expect(g0.regionais!.nordeste!.entrants).toContain('bahia');
    let g = g0, seen = 0, guard = 0;
    while (!isSeasonOver(g) && guard++ < 800) { if (regionalMatchDue(g, 'nordeste')) seen++; g = playNext(g).state; }
    expect(seen).toBeGreaterThanOrEqual(4); // as rodadas de grupos do seu clube (4 jogos em grupos de 5)
    expect(g.regionais!.nordeste!.championId).toBeTruthy();
  }, 600_000);
});
