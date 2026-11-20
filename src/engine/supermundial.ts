import { COMP_NAMES } from '../data/names';
import { prize } from './economy';
import { clubOf, teamOf } from './lookup';
import { addScorers, clearGoals, drainGoals } from './scorers';
import { makeRng } from './rng';
import { buildFixtures } from './schedule';
import { teamRatings } from './squad';
import { COMPS, country, groupTable, isMine, M, playTie, playTieGroup, shuffle, toClubInfo } from './continental';
import { CLUBS_DATA, type ClubData } from '../data/clubs';
import { OTHER_CLUBS, otherClub } from '../data/otherworld';
import { teamFromPlayers } from './squad';
import type { CupRound, CupTie, GameState, LibGroup, LibState, MatchResult, NewsItem, OtherCups, SuperState } from './types';

/* =====================================================================
   SUPER MUNDIAL DE CLUBES (a cada 4 anos, como a versão real): 16 clubes, os últimos 4 campeões da Libertadores, os últimos 4 da Champions
   e os últimos 4 das copas da África e da Arábia. 4 grupos de 4 (3 rodadas, todos contra todos) e mata-mata: quartas, semifinal e final.
   Prêmios bem maiores que os do Mundial.
   ===================================================================== */

export const SUPER_ID = 'super';
export const SUPER_STEPS = ['Grupos · rodada 1', 'Grupos · rodada 2', 'Grupos · rodada 3', 'Quartas de final', 'Semifinal', 'Final'];
export const SUPER_SIZE = 16;
/** O Super Mundial acontece a cada 4 anos (temporadas 2026, 2030, 2034...), como a versão real. */
export const SUPER_EVERY = 4;
export const isSuperYear = (season: number) => season % SUPER_EVERY === 2;
/** Os últimos 4 campeões de cada competição vão ao torneio. */
export const SUPER_PER_COMP = 4;
export const SUPER_PRIZE = { win: 4 * M, draw: 1.5 * M, qualified: 20 * M, ko: [35 * M, 60 * M, 250 * M], runnerUp: 100 * M };

/* ---- Copas da África e da Arábia (nos bastidores) ---- */
const ovrCache = new Map<string, number>();
const ovrOf = (c: ClubData) => { let v = ovrCache.get(c.id); if (v === undefined) { v = teamRatings(teamFromPlayers(c.id, c.squad)).overall; ovrCache.set(c.id, v); } return v; };

/** Todo fim de temporada as copas da África e da Arábia têm campeão e vice (sorteio ponderado pela força dos clubes). */
export function otherCupsAfterLeagueRound(g: GameState): GameState {
  if (g.round - 1 !== g.totalRounds) return g;
  const cur: OtherCups = g.otherCups ?? { africa: [], arab: [] };
  if (cur.africa.some((e) => e.season === g.season) && cur.arab.some((e) => e.season === g.season)) return g;
  const next: OtherCups = { africa: [...cur.africa], arab: [...cur.arab] };
  const news: NewsItem[] = [];
  for (const key of ['africa', 'arab'] as const) {
    if (next[key].some((e) => e.season === g.season)) continue;
    const rng = makeRng(g.seed * 211 + g.season * 37 + (key === 'africa' ? 5 : 9));
    const pool = [...OTHER_CLUBS[key]];
    const draw = (list: ClubData[]) => { const w = list.map((c) => Math.exp((ovrOf(c) - 60) / 4)); let r = rng() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; } return list[list.length - 1]; };
    const champ = draw(pool);
    const vice = draw(pool.filter((c) => c.id !== champ.id));
    next[key] = [...next[key], { season: g.season, championId: champ.id, runnerUpId: vice.id }].slice(-12);
    news.push({ season: g.season, round: g.round, text: `🌍 ${COMP_NAMES[key]}: ${champ.name} é campeão (vice: ${vice.name}).`, tone: 'info' });
  }
  return { ...g, otherCups: next, news: [...news, ...g.news].slice(0, 80) };
}

