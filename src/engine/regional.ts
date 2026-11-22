import { estadualClubsOf, ufOfClub } from '../data/estaduais_clubs';
import { COMP_NAMES } from '../data/names';
import { prize } from './economy';
import { estadualRanking } from './estadual';
import { clubOf, teamOf } from './lookup';
import { addScorers, clearGoals, drainGoals } from './scorers';
import { makeRng } from './rng';
import { buildFixtures } from './schedule';
import { teamRatings } from './squad';
import { isMine, playTie, playTieGroup, scaleDates, shuffle } from './continental';
import { computeTable } from './table';
import type { CupRound, CupTie, GameState, LibGroup, MatchResult, NewsItem, RegionalKey, RegionalState } from './types';

/* =====================================================================
   COPAS REGIONAIS (regras 2026): Copa do Nordeste, Copa Verde e Copa Sul-Sudeste, dentro da temporada (só nas carreiras do Brasil, com estaduais).
   - Copa do Nordeste: 20 clubes dos 9 estados, em 4 grupos de 5 (turno único, 4 jogos cada); os 2 primeiros de cada grupo vão às quartas de final, semifinal e final.
   - Copa Verde: 24 clubes em dois blocos de 12: Copa Norte e Copa Centro-Oeste (com o Espírito Santo). Cada bloco tem 2 grupos de 6 (turno único);
     os 4 primeiros de cada grupo vão às quartas; os campeões dos dois blocos decidem o título.
   - Copa Sul-Sudeste: 12 clubes, 2 por federação (ES, MG, PR, RJ, RS e SP), em 2 grupos de 6 que se enfrentam entre si (6 jogos cada);
     os 2 primeiros de cada grupo vão à semifinal e à final.
   Os campeões (e os dois campeões de bloco da Copa Verde) têm vaga na Copa do Brasil da temporada seguinte.
   "Melhores" = a classificação final do estadual da temporada passada (na primeira temporada, a força do clube).
   As vagas por estado são dados configuráveis por copa (RCfg.quota), pensados para mudar de uma temporada para outra.
   ===================================================================== */

interface RCfg {
  key: RegionalKey; icon: string;
  /** vagas por estado (configurável por temporada) */
  quota: Record<string, number>;
  /** Copa Verde: os clubes são sorteados em grupos dentro de cada bloco */
  blocs?: string[][];
  groups: number; groupSize: number; groupRounds: number;
  /** grupos que se enfrentam entre si (Copa Sul-Sudeste) */
  cross?: boolean;
  koNames: string[];
  /** depois de qual rodada do campeonato (pensadas para 38 rodadas) acontece cada etapa: grupos e depois mata-mata */
  dates: number[];
  win: number; draw: number; qualified: number; ko: number[]; runnerUp: number;
}
const K = 1_000, M = 1_000_000;
export const REGIONALS: Record<RegionalKey, RCfg> = {
  nordeste: {
    key: 'nordeste', icon: '🌵', quota: { BA: 3, CE: 3, PE: 3, MA: 2, PB: 2, RN: 2, SE: 2, AL: 2, PI: 1 },
    groups: 4, groupSize: 5, groupRounds: 5, koNames: ['Quartas de final', 'Semifinal', 'Final'],
    dates: [1, 4, 8, 12, 16, 22, 27, 33],
    win: 300 * K, draw: 100 * K, qualified: 1 * M, ko: [2.5 * M, 4 * M, 12 * M], runnerUp: 4 * M,
  },
  verde: {
    key: 'verde', icon: '🌳', quota: { PA: 2, AM: 2, AC: 2, AP: 1, RO: 2, RR: 1, TO: 2, GO: 3, DF: 3, MT: 2, MS: 2, ES: 2 },
    blocs: [['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'], ['DF', 'GO', 'MT', 'MS', 'ES']],
    groups: 4, groupSize: 6, groupRounds: 5, koNames: ['Quartas de final', 'Semifinal', 'Final do bloco (Copa Norte e Centro-Oeste)', 'Final da Copa Verde'],
    dates: [2, 5, 9, 13, 17, 21, 25, 29, 34],
    win: 150 * K, draw: 50 * K, qualified: 700 * K, ko: [1.2 * M, 2 * M, 3 * M, 8 * M], runnerUp: 2.5 * M,
  },
  sulsudeste: {
    key: 'sulsudeste', icon: '🌲', quota: { ES: 2, MG: 2, PR: 2, RJ: 2, RS: 2, SP: 2 },
    groups: 2, groupSize: 6, groupRounds: 6, cross: true, koNames: ['Semifinal', 'Final'],
    dates: [3, 6, 10, 14, 18, 22, 28, 32],
    win: 250 * K, draw: 80 * K, qualified: 1 * M, ko: [3 * M, 6 * M], runnerUp: 2 * M,
  },
};
export const REGIONAL_KEYS: RegionalKey[] = ['nordeste', 'verde', 'sulsudeste'];
export const REGIONAL_GROUP_ROUNDS = 5;
export const regionalName = (k: RegionalKey) => COMP_NAMES[k];

