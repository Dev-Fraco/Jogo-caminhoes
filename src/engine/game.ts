import type { ClubData } from '../data/clubs';
import { simulateMatch } from './match';
import { makeRng } from './rng';
import { buildFixtures } from './schedule';
import { autoLineup, teamFromPlayers } from './squad';
import { computeTable } from './table';
import type { ClubInfo, DivisionState, FormationId, Fixture, GameState, MatchResult, Position, SeasonSummary, TableRow } from './types';

/** Receita de fim de temporada por divisão (A→D), em R$. Valores provisórios até existir um sistema de finanças. */
export const DIVISION_INCOME = [40_000_000, 12_000_000, 5_000_000, 2_000_000];

/** Receita do clube na temporada: base da divisão × reputação, com bônus pela posição final (até +40% para o campeão). */
export function seasonIncome(divisionIndex: number, reputation: number, position: number, size: number): number {
  const base = DIVISION_INCOME[Math.min(divisionIndex, DIVISION_INCOME.length - 1)] * (0.6 + 0.2 * reputation);
  const bonus = 1 + 0.4 * (1 - (position - 1) / Math.max(1, size - 1));
  return Math.round((base * bonus) / 100_000) * 100_000;
}

/** Quantos clubes sobem e descem entre divisões vizinhas (Série A↔B, B↔C, C↔D). */
export const PROMOTION_SLOTS = 4;
export const RELEGATION_SLOTS = 4;

export interface CareerInput {
  saveName: string;
  coach: { name: string; nationality: string; reputation: string };
  difficulty: string;
  mode: string;
  season: number;
  userClubId: string;
  /** Pirâmide, da divisão principal para as inferiores. */
  divisions: { id: string; name: string; clubs: ClubData[] }[];
}

function buildSeason(divisions: DivisionState[]): { fixtures: Fixture[]; totalRounds: number } {
  const fixtures: Fixture[] = [];
  let totalRounds = 0;
  for (const d of divisions) {
    const f = buildFixtures(d.clubIds, d.id);
    fixtures.push(...f.fixtures);
    totalRounds = Math.max(totalRounds, f.totalRounds);
  }
  return { fixtures, totalRounds };
}

/** Cria uma carreira nova: todos os clubes de todas as divisões, calendário completo e elencos. */
export function newCareer(input: CareerInput, seed = Date.now() % 2147483647): GameState {
  const all = input.divisions.flatMap((d) => d.clubs);
  if (!all.some((c) => c.id === input.userClubId)) throw new Error('Clube inexistente na pirâmide');
  if (new Set(all.map((c) => c.id)).size !== all.length) throw new Error('Clubes repetidos na pirâmide');
  if (input.divisions.some((d) => d.clubs.length < PROMOTION_SLOTS + RELEGATION_SLOTS)) throw new Error('Divisão com poucos clubes');

  const divisions: DivisionState[] = input.divisions.map((d) => ({ id: d.id, name: d.name, clubIds: d.clubs.map((c) => c.id) }));
  const clubs: Record<string, ClubInfo> = {};
  const teams: GameState['teams'] = {};
  const budgets: Record<string, number> = {};
  for (const c of all) {
    budgets[c.id] = c.budget;
    clubs[c.id] = { id: c.id, name: c.name, shortName: c.shortName, badge: c.badge, primaryColor: c.primaryColor, secondaryColor: c.secondaryColor, stadium: c.stadium, city: c.city, reputation: c.reputation };
    teams[c.id] = teamFromPlayers(c.id, c.squad);
  }
  const { fixtures, totalRounds } = buildSeason(divisions);
  return {
    version: 3, saveName: input.saveName, coach: input.coach, difficulty: input.difficulty, mode: input.mode,
    userClubId: input.userClubId, seed, season: input.season, round: 1, totalRounds,
    clubs, budgets, transfers: [], divisions, teams, fixtures, results: [], history: [],
  };
}

export const isSeasonOver = (g: GameState) => g.round > g.totalRounds;

export const userDivisionIndex = (g: GameState) => g.divisions.findIndex((d) => d.clubIds.includes(g.userClubId));
export const userDivision = (g: GameState) => g.divisions[userDivisionIndex(g)];

export function fixturesOfRound(g: GameState, round: number, divisionId?: string) {
  return g.fixtures.filter((f) => f.round === round && (!divisionId || f.divisionId === divisionId));
}

