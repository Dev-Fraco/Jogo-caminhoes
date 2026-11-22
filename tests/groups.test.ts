import { startNextSeason } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { GROUP_COUNT, GROUP_ROUNDS, GROUP_SIZE, groupTables } from '../src/engine/groups';
import { D_LAST_ROUND, phaseViews, serieDFlow, serieDStanding, tieOutcome } from '../src/engine/phases';
import { serieDQualifiers } from '../src/engine/estadual';
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
  it('mata-mata de ida e volta: 64 → 32 → 16 → 8 → 4; os 4 primeiros de cada grupo se classificam; pênaltis só se o agregado empatar', () => {
    let g = play(makeCareer('palmeiras', 5), GROUP_ROUNDS);
    const tabs = groupTables(g, D(g));
    g = playRound(g).state; // rodada 11: ida da 1ª fase
    const first = phaseViews(g, D(g))[0];
    expect(first.name).toBe('1ª fase (64 clubes)');
    expect(first.ties.length).toBe(32);
    const top4 = new Set(tabs.flatMap((t) => t.rows.slice(0, 4).map((r) => r.clubId)));
    expect(top4.size).toBe(64);
    for (const t of first.ties) { expect(top4.has(t.aId)).toBe(true); expect(top4.has(t.bId)).toBe(true); }
    g = play(g);
    const views = phaseViews(g, D(g));
    expect(views.map((v) => v.ties.length)).toEqual([32, 16, 8, 4, 2, 2, 1]); // fases, quartas, semifinais, playoffs de acesso e final
    expect(views.map((v) => v.name)).toEqual(['1ª fase (64 clubes)', '2ª fase (32 clubes)', 'Oitavas de final', 'Quartas de final', 'Playoff de acesso', 'Semifinal', 'Final']);
    for (const v of views) for (const t of v.ties) { expect(t.done).toBe(true); expect(t.legs.length).toBe(2); expect(t.winnerId).toBeTruthy(); }
    // a volta decide: pênaltis só quando o agregado termina empatado
    for (const v of views) for (const t of v.ties) {
      const volta = t.legs[1];
      if (t.aGoals === t.bGoals) expect(volta.pens && volta.pens[0] !== volta.pens[1]).toBeTruthy(); else expect(volta.pens).toBeUndefined();
      expect(t.legs[0].pens).toBeUndefined();
    }
    // cada fase só tem vencedores da anterior
    const byName = (n: string) => views.find((v) => v.name === n)!;
    const order = ['1ª fase (64 clubes)', '2ª fase (32 clubes)', 'Oitavas de final', 'Quartas de final'];
    for (let i = 1; i < order.length; i++) {
      const prev = new Set(byName(order[i - 1]).ties.map((t) => t.winnerId));
      for (const t of byName(order[i]).ties) { expect(prev.has(t.aId)).toBe(true); expect(prev.has(t.bId)).toBe(true); }
    }
    // semifinais com os 4 vencedores das quartas; playoffs de acesso com os 4 eliminados nas quartas
    const qfWin = new Set(byName('Quartas de final').ties.map((t) => t.winnerId));
    const qfLose = new Set(byName('Quartas de final').ties.map((t) => (t.winnerId === t.aId ? t.bId : t.aId)));
    for (const t of byName('Semifinal').ties) { expect(qfWin.has(t.aId)).toBe(true); expect(qfWin.has(t.bId)).toBe(true); }
    for (const t of byName('Playoff de acesso').ties) { expect(qfLose.has(t.aId)).toBe(true); expect(qfLose.has(t.bId)).toBe(true); }
    expect(g.results.some((r) => r.divisionId === 'serie-d' && r.round > D_LAST_ROUND)).toBe(false);
  });
  it('6 acessos: os 4 vencedores das quartas + os 2 vencedores dos playoffs; campeão = vencedor da final', () => {
    const end = play(makeCareer('palmeiras', 5));
    const st = serieDStanding(end, D(end));
    const views = phaseViews(end, D(end));
    const qf = views.find((v) => v.name === 'Quartas de final')!.ties.map((t) => t.winnerId!);
    const po = views.find((v) => v.name === 'Playoff de acesso')!.ties.map((t) => t.winnerId!);
    expect(st.promoted.length).toBe(6);
    expect([...st.promoted].sort()).toEqual([...qf, ...po].sort());
    expect(st.championId).toBe(views.find((v) => v.name === 'Final')!.ties[0].winnerId);
    expect(st.table.length).toBe(96);
    expect(st.table[0].clubId).toBe(st.championId);
    expect(tieOutcome(end, 'serie-d', 'D-F-0')?.done).toBe(true);
  });
  it('virada: sobem da D os que a regra manda, a Série D segue com 96 e nada se perde', () => {
    const end = play(makeCareer('palmeiras', 5));
    const st = serieDStanding(end, D(end));
    const flow = serieDFlow(end.season, serieDQualifiers(end).length);
    const next = startNextSeason(end);
    const idsD = new Set(next.divisions[3].clubIds), idsC = new Set(next.divisions[2].clubIds);
    for (const id of st.promoted.slice(0, flow.promoted)) { expect(idsC.has(id)).toBe(true); expect(idsD.has(id)).toBe(false); }
    expect(next.divisions[3].clubIds.length).toBe(96);
    expect(next.divisions[3].groups!.flat().length).toBe(96);
    expect(next.divisions[3].groups).not.toEqual(end.divisions[3].groups);
    expect(next.history[0].divisions[3].championId).toBe(st.championId);
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
    expect(mine.length).toBeLessThanOrEqual(D_LAST_ROUND);
  });
  it('várias temporadas seguidas mantêm 96 clubes na Série D e os grupos refeitos a cada ano', () => {
    let g = makeCareer('flamengo', 4);
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) { g = { ...play(g), morale: { ...g.morale, board: 60 } }; g = startNextSeason(g); expect(g.divisions[3].clubIds.length).toBe(96); seen.add(JSON.stringify(g.divisions[3].groups)); }
    expect(seen.size).toBe(3);
  });
});
