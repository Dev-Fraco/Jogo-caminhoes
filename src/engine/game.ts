import { makeRng } from './rng';
import { buildFixtures } from './schedule';
import { simulateMatch } from './match';
import { autoLineup, buildTeam } from './squad';
import type { DataPack, FormationId, GameState, MatchResult, Position } from './types';

export function newGame(pack: DataPack, userClubId: string, seed = Date.now() % 2147483647, season = 1): GameState {
  const clubs = pack.league.clubs;
  if (!clubs.some((c) => c.id === userClubId)) throw new Error('Clube inexistente no pacote');
  const { fixtures, totalRounds } = buildFixtures(clubs.map((c) => c.id));
  const teams = Object.fromEntries(clubs.map((c) => [c.id, buildTeam(c, seed)]));
  return {
    version: 1, packId: pack.id, packName: pack.name, leagueName: pack.league.name,
    clubs: structuredClone(clubs), userClubId, seed, season,
    round: 1, totalRounds, teams, fixtures, results: [],
  };
}

export const isSeasonOver = (g: GameState) => g.round > g.totalRounds;

export function fixturesOfRound(g: GameState, round: number) {
  return g.fixtures.filter((f) => f.round === round);
}

/** Joga a próxima rodada (todos os jogos). Retorna novo estado + resultados da rodada. */
export function playRound(g: GameState): { state: GameState; results: MatchResult[] } {
  if (isSeasonOver(g)) return { state: g, results: [] };
  const rng = makeRng(g.seed * 1000 + g.round + g.season * 100003);
  const teams = { ...g.teams };
  // clubes controlados pela IA sempre escalam o melhor time
  for (const id of Object.keys(teams)) {
    if (id === g.userClubId) continue;
    const t = teams[id];
    teams[id] = { ...t, lineup: autoLineup(t.players, t.formation) };
  }
  const results: MatchResult[] = fixturesOfRound(g, g.round).map((f) => {
    const out = simulateMatch(teams[f.homeId], teams[f.awayId], rng);
    return { round: f.round, homeId: f.homeId, awayId: f.awayId, homeGoals: out.homeGoals, awayGoals: out.awayGoals, events: out.events };
  });
  return { state: { ...g, teams, round: g.round + 1, results: [...g.results, ...results] }, results };
}

export function setFormation(g: GameState, formation: FormationId): GameState {
  const t = g.teams[g.userClubId];
  return { ...g, teams: { ...g.teams, [g.userClubId]: { ...t, formation, lineup: autoLineup(t.players, formation) } } };
}

/** Troca um titular por um reserva da MESMA posição. */
export function swapPlayer(g: GameState, outId: string, inId: string): GameState {
  const t = g.teams[g.userClubId];
  const o = t.players.find((p) => p.id === outId), i = t.players.find((p) => p.id === inId);
  if (!o || !i || o.pos !== i.pos || !t.lineup.includes(outId) || t.lineup.includes(inId)) return g;
  const lineup = t.lineup.map((id) => (id === outId ? inId : id));
  return { ...g, teams: { ...g.teams, [g.userClubId]: { ...t, lineup } } };
}

export const POS_ORDER: Position[] = ['GK', 'DEF', 'MID', 'ATT'];
