import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { COMP_NAMES } from '../src/data/names';
import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { isSeasonOver, newCareer, playNext, playRound } from '../src/engine/game';
import { CONTINENTALS, groupTable, matchDue, userMatch } from '../src/engine/continental';
import { pyramidOf, slotsOfLeague } from '../src/data/pyramid';

const career = (user = 'palmeiras', seed = 5) => newCareer({
  saveName: 't', coach: { name: 'Teste Silva', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026,
  userClubId: user, divisions: brazilPyramid(), cup: true,
}, seed);

describe('Libertadores', () => {
  it('32 clubes (6 do Brasil), 8 grupos de 4 com 6 rodadas, sem repetir país no grupo quando possível', () => {
    const g = career();
    const lib = g.lib!;
    expect(lib.alive.length).toBe(32);
    expect(new Set(lib.alive).size).toBe(32);
    expect(lib.groups.length).toBe(8);
    for (const gr of lib.groups) { expect(gr.clubIds.length).toBe(4); expect(gr.matches.length).toBe(12); }
    expect(lib.alive.filter((id) => g.clubs[id]).length).toBe(6);
    expect(Object.keys(g.foreign!.clubs).length).toBe(26 + 26 + 16); // Libertadores + Sul-Americana + Champions
    // clubes de fora não entram no campeonato nem no mercado
    expect(Object.keys(g.teams).some((id) => g.foreign!.teams[id])).toBe(false);
  });
  it('o jogo do seu clube vem antes da rodada seguinte; fora da Libertadores tudo é automático', () => {
    let g = career('palmeiras', 4);
    expect(g.lib!.alive).toContain('palmeiras');
    let sawLib = false, guard = 0;
    while (!isSeasonOver(g) && guard++ < 200) {
      if (matchDue(g, 'lib')) { sawLib = true; expect(userMatch(g, 'lib')).toBeTruthy(); }
      g = playNext(g).state;
    }
    expect(sawLib).toBe(true);
    expect(g.lib!.championId).toBeTruthy();
    const h = career('csa', 1);
    expect(h.lib!.alive).not.toContain('csa');
    let k = h; while (!isSeasonOver(k)) k = playRound(k).state;
    expect(k.lib!.championId).toBeTruthy();
    expect(k.lib!.ko.length).toBe(4);
    expect(k.lib!.ko.flatMap((r) => r.ties).every((t) => t.winnerId)).toBe(true);
  });
  it('fase de grupos completa e classificados somam 16; a próxima temporada traz nova Libertadores com os brasileiros classificados', () => {
    let g = career('flamengo', 8);
    while (!isSeasonOver(g)) g = playNext(g).state;
    for (const gr of g.lib!.groups) expect(groupTable(g, gr).every((r) => r.played === 6)).toBe(true);
    expect(g.lib!.ko[0].ties.length).toBe(8);
    const n = startNextSeason(g);
    expect(n.history.at(-1)!.libChampionId).toBe(g.lib!.championId);
    expect(n.lib!.championId).toBeUndefined();
    expect(n.lib!.alive.length).toBe(32);
    expect(n.lib!.alive.filter((id) => n.clubs[id]).length).toBe(6);
    expect(CONTINENTALS.lib.dates.length).toBe(10);
  });

  const abroad = (leagueCountry: string, league: string, user: (d: ReturnType<typeof pyramidOf>) => string) => {
    const divisions = pyramidOf(leagueCountry, league);
    return newCareer({ saveName: 't', coach: { name: 'Teste Silva', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: user(divisions), divisions, slots: slotsOfLeague(league), leagueName: league }, 6);
  };

  it('carreira na Argentina: o River joga a Libertadores com 5 argentinos e 6 brasileiros de fora', () => {
    const g = abroad('AR', 'liga-profesional', () => 'ar-river');
    expect(g.lib!.alive).toContain('ar-river');
    expect(g.lib!.alive.filter((id) => id.startsWith('ar-')).length).toBe(5);
    expect(g.lib!.alive.filter((id) => g.foreign!.clubs[id] && !id.includes('-primera') && !/^(ar|bo|cl|co|ec|py|pe|uy|ve)-/.test(id)).length).toBe(6);
    let k = g, guard = 0, seen = false;
    while (!isSeasonOver(k) && guard++ < 200) { if (matchDue(k, 'lib')) seen = true; k = playNext(k).state; }
    expect(seen).toBe(true);
    expect(k.lib!.championId).toBeTruthy();
  });
  it('carreira na Inglaterra: Champions com 16 clubes (3 ingleses), Libertadores só com clubes de fora', () => {
    const g = abroad('EN', 'premier-league', () => 'en-man-city');
    expect(g.ucl!.alive.length).toBe(16);
    expect(g.ucl!.groups.length).toBe(4);
    expect(g.ucl!.alive).toContain('en-man-city');
    expect(g.lib!.alive).not.toContain('en-man-city');
    let k = g, guard = 0, seen = false;
    while (!isSeasonOver(k) && guard++ < 300) { if (matchDue(k, 'ucl')) seen = true; k = playNext(k).state; }
    expect(seen).toBe(true);
    expect(k.ucl!.championId).toBeTruthy();
    expect(k.ucl!.ko.map((r) => r.ties.length)).toEqual([4, 2, 1]);
  });
  it('Mundial: semifinais cruzadas entre finalistas da Libertadores e da Champions; a temporada só acaba depois dele', () => {
    let g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'csa', divisions: brazilPyramid(), cup: true }, 11);
    while (g.round <= g.totalRounds) g = playNext(g).state;
    expect(g.mundial).toBeTruthy();
    expect(g.mundial!.ko.length).toBe(2);
    expect(g.mundial!.ko[0].ties.length).toBe(2);
    expect(isSeasonOver(g)).toBe(true);
    expect(g.mundial!.championId).toBeTruthy();
    const part = g.mundial!.ko[0].ties.flatMap((t) => [t.homeId, t.awayId]);
    expect(part).toContain(g.lib!.championId);
    expect(part).toContain(g.ucl!.championId);
    expect(part).toContain(g.mundial!.championId);
    const n = startNextSeason(g);
    expect(n.history.at(-1)!.mundialChampionId).toBe(g.mundial!.championId);
    expect(n.mundial).toBeUndefined();
  });
  it('usuário campeão da Libertadores joga o Mundial e a temporada espera o jogo dele', () => {
    // força o Mundial com o seu clube dentro
    let g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, 2);
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed++) {
      g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, seed);
      while (g.round <= g.totalRounds && !g.mundial) g = playNext(g).state;
      if (g.mundial?.alive.includes('palmeiras') && g.mundial.due) found = true;
    }
    if (found) { expect(isSeasonOver(g)).toBe(false); while (!isSeasonOver(g)) g = playNext(g).state; expect(g.mundial!.championId).toBeTruthy(); }
  });

  it('Sul-Americana: 32 clubes de gente que NÃO está na Libertadores; 6 do Brasil são os 7º ao 12º da Série A', () => {
    const g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, 4);
    const sula = g.sula!;
    expect(sula.alive.length).toBe(32);
    expect(sula.groups.length).toBe(8);
    expect(new Set(sula.alive).size).toBe(32);
    expect(sula.alive.filter((id) => g.lib!.alive.includes(id))).toEqual([]);
    expect(sula.alive.filter((id) => g.clubs[id]).length).toBe(6);
    expect(sula.name).toBe(COMP_NAMES.sula);
    let k = g, guard = 0;
    while (!isSeasonOver(k) && guard++ < 400) k = playNext(k).state;
    expect(k.sula!.championId).toBeTruthy();
    expect(k.sula!.ko.map((r) => r.ties.length)).toEqual([8, 4, 2, 1]);
    const n = startNextSeason({ ...k, morale: { ...k.morale, board: 60 } });
    expect(n.history.at(-1)!.sulaChampionId).toBe(k.sula!.championId);
    expect(n.sula!.championId).toBeUndefined();
  });
  it('o campeonato curto (Paraguai, 22 rodadas) termina todas as competições continentais dentro da temporada', () => {
    const divisions = pyramidOf('PY', 'primera-paraguay');
    let g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: divisions[0].clubs[0].id, divisions, slots: slotsOfLeague('primera-paraguay'), leagueName: 'x' }, 3);
    expect(g.totalRounds).toBe(22);
    expect(Math.max(...g.lib!.dueAfter)).toBeLessThanOrEqual(22);
    let guard = 0;
    while (!isSeasonOver(g) && guard++ < 300) g = playNext(g).state;
    expect(g.lib!.championId).toBeTruthy();
    expect(g.sula!.championId).toBeTruthy();
    expect(g.ucl!.championId).toBeTruthy();
    expect(g.mundial!.championId).toBeTruthy();
  });
});
