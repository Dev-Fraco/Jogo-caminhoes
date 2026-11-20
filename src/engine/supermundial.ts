import { COMP_NAMES } from '../data/names';
import { prize } from './economy';
import { clubOf, teamOf } from './lookup';
import { addScorers, clearGoals, drainGoals } from './scorers';
import { makeRng } from './rng';
import { buildFixtures } from './schedule';
import { teamRatings } from './squad';
import { COMPS, country, groupTable, isMine, M, playTie, playTieGroup, shuffle } from './continental';
import type { CupRound, CupTie, GameState, LibGroup, LibState, MatchResult, NewsItem, SuperState } from './types';

/* =====================================================================
   SUPER MUNDIAL DE CLUBES: depois da última rodada e das copas continentais, os 32 melhores clubes do mundo se enfrentam:
   14 da Europa, 10 da Libertadores, 4 da Sul-Americana e 4 convidados (os mais fortes que sobraram).
   8 grupos de 4 (3 rodadas, todos contra todos) e mata-mata: oitavas, quartas, semifinal e final. Prêmios bem maiores que os do Mundial.
   ===================================================================== */

export const SUPER_ID = 'super';
export const SUPER_STEPS = ['Grupos · rodada 1', 'Grupos · rodada 2', 'Grupos · rodada 3', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'];
export const SUPER_SIZE = 32;
/** Quantos clubes vêm de cada competição (o resto são convidados). */
export const SUPER_QUOTA = { ucl: 14, lib: 10, sula: 4 } as const;
export const SUPER_PRIZE = { win: 4 * M, draw: 1.5 * M, qualified: 15 * M, ko: [20 * M, 35 * M, 60 * M, 250 * M], runnerUp: 100 * M };

/** Até onde o clube foi na competição continental (maior = mais longe). */
function reach(g: GameState, l: LibState, id: string): number {
  if (l.championId === id) return 10_000;
  let best = 0;
  l.ko.forEach((r, k) => { if (r.ties.some((t) => t.homeId === id || t.awayId === id)) best = Math.max(best, 100 * (k + 1)); });
  if (best) return best;
  const grp = l.groups.find((x) => x.clubIds.includes(id));
  if (!grp) return 0;
  const row = groupTable(g, grp).find((r) => r.clubId === id);
  return 10 + (row?.points ?? 0);
}

/** Os 32 classificados, na ordem de força. */
export function superEntrants(g: GameState): string[] {
  const ovr = (id: string) => teamRatings(teamOf(g, id)).overall;
  const taken = new Set<string>();
  const out: string[] = [];
  const rest: string[] = [];
  for (const key of COMPS) {
    const l = g[key];
    if (!l) continue;
    const ids = l.groups.flatMap((x) => x.clubIds);
    const ranked = [...ids].sort((a, b) => reach(g, l, b) - reach(g, l, a) || ovr(b) - ovr(a));
    const n = SUPER_QUOTA[key];
    let got = 0;
    for (const id of ranked) {
      if (taken.has(id)) continue;
      if (got < n) { taken.add(id); out.push(id); got++; } else rest.push(id);
    }
  }
  for (const id of [...new Set(rest)].filter((x) => !taken.has(x)).sort((a, b) => ovr(b) - ovr(a))) { if (out.length >= SUPER_SIZE) break; out.push(id); taken.add(id); }
  return out.slice(0, SUPER_SIZE);
}

const userIn = (g: GameState) => !g.unemployed && !!g.superMundial && g.superMundial.alive.includes(g.userClubId) && !g.superMundial.championId;
export const superUserIn = userIn;
export const superMatchDue = (g: GameState) => !!g.superMundial?.due && userIn(g);
export function superUserMatch(g: GameState): { homeId: string; awayId: string } | undefined {
  const s = g.superMundial;
  if (!s?.due) return undefined;
  if (s.step < 3) return s.groups.flatMap((gr) => gr.matches).find((m) => m.round === s.step + 1 && isMine(g)(m));
  return s.ko[s.step - 3]?.ties.find(isMine(g));
}
export const superStepName = (s: SuperState) => SUPER_STEPS[Math.min(s.step, SUPER_STEPS.length - 1)];

/** Monta o torneio com os classificados: potes por força, sem dois clubes do mesmo país no grupo quando dá. */
export function createSuper(g: GameState): SuperState | undefined {
  const ids = superEntrants(g);
  const n = Math.floor(ids.length / 4) * 4;
  if (n < 16) return undefined;
  const entrants = ids.slice(0, n);
  const ovr = (id: string) => teamRatings(teamOf(g, id)).overall;
  const sorted = [...entrants].sort((a, b) => ovr(b) - ovr(a));
  const gs = n / 4;
  const rng = makeRng(g.seed * 71 + g.season * 29 + 1717);
  const groupsIds: string[][] = Array.from({ length: gs }, () => []);
  for (let pot = 0; pot < 4; pot++) {
    const pool = shuffle(rng, sorted.slice(pot * gs, pot * gs + gs));
    for (const gi of shuffle(rng, Array.from({ length: gs }, (_, i) => i))) {
      const k = Math.max(0, pool.findIndex((id) => !groupsIds[gi].some((o) => country(o) === country(id))));
      groupsIds[gi].push(pool.splice(k, 1)[0]);
    }
  }
  const groups: LibGroup[] = groupsIds.map((clubIds, i) => {
    const gid = `SG${'ABCDEFGH'[i]}`;
    return { id: gid, clubIds, matches: buildFixtures(clubIds, gid).fixtures.filter((f) => f.round <= 3).map((f) => ({ round: f.round, homeId: f.homeId, awayId: f.awayId })) };
  });
  return { id: SUPER_ID, name: COMP_NAMES.supermundial, groups, ko: [], step: 0, due: true, alive: entrants, entrants };
}

/** Depois da última rodada (e do Mundial): monta o Super Mundial. Se o seu clube não está nele, é simulado na hora. */
export function superAfterLeagueRound(g: GameState): GameState {
  if (g.superMundial || g.round - 1 !== g.totalRounds) return g;
  if (COMPS.some((k) => g[k] && !g[k]!.championId)) return g; // as copas continentais precisam ter terminado
  const sm = createSuper(g);
  if (!sm) return g;
  let s: GameState = { ...g, superMundial: sm };
  const you = !s.unemployed && sm.alive.includes(s.userClubId);
  if (you) s = { ...s, news: [{ season: s.season, round: s.round, text: `🌐 ${sm.name}: seu clube está entre os 32 melhores do mundo!`, tone: 'good' as const }, ...s.news].slice(0, 80) };
  while (s.superMundial?.due && !userIn(s)) s = playSuperStep(s).state;
  return s;
}

/** Joga a etapa pendente (rodada de grupos ou fase do mata-mata). */
export function playSuperStep(g: GameState): { state: GameState; results: MatchResult[] } {
  const sm = g.superMundial;
  if (!sm || !sm.due) return { state: g, results: [] };
  const step = sm.step;
  clearGoals();
  const rng = makeRng(g.seed * 7919 + g.season * 101 + step * 23 + 61);
  const results: MatchResult[] = [];
  const news: NewsItem[] = [];
  const budgets = { ...g.budgets };
  const pay = (id: string, v: number) => { if (id in budgets) budgets[id] += prize(g, v); };
  const say = (text: string, tone: NewsItem['tone']) => news.push({ season: g.season, round: g.round, text, tone });
  const label = `🌐 ${sm.name}`;
  let next: SuperState;
  if (step < 3) {
    const groups = sm.groups.map((gr) => ({
      ...gr,
      matches: gr.matches.map((m) => {
        if (m.round !== step + 1) return m;
        const t = playTieGroup(g, rng, m, SUPER_ID, step + 1, results);
        if (t.homeGoals === t.awayGoals) { pay(m.homeId, SUPER_PRIZE.draw); pay(m.awayId, SUPER_PRIZE.draw); }
        else pay(t.homeGoals! > t.awayGoals! ? m.homeId : m.awayId, SUPER_PRIZE.win);
        return { ...m, homeGoals: t.homeGoals, awayGoals: t.awayGoals };
      }),
    }));
    next = { ...sm, groups, step: step + 1, due: true };
    if (step === 2) {
      const tabs = groups.map((gr) => groupTable({ ...g, superMundial: next } as GameState, gr as LibGroup));
      const firsts = tabs.map((t) => t[0].clubId), seconds = tabs.map((t) => t[1].clubId);
      const ties: CupTie[] = firsts.map((f, i) => ({ homeId: f, awayId: seconds[i ^ 1] }));
      const alive = [...firsts, ...seconds];
      for (const id of alive) pay(id, SUPER_PRIZE.qualified);
      next = { ...next, ko: [{ name: SUPER_STEPS[3], ties }], alive };
      if (sm.alive.includes(g.userClubId)) say(alive.includes(g.userClubId) ? `${label}: seu clube avançou para as oitavas de final!` : `${label}: seu clube foi eliminado na fase de grupos.`, alive.includes(g.userClubId) ? 'good' : 'bad');
    }
  } else {
    const k = step - 3;
    const round = sm.ko[k];
    const ties: CupTie[] = round.ties.map((t) => {
      const r = playTie(g, rng, t, SUPER_ID, step + 1, results);
      const loser = r.winnerId === t.homeId ? t.awayId : t.homeId;
      pay(r.winnerId!, SUPER_PRIZE.ko[k]);
      if (k === SUPER_PRIZE.ko.length - 1) pay(loser, SUPER_PRIZE.runnerUp);
      if (isMine(g)(t)) {
        const rival = clubOf(g, r.winnerId === g.userClubId ? loser : r.winnerId!).name;
        if (r.winnerId !== g.userClubId) say(`${label}: eliminado pelo ${rival} (${round.name}).`, 'bad');
        else say(k === SUPER_PRIZE.ko.length - 1 ? `🏆 CAMPEÃO DO ${sm.name.toUpperCase()}!` : `${label}: você eliminou o ${rival} (${round.name}).`, 'good');
      }
      return r;
    });
    const winners = ties.map((t) => t.winnerId!);
    const ko: CupRound[] = [...sm.ko.slice(0, k), { ...round, ties }];
    if (winners.length > 1) ko.push({ name: SUPER_STEPS[step + 1], ties: winners.reduce<CupTie[]>((acc, w, i) => (i % 2 ? acc : [...acc, { homeId: w, awayId: winners[i + 1] }]), []) });
    next = { ...sm, ko, step: step + 1, due: winners.length > 1, alive: winners, championId: winners.length === 1 ? winners[0] : undefined };
  }
  return { state: { ...g, budgets, superMundial: next, scorers: addScorers(g, drainGoals()), news: [...news, ...g.news].slice(0, 80) }, results };
}
