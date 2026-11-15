import { describe, expect, it } from 'vitest';
import { clubGoals, goalStatus } from '../src/engine/aigoals';
import { aiBalanceSquads, DEFAULT_LIMITS, squadLimits, squadReport } from '../src/engine/aisquad';
import { squadNeeds } from '../src/engine/aineeds';
import { clubProfile } from '../src/engine/aiprofile';
import { skipSeasons } from '../src/engine/game';
import { makeRng } from '../src/engine/rng';
import { rosterOk } from '../src/engine/roster';
import type { GameState, MatchResult, Player, Position } from '../src/engine/types';
import { makeCareer } from './helpers';

const g0 = makeCareer('flamengo', 4);
const ids = g0.divisions[0].clubIds.filter((x) => x !== 'flamengo');
const setPlayers = (g: GameState, id: string, f: (ps: Player[]) => Player[]): GameState => ({ ...g, teams: { ...g.teams, [id]: { ...g.teams[id], players: f(g.teams[id].players) } } });
const extra = (id: string, pos: Position, n: number, age = 24, strength = 50): Player[] => Array.from({ length: n }, (_, i) => ({ id: `${id}-x${pos}${i}`, name: `Extra ${pos}${i}`, pos, age, strength }));
const total = (g: GameState) => Object.values(g.teams).reduce((t, x) => t + x.players.length, 0) + (g.freeAgents ?? []).length;

describe('Etapa 8 — objetivos', () => {
  it('todo clube tem objetivo de liga coerente com a divisão', () => {
    for (const d of g0.divisions.filter((x) => x.format !== 'outside')) for (const id of d.clubIds.slice(0, 6)) {
      const goals = clubGoals(g0, id);
      expect(goals.leagueLabel.length).toBeGreaterThan(5);
      const di = g0.divisions.indexOf(d);
      if (di > 0) expect(goals.league).not.toBe('titulo');
      if (di === 0) expect(goals.league).not.toBe('acesso');
    }
  });
  it('clube com meta de título disputa; clube que luta contra o rebaixamento entra em sobrevivência; na tabela, o momento manda', () => {
    const t = ids.find((id) => clubGoals(g0, id).league === 'titulo');
    const s = ids.find((id) => clubGoals(g0, id).league === 'rebaixamento');
    if (t) expect(goalStatus(g0, t).mode).toBe('disputa');
    if (s) expect(goalStatus(g0, s).mode).toBe('sobrevivencia');
    // clube grande perdendo tudo por 12 rodadas: objetivo já inviável → volta ao normal
    const id = t ?? ids[0];
    const d = g0.divisions[0];
    const results: MatchResult[] = [];
    for (let r = 1; r <= 12; r++) for (let i = 0; i + 1 < d.clubIds.length; i += 2) { const a = d.clubIds[(i + r) % d.clubIds.length], b = d.clubIds[(i + 1 + r) % d.clubIds.length]; results.push({ divisionId: d.id, round: r, homeId: a, awayId: b, homeGoals: a === id ? 0 : 1, awayGoals: b === id ? 0 : a === id ? 1 : 1 }); }
    const g = { ...g0, round: 13, results };
    expect(goalStatus(g, id).mode).not.toBe('disputa');
  });
});

describe('Etapa 9 — elencos realistas', () => {
  it('limites padrão e configuráveis', () => {
    expect(squadLimits(g0)).toEqual(DEFAULT_LIMITS);
    const l = squadLimits({ squadRules: { total: { max: 30 }, pos: { GK: { max: 5 } } } });
    expect(l.total.max).toBe(30); expect(l.total.min).toBe(DEFAULT_LIMITS.total.min);
    expect(l.pos.GK.max).toBe(5); expect(l.pos.GK.ideal).toBe(DEFAULT_LIMITS.pos.GK.ideal); expect(l.pos.DEF).toEqual(DEFAULT_LIMITS.pos.DEF);
  });
  it('relatório aponta excesso de uma posição com falta de outra (desequilíbrio)', () => {
    const club = ids[0];
    const g = setPlayers(g0, club, (ps) => { let k = 0; return [...ps.filter((p) => p.pos !== 'ATT' || k++ < 2), ...extra(club, 'MID', 6)]; });
    const r = squadReport(g, club);
    expect(r.issues.some((i) => i.kind === 'excesso' && i.pos === 'MID')).toBe(true);
    expect(r.issues.some((i) => i.kind === 'falta' && i.pos === 'ATT')).toBe(true);
    expect(r.issues.some((i) => i.kind === 'desequilibrio')).toBe(true);
  });
  it('clube nunca contrata posição que já está no limite máximo', () => {
    const club = ids[1];
    const g = setPlayers(g0, club, (ps) => [...ps, ...extra(club, 'GK', 6)]);
    const needs = squadNeeds(g, club, clubProfile(g, club));
    expect(needs.some((n) => n.pos === 'GK')).toBe(false);
  });
  it('excesso é organizado sem apagar ninguém: total de jogadores no jogo não diminui e elencos seguem válidos', () => {
    const club = ids[2];
    const g = setPlayers(g0, club, (ps) => [...ps, ...extra(club, 'MID', 7, 25, 45)]);
    const before = total(g);
    const out = aiBalanceSquads(g, makeRng(5));
    expect(total(out)).toBe(before);
    expect(squadReport(out, club).counts.MID).toBeLessThan(squadReport(g, club).counts.MID);
    expect(rosterOk(out.teams[club].players)).toBe(true);
    const allIds = [...Object.values(out.teams).flatMap((t) => t.players.map((p) => p.id)), ...(out.freeAgents ?? []).map((p) => p.id)];
    expect(new Set(allIds).size).toBe(allIds.length);
  });
  it('elenco cadastrado muito grande não é cortado de uma vez no clube do jogador (só a IA reorganiza) ', () => {
    const g = setPlayers(g0, 'flamengo', (ps) => [...ps, ...extra('flamengo', 'DEF', 10)]);
    expect(aiBalanceSquads(g, makeRng(1)).teams['flamengo'].players.length).toBe(g.teams['flamengo'].players.length);
  });
  it('várias temporadas: ninguém some do jogo sem ser por aposentadoria, e nenhum clube fica sem uma posição', () => {
    const g = skipSeasons(makeCareer('flamengo', 17), 3);
    for (const id of Object.keys(g.teams)) {
      const r = squadReport(g, id);
      for (const pos of ['GK', 'DEF', 'MID', 'ATT'] as Position[]) expect(r.counts[pos]).toBeGreaterThanOrEqual(DEFAULT_LIMITS.pos[pos].min);
    }
    expect((g.freeAgents ?? []).length).toBeLessThanOrEqual(600);
  }, 120_000);
});
