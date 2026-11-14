import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { isSeasonOver, newCareer, playNext, playRound, startNextSeason } from '../src/engine/game';
import { LIB_DATES, libMatchDue, groupTable, userLibMatch } from '../src/engine/libertadores';

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
    expect(Object.keys(g.foreign!.clubs).length).toBe(26);
    // clubes de fora não entram no campeonato nem no mercado
    expect(Object.keys(g.teams).some((id) => g.foreign!.teams[id])).toBe(false);
  });
  it('o jogo do seu clube vem antes da rodada seguinte; fora da Libertadores tudo é automático', () => {
    let g = career('palmeiras', 4);
    expect(g.lib!.alive).toContain('palmeiras');
    let sawLib = false, guard = 0;
    while (!isSeasonOver(g) && guard++ < 200) {
      if (libMatchDue(g)) { sawLib = true; expect(userLibMatch(g)).toBeTruthy(); }
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
    expect(LIB_DATES.length).toBe(10);
  });
});