/** Joga a próxima rodada em TODAS as divisões. Retorna o novo estado e os resultados da rodada. */
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
    const mine = f.homeId === g.userClubId || f.awayId === g.userClubId;
    return { divisionId: f.divisionId, round: f.round, homeId: f.homeId, awayId: f.awayId, homeGoals: out.homeGoals, awayGoals: out.awayGoals, events: mine ? out.events : [] };
  });
  return { state: { ...g, teams, round: g.round + 1, results: [...g.results, ...results] }, results };
}

export const resultsOfDivision = (g: GameState, divisionId: string) => g.results.filter((r) => r.divisionId === divisionId);

/** Classificação atual de uma divisão. */
export function divisionTable(g: GameState, divisionId: string): TableRow[] {
  const d = g.divisions.find((x) => x.id === divisionId)!;
  return computeTable(d.clubIds.map((id) => ({ id, name: g.clubs[id].name })), resultsOfDivision(g, divisionId));
}

export interface DivisionMoves { divisionId: string; table: TableRow[]; promoted: string[]; relegated: string[] }

/** Quem sobe e quem desce em cada divisão, de acordo com a classificação atual. */
export function seasonMoves(g: GameState): DivisionMoves[] {
  const last = g.divisions.length - 1;
  return g.divisions.map((d, i) => {
    const table = divisionTable(g, d.id);
    return {
      divisionId: d.id, table,
      promoted: i > 0 ? table.slice(0, PROMOTION_SLOTS).map((r) => r.clubId) : [],
      relegated: i < last ? table.slice(-RELEGATION_SLOTS).map((r) => r.clubId) : [],
    };
  });
}

export type Movement = 'promoted' | 'relegated' | 'stay';

export interface SeasonOutcome {
  moves: DivisionMoves[];
  userDivisionId: string;
  userPosition: number;
  movement: Movement;
  /** Divisão onde o clube jogará na próxima temporada. */
  nextDivisionId: string;
}

export function seasonOutcome(g: GameState): SeasonOutcome {
  const moves = seasonMoves(g);
  const i = userDivisionIndex(g);
  const m = moves[i];
  const movement: Movement = m.promoted.includes(g.userClubId) ? 'promoted' : m.relegated.includes(g.userClubId) ? 'relegated' : 'stay';
  const next = movement === 'promoted' ? i - 1 : movement === 'relegated' ? i + 1 : i;
  return { moves, userDivisionId: g.divisions[i].id, userPosition: m.table.findIndex((r) => r.clubId === g.userClubId) + 1, movement, nextDivisionId: g.divisions[next].id };
}

/** Encerra a temporada: aplica acesso e rebaixamento, guarda o resumo e monta o calendário da próxima. */
export function startNextSeason(g: GameState): GameState {
  if (!isSeasonOver(g)) return g;
  const out = seasonOutcome(g);
  const moves = out.moves;

  const divisions: DivisionState[] = g.divisions.map((d, i) => {
    const stay = moves[i].table.map((r) => r.clubId).filter((id) => !moves[i].promoted.includes(id) && !moves[i].relegated.includes(id));
    const fromAbove = i > 0 ? moves[i - 1].relegated : [];
    const fromBelow = i < g.divisions.length - 1 ? moves[i + 1].promoted : [];
    return { id: d.id, name: d.name, clubIds: [...fromBelow, ...stay, ...fromAbove] };
  });

  const summary: SeasonSummary = {
    season: g.season, userDivisionId: out.userDivisionId, userPosition: out.userPosition,
    divisions: moves.map((m) => ({ id: m.divisionId, championId: m.table[0].clubId, promoted: m.promoted, relegated: m.relegated })),
  };
  const { fixtures, totalRounds } = buildSeason(divisions);
  // receita da temporada para todos os clubes, conforme a divisão em que jogaram e a posição final
  const budgets = { ...g.budgets };
  moves.forEach((m, i) => m.table.forEach((r, idx) => {
    budgets[r.clubId] = (budgets[r.clubId] ?? 0) + seasonIncome(i, g.clubs[r.clubId].reputation, idx + 1, m.table.length);
  }));
  return { ...g, season: g.season + 1, round: 1, totalRounds, divisions, fixtures, results: [], budgets, history: [...g.history, summary] };
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
