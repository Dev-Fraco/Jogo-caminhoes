import { describe, expect, it } from 'vitest';
import { startNextSeason } from '../src/premium/season';
import { isSeasonOver, playRound, seasonMoves } from '../src/engine/game';
import { LEAGUE_ROUNDS, leagueTable, phaseViews, rulesFor, serieBStanding, serieCGroupTables, serieCGroups, serieCStanding, serieDFlow, tieOutcome } from '../src/engine/phases';
import { serieDQualifiers } from '../src/engine/estadual';
import { makeCareer } from './helpers';
import type { GameState } from '../src/engine/types';

const play = (g: GameState, until = 999) => { while (!isSeasonOver(g) && g.round <= until) g = playRound(g).state; return g; };
const B = (g: GameState) => g.divisions[1];
const C = (g: GameState) => g.divisions[2];

describe('Série B: playoffs de acesso', () => {
  it('1º e 2º sobem direto; 3º x 6º e 4º x 5º em ida e volta (rodadas 39 e 40) dão as outras 2 vagas; 4 últimos caem', () => {
    let g = play(makeCareer('palmeiras', 5), LEAGUE_ROUNDS);
    expect(g.totalRounds).toBe(LEAGUE_ROUNDS + 2);
    const order = leagueTable(g, B(g)).map((r) => r.clubId);
    expect(g.round).toBe(LEAGUE_ROUNDS + 1);
    const t0 = tieOutcome(g, 'serie-b', 'B-PO-0')!, t1 = tieOutcome(g, 'serie-b', 'B-PO-1')!;
    expect([t0.aId, t0.bId]).toEqual([order[2], order[5]]);
    expect([t1.aId, t1.bId]).toEqual([order[3], order[4]]);
    g = play(g);
    const done0 = tieOutcome(g, 'serie-b', 'B-PO-0')!, done1 = tieOutcome(g, 'serie-b', 'B-PO-1')!;
    expect(done0.legs.map((r) => r.round)).toEqual([39, 40]);
    expect(done0.legs[0].homeId).toBe(order[5]); expect(done0.legs[1].homeId).toBe(order[2]); // a ida é na casa do pior colocado
    const st = serieBStanding(g, B(g));
    expect(st.promoted).toEqual([order[0], order[1], done0.winnerId, done1.winnerId]);
    const moves = seasonMoves(g)[1];
    expect(moves.promoted).toEqual(st.promoted);
    expect(moves.relegated).toEqual(order.slice(-4));
    // a tabela de 38 rodadas não mistura os playoffs
    expect(leagueTable(g, B(g)).every((r) => r.played === 38)).toBe(true);
    expect(phaseViews(g, B(g))[0].name).toBe('Playoffs de acesso');
  });
});

describe('Série C: 1ª fase, quadrangulares e final', () => {
  it('19 rodadas em turno único; 8 avançam em 2 quadrangulares (1º-4º-5º-8º e 2º-3º-6º-7º), ida e volta; líderes fazem a final', () => {
    let g = play(makeCareer('csa', 3), 19);
    const t1 = leagueTable(g, C(g));
    expect(t1.every((r) => r.played === 19)).toBe(true);
    expect(g.results.filter((r) => r.divisionId === 'serie-c').length).toBe(190);
    const grp = serieCGroups(g, C(g))!;
    const ids = t1.map((r) => r.clubId);
    expect(grp[0]).toEqual([ids[0], ids[3], ids[4], ids[7]]);
    expect(grp[1]).toEqual([ids[1], ids[2], ids[5], ids[6]]);
    g = play(g, 25);
    const quads = serieCGroupTables(g, C(g));
    expect(quads.length).toBe(2);
    for (const q of quads) expect(q.rows.every((r) => r.played === 6)).toBe(true);
    g = play(g);
    const fin = tieOutcome(g, 'serie-c', 'C-F')!;
    expect(fin.done).toBe(true);
    expect(fin.legs.map((r) => r.round)).toEqual([26, 27]);
    const leaders = quads.map((q) => q.rows[0].clubId);
    expect([fin.aId, fin.bId].sort()).toEqual([...leaders].sort());
    const st = serieCStanding(g, C(g));
    expect(st.championId).toBe(fin.winnerId);
    expect([...st.promoted].sort()).toEqual(quads.flatMap((q) => [q.rows[0].clubId, q.rows[1].clubId]).sort());
    const moves = seasonMoves(g)[2];
    expect(moves.promoted.length).toBe(4);
    expect(moves.relegated).toEqual(ids.slice(-rulesFor(g.season).cRelegated)); // 19º e 20º da 1ª fase
  });
  it('virada de temporada: sobem 4 para a B, caem 2 para a D, sobem da D conforme a regra e a Série C cresce (20 → 24 em 2027)', () => {
    const end = play(makeCareer('csa', 3));
    const quals = serieDQualifiers(end).length;
    const flow = serieDFlow(end.season, quals);
    const next = startNextSeason(end);
    expect(next.divisions[2].clubIds.length).toBe(20 - 4 + 4 - 2 + flow.promoted);
    expect(next.divisions[3].clubIds.length).toBe(96);
    expect(next.divisions[1].clubIds.length).toBe(20);
    expect(next.divisions[0].clubIds.length).toBe(20);
    expect(next.totalRounds).toBeGreaterThanOrEqual(LEAGUE_ROUNDS + 2);
  });
});

describe('regras por temporada', () => {
  it('a Série D mantém 96 clubes: com 8 vagas dos estaduais, 6 sobem e 4 descem; sem estaduais, só sobem os que fecham a conta', () => {
    expect(serieDFlow(2026, 8)).toEqual({ promoted: 6, relegated: 4 });
    expect(serieDFlow(2026, 4)).toEqual({ promoted: 6, relegated: 0 });
    expect(serieDFlow(2026, 0)).toEqual({ promoted: 2, relegated: 0 });
  });
  it('Série C cresce até 28 e depois fica estável (caem tantos quantos sobem da D)', () => {
    expect(rulesFor(2026).cRelegated).toBe(2);
    expect(rulesFor(2027).cRelegated).toBe(2);
    expect(rulesFor(2028).cRelegated).toBe(rulesFor(2028).dPromoted);
  });
});
