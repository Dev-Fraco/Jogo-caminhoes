import { buildFixtures } from './schedule';
import { computeTable } from './table';
import { groupTables } from './groups';
import type { DivisionState, Fixture, GameState, MatchResult, TableRow } from './types';

/* =====================================================================
   Fases do Campeonato Brasileiro (regras 2026): playoffs de acesso da Série B, Série C em duas fases com quadrangulares e final,
   e mata-mata de ida e volta da Série D. Tudo pelo mesmo mecanismo: confrontos de ida e volta (`tie`/`leg`), criados depois de cada rodada.
   ===================================================================== */

export const SERIE_B = 'serie-b', SERIE_C = 'serie-c', SERIE_D = 'serie-d';
export type Kind = 'B' | 'C' | 'D';
export const kindOf = (d: Pick<DivisionState, 'id'> | undefined): Kind | undefined => (d?.id === SERIE_B ? 'B' : d?.id === SERIE_C ? 'C' : d?.id === SERIE_D ? 'D' : undefined);

/** Rodadas do campeonato de pontos corridos (Séries A e B). */
export const LEAGUE_ROUNDS = 38;

/** Regras que mudam de uma temporada para outra (configuráveis): quantos caem da Série C, quantos sobem da D, quantos avançam na C. */
export interface SeasonRules { cRelegated: number; dPromoted: number; cQualified: number }
export const rulesFor = (season: number): SeasonRules => ({ cRelegated: season >= 2028 ? 6 : 2, dPromoted: 6, cQualified: 8 });

/** Quantos clubes sobem da D e quantos descem da D para os estaduais, dado quantos clubes de estadual sobem (mantém a Série D com 96). */
export function serieDFlow(season: number, quals: number): { promoted: number; relegated: number } {
  const r = rulesFor(season);
  const need = r.dPromoted - r.cRelegated; // a D perde 6 e recebe os que caem da C
  if (quals >= need) return { promoted: r.dPromoted, relegated: quals - need };
  return { promoted: r.cRelegated + quals, relegated: 0 };
}

/* ---------- confrontos de ida e volta ---------- */

const tieFx = (div: string, round: number, tie: string, phase: string, leg: 1 | 2, home: string, away: string): Fixture => ({ divisionId: div, round, homeId: home, awayId: away, ko: true, tie, leg, phase });
/** a = cabeça de chave (joga a volta em casa); b joga a ida em casa. */
const twoLegs = (div: string, round: number, tie: string, phase: string, a: string, b: string): Fixture[] => [tieFx(div, round, tie, phase, 1, b, a), tieFx(div, round + 1, tie, phase, 2, a, b)];

export interface TieOutcome { tie: string; phase: string; aId: string; bId: string; legs: MatchResult[]; aGoals: number; bGoals: number; winnerId?: string; done: boolean }

/** Resultado de um confronto: gols somados, pênaltis (se empatar no agregado) e quem avançou. */
export function tieOutcome(g: Pick<GameState, 'fixtures' | 'results'>, divisionId: string, tie: string): TieOutcome | undefined {
  const fx = g.fixtures.filter((f) => f.divisionId === divisionId && f.tie === tie).sort((x, y) => (x.leg ?? 1) - (y.leg ?? 1));
  if (!fx.length) return undefined;
  const volta = fx[fx.length - 1];
  const aId = volta.homeId, bId = volta.awayId;
  const legs = fx.map((f) => g.results.find((r) => r.divisionId === divisionId && r.tie === tie && r.leg === f.leg)).filter((r): r is MatchResult => !!r);
  let aGoals = 0, bGoals = 0;
  for (const r of legs) { if (r.homeId === aId) { aGoals += r.homeGoals; bGoals += r.awayGoals; } else { bGoals += r.homeGoals; aGoals += r.awayGoals; } }
  const done = legs.length === fx.length;
  let winnerId: string | undefined;
  if (done) {
    if (aGoals !== bGoals) winnerId = aGoals > bGoals ? aId : bId;
    else { const last = legs[legs.length - 1]; const p = last.pens; winnerId = p ? (p[0] > p[1] ? last.homeId : last.awayId) : aId; }
  }
  return { tie, phase: volta.phase ?? '', aId, bId, legs, aGoals, bGoals, winnerId, done };
}
const loserOf = (t: TieOutcome) => (t.winnerId === t.aId ? t.bId : t.aId);

