import { makeRng, type Rng } from './rng';
import { buildFixtures } from './schedule';
import { teamRatings } from './squad';
import { computeTable } from './table';
import type { DivisionState, Fixture, GameState, MatchResult, TableRow } from './types';

/** Série D: 16 grupos de 6 (turno e returno = 10 rodadas), depois mata-mata com os 2 primeiros de cada grupo (32 clubes). */
export const GROUP_COUNT = 16;
export const GROUP_SIZE = 6;
export const GROUP_ROUNDS = 10;
export const KO_NAMES = ['32 avos', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'];
/** Quem chega à semifinal (4 clubes) sobe para a Série C. */
export const KO_FIRST_ROUND = GROUP_ROUNDS + 1;
export const KO_LAST_ROUND = GROUP_ROUNDS + 5;

const shuffle = <T,>(rng: Rng, list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const isGroups = (d: Pick<DivisionState, 'format'> | undefined): boolean => d?.format === 'groups';

/** Sorteia os 16 grupos em 6 potes por força (cada grupo recebe um clube de cada pote). */
export function buildGroups(clubIds: string[], strength: (id: string) => number, rng: Rng): string[][] {
  if (clubIds.length !== GROUP_COUNT * GROUP_SIZE) throw new Error('A Série D precisa de 96 clubes');
  const sorted = [...clubIds].sort((a, b) => strength(b) - strength(a));
  const groups: string[][] = Array.from({ length: GROUP_COUNT }, () => []);
  for (let pot = 0; pot < GROUP_SIZE; pot++) {
    const pool = shuffle(rng, sorted.slice(pot * GROUP_COUNT, (pot + 1) * GROUP_COUNT));
    pool.forEach((id, i) => groups[i].push(id));
  }
  return groups;
}

/** Cria os grupos de uma divisão em formato de grupos (a ordem dos clubes não importa; o sorteio é fixo para a temporada). */
export function withGroups(d: DivisionState, teams: GameState['teams'], seed: number): DivisionState {
  if (!isGroups(d)) return d;
  const rng = makeRng(seed);
  return { ...d, groups: buildGroups(d.clubIds, (id) => (teams[id] ? teamRatings(teams[id]).overall : 40), rng) }; // clubes que acabaram de subir ainda não têm elenco: contam como fracos
}

export function groupFixtures(d: DivisionState): Fixture[] {
  return (d.groups ?? []).flatMap((g) => buildFixtures(g, d.id).fixtures);
}

const resultsOf = (g: GameState, divisionId: string) => g.results.filter((r) => r.divisionId === divisionId);
const inGroupPhase = (r: MatchResult) => r.round <= GROUP_ROUNDS;

/** Classificação de cada grupo (só jogos da fase de grupos). */
export function groupTables(g: GameState, d: DivisionState): { name: string; rows: TableRow[] }[] {
  const res = resultsOf(g, d.id).filter(inGroupPhase);
  return (d.groups ?? []).map((ids, i) => ({
    name: `Grupo ${String.fromCharCode(65 + i)}`,
    rows: computeTable(ids.map((id) => ({ id, name: g.clubs[id].name })), res.filter((r) => ids.includes(r.homeId))),
  }));
}

/** Vencedor de um jogo eliminatório (gols e, se empatar, pênaltis). */
export const koWinner = (r: MatchResult): string => (r.homeGoals !== r.awayGoals ? (r.homeGoals > r.awayGoals ? r.homeId : r.awayId) : r.pens && r.pens[0] > r.pens[1] ? r.homeId : r.awayId);

/** Jogos do mata-mata já jogados ou marcados, por rodada. */
export const koFixtures = (g: GameState, divisionId: string, round: number) => g.fixtures.filter((f) => f.divisionId === divisionId && f.ko && f.round === round);

/**
 * Depois de cada rodada do campeonato: abre o mata-mata da Série D (rodada 11) com os 2 primeiros de cada grupo
 * e, a cada fase, sorteia os confrontos da seguinte com os vencedores (chaveamento fixo).
 */
export function advanceKnockout(g: GameState): GameState {
  const d = g.divisions.find(isGroups);
  if (!d || !d.groups) return g;
  const played = g.round - 1; // rodada que acabou de ser jogada
  let ties: [string, string][] = [];
  if (played === GROUP_ROUNDS) {
    const tabs = groupTables(g, d);
    const first = tabs.map((t) => t.rows[0].clubId), second = tabs.map((t) => t.rows[1].clubId);
    ties = first.map((f, i) => [f, second[i ^ 1]]); // 1º do grupo (em casa) contra o 2º do grupo vizinho
  } else if (played > GROUP_ROUNDS && played < KO_LAST_ROUND) {
    const winners = resultsOf(g, d.id).filter((r) => r.round === played).sort((a, b) => fixtureIndex(g, d.id, a) - fixtureIndex(g, d.id, b)).map(koWinner);
    for (let i = 0; i < winners.length; i += 2) ties.push([winners[i], winners[i + 1]]);
  } else return g;
  const add: Fixture[] = ties.map(([home, away]) => ({ divisionId: d.id, round: played + 1, homeId: home, awayId: away, ko: true }));
  return { ...g, fixtures: [...g.fixtures, ...add] };
}
const fixtureIndex = (g: GameState, divisionId: string, r: MatchResult) => g.fixtures.findIndex((f) => f.divisionId === divisionId && f.round === r.round && f.homeId === r.homeId && f.awayId === r.awayId);

export interface KnockoutView { name: string; round: number; ties: { homeId: string; awayId: string; result?: MatchResult; winnerId?: string }[] }
/** Chaveamento do mata-mata (fases já montadas). */
export function knockoutView(g: GameState, d: DivisionState): KnockoutView[] {
  return KO_NAMES.map((name, i) => {
    const round = KO_FIRST_ROUND + i;
    const ties = koFixtures(g, d.id, round).map((f) => {
      const result = g.results.find((r) => r.divisionId === d.id && r.round === round && r.homeId === f.homeId && r.awayId === f.awayId);
      return { homeId: f.homeId, awayId: f.awayId, result, winnerId: result ? koWinner(result) : undefined };
    });
    return { name, round, ties };
  }).filter((v) => v.ties.length > 0);
}

/** Classificação final da Série D: campeão, vice, semifinalistas, depois quem caiu em cada fase (por pontos na fase de grupos). */
export function finalStandings(g: GameState, d: DivisionState): { table: TableRow[]; promoted: string[]; championId: string } {
  const all = computeTable(d.clubIds.map((id) => ({ id, name: g.clubs[id].name })), resultsOf(g, d.id).filter(inGroupPhase));
  const stage = new Map<string, number>(); // 0 = eliminado nos grupos; 1.. = fase em que caiu; 6 = campeão
  for (const v of knockoutView(g, d)) for (const t of v.ties) {
    if (!t.winnerId) continue;
    const loser = t.winnerId === t.homeId ? t.awayId : t.homeId;
    stage.set(loser, Math.max(stage.get(loser) ?? 0, v.round - GROUP_ROUNDS));
    if (v.round === KO_LAST_ROUND) stage.set(t.winnerId, 6);
  }
  for (const v of knockoutView(g, d)) for (const t of v.ties) for (const id of [t.homeId, t.awayId]) if (!stage.has(id)) stage.set(id, v.round - GROUP_ROUNDS); // ainda na disputa
  const table = [...all].sort((a, b) => (stage.get(b.clubId) ?? 0) - (stage.get(a.clubId) ?? 0) || 0);
  const ranked = table.filter((r, i, arr) => i === arr.findIndex((x) => x.clubId === r.clubId));
  const promoted = ranked.filter((r) => (stage.get(r.clubId) ?? 0) >= 4).map((r) => r.clubId).slice(0, 4);
  return { table: ranked, promoted, championId: ranked[0].clubId };
}

/** Classificação do grupo do seu clube (para humor da diretoria e Início). */
export function userGroupRows(g: GameState, d: DivisionState): TableRow[] | undefined {
  const tab = groupTables(g, d).find((t) => t.rows.some((r) => r.clubId === g.userClubId));
  return tab?.rows;
}
