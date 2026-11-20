import { estadualClubsOf, ufOfClub } from '../data/estaduais_clubs';
import { COMP_NAMES } from '../data/names';
import { prize } from './economy';
import { estadualRanking } from './estadual';
import { clubOf, teamOf } from './lookup';
import { addScorers, clearGoals, drainGoals } from './scorers';
import { makeRng } from './rng';
import { buildFixtures } from './schedule';
import { teamRatings } from './squad';
import { groupTable, isMine, playTie, playTieGroup, scaleDates, shuffle } from './continental';
import type { CupRound, CupTie, GameState, LibGroup, MatchResult, NewsItem, RegionalKey, RegionalState } from './types';

/* =====================================================================
   COPA DO NORDESTE e COPA VERDE: copas regionais dentro da temporada (só nas carreiras do Brasil, com estaduais).
   - Copa do Nordeste: os 4 melhores de cada estado (AL, BA, CE, MA, PB, PE, PI, RN e SE) = 36 clubes. 6 grupos de 6 (5 rodadas, turno único);
     passam os 2 primeiros de cada grupo e os 4 melhores terceiros: oitavas, quartas, semifinal e final.
   - Copa Verde: os 2 melhores de cada estado do Norte, Centro-Oeste e do Espírito Santo (AC, AP, AM, PA, RO, RR, TO, DF, GO, MT, MS, ES) = 24 clubes.
     4 grupos de 6 (5 rodadas); passam os 2 primeiros de cada grupo: quartas, semifinal e final.
   "Melhores" = a classificação final do estadual da temporada passada (na primeira temporada, a força do clube).
   ===================================================================== */

interface RCfg {
  key: RegionalKey; icon: string;
  states: string[]; perState: number;
  groups: number; qualifiedThirds: number; koNames: string[];
  /** datas em rodadas do campeonato (pensadas para 38 rodadas): grupos e depois mata-mata */
  dates: number[];
  win: number; draw: number; qualified: number; ko: number[]; runnerUp: number;
}
const K = 1_000, M = 1_000_000;
export const REGIONALS: Record<RegionalKey, RCfg> = {
  nordeste: {
    key: 'nordeste', icon: '🌵', states: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'], perState: 4,
    groups: 6, qualifiedThirds: 4, koNames: ['Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'],
    dates: [1, 3, 8, 13, 18, 22, 26, 30, 34],
    win: 300 * K, draw: 100 * K, qualified: 1 * M, ko: [1.5 * M, 2.5 * M, 4 * M, 12 * M], runnerUp: 4 * M,
  },
  verde: {
    key: 'verde', icon: '🌳', states: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO', 'DF', 'GO', 'MT', 'MS', 'ES'], perState: 2,
    groups: 4, qualifiedThirds: 0, koNames: ['Quartas de final', 'Semifinal', 'Final'],
    dates: [2, 6, 10, 15, 19, 24, 28, 32],
    win: 150 * K, draw: 50 * K, qualified: 700 * K, ko: [1.2 * M, 2 * M, 8 * M], runnerUp: 2.5 * M,
  },
};
export const REGIONAL_KEYS: RegionalKey[] = ['nordeste', 'verde'];
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