/* ---------- tabelas ---------- */

const leagueResults = (g: GameState, d: DivisionState, maxRound: number) => g.results.filter((r) => r.divisionId === d.id && !r.tie && r.round <= maxRound);
const tableOf = (g: GameState, _d: DivisionState, ids: string[], res: MatchResult[]) => computeTable(ids.map((id) => ({ id, name: g.clubs[id].name })), res);

/** Tabela de pontos corridos (Série B: 38 rodadas; Série C: 1ª fase, turno único). */
export function leagueTable(g: GameState, d: DivisionState): TableRow[] {
  const max = kindOf(d) === 'C' ? d.clubIds.length - 1 : kindOf(d) === 'B' ? LEAGUE_ROUNDS : Number.MAX_SAFE_INTEGER;
  return tableOf(g, d, d.clubIds, leagueResults(g, d, max));
}
const fill = (picked: string[], order: string[], n: number) => [...picked, ...order.filter((id) => !picked.includes(id))].slice(0, n);

/* ---------- Série B: playoffs de acesso ---------- */

export interface Standing { table: TableRow[]; promoted: string[]; championId: string }

export function serieBStanding(g: GameState, d: DivisionState): Standing {
  const t = leagueTable(g, d);
  const order = t.map((r) => r.clubId);
  const po = ['B-PO-0', 'B-PO-1'].map((id) => tieOutcome(g, d.id, id)).filter((x): x is TieOutcome => !!x);
  const winners = po.filter((x) => x.winnerId).map((x) => x.winnerId!);
  // 1º e 2º sobem direto; os vencedores dos playoffs (3º x 6º e 4º x 5º) pegam as outras duas vagas; se ainda não terminou, vale a tabela
  const promoted = fill([...order.slice(0, 2), ...winners], order, 4);
  return { table: t, promoted, championId: order[0] };
}

/* ---------- Série C: 1ª fase + quadrangulares + final ---------- */

const cRounds = (d: DivisionState) => ({ first: d.clubIds.length - 1, quadFrom: d.clubIds.length, quadTo: d.clubIds.length + 5, finalAt: d.clubIds.length + 6 });
export const serieCFixtures = (d: DivisionState): Fixture[] => { const f = buildFixtures(d.clubIds, d.id); const half = f.totalRounds / 2; return f.fixtures.filter((x) => x.round <= half); };
/** Rodadas que a Série C usa (1ª fase + 6 dos quadrangulares + 2 da final). */
export const serieCTotalRounds = (d: DivisionState) => d.clubIds.length - 1 + 6 + 2;

/** Os dois quadrangulares: 1º, 4º, 5º e 8º da 1ª fase; 2º, 3º, 6º e 7º. */
export function serieCGroups(g: GameState, d: DivisionState): string[][] | undefined {
  const r = cRounds(d);
  const played = g.results.filter((x) => x.divisionId === d.id && !x.tie && x.round <= r.first).length;
  if (played < (d.clubIds.length / 2) * r.first) return undefined; // 1ª fase ainda não terminou
  const t = leagueTable(g, d).map((x) => x.clubId);
  return [[t[0], t[3], t[4], t[7]], [t[1], t[2], t[5], t[6]]];
}
export function serieCGroupTables(g: GameState, d: DivisionState): { name: string; rows: TableRow[] }[] {
  const grp = serieCGroups(g, d);
  if (!grp) return [];
  const r = cRounds(d);
  return grp.map((ids, i) => ({ name: `Quadrangular ${i + 1}`, rows: tableOf(g, d, ids, g.results.filter((x) => x.divisionId === d.id && !x.tie && x.round >= r.quadFrom && x.round <= r.quadTo && ids.includes(x.homeId) && ids.includes(x.awayId))) }));
}

