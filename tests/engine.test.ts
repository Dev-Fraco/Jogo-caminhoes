import { describe, expect, it } from 'vitest';
import { BRASILEIRAO } from '../src/data/brasileirao';
import { parsePack } from '../src/data/pack';
import { isSeasonOver, newGame, playRound, setFormation, swapPlayer } from '../src/engine/game';
import { makeRng } from '../src/engine/rng';
import { simulateMatch } from '../src/engine/match';
import { buildFixtures } from '../src/engine/schedule';
import { buildTeam } from '../src/engine/squad';
import { computeTable } from '../src/engine/table';

describe('calendário', () => {
  it('20 clubes => 38 rodadas, 380 jogos, todos jogam todas as rodadas', () => {
    const ids = BRASILEIRAO.league.clubs.map((c) => c.id);
    const { fixtures, totalRounds } = buildFixtures(ids);
    expect(totalRounds).toBe(38);
    expect(fixtures).toHaveLength(380);
    for (let r = 1; r <= 38; r++) {
      const inRound = fixtures.filter((f) => f.round === r);
      expect(inRound).toHaveLength(10);
      expect(new Set(inRound.flatMap((f) => [f.homeId, f.awayId])).size).toBe(20);
    }
    // cada par se enfrenta exatamente 2x, uma em cada mando
    const pairs = new Map<string, number>();
    for (const f of fixtures) pairs.set(`${f.homeId}>${f.awayId}`, (pairs.get(`${f.homeId}>${f.awayId}`) ?? 0) + 1);
    expect(pairs.size).toBe(380);
    expect([...pairs.values()].every((v) => v === 1)).toBe(true);
  });
});

describe('simulação', () => {
  it('média de gols realista e time forte vence mais', () => {
    const [strong, weak] = [BRASILEIRAO.league.clubs[0], BRASILEIRAO.league.clubs[19]];
    const S = buildTeam(strong, 1), W = buildTeam(weak, 1);
    const rng = makeRng(42);
    let goals = 0, sWins = 0, wWins = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const o = simulateMatch(S, W, rng);
      goals += o.homeGoals + o.awayGoals;
      if (o.homeGoals > o.awayGoals) sWins++; else if (o.homeGoals < o.awayGoals) wWins++;
    }
    const avg = goals / N;
    expect(avg).toBeGreaterThan(1.8);
    expect(avg).toBeLessThan(3.6);
    expect(sWins).toBeGreaterThan(wWins * 2);
  });
});

describe('temporada completa', () => {
  it('joga 38 rodadas e gera tabela consistente e determinística', () => {
    const run = () => {
      let g = newGame(BRASILEIRAO, 'fla', 123);
      while (!isSeasonOver(g)) g = playRound(g).state;
      return g;
    };
    const a = run(), b = run();
    expect(a.results).toHaveLength(380);
    expect(JSON.stringify(a.results.map((r) => [r.homeGoals, r.awayGoals]))).toBe(JSON.stringify(b.results.map((r) => [r.homeGoals, r.awayGoals])));
    const table = computeTable(a.clubs, a.results);
    expect(table.every((r) => r.played === 38)).toBe(true);
    expect(table.reduce((s, r) => s + r.gf, 0)).toBe(table.reduce((s, r) => s + r.ga, 0));
    expect(table[0].points).toBeGreaterThan(table[19].points);
  });
});

describe('escalação', () => {
  it('troca só dentro da mesma posição e formação refaz o time', () => {
    let g = newGame(BRASILEIRAO, 'pal', 7);
    const t = g.teams.pal;
    const starter = t.players.find((p) => t.lineup.includes(p.id) && p.pos === 'MID')!;
    const bench = t.players.find((p) => !t.lineup.includes(p.id) && p.pos === 'MID')!;
    const benchAtt = t.players.find((p) => !t.lineup.includes(p.id) && p.pos === 'ATT')!;
    expect(swapPlayer(g, starter.id, benchAtt.id)).toBe(g); // posição diferente: ignorado
    g = swapPlayer(g, starter.id, bench.id);
    expect(g.teams.pal.lineup).toContain(bench.id);
    g = setFormation(g, '4-3-3');
    expect(g.teams.pal.lineup).toHaveLength(11);
    expect(g.teams.pal.lineup.filter((id) => g.teams.pal.players.find((p) => p.id === id)!.pos === 'ATT')).toHaveLength(3);
  });
});

describe('pacote de dados', () => {
  it('aceita o pacote padrão e rejeita lixo', () => {
    expect(() => parsePack(JSON.parse(JSON.stringify(BRASILEIRAO)))).not.toThrow();
    expect(() => parsePack({})).toThrow();
    expect(() => parsePack({ ...BRASILEIRAO, league: { name: 'x', clubs: [] } })).toThrow();
  });
});
