import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { GROUP_COUNT, GROUP_ROUNDS, GROUP_SIZE, KO_FIRST_ROUND, KO_LAST_ROUND, finalStandings, groupTables, knockoutView } from '../src/engine/groups';
import { teamRatings } from '../src/engine/squad';
import { isSeasonOver, playNext, playRound, seasonOutcome } from '../src/engine/game';
import { makeCareer } from './helpers';
import type { GameState } from '../src/engine/types';

const play = (g: GameState, until = 999) => { while (!isSeasonOver(g) && g.round <= until) g = playRound(g).state; return g; };
const D = (g: GameState) => g.divisions[3];

describe('Série D em grupos', () => {
  it('96 clubes sorteados em 16 grupos de 6, um de cada pote de força em cada grupo', () => {
    const g = makeCareer('csa', 3);
    const d = D(g);
    expect(d.format).toBe('groups');
    expect(d.groups!.length).toBe(GROUP_COUNT);
    expect(d.groups!.every((x) => x.length === GROUP_SIZE)).toBe(true);
    expect(new Set(d.groups!.flat()).size).toBe(96);
    expect([...d.groups!.flat()].sort()).toEqual([...d.clubIds].sort());
    const ovr = (id: string) => teamRatings(g.teams[id]).overall;
    const sorted = [...d.clubIds].sort((a, b) => ovr(b) - ovr(a));
    const potOf = new Map(sorted.map((id, i) => [id, Math.floor(i / GROUP_COUNT)]));
    for (const grp of d.groups!) expect(new Set(grp.map((id) => potOf.get(id))).size).toBe(6);
  });
  it('fase de grupos: 10 rodadas, todos jogam 10 vezes (turno e returno só contra o próprio grupo)', () => {
    const g = play(makeCareer('csa', 3), GROUP_ROUNDS);
    expect(g.round).toBe(GROUP_ROUNDS + 1);
    const tabs = groupTables(g, D(g));
    expect(tabs.length).toBe(16);
    for (const t of tabs) { expect(t.rows.length).toBe(6); expect(t.rows.every((r) => r.played === 10)).toBe(true); }
    const res = g.results.filter((r) => r.divisionId === 'serie-d');
    expect(res.length).toBe(16 * 30);
    for (const r of res) expect(D(g).groups!.some((grp) => grp.includes(r.homeId) && grp.includes(r.awayId))).toBe(true);
  });
  it('mata-mata: 32 → 16 → 8 → 4 → 2 → 1; quem empata vai aos pênaltis; os 2 primeiros de cada grupo se classificam', () => {
    let g = play(makeCareer('palmeiras', 5), GROUP_ROUNDS);
    const tabs = groupTables(g, D(g));
    g = playRound(g).state;
    const ko = knockoutView(g, D(g));
    expect(ko[0].ties.length).toBe(16);
    const firsts = new Set(tabs.flatMap((t) => [t.rows[0].clubId, t.rows[1].clubId]));
    for (const t of ko[0].ties) { expect(firsts.has(t.homeId)).toBe(true); expect(firsts.has(t.awayId)).toBe(true); }
    expect(ko[0].ties.every((t) => t.result)).toBe(true);
    g = play(g);
    const full = knockoutView(g, D(g));
    expect(full.map((v) => v.ties.length)).toEqual([16, 8, 4, 2, 1]);
    expect(full.map((v) => v.round)).toEqual([11, 12, 13, 14, 15]);
    for (const v of full) for (const t of v.ties) expect(t.winnerId).toBeTruthy();
    const draws = g.results.filter((r) => r.divisionId === 'serie-d' && r.round >= KO_FIRST_ROUND && r.homeGoals === r.awayGoals);
    expect(draws.every((r) => r.pens && r.pens[0] !== r.pens[1])).toBe(true);
    // cada fase só tem vencedores da anterior
    for (let i = 1; i < full.length; i++) {
      const prev = new Set(full[i - 1].ties.map((t) => t.winnerId));
      for (const t of full[i].ties) { expect(prev.has(t.homeId)).toBe(true); expect(prev.has(t.awayId)).toBe(true); }
    }
    expect(KO_LAST_ROUND).toBe(15);
  });
  it('campeão da D, 4 semifinalistas sobem para a Série C, os 4 últimos da C descem, nada cai da D', () => {
    const end = play(makeCareer('palmeiras', 5));
    const f = finalStandings(end, D(end));
    const final = knockoutView(end, D(end)).at(-1)!.ties[0];
    expect(f.championId).toBe(final.winnerId);
    expect(f.promoted.length).toBe(4);
    const semi = knockoutView(end, D(end)).find((v) => v.round === 14)!.ties.flatMap((t) => [t.homeId, t.awayId]);
    expect([...f.promoted].sort()).toEqual([...semi].sort());
    expect(f.table.length).toBe(96);
    expect(f.table[0].clubId).toBe(f.championId);
    const cTable = end.divisions[2];
    const next = startNextSeason(end);
    const idsD = new Set(next.divisions[3].clubIds), idsC = new Set(next.divisions[2].clubIds);
    for (const id of f.promoted) { expect(idsC.has(id)).toBe(true); expect(idsD.has(id)).toBe(false); }
    expect(next.divisions[3].clubIds.length).toBe(96);
    expect(next.divisions[3].groups!.flat().length).toBe(96);
    expect(next.divisions[3].groups).not.toEqual(end.divisions[3].groups);
    expect(cTable.clubIds.length).toBe(20);
    expect(next.history[0].divisions[3].championId).toBe(f.championId);
    expect(next.history[0].divisions[3].promoted).toEqual(f.promoted);
    expect(next.history[0].tables![3].rows.length).toBe(96);
  });
  it('quem joga a Série D e é eliminado fica sem jogos nas rodadas finais, sem travar o jogo', () => {
    let g = makeCareer('csa', 7);
    let guard = 0;
    while (!isSeasonOver(g) && guard++ < 100) g = playNext(g).state;
    expect(isSeasonOver(g)).toBe(true);
    const out = seasonOutcome(g);
    expect(['promoted', 'stay']).toContain(out.movement); // da D não se cai
    const mine = g.results.filter((r) => r.divisionId === 'serie-d' && (r.homeId === 'csa' || r.awayId === 'csa'));
    expect(mine.length).toBeGreaterThanOrEqual(10);
    expect(mine.length).toBeLessThanOrEqual(15);
  });
  it('várias temporadas seguidas mantêm 96 clubes na Série D e os grupos refeitos a cada ano', () => {
    let g = makeCareer('flamengo', 4);
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) { g = { ...play(g), morale: { ...g.morale, board: 60 } }; g = startNextSeason(g); expect(g.divisions[3].clubIds.length).toBe(96); seen.add(JSON.stringify(g.divisions[3].groups)); }
    expect(seen.size).toBe(3);
  });
});