/** Monta a Copa do Nordeste e a Copa Verde da temporada (`prev` = estado com o estadual da temporada que acabou, se houver). */
export function createRegionals(g: GameState, prev?: GameState): GameState {
  if (!g.estadual || g.leagueName !== undefined) return { ...g, regionais: undefined };
  const regionais: NonNullable<GameState['regionais']> = {};
  for (const key of REGIONAL_KEYS) {
    const cfg = REGIONALS[key];
    const ids = cfg.states.flatMap((uf) => bestOfState(g, prev, uf, cfg.perState));
    if (ids.length < cfg.groups * 2) continue;
    const ovr = (id: string) => teamRatings(teamOf(g, id)).overall;
    const sorted = [...ids].sort((a, b) => ovr(b) - ovr(a));
    const per = Math.floor(ids.length / cfg.groups);
    const rng = makeRng(g.seed * 83 + g.season * 31 + (key === 'nordeste' ? 11 : 17));
    // sorteio por potes (um clube de cada pote em cada grupo), refeito até nenhum grupo ter dois clubes do mesmo estado (quando dá)
    const draw = (): string[][] => {
      const out: string[][] = Array.from({ length: cfg.groups }, () => []);
      for (let pot = 0; pot < per; pot++) {
        const pool = shuffle(rng, sorted.slice(pot * cfg.groups, pot * cfg.groups + cfg.groups));
        for (const gi of shuffle(rng, Array.from({ length: cfg.groups }, (_, i) => i))) {
          if (!pool.length) break;
          const k = Math.max(0, pool.findIndex((id) => !out[gi].some((o) => ufOfClub(o) === ufOfClub(id))));
          out[gi].push(pool.splice(k, 1)[0]);
        }
      }
      return out;
    };
    const clashes = (gs: string[][]) => gs.reduce((n, gr) => n + gr.length - new Set(gr.map((id) => ufOfClub(id))).size, 0);
    let groupsIds = draw();
    for (let tries = 0; tries < 300 && clashes(groupsIds) > 0; tries++) { const t = draw(); if (clashes(t) < clashes(groupsIds)) groupsIds = t; }
    const groups: LibGroup[] = groupsIds.map((clubIds, i) => {
      const gid = `${key === 'nordeste' ? 'NE' : 'CV'}${'ABCDEF'[i]}`;
      return { id: gid, clubIds, matches: buildFixtures(clubIds, gid).fixtures.filter((f) => f.round <= REGIONAL_GROUP_ROUNDS).map((f) => ({ round: f.round, homeId: f.homeId, awayId: f.awayId })) };
    });
    const dueAfter = scaleDates(cfg.dates, g.totalRounds);
    regionais[key] = { id: key, name: COMP_NAMES[key], groups, ko: [], step: 0, groupRounds: REGIONAL_GROUP_ROUNDS, dueAfter, due: false, alive: groupsIds.flat(), entrants: groupsIds.flat() };
  }
  return { ...g, regionais: Object.keys(regionais).length ? regionais : undefined };
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
      const tabs = groups.map((gr) => groupTable({ ...g, regionais: { ...g.regionais, [key]: next } } as GameState, gr as LibGroup));
      let ties: CupTie[]; let alive: string[];
      if (cfg.qualifiedThirds > 0) { // Copa do Nordeste: 12 primeiros e segundos + 4 melhores terceiros, em chave por campanha
        const top = tabs.flatMap((t, gi) => t.slice(0, 2).map((row, pos) => ({ row, pos, gi })));
        const thirds = tabs.map((t, gi) => ({ row: t[2], pos: 2, gi })).filter((x) => x.row).sort((a, b) => b.row.points - a.row.points || b.row.gd - a.row.gd || b.row.gf - a.row.gf).slice(0, cfg.qualifiedThirds);
        const seeds = [...top, ...thirds].sort((a, b) => a.pos - b.pos || b.row.points - a.row.points || b.row.gd - a.row.gd || b.row.gf - a.row.gf).map((x) => x.row.clubId);
        alive = seeds;
        const n = seeds.length;
        const order = [0, 7, 3, 4, 1, 6, 2, 5]; // chave: os melhores só se cruzam nas fases finais
        ties = order.filter((i) => i < n / 2).map((i) => ({ homeId: seeds[i], awayId: seeds[n - 1 - i] }));
      } else { // Copa Verde: 1º de um grupo contra o 2º do grupo vizinho
        const firsts = tabs.map((t) => t[0].clubId), seconds = tabs.map((t) => t[1].clubId);
        ties = firsts.map((f, i) => ({ homeId: f, awayId: seconds[i ^ 1] }));
        alive = [...firsts, ...seconds];
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
    next = { ...r, ko, step: step + 1, due: false, alive: winners, championId: winners.length === 1 ? winners[0] : undefined };
  }
  return { state: { ...g, budgets, regionais: { ...g.regionais, [key]: next }, scorers: addScorers(g, drainGoals()), news: [...news, ...g.news].slice(0, 80) }, results };
}