/** Os melhores clubes do estado: pela classificação final do estadual anterior (Série A do estado); sem ela, pela força do clube. */
function bestOfState(g: GameState, prev: GameState | undefined, uf: string, n: number): string[] {
  const comp = prev?.estadual?.comps.find((c) => c.uf === uf);
  const ranked: string[] = comp && prev?.estadual?.done ? estadualRanking(prev, comp.divisions[0]) : [];
  const strength = (id: string) => teamRatings(teamOf(g, id)).overall;
  const byRating = [...estadualClubsOf(uf)].map((c) => c.id).sort((a, b) => strength(b) - strength(a));
  return [...ranked, ...byRating].filter((id, i, a) => a.indexOf(id) === i).slice(0, n);
}

/** Participantes de cada copa. O Espírito Santo manda os 2 melhores à Copa Sul-Sudeste e os 2 seguintes à Copa Verde (ninguém repete). */
function entrantsOf(g: GameState, prev: GameState | undefined, cfg: RCfg): string[] {
  return Object.entries(cfg.quota).flatMap(([uf, n]) => {
    if (uf === 'ES') { const four = bestOfState(g, prev, 'ES', 4); return cfg.key === 'sulsudeste' ? four.slice(0, n) : four.slice(2, 2 + n); }
    return bestOfState(g, prev, uf, n);
  });
}

/** Sorteio por potes de força (um clube de cada pote em cada grupo), sem dois do mesmo estado no mesmo grupo quando dá. */
function drawGroups(ids: string[], nGroups: number, rng: ReturnType<typeof makeRng>, ovr: (id: string) => number): string[][] {
  const sorted = [...ids].sort((a, b) => ovr(b) - ovr(a));
  const per = Math.ceil(sorted.length / nGroups);
  const draw = (): string[][] => {
    const out: string[][] = Array.from({ length: nGroups }, () => []);
    for (let pot = 0; pot < per; pot++) {
      const pool = shuffle(rng, sorted.slice(pot * nGroups, pot * nGroups + nGroups));
      for (const gi of shuffle(rng, Array.from({ length: nGroups }, (_, i) => i))) {
        if (!pool.length) break;
        const k = Math.max(0, pool.findIndex((id) => !out[gi].some((o) => ufOfClub(o) === ufOfClub(id))));
        out[gi].push(pool.splice(k, 1)[0]);
      }
    }
    return out;
  };
  const clashes = (gs: string[][]) => gs.reduce((n, gr) => n + gr.length - new Set(gr.map((id) => ufOfClub(id))).size, 0);
  let best = draw();
  for (let tries = 0; tries < 300 && clashes(best) > 0; tries++) { const t = draw(); if (clashes(t) < clashes(best)) best = t; }
  return best;
}

/** Monta as copas regionais da temporada (`prev` = estado com o estadual da temporada que acabou, se houver). */
export function createRegionals(g: GameState, prev?: GameState): GameState {
  if (!g.estadual || g.leagueName !== undefined) return { ...g, regionais: undefined };
  const regionais: NonNullable<GameState['regionais']> = {};
  const ovr = (id: string) => teamRatings(teamOf(g, id)).overall;
  for (const key of REGIONAL_KEYS) {
    const cfg = REGIONALS[key];
    const ids = entrantsOf(g, prev, cfg);
    if (ids.length < cfg.groups * 2) continue;
    const rng = makeRng(g.seed * 83 + g.season * 31 + (key === 'nordeste' ? 11 : key === 'verde' ? 17 : 23));
    let groupsIds: string[][];
    if (cfg.blocs) { // Copa Verde: cada bloco (Norte; Centro-Oeste + ES) tem os seus 2 grupos
      groupsIds = cfg.blocs.flatMap((states) => drawGroups(ids.filter((id) => states.includes(ufOfClub(id) ?? '')), cfg.groups / cfg.blocs!.length, rng, ovr));
    } else groupsIds = drawGroups(ids, cfg.groups, rng, ovr);
    const prefix = key === 'nordeste' ? 'NE' : key === 'verde' ? 'CV' : 'SS';
    const groups: LibGroup[] = groupsIds.map((clubIds, i) => {
      const gid = `${prefix}${'ABCDEF'[i]}`;
      if (cfg.cross) { // cada clube enfrenta os 6 do outro grupo, uma vez: todos os jogos ficam na lista do 1º grupo
        const other = groupsIds[1 - i];
        const matches = i === 0 ? clubIds.flatMap((h, hi) => other.map((_, r) => ({ round: r + 1, homeId: (hi + r) % 2 === 0 ? h : other[(hi + r) % other.length], awayId: (hi + r) % 2 === 0 ? other[(hi + r) % other.length] : h }))) : [];
        return { id: gid, clubIds, matches };
      }
      return { id: gid, clubIds, matches: buildFixtures(clubIds, gid).fixtures.filter((f) => f.round <= cfg.groupRounds).map((f) => ({ round: f.round, homeId: f.homeId, awayId: f.awayId })) };
    });
    const dueAfter = scaleDates(cfg.dates, g.totalRounds);
    regionais[key] = { id: key, name: COMP_NAMES[key], groups, ko: [], step: 0, groupRounds: cfg.groupRounds, dueAfter, due: false, alive: groupsIds.flat(), entrants: groupsIds.flat() };
  }
  return { ...g, regionais: Object.keys(regionais).length ? regionais : undefined };
}