export function serieCStanding(g: GameState, d: DivisionState): Standing {
  const t1 = leagueTable(g, d), order1 = t1.map((r) => r.clubId);
  const grp = serieCGroups(g, d);
  const need = rulesFor(g.season).cQualified;
  if (!grp) return { table: t1, promoted: order1.slice(0, 4), championId: order1[0] };
  const quads = serieCGroupTables(g, d);
  const quadDone = quads.every((q) => q.rows.every((r) => r.played === 6));
  const lead = quads.map((q) => q.rows[0].clubId), second = quads.map((q) => q.rows[1].clubId), third = quads.map((q) => q.rows[2].clubId), fourth = quads.map((q) => q.rows[3].clubId);
  const fin = tieOutcome(g, d.id, 'C-F');
  let top: string[] = [...lead];
  if (fin?.winnerId) top = [fin.winnerId, loserOf(fin)];
  else if (quadDone) top = [...lead].sort((a, b) => order1.indexOf(a) - order1.indexOf(b));
  const ranked = [...top, ...second, ...third, ...fourth, ...order1].filter((id, i, a) => a.indexOf(id) === i);
  const rowOf = new Map(t1.map((r) => [r.clubId, r]));
  void need;
  return { table: ranked.map((id) => rowOf.get(id)!), promoted: fill(quadDone ? [...lead, ...second] : [], ranked, 4), championId: ranked[0] };
}

/* ---------- Série D: grupos, mata-mata de ida e volta e playoffs de acesso ---------- */

export const D_GROUP_ROUNDS = 10;
const D_STEPS = [
  { key: 'P1', name: '1ª fase (64 clubes)', at: 11 }, { key: 'P2', name: '2ª fase (32 clubes)', at: 13 }, { key: 'R16', name: 'Oitavas de final', at: 15 },
  { key: 'QF', name: 'Quartas de final', at: 17 }, { key: 'SF', name: 'Semifinal', at: 19 }, { key: 'PO', name: 'Playoff de acesso', at: 19 }, { key: 'F', name: 'Final', at: 21 },
];
export const D_LAST_ROUND = 22;
const dName = (key: string) => D_STEPS.find((s) => s.key === key)!.name;
const dTies = (g: GameState, d: DivisionState, key: string): TieOutcome[] => g.fixtures.filter((f) => f.divisionId === d.id && f.tie?.startsWith(`D-${key}-`) && f.leg === 1).map((f) => tieOutcome(g, d.id, f.tie!)!).sort((x, y) => Number(x.tie.split('-')[2]) - Number(y.tie.split('-')[2]));

export function serieDStanding(g: GameState, d: DivisionState): Standing {
  const grp = groupTables(g, d);
  const all = computeTable(d.clubIds.map((id) => ({ id, name: g.clubs[id].name })), g.results.filter((r) => r.divisionId === d.id && !r.tie && r.round <= D_GROUP_ROUNDS));
  const stage = new Map<string, number>();
  const reach = (id: string, s: number) => stage.set(id, Math.max(stage.get(id) ?? 0, s));
  const level: Record<string, number> = { P1: 1, P2: 2, R16: 3, QF: 4, PO: 4, SF: 6, F: 7 };
  for (const key of ['P1', 'P2', 'R16', 'QF', 'PO', 'SF', 'F']) for (const t of dTies(g, d, key)) {
    reach(t.aId, level[key]); reach(t.bId, level[key]);
    if (t.winnerId) {
      if (key === 'PO') reach(t.winnerId, 5);
      if (key === 'F') reach(t.winnerId, 8);
    }
  }
  const byGroup = new Map<string, number>(all.map((r, i) => [r.clubId, all.length - i]));
  const ranked = [...all].sort((x, y) => (stage.get(y.clubId) ?? 0) - (stage.get(x.clubId) ?? 0) || (byGroup.get(y.clubId) ?? 0) - (byGroup.get(x.clubId) ?? 0));
  const order = ranked.map((r) => r.clubId);
  const qf = dTies(g, d, 'QF').filter((t) => t.winnerId).map((t) => t.winnerId!);
  const po = dTies(g, d, 'PO').filter((t) => t.winnerId).map((t) => t.winnerId!);
  void grp;
  const promoted = fill([...qf, ...po], order, rulesFor(g.season).dPromoted);
  return { table: ranked, promoted, championId: order[0] };
}

/* ---------- avanço das fases (depois de cada rodada) ---------- */