/** Garante que o time do clube existe no estado (clubes de outras temporadas e da África/Arábia entram em `foreign`). */
function ensureTeam(g: GameState, id: string): GameState | undefined {
  if (g.teams[id] || g.foreign?.teams[id]) return g;
  const c = otherClub(id) ?? Object.values(CLUBS_DATA).flat().find((x) => x.id === id);
  if (!c) return undefined;
  const foreign = g.foreign ?? { clubs: {}, teams: {} };
  return { ...g, foreign: { clubs: { ...foreign.clubs, [id]: toClubInfo(c) }, teams: { ...foreign.teams, [id]: teamFromPlayers(id, c.squad) } } };
}

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

/** Os 16 classificados: os últimos 4 campeões da Libertadores, da Champions, da África e da Arábia (o que faltar é completado pelos melhores da edição atual). */
export function superEntrants(g0: GameState): { ids: string[]; state: GameState } {
  let g = g0;
  const taken = new Set<string>();
  const out: string[] = [];
  const take = (id: string | undefined): boolean => {
    if (!id || taken.has(id)) return false;
    const s = ensureTeam(g, id);
    if (!s) return false;
    g = s; taken.add(id); out.push(id); return true;
  };
  const ovr = (id: string) => teamRatings(teamOf(g, id)).overall;
  for (const key of ['lib', 'ucl'] as const) {
    const champKey = key === 'lib' ? 'libChampionId' : 'uclChampionId';
    const past = [g[key]?.championId, ...[...g.history].reverse().map((h) => h[champKey])];
    let got = 0;
    for (const id of past) { if (got >= SUPER_PER_COMP) break; if (take(id)) got++; }
    const l = g[key];
    if (l && got < SUPER_PER_COMP) { // sem história suficiente (carreira nova): os melhores da edição atual completam
      const ranked = l.groups.flatMap((x) => x.clubIds).filter((id) => !taken.has(id)).sort((a, b) => reach(g, l, b) - reach(g, l, a) || ovr(b) - ovr(a));
      for (const id of ranked) { if (got >= SUPER_PER_COMP) break; if (take(id)) got++; }
    }
  }
  for (const key of ['africa', 'arab'] as const) {
    const eds = [...(g.otherCups?.[key] ?? [])].reverse();
    let got = 0;
    for (const e of eds) { if (got >= SUPER_PER_COMP) break; if (take(e.championId)) got++; }
    const rest = [...OTHER_CLUBS[key]].sort((a, b) => ovrOf(b) - ovrOf(a));
    for (const c of rest) { if (got >= SUPER_PER_COMP) break; if (take(c.id)) got++; }
  }
  return { ids: out, state: g };
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
export function createSuper(g0: GameState): { sm: SuperState; state: GameState } | undefined {
  const { ids, state: g } = superEntrants(g0);
  const n = Math.floor(ids.length / 4) * 4;
  if (n < 8) return undefined;
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
  return { state: g, sm: { id: SUPER_ID, name: COMP_NAMES.supermundial, groups, ko: [], step: 0, due: true, alive: entrants, entrants } };
}

/** Depois da última rodada (e do Mundial): monta o Super Mundial. Se o seu clube não está nele, é simulado na hora. */
export function superAfterLeagueRound(g: GameState): GameState {
  g = otherCupsAfterLeagueRound(g);
  if (g.superMundial || g.round - 1 !== g.totalRounds || !isSuperYear(g.season)) return g;
  if (COMPS.some((k) => g[k] && !g[k]!.championId)) return g; // as copas continentais precisam ter terminado
  const made = createSuper(g);
  if (!made) return g;
  const sm = made.sm;
  let s: GameState = { ...made.state, superMundial: sm };
  const you = !s.unemployed && sm.alive.includes(s.userClubId);
  if (you) s = { ...s, news: [{ season: s.season, round: s.round, text: `🌐 ${sm.name}: seu clube está entre os 16 melhores do mundo!`, tone: 'good' as const }, ...s.news].slice(0, 80) };
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