/** Classificação de um grupo. Nas copas em que os grupos se enfrentam (Sul-Sudeste), os jogos estão em outro grupo: a tabela considera todos os jogos da copa. */
export function regionalGroupTable(g: GameState, r: RegionalState, gi: number) {
  const gr = r.groups[gi];
  const done = r.groups.flatMap((x) => x.matches).filter((m) => m.homeGoals !== undefined && (gr.clubIds.includes(m.homeId) || gr.clubIds.includes(m.awayId)))
    .map((m) => ({ divisionId: gr.id, round: m.round, homeId: m.homeId, awayId: m.awayId, homeGoals: m.homeGoals!, awayGoals: m.awayGoals!, events: [] as never[] }));
  const clubs = [...new Set(done.flatMap((m) => [m.homeId, m.awayId]).concat(gr.clubIds))];
  return computeTable(clubs.map((id) => ({ id, name: clubOf(g, id).name })), done as MatchResult[]).filter((row) => gr.clubIds.includes(row.clubId));
}

const userIn = (g: GameState, key: RegionalKey) => { const r = g.regionais?.[key]; return !g.unemployed && !!r && r.alive.includes(g.userClubId) && !r.championId; };
export const regionalUserIn = userIn;
export const regionalMatchDue = (g: GameState, key: RegionalKey) => !!g.regionais?.[key]?.due && userIn(g, key);
export const regionalDueAny = (g: GameState) => REGIONAL_KEYS.some((k) => g.regionais?.[k]?.due);
export function regionalUserMatch(g: GameState, key: RegionalKey): { homeId: string; awayId: string } | undefined {
  const r = g.regionais?.[key];
  if (!r?.due) return undefined;
  if (r.step < r.groupRounds) return r.groups.flatMap((gr) => gr.matches).find((m) => m.round === r.step + 1 && isMine(g)(m));
  return r.ko[r.step - r.groupRounds]?.ties.find(isMine(g));
}
export const regionalStepName = (key: RegionalKey, r: RegionalState) => (r.step < r.groupRounds ? `Grupos · rodada ${r.step + 1}` : REGIONALS[key].koNames[Math.min(r.step - r.groupRounds, REGIONALS[key].koNames.length - 1)]);

/** Depois de uma rodada do campeonato: abre a etapa se for a data; se o seu clube não joga, é simulada na hora. */
export function regionalAfterLeagueRound(g: GameState): GameState {
  let s = g;
  for (const key of REGIONAL_KEYS) {
    const r = s.regionais?.[key];
    if (!r || r.due || r.championId || r.step >= r.groupRounds + REGIONALS[key].koNames.length || s.round - 1 !== r.dueAfter[r.step]) continue;
    s = { ...s, regionais: { ...s.regionais, [key]: { ...r, due: true } } };
    if (!userIn(s, key)) s = playRegionalStep(s, key).state;
  }
  return s;
}