/** Chamada depois de cada rodada: cria os confrontos da fase seguinte quando a anterior termina. */
export function advancePhases(g: GameState): GameState {
  const played = g.round - 1;
  const add: Fixture[] = [];
  for (const d of g.divisions) {
    const kind = kindOf(d);
    if (kind === 'B' && played === LEAGUE_ROUNDS && !g.fixtures.some((f) => f.divisionId === d.id && f.tie)) {
      const o = leagueTable(g, d).map((r) => r.clubId);
      add.push(...twoLegs(d.id, LEAGUE_ROUNDS + 1, 'B-PO-0', 'Playoff de acesso', o[2], o[5]), ...twoLegs(d.id, LEAGUE_ROUNDS + 1, 'B-PO-1', 'Playoff de acesso', o[3], o[4]));
    } else if (kind === 'C') {
      const r = cRounds(d);
      if (played === r.first && !g.fixtures.some((f) => f.divisionId === d.id && f.round === r.quadFrom)) {
        const grp = serieCGroups(g, d);
        if (grp) for (const ids of grp) for (const f of buildFixtures(ids, d.id).fixtures) add.push({ ...f, round: f.round + r.first });
      } else if (played === r.quadTo && !g.fixtures.some((f) => f.divisionId === d.id && f.tie === 'C-F')) {
        const q = serieCGroupTables(g, d);
        if (q.length === 2) {
          const order1 = leagueTable(g, d).map((x) => x.clubId);
          const [l1, l2] = q.map((x) => x.rows[0].clubId).sort((a, b) => order1.indexOf(a) - order1.indexOf(b));
          add.push(...twoLegs(d.id, r.finalAt, 'C-F', 'Final', l1, l2));
        }
      }
    } else if (kind === 'D' && d.groups) {
      const mk = (key: string, pairs: [string, string][]) => { const at = D_STEPS.find((s) => s.key === key)!.at; pairs.forEach(([a, b], i) => add.push(...twoLegs(d.id, at, `D-${key}-${i}`, dName(key), a, b))); };
      const winnersOf = (key: string) => dTies(g, d, key).map((t) => t.winnerId!);
      const pairUp = (w: string[]): [string, string][] => { const p: [string, string][] = []; for (let i = 0; i + 1 < w.length; i += 2) p.push([w[i], w[i + 1]]); return p; };
      if (played === D_GROUP_ROUNDS && !dTies(g, d, 'P1').length) {
        const tabs = groupTables(g, d).map((t) => t.rows.map((r) => r.clubId));
        const pairs: [string, string][] = [];
        tabs.forEach((rows, i) => { const o = tabs[i ^ 1]; pairs.push([rows[0], o[3]], [rows[1], o[2]]); }); // 1º x 4º e 2º x 3º do grupo vizinho
        mk('P1', pairs);
      } else if (played === 12 && !dTies(g, d, 'P2').length) mk('P2', pairUp(winnersOf('P1')));
      else if (played === 14 && !dTies(g, d, 'R16').length) mk('R16', pairUp(winnersOf('P2')));
      else if (played === 16 && !dTies(g, d, 'QF').length) mk('QF', pairUp(winnersOf('R16')));
      else if (played === 18 && !dTies(g, d, 'SF').length) {
        const qf = dTies(g, d, 'QF');
        mk('SF', pairUp(qf.map((t) => t.winnerId!)));
        mk('PO', pairUp(qf.map((t) => loserOf(t))));
      } else if (played === 20 && !dTies(g, d, 'F').length) mk('F', pairUp(winnersOf('SF')));
    }
  }
  return add.length ? { ...g, fixtures: [...g.fixtures, ...add] } : g;
}

/* ---------- para as telas ---------- */

export interface PhaseView { name: string; ties: TieOutcome[] }
/** Confrontos de ida e volta da divisão, por fase (Série B: playoffs; Série C: final; Série D: mata-mata). */
export function phaseViews(g: GameState, d: DivisionState): PhaseView[] {
  const kind = kindOf(d);
  const out: PhaseView[] = [];
  const add = (name: string, ties: TieOutcome[]) => { if (ties.length) out.push({ name, ties }); };
  if (kind === 'B') add('Playoffs de acesso', ['B-PO-0', 'B-PO-1'].map((t) => tieOutcome(g, d.id, t)).filter((x): x is TieOutcome => !!x));
  else if (kind === 'C') { const f = tieOutcome(g, d.id, 'C-F'); if (f) add('Final', [f]); }
  else if (kind === 'D') for (const key of ['P1', 'P2', 'R16', 'QF', 'PO', 'SF', 'F']) add(dName(key), dTies(g, d, key));
  return out;
}
export { D_STEPS };
