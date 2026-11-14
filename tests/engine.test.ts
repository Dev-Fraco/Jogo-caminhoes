import { describe, expect, it } from 'vitest';
import { CLUBS_DATA } from '../src/data/clubs';
import { parsePack } from '../src/data/pack';
import {
  divisionTable, isSeasonOver, PROMOTION_SLOTS, RELEGATION_SLOTS, playRound, seasonOutcome, setFormation, startNextSeason, swapPlayer, userDivision,
} from '../src/engine/game';
import { simulateMatch } from '../src/engine/match';
import { makeRng } from '../src/engine/rng';
import { buildFixtures } from '../src/engine/schedule';
import { teamFromPlayers } from '../src/engine/squad';
import { computeTable } from '../src/engine/table';
import type { GameState } from '../src/engine/types';
import { makeCareer } from './helpers';

/** Joga a temporada inteira mantendo a diretoria satisfeita (sem demissão), para testar o resto. */
const playSeason = (g: GameState) => { while (!isSeasonOver(g)) { g = playRound(g).state; g = { ...g, morale: { ...g.morale, board: 60 } }; } return g; };

describe('calendário', () => {
  it('20 clubes => 38 rodadas, 380 jogos, todos jogam todas as rodadas', () => {
    const ids = CLUBS_DATA['serie-a'].map((c) => c.id);
    const { fixtures, totalRounds } = buildFixtures(ids, 'serie-a');
    expect(totalRounds).toBe(38);
    expect(fixtures).toHaveLength(380);
    for (let r = 1; r <= 38; r++) {
      const inRound = fixtures.filter((f) => f.round === r);
      expect(inRound).toHaveLength(10);
      expect(new Set(inRound.flatMap((f) => [f.homeId, f.awayId])).size).toBe(20);
    }
    const pairs = new Set(fixtures.map((f) => `${f.homeId}>${f.awayId}`));
    expect(pairs.size).toBe(380); // cada par se enfrenta 1x em cada mando
  });
});

describe('simulação', () => {
  it('média de gols realista e time forte vence mais', () => {
    const [strong, weak] = [CLUBS_DATA['serie-a'][0], CLUBS_DATA['serie-a'].find((c) => c.id === 'remo')!];
    const S = teamFromPlayers(strong.id, strong.squad), W = teamFromPlayers(weak.id, weak.squad);
    const rng = makeRng(42);
    let goals = 0, sWins = 0, wWins = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const o = simulateMatch(S, W, rng);
      goals += o.homeGoals + o.awayGoals;
      if (o.homeGoals > o.awayGoals) sWins++; else if (o.homeGoals < o.awayGoals) wWins++;
    }
    expect(goals / N).toBeGreaterThan(1.8);
    expect(goals / N).toBeLessThan(3.6);
    expect(sWins).toBeGreaterThan(wWins * 2);
  });
});

describe('carreira no Campeonato Brasileiro', () => {
  it('cria 4 divisões de 20 clubes, 80 clubes distintos, e o clube do jogador na divisão certa', () => {
    const g = makeCareer('santa-cruz');
    expect(g.divisions.map((d) => d.id)).toEqual(['serie-a', 'serie-b', 'serie-c', 'serie-d']);
    expect(g.divisions.every((d) => d.clubIds.length === 20)).toBe(true);
    expect(new Set(g.divisions.flatMap((d) => d.clubIds)).size).toBe(80);
    expect(Object.keys(g.teams)).toHaveLength(80);
    expect(userDivision(g).id).toBe('serie-c');
    expect(g.totalRounds).toBe(38);
    expect(g.fixtures).toHaveLength(4 * 380);
    expect(g.version).toBe(5);
  });
  it('rejeita clube que não existe', () => expect(() => makeCareer('nao-existe')).toThrow());

  it('joga 38 rodadas em todas as divisões; tabelas consistentes e determinísticas; eventos só nos jogos do jogador', () => {
    const a = playSeason(makeCareer('palmeiras')), b = playSeason(makeCareer('palmeiras'));
    expect(a.results).toHaveLength(4 * 380);
    expect(JSON.stringify(a.results.map((r) => [r.homeGoals, r.awayGoals]))).toBe(JSON.stringify(b.results.map((r) => [r.homeGoals, r.awayGoals])));
    for (const d of a.divisions) {
      const t = divisionTable(a, d.id);
      expect(t.every((r) => r.played === 38)).toBe(true);
      expect(t.reduce((s, r) => s + r.gf, 0)).toBe(t.reduce((s, r) => s + r.ga, 0));
    }
    const mine = (r: { homeId: string; awayId: string }) => r.homeId === 'palmeiras' || r.awayId === 'palmeiras';
    expect(a.results.filter((r) => !mine(r)).every((r) => r.events.length === 0)).toBe(true);
    expect(a.results.filter(mine).some((r) => r.events.length > 0)).toBe(true);
  });
});