/** Joga a etapa pendente (rodada de grupos ou fase do mata-mata). */
export function playRegionalStep(g: GameState, key: RegionalKey): { state: GameState; results: MatchResult[] } {
  const cfg = REGIONALS[key];
  const r = g.regionais?.[key];
  if (!r || !r.due) return { state: g, results: [] };
  const step = r.step;
  clearGoals();
  const rng = makeRng(g.seed * 4421 + g.season * 59 + step * 13 + (key === 'nordeste' ? 3 : 8));
  const results: MatchResult[] = [];
  const news: NewsItem[] = [];
  const budgets = { ...g.budgets };
  const pay = (id: string, v: number) => { if (id in budgets) budgets[id] += prize(g, v); };
  const say = (text: string, tone: NewsItem['tone']) => news.push({ season: g.season, round: g.round, text, tone });
  const label = `${cfg.icon} ${r.name}`;
  let next: RegionalState;
  if (step < r.groupRounds) {
    const groups = r.groups.map((gr) => ({
      ...gr,
      matches: gr.matches.map((m) => {
        if (m.round !== step + 1) return m;
        const t = playTieGroup(g, rng, m, key, step + 1, results);
        if (t.homeGoals === t.awayGoals) { pay(m.homeId, cfg.draw); pay(m.awayId, cfg.draw); }
        else pay(t.homeGoals! > t.awayGoals! ? m.homeId : m.awayId, cfg.win);
        return { ...m, homeGoals: t.homeGoals, awayGoals: t.awayGoals };
      }),
    }));
    next = { ...r, groups, step: step + 1, due: false };
    if (step === r.groupRounds - 1) {
      const tabs = groups.map((_, gi) => regionalGroupTable(g, { ...next, groups } as RegionalState, gi).map((row) => row.clubId));
      let ties: CupTie[]; let alive: string[];
      const mk = (a: string, b: string): CupTie => ({ homeId: b, awayId: a }); // o melhor colocado joga em casa depois; a ida é do pior (campo do menos cotado)
      if (key === 'nordeste') { // 4 grupos de 5: os 2 primeiros; 1º de um grupo contra o 2º do grupo vizinho (os melhores só se cruzam nas fases finais)
        const t = tabs;
        ties = [mk(t[0][0], t[1][1]), mk(t[2][0], t[3][1]), mk(t[1][0], t[0][1]), mk(t[3][0], t[2][1])];
        alive = tabs.flatMap((x) => x.slice(0, 2));
      } else if (key === 'verde') { // cada bloco: 4 primeiros dos seus 2 grupos (1ºA x 4ºB, 2ºA x 3ºB, 1ºB x 4ºA, 2ºB x 3ºA)
        ties = [];
        for (const [a, b] of [[0, 1], [2, 3]]) ties.push(mk(tabs[a][0], tabs[b][3]), mk(tabs[a][1], tabs[b][2]), mk(tabs[b][0], tabs[a][3]), mk(tabs[b][1], tabs[a][2]));
        alive = tabs.flatMap((x) => x.slice(0, 4));
      } else { // Sul-Sudeste: 2 primeiros de cada grupo
        ties = [mk(tabs[0][0], tabs[1][1]), mk(tabs[1][0], tabs[0][1])];
        alive = tabs.flatMap((x) => x.slice(0, 2));
      }
      for (const id of alive) pay(id, cfg.qualified);
      next = { ...next, ko: [{ name: cfg.koNames[0], ties }], alive };
      if (r.alive.includes(g.userClubId)) say(alive.includes(g.userClubId) ? `${label}: seu clube avançou para as ${cfg.koNames[0].toLowerCase()}!` : `${label}: seu clube foi eliminado na fase de grupos.`, alive.includes(g.userClubId) ? 'good' : 'bad');
    }
  } else {
    const k = step - r.groupRounds;
    const round = r.ko[k];
    const ties: CupTie[] = round.ties.map((t) => {
      const res = playTie(g, rng, t, key, step + 1, results);
      const loser = res.winnerId === t.homeId ? t.awayId : t.homeId;
      pay(res.winnerId!, cfg.ko[k]);
      if (k === cfg.ko.length - 1) pay(loser, cfg.runnerUp);
      if (isMine(g)(t)) {
        const rival = clubOf(g, res.winnerId === g.userClubId ? loser : res.winnerId!).name;
        if (res.winnerId !== g.userClubId) say(`${label}: eliminado pelo ${rival} (${round.name}).`, 'bad');
        else say(k === cfg.ko.length - 1 ? `🏆 CAMPEÃO DA ${r.name.toUpperCase()}!` : `${label}: você eliminou o ${rival} (${round.name}).`, 'good');
      }
      return res;
    });
    const winners = ties.map((t) => t.winnerId!);
    const ko: CupRound[] = [...r.ko.slice(0, k), { ...round, ties }];
    if (winners.length > 1) ko.push({ name: cfg.koNames[k + 1], ties: winners.reduce<CupTie[]>((acc, w, i) => (i % 2 ? acc : [...acc, { homeId: w, awayId: winners[i + 1] }]), []) });
    next = { ...r, ko, step: step + 1, due: false, alive: winners, championId: winners.length === 1 ? winners[0] : undefined, ...(key === 'verde' && k === 2 ? { blocChampions: winners } : {}) };
  }
  return { state: { ...g, budgets, regionais: { ...g.regionais, [key]: next }, scorers: addScorers(g, drainGoals()), news: [...news, ...g.news].slice(0, 80) }, results };
}
