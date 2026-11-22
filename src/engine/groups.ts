import { makeRng, type Rng } from './rng';
import { buildFixtures } from './schedule';
import { teamRatings } from './squad';
import { computeTable } from './table';
import type { DivisionState, Fixture, GameState, MatchResult, TableRow } from './types';

/** Série D: 16 grupos de 6 (turno e returno = 10 rodadas); os 4 primeiros de cada grupo vão ao mata-mata de ida e volta (veja phases.ts). */
export const GROUP_COUNT = 16;
export const GROUP_SIZE = 6;
export const GROUP_ROUNDS = 10;
export const KO_NAMES = ['32 avos', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'];
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

/** Classificação do grupo do seu clube (para humor da diretoria e Início). */
export function userGroupRows(g: GameState, d: DivisionState): TableRow[] | undefined {
  const tab = groupTables(g, d).find((t) => t.rows.some((r) => r.clubId === g.userClubId));
  return tab?.rows;
}