describe('acesso e rebaixamento', () => {
  it('só encerra a temporada quando ela acabou', () => {
    const g = makeCareer();
    expect(startNextSeason(g)).toBe(g);
  });

  it('sobem os 4 primeiros e descem os 4 últimos entre divisões vizinhas; 20 clubes em cada divisão', () => {
    const end = playSeason(makeCareer('palmeiras'));
    const tables = Object.fromEntries(end.divisions.map((d) => [d.id, divisionTable(end, d.id).map((r) => r.clubId)]));
    const next = startNextSeason(end);
    const ids = (id: string) => new Set(next.divisions.find((d) => d.id === id)!.clubIds);

    expect(PROMOTION_SLOTS).toBe(4); expect(RELEGATION_SLOTS).toBe(4);
    expect(next.season).toBe(2027);
    expect(next.divisions.every((d) => d.clubIds.length === 20)).toBe(true);
    expect(new Set(next.divisions.flatMap((d) => d.clubIds)).size).toBe(80);

    // Série A: perdeu os 4 últimos, ganhou os 4 primeiros da B
    for (const c of tables['serie-a'].slice(-4)) { expect(ids('serie-a').has(c)).toBe(false); expect(ids('serie-b').has(c)).toBe(true); }
    for (const c of tables['serie-b'].slice(0, 4)) expect(ids('serie-a').has(c)).toBe(true);
    // B ↔ C
    for (const c of tables['serie-b'].slice(-4)) expect(ids('serie-c').has(c)).toBe(true);
    for (const c of tables['serie-c'].slice(0, 4)) expect(ids('serie-b').has(c)).toBe(true);
    // C ↔ D
    for (const c of tables['serie-c'].slice(-4)) expect(ids('serie-d').has(c)).toBe(true);
    for (const c of tables['serie-d'].slice(0, 4)) expect(ids('serie-c').has(c)).toBe(true);
    // quem ficou no meio continua onde estava
    for (const c of tables['serie-a'].slice(0, 16)) expect(ids('serie-a').has(c)).toBe(true);
    for (const c of tables['serie-d'].slice(4)) expect(ids('serie-d').has(c)).toBe(true);

    // nova temporada limpa: rodada 1, sem resultados, calendário novo, histórico guardado
    expect(next.round).toBe(1); expect(next.results).toHaveLength(0); expect(next.fixtures).toHaveLength(4 * 380);
    expect(next.history).toHaveLength(1);
    expect(next.history[0].divisions.map((d) => d.championId)).toEqual(Object.values(tables).map((t) => t[0]));
  });

  it('o resultado do clube do jogador (sobe, desce ou fica) bate com a classificação e com a divisão seguinte', () => {
    for (const club of ['palmeiras', 'sport', 'guarani', 'abc']) {
      const end = playSeason(makeCareer(club, 7));
      const out = seasonOutcome(end);
      const next = startNextSeason(end);
      expect(userDivision(next).id).toBe(out.nextDivisionId);
      if (out.movement === 'stay') expect(out.nextDivisionId).toBe(out.userDivisionId);
    }
  });

  it('funciona por várias temporadas seguidas (sempre 80 clubes, 20 por divisão)', () => {
    let g = makeCareer('flamengo', 99);
    for (let i = 0; i < 3; i++) {
      g = startNextSeason(playSeason(g));
      expect(g.divisions.map((d) => d.clubIds.length)).toEqual([20, 20, 20, 20]);
      expect(new Set(g.divisions.flatMap((d) => d.clubIds)).size).toBe(80);
    }
    expect(g.season).toBe(2029);
    expect(g.history).toHaveLength(3);
  });
});

describe('escalação', () => {
  it('troca só dentro da mesma posição e formação refaz o time', () => {
    let g = makeCareer('palmeiras', 7);
    const t = g.teams.palmeiras;
    const starter = t.players.find((p) => t.lineup.includes(p.id) && p.pos === 'MID')!;
    const bench = t.players.find((p) => !t.lineup.includes(p.id) && p.pos === 'MID')!;
    const benchAtt = t.players.find((p) => !t.lineup.includes(p.id) && p.pos === 'ATT')!;
    expect(swapPlayer(g, starter.id, benchAtt.id)).toBe(g);
    g = swapPlayer(g, starter.id, bench.id);
    expect(g.teams.palmeiras.lineup).toContain(bench.id);
    g = setFormation(g, '4-3-3');
    expect(g.teams.palmeiras.lineup).toHaveLength(11);
    expect(g.teams.palmeiras.lineup.filter((id) => g.teams.palmeiras.players.find((p) => p.id === id)!.pos === 'ATT')).toHaveLength(3);
  });
});

describe('tabela', () => {
  it('desempata por pontos, vitórias, saldo e gols', () => {
    const t = computeTable([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], [
      { divisionId: 'x', round: 1, homeId: 'a', awayId: 'b', homeGoals: 2, awayGoals: 1, events: [] },
    ]);
    expect(t.map((r) => r.clubId)).toEqual(['a', 'b']);
    expect(t[0]).toMatchObject({ points: 3, gd: 1, played: 1 });
  });
});

describe('pacote de dados (formato para mods)', () => {
  const clubs = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, short: id, color: '#fff', strength: 60 }));
  it('aceita um pacote válido e rejeita lixo', () => {
    expect(() => parsePack({ format: 'caminhoes-pack-v1', id: 'x', name: 'X', league: { name: 'L', clubs } })).not.toThrow();
    expect(() => parsePack({})).toThrow();
    expect(() => parsePack({ format: 'caminhoes-pack-v1', id: 'x', name: 'X', league: { name: 'L', clubs: [] } })).toThrow();
  });
});
