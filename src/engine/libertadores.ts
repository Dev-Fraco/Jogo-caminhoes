import { CLUBS_DATA, type ClubData } from '../data/clubs';
import { moraleFactor } from './morale';
import { simulateMatch } from './match';
import { clubOf, teamOf } from './lookup';
import { makeRng, type Rng } from './rng';
import { buildFixtures } from './schedule';
import { autoLineup, teamFromPlayers, teamRatings } from './squad';
import { computeTable } from './table';
import type { ClubInfo, CupRound, CupTie, GameState, LibGroup, LibState, MatchResult, NewsItem, TeamState } from './types';

export const LIBERTADORES = 'libertadores';
export const LIB_STEP_NAMES = ['Grupos · rodada 1', 'Grupos · rodada 2', 'Grupos · rodada 3', 'Grupos · rodada 4', 'Grupos · rodada 5', 'Grupos · rodada 6', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'];
/** Depois de qual rodada do campeonato cada etapa acontece (não coincide com as datas da Copa do Brasil). */
export const LIB_DATES = [6, 11, 16, 21, 24, 28, 30, 32, 35, 37];
const PRIZE = { win: 2_500_000, draw: 1_000_000, qualified: 8_000_000, ko: [12_000_000, 18_000_000, 30_000_000, 150_000_000], runnerUp: 50_000_000 };

/** Vagas por país (1ª divisão) além dos 6 do Brasil: 32 clubes no total. */
const QUOTAS: [string, number][] = [['ar-primera', 5], ['co-primera', 3], ['cl-primera', 3], ['uy-primera', 3], ['ec-primera', 3], ['py-primera', 3], ['pe-primera', 2], ['bo-primera', 2], ['ve-primera', 2]];
export const BRAZIL_SLOTS = 6;

const country = (id: string) => (/^(ar|bo|cl|co|ec|py|pe|uy|ve)-/.test(id) ? id.slice(0, 2) : 'br');
const shuffle = <T>(rng: Rng, list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const toClubInfo = (c: ClubData): ClubInfo => ({ id: c.id, name: c.name, shortName: c.shortName, badge: c.badge, primaryColor: c.primaryColor, secondaryColor: c.secondaryColor, stadium: c.stadium, city: c.city, reputation: c.reputation, boardExpectation: c.boardExpectation });

/** Os clubes estrangeiros da Libertadores: os maiores de cada país (reputação e orçamento). */
export function foreignEntrants(): ClubData[] {
  return QUOTAS.flatMap(([div, n]) => [...(CLUBS_DATA[div] ?? [])].sort((a, b) => b.reputation - a.reputation || b.budget - a.budget).slice(0, n));
}

/** Os 6 brasileiros: campeão da Copa do Brasil + melhores da Série A (ou, na 1ª temporada, os 6 mais fortes). */
export function brazilQualifiers(g: Pick<GameState, 'divisions' | 'teams'>, ranking?: string[], cupChampion?: string): string[] {
  const serieA = g.divisions[0].clubIds;
  const base = ranking ?? [...serieA].sort((a, b) => teamRatings(g.teams[b]).overall - teamRatings(g.teams[a]).overall);
  const list = [...(cupChampion ? [cupChampion] : []), ...base].filter((id, i, a) => a.indexOf(id) === i && g.teams[id]);
  return list.slice(0, BRAZIL_SLOTS);
}

/** Cria a Libertadores da temporada: traz os clubes de fora e sorteia os grupos (4 potes por força, sem repetir país quando possível). */
export function createLibertadores(g: GameState, brazilIds: string[]): GameState {
  const rng = makeRng(g.seed * 53 + g.season * 13 + 29);
  const foreignData = foreignEntrants();
  const foreign: NonNullable<GameState['foreign']> = { clubs: {}, teams: {} };
  for (const c of foreignData) { foreign.clubs[c.id] = toClubInfo(c); foreign.teams[c.id] = teamFromPlayers(c.id, c.squad); }
  const withForeign = { ...g, foreign };
  const ids = [...brazilIds, ...foreignData.map((c) => c.id)];
  const ovr = (id: string) => teamRatings(teamOf(withForeign, id)).overall;
  const sorted = [...ids].sort((a, b) => ovr(b) - ovr(a));
  const groupsIds: string[][] = Array.from({ length: 8 }, () => []);
  for (let pot = 0; pot < 4; pot++) {
    const pool = shuffle(rng, sorted.slice(pot * 8, pot * 8 + 8));
    for (const gi of shuffle(rng, [0, 1, 2, 3, 4, 5, 6, 7])) {
      const k = Math.max(0, pool.findIndex((id) => !groupsIds[gi].some((o) => country(o) === country(id))));
      groupsIds[gi].push(pool.splice(k, 1)[0]);
    }
  }
  const groups: LibGroup[] = groupsIds.map((clubIds, i) => {
    const id = `G${'ABCDEFGH'[i]}`;
    return { id, clubIds, matches: buildFixtures(clubIds, id).fixtures.map((f) => ({ round: f.round, homeId: f.homeId, awayId: f.awayId })) };
  });
  const lib: LibState = { id: LIBERTADORES, name: 'Libertadores', groups, ko: [], step: 0, dueAfter: LIB_DATES, due: false, alive: ids };
  return { ...withForeign, lib };
}

export const userInLib = (g: GameState) => !!g.lib && g.lib.alive.includes(g.userClubId) && !g.lib.championId;
export const libMatchDue = (g: GameState) => !!g.lib?.due && userInLib(g);
export const libStepName = (l: LibState) => LIB_STEP_NAMES[Math.min(l.step, LIB_STEP_NAMES.length - 1)];

/** O jogo do seu clube na etapa atual da Libertadores. */
export function userLibMatch(g: GameState): { homeId: string; awayId: string } | undefined {
  const l = g.lib;
  if (!l?.due) return undefined;
  const mine = (m: { homeId: string; awayId: string }) => m.homeId === g.userClubId || m.awayId === g.userClubId;
  if (l.step < 6) return l.groups.flatMap((gr) => gr.matches).find((m) => m.round === l.step + 1 && mine(m));
  return l.ko[l.step - 6]?.ties.find(mine);
}

export function groupTable(g: GameState, group: LibGroup) {
  const done = group.matches.filter((m) => m.homeGoals !== undefined).map((m) => ({ divisionId: group.id, round: m.round, homeId: m.homeId, awayId: m.awayId, homeGoals: m.homeGoals!, awayGoals: m.awayGoals!, events: [] }));
  return computeTable(group.clubIds.map((id) => ({ id, name: clubOf(g, id).name })), done);
}

/** Depois de uma rodada do campeonato: abre a etapa da Libertadores se for a data; se o seu clube não joga, é simulada na hora. */
export function libAfterLeagueRound(g: GameState): GameState {
  const l = g.lib;
  if (!l || l.due || l.championId || l.step >= LIB_DATES.length) return g;
  if (g.round - 1 !== l.dueAfter[l.step]) return g;
  const opened = { ...g, lib: { ...l, due: true } };
  return userInLib(opened) ? opened : playLibStep(opened).state;
}

const lineupTeam = (g: GameState, id: string): TeamState => {
  const t = teamOf(g, id);
  return id === g.userClubId ? t : { ...t, lineup: autoLineup(t.players, t.formation) };
};

/** Joga a etapa pendente da Libertadores (rodada de grupos ou fase do mata-mata). */
export function playLibStep(g: GameState): { state: GameState; results: MatchResult[] } {
  const lib = g.lib;
  if (!lib || !lib.due) return { state: g, results: [] };
  const step = lib.step;
  const rng = makeRng(g.seed * 6151 + g.season * 97 + step * 19 + 7);
  const factor = moraleFactor(g.morale.team);
  const results: MatchResult[] = [];
  const news: NewsItem[] = [];
  const budgets = { ...g.budgets };
  const pay = (id: string, v: number) => { if (id in budgets) budgets[id] += v; };
  const play = (homeId: string, awayId: string) => {
    const mods = { home: homeId === g.userClubId ? factor : 1, away: awayId === g.userClubId ? factor : 1 };
    const out = simulateMatch(lineupTeam(g, homeId), lineupTeam(g, awayId), rng, mods, { home: clubOf(g, homeId).name, away: clubOf(g, awayId).name });
    const mine = homeId === g.userClubId || awayId === g.userClubId;
    results.push({ divisionId: LIBERTADORES, round: step + 1, homeId, awayId, homeGoals: out.homeGoals, awayGoals: out.awayGoals, events: mine ? out.events : [] });
    return out;
  };
  const say = (text: string, tone: NewsItem['tone']) => news.push({ season: g.season, round: g.round, text, tone });
  let next: LibState;

  if (step < 6) {
    const groups = lib.groups.map((gr) => ({
      ...gr,
      matches: gr.matches.map((m) => {
        if (m.round !== step + 1) return m;
        const out = play(m.homeId, m.awayId);
        if (out.homeGoals === out.awayGoals) { pay(m.homeId, PRIZE.draw); pay(m.awayId, PRIZE.draw); }
        else pay(out.homeGoals > out.awayGoals ? m.homeId : m.awayId, PRIZE.win);
        return { ...m, homeGoals: out.homeGoals, awayGoals: out.awayGoals };
      }),
    }));
    next = { ...lib, groups, step: step + 1, due: false };
    if (step === 5) {
      const tabs = groups.map((gr) => groupTable({ ...g, lib: next }, gr));
      const firsts = tabs.map((t) => t[0].clubId), seconds = tabs.map((t) => t[1].clubId);
      const ties: CupTie[] = [];
      for (let i = 0; i < 8; i++) ties.push({ homeId: firsts[i], awayId: seconds[i ^ 1] }); // 1º do grupo em casa contra o 2º do grupo vizinho
      const alive = [...firsts, ...seconds];
      for (const id of alive) pay(id, PRIZE.qualified);
      next = { ...next, ko: [{ name: LIB_STEP_NAMES[6], ties }], alive };
      if (alive.includes(g.userClubId)) say(`🌎 Libertadores: seu clube avançou para as oitavas de final!`, 'good');
      else if (lib.alive.includes(g.userClubId)) say(`🌎 Libertadores: seu clube foi eliminado na fase de grupos.`, 'bad');
    }
  } else {
    const k = step - 6;
    const round = lib.ko[k];
    const ties: CupTie[] = round.ties.map((t) => {
      const out = play(t.homeId, t.awayId);
      let pens: [number, number] | undefined;
      let winnerId = out.homeGoals > out.awayGoals ? t.homeId : out.awayGoals > out.homeGoals ? t.awayId : '';
      if (!winnerId) {
        const gk = (id: string) => teamRatings(teamOf(g, id)).gk;
        const pH = 0.78 - (gk(t.awayId) - gk(t.homeId)) * 0.002, pA = 0.78 - (gk(t.homeId) - gk(t.awayId)) * 0.002;
        let h = 0, a = 0;
        for (let i = 0; i < 5; i++) { if (rng() < pH) h++; if (rng() < pA) a++; }
        while (h === a) { if (rng() < pH) h++; if (rng() < pA) a++; }
        pens = [h, a]; winnerId = h > a ? t.homeId : t.awayId;
      }
      const loser = winnerId === t.homeId ? t.awayId : t.homeId;
      pay(winnerId, PRIZE.ko[k]);
      if (k === 3) pay(loser, PRIZE.runnerUp);
      if (t.homeId === g.userClubId || t.awayId === g.userClubId) {
        const rival = clubOf(g, winnerId === g.userClubId ? loser : winnerId).name;
        if (winnerId !== g.userClubId) say(`🌎 Libertadores: eliminado pelo ${rival} (${round.name}).`, 'bad');
        else say(k === 3 ? '🏆 CAMPEÃO DA LIBERTADORES!' : `🌎 Libertadores: você eliminou o ${rival} (${round.name}).`, 'good');
      }
      return { ...t, homeGoals: out.homeGoals, awayGoals: out.awayGoals, pens, winnerId };
    });
    const winners = ties.map((t) => t.winnerId!);
    const ko: CupRound[] = [...lib.ko.slice(0, k), { ...round, ties }];
    if (winners.length > 1) {
      const nextTies: CupTie[] = [];
      for (let i = 0; i < winners.length; i += 2) nextTies.push({ homeId: winners[i], awayId: winners[i + 1] });
      ko.push({ name: LIB_STEP_NAMES[step + 1], ties: nextTies });
    }
    next = { ...lib, ko, step: step + 1, due: false, alive: winners, championId: winners.length === 1 ? winners[0] : undefined };
  }
  return { state: { ...g, budgets, lib: next, news: [...news, ...g.news].slice(0, 30) }, results };
}
