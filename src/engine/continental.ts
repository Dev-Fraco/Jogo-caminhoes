import { CLUBS_DATA, type ClubData } from '../data/clubs';
import { prize } from './economy';
import { clubOf, teamOf } from './lookup';
import { moraleFactor } from './morale';
import { simulateCupMatch, simulateMatch } from './match';
import { COMP_NAMES } from '../data/names';
import { addScorers, clearGoals, drainGoals, logGoals } from './scorers';
import { makeRng, type Rng } from './rng';
import { buildFixtures } from './schedule';
import { injuredSet } from './injuries';
import { aiLineup } from './rotation';
import { teamFromPlayers, teamRatings } from './squad';
import { computeTable } from './table';
import type { ClubInfo, CupRound, CupTie, GameState, LibGroup, LibState, MatchResult, MundialState, NewsItem, PenKick, TeamState } from './types';
import { penaltyTakers, shootoutKicks } from './cup';

export type Comp = 'lib' | 'ucl' | 'sula';
export const M = 1_000_000;

interface Cfg {
  key: Comp; id: string; name: string; icon: string;
  /** Vagas por país (chave = id da 1ª divisão). */
  quotas: [string, number][];
  groups: number; stepNames: string[];
  /** Depois de qual rodada do campeonato cada etapa acontece (não coincide com a Copa do Brasil: 4, 9, 14, 19, 26, 33). */
  dates: number[];
  win: number; draw: number; qualified: number; koPrize: number[]; runnerUp: number;
}

const GROUP_NAMES = [1, 2, 3, 4, 5, 6].map((n) => `Grupos · rodada ${n}`);
export const CONTINENTALS: Record<Comp, Cfg> = {
  lib: {
    key: 'lib', id: 'libertadores', get name() { return COMP_NAMES.lib; }, icon: '🌎',
    quotas: [['serie-a', 6], ['ar-primera', 5], ['co-primera', 3], ['cl-primera', 3], ['uy-primera', 3], ['ec-primera', 3], ['py-primera', 3], ['pe-primera', 2], ['bo-primera', 2], ['ve-primera', 2]],
    groups: 8, stepNames: [...GROUP_NAMES, 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'],
    dates: [6, 11, 16, 21, 24, 28, 30, 32, 35, 37],
    win: 2.5 * M, draw: 1 * M, qualified: 8 * M, koPrize: [12 * M, 18 * M, 30 * M, 150 * M], runnerUp: 50 * M,
  },
  sula: {
    key: 'sula', id: 'sulamericana', get name() { return COMP_NAMES.sula; }, icon: '🌴',
    // os clubes logo depois dos da Libertadores em cada país (as vagas são as mesmas, a partir da posição seguinte)
    quotas: [['serie-a', 6], ['ar-primera', 5], ['co-primera', 3], ['cl-primera', 3], ['uy-primera', 3], ['ec-primera', 3], ['py-primera', 3], ['pe-primera', 2], ['bo-primera', 2], ['ve-primera', 2]],
    groups: 8, stepNames: [...GROUP_NAMES, 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'],
    dates: [5, 10, 15, 20, 23, 27, 29, 31, 34, 36],
    win: 1.5 * M, draw: 0.6 * M, qualified: 5 * M, koPrize: [7 * M, 12 * M, 20 * M, 80 * M], runnerUp: 30 * M,
  },
  ucl: {
    key: 'ucl', id: 'champions', get name() { return COMP_NAMES.ucl; }, icon: '⭐',
    quotas: [['premier', 3], ['es-primera', 3], ['it-serie-a', 3], ['bundesliga', 3], ['ligue-1', 2], ['pt-primeira', 2]],
    groups: 4, stepNames: [...GROUP_NAMES, 'Quartas de final', 'Semifinal', 'Final'],
    dates: [7, 12, 17, 22, 25, 29, 31, 34, 36],
    win: 4 * M, draw: 1.5 * M, qualified: 15 * M, koPrize: [20 * M, 35 * M, 200 * M], runnerUp: 70 * M,
  },
};
export const COMPS: Comp[] = ['lib', 'sula', 'ucl'];

/** Ajusta as datas (pensadas para 38 rodadas) ao tamanho do campeonato, sempre crescentes. */
export function scaleDates(dates: number[], totalRounds: number): number[] {
  const out: number[] = [];
  for (const d of dates) { const v = Math.max(1, Math.round((d * totalRounds) / 38)); out.push(out.length && v <= out[out.length - 1] ? out[out.length - 1] + 1 : v); }
  return out;
}
export const MUNDIAL_ID = 'mundial';
const MUNDIAL_PRIZE = { semi: 25 * M, champion: 120 * M };

const FOREIGN_PREFIX = /^(ar|bo|cl|co|ec|py|pe|uy|ve|en|es|it|de|fr|pt)-/;
export const country = (id: string) => (/^(afr|ara)-/.test(id) ? id.slice(0, 3) : FOREIGN_PREFIX.test(id) ? id.slice(0, 2) : 'br');
export const shuffle = <T>(rng: Rng, list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const toClubInfo = (c: ClubData): ClubInfo => ({ id: c.id, name: c.name, shortName: c.shortName, badge: c.badge, primaryColor: c.primaryColor, secondaryColor: c.secondaryColor, stadium: c.stadium, city: c.city, reputation: c.reputation, boardExpectation: c.boardExpectation });

const topOf = (div: string, n: number, skip = 0): ClubData[] => [...(CLUBS_DATA[div] ?? [])].sort((a, b) => b.reputation - a.reputation || b.budget - a.budget).slice(skip, skip + n);

/** Cria as duas competições continentais da temporada. Os clubes do seu país vêm da sua liga (campeão da copa nacional primeiro, depois a classificação); os demais, dos maiores de cada país. */
/**
 * Vagas do seu país (regras 2026): campeões continentais do ano anterior, campeão da Copa do Brasil, 1º ao 4º da Série A (fase de grupos),
 * e a vaga preliminar para o vice da Copa do Brasil (ou, se ele já estiver classificado, o próximo da tabela). Quem já tem vaga por outro caminho
 * não ocupa duas: a vaga passa ao próximo elegível. A Sul-Americana fica com os 6 seguintes que não estão na Libertadores.
 */
export function domesticOrder(ranking: string[], cupChampion?: string, extra?: { vice?: string; holders?: string[] }): string[] {
  return [...(extra?.holders ?? []), ...(cupChampion ? [cupChampion] : []), ...ranking.slice(0, 4), ...(extra?.vice ? [extra.vice] : []), ...ranking].filter((id, i, a) => a.indexOf(id) === i);
}

export function createContinentals(g: GameState, ranking?: string[], cupChampion?: string, extra?: { vice?: string; holders?: string[] }): GameState {
  const home = g.divisions[0].id;
  const foreign: NonNullable<GameState['foreign']> = { clubs: {}, teams: {} };
  const out: GameState = { ...g, foreign };
  const byStrength = [...g.divisions[0].clubIds].sort((a, b) => teamRatings(g.teams[b]).overall - teamRatings(g.teams[a]).overall);
  const domestic = domesticOrder(ranking ?? byStrength, cupChampion, extra).filter((id) => g.teams[id]);
  for (const key of COMPS) {
    const cfg = CONTINENTALS[key];
    const ids: string[] = [];
    for (const [div, n] of cfg.quotas) {
      const skip = key === 'sula' ? (CONTINENTALS.lib.quotas.find(([d]) => d === div)?.[1] ?? 0) : 0; // a Sul-Americana pega quem vem depois dos da Libertadores
      if (div === home) ids.push(...domestic.slice(skip, skip + n));
      else for (const c of topOf(div, n, skip)) { foreign.clubs[c.id] = toClubInfo(c); foreign.teams[c.id] = teamFromPlayers(c.id, c.squad); ids.push(c.id); }
    }
    const rng = makeRng(g.seed * 53 + g.season * 13 + (key === 'lib' ? 29 : key === 'sula' ? 37 : 71));
    const ovr = (id: string) => teamRatings(teamOf(out, id)).overall;
    const sorted = [...ids].sort((a, b) => ovr(b) - ovr(a));
    const gs = cfg.groups;
    const groupsIds: string[][] = Array.from({ length: gs }, () => []);
    for (let pot = 0; pot < 4; pot++) {
      const pool = shuffle(rng, sorted.slice(pot * gs, pot * gs + gs));
      for (const gi of shuffle(rng, Array.from({ length: gs }, (_, i) => i))) {
        const k = Math.max(0, pool.findIndex((id) => !groupsIds[gi].some((o) => country(o) === country(id))));
        groupsIds[gi].push(pool.splice(k, 1)[0]);
      }
    }
    const groups: LibGroup[] = groupsIds.map((clubIds, i) => {
      const gid = `G${'ABCDEFGH'[i]}`;
      return { id: gid, clubIds, matches: buildFixtures(clubIds, gid).fixtures.map((f) => ({ round: f.round, homeId: f.homeId, awayId: f.awayId })) };
    });
    out[key] = { id: cfg.id, name: cfg.name, groups, ko: [], step: 0, dueAfter: scaleDates(cfg.dates, g.totalRounds), due: false, alive: ids };
  }
  return out;
}

export const stepName = (key: Comp, l: LibState) => CONTINENTALS[key].stepNames[Math.min(l.step, CONTINENTALS[key].stepNames.length - 1)];
export const userIn = (g: GameState, key: Comp) => { const l = g[key]; return !g.unemployed && !!l && l.alive.includes(g.userClubId) && !l.championId; };
export const matchDue = (g: GameState, key: Comp) => !!g[key]?.due && userIn(g, key);

export const isMine = (g: GameState) => (m: { homeId: string; awayId: string }) => m.homeId === g.userClubId || m.awayId === g.userClubId;
/** O jogo do seu clube na etapa atual. */
export function userMatch(g: GameState, key: Comp): { homeId: string; awayId: string } | undefined {
  const l = g[key];
  if (!l?.due) return undefined;
  if (l.step < 6) return l.groups.flatMap((gr) => gr.matches).find((m) => m.round === l.step + 1 && isMine(g)(m));
  return l.ko[l.step - 6]?.ties.find(isMine(g));
}

export function groupTable(g: GameState, group: LibGroup) {
  const done = group.matches.filter((m) => m.homeGoals !== undefined).map((m) => ({ divisionId: group.id, round: m.round, homeId: m.homeId, awayId: m.awayId, homeGoals: m.homeGoals!, awayGoals: m.awayGoals!, events: [] }));
  return computeTable(group.clubIds.map((id) => ({ id, name: clubOf(g, id).name })), done);
}

const lineupTeam = (g: GameState, id: string): TeamState => {
  const t = teamOf(g, id);
  return id === g.userClubId && !g.unemployed ? t : { ...t, lineup: aiLineup(g, t, injuredSet(g), 1.2) };
};

/** Simula um jogo e, se terminar empatado e for mata-mata, decide nos pênaltis. */
export function playTie(g: GameState, rng: Rng, t: CupTie, divisionId: string, round: number, results: MatchResult[]): CupTie {
  const factor = moraleFactor(g.morale.team);
  const mods = { home: t.homeId === g.userClubId ? factor : 1, away: t.awayId === g.userClubId ? factor : 1 };
  const out = simulateCupMatch(lineupTeam(g, t.homeId), lineupTeam(g, t.awayId), rng, mods, { home: clubOf(g, t.homeId).name, away: clubOf(g, t.awayId).name });
  logGoals(out.events, t.homeId, t.awayId, divisionId === MUNDIAL_ID ? 'mundial' : divisionId); // artilharia
  let pens: [number, number] | undefined;
  let penKicks: { home: PenKick[]; away: PenKick[] } | undefined;
  let winnerId = out.homeGoals > out.awayGoals ? t.homeId : out.awayGoals > out.homeGoals ? t.awayId : '';
  if (!winnerId) {
    const gk = (id: string) => teamRatings(teamOf(g, id)).gk;
    const sk = shootoutKicks(rng, gk(t.homeId), gk(t.awayId), penaltyTakers(lineupTeam(g, t.homeId)), penaltyTakers(lineupTeam(g, t.awayId)));
    pens = sk.score; penKicks = { home: sk.home, away: sk.away }; winnerId = pens[0] > pens[1] ? t.homeId : t.awayId;
  }
  results.push({ divisionId, round, homeId: t.homeId, awayId: t.awayId, homeGoals: out.homeGoals, awayGoals: out.awayGoals, ...(isMine(g)(t) && pens ? { pens, penKicks } : {}), events: isMine(g)(t) ? out.events : [] });
  return { ...t, homeGoals: out.homeGoals, awayGoals: out.awayGoals, pens, winnerId };
}

/** Depois de uma rodada do campeonato: abre a etapa se for a data; se o seu clube não joga, é simulada na hora. */
export function contAfterLeagueRound(g: GameState): GameState {
  let s = g;
  for (const key of COMPS) {
    const l = s[key];
    if (!l || l.due || l.championId || l.step >= l.dueAfter.length || s.round - 1 !== l.dueAfter[l.step]) continue;
    s = { ...s, [key]: { ...l, due: true } };
    if (!userIn(s, key)) s = playContStep(s, key).state;
  }
  return s;
}

/** Joga a etapa pendente (rodada de grupos ou fase do mata-mata). */
export function playContStep(g: GameState, key: Comp): { state: GameState; results: MatchResult[] } {
  const cfg = CONTINENTALS[key];
  const comp = g[key];
  if (!comp || !comp.due) return { state: g, results: [] };
  const step = comp.step;
  clearGoals();
  const rng = makeRng(g.seed * 6151 + g.season * 97 + step * 19 + (key === 'lib' ? 7 : key === 'sula' ? 23 : 43));
  const results: MatchResult[] = [];
  const news: NewsItem[] = [];
  const budgets = { ...g.budgets };
  const pay = (id: string, v: number) => { if (id in budgets) budgets[id] += prize(g, v); };
  const say = (text: string, tone: NewsItem['tone']) => news.push({ season: g.season, round: g.round, text, tone });
  let next: LibState;

  if (step < 6) {
    const groups = comp.groups.map((gr) => ({
      ...gr,
      matches: gr.matches.map((m) => {
        if (m.round !== step + 1) return m;
        const t = playTieGroup(g, rng, m, cfg.id, step + 1, results);
        if (t.homeGoals === t.awayGoals) { pay(m.homeId, cfg.draw); pay(m.awayId, cfg.draw); }
        else pay(t.homeGoals! > t.awayGoals! ? m.homeId : m.awayId, cfg.win);
        return { ...m, homeGoals: t.homeGoals, awayGoals: t.awayGoals };
      }),
    }));
    next = { ...comp, groups, step: step + 1, due: false };
    if (step === 5) {
      const tabs = groups.map((gr) => groupTable({ ...g, [key]: next }, gr));
      const firsts = tabs.map((t) => t[0].clubId), seconds = tabs.map((t) => t[1].clubId);
      const ties: CupTie[] = firsts.map((f, i) => ({ homeId: f, awayId: seconds[i ^ 1] })); // 1º do grupo em casa contra o 2º do grupo vizinho
      const alive = [...firsts, ...seconds];
      for (const id of alive) pay(id, cfg.qualified);
      next = { ...next, ko: [{ name: cfg.stepNames[6], ties }], alive };
      if (alive.includes(g.userClubId)) say(`${cfg.icon} ${cfg.name}: seu clube avançou para as ${cfg.stepNames[6].toLowerCase()}!`, 'good');
      else if (comp.alive.includes(g.userClubId)) say(`${cfg.icon} ${cfg.name}: seu clube foi eliminado na fase de grupos.`, 'bad');
    }
  } else {
    const k = step - 6;
    const round = comp.ko[k];
    const ties: CupTie[] = round.ties.map((t) => {
      const r = playTie(g, rng, t, cfg.id, step + 1, results);
      const loser = r.winnerId === t.homeId ? t.awayId : t.homeId;
      pay(r.winnerId!, cfg.koPrize[k]);
      if (k === cfg.koPrize.length - 1) pay(loser, cfg.runnerUp);
      if (isMine(g)(t)) {
        const rival = clubOf(g, r.winnerId === g.userClubId ? loser : r.winnerId!).name;
        if (r.winnerId !== g.userClubId) say(`${cfg.icon} ${cfg.name}: eliminado pelo ${rival} (${round.name}).`, 'bad');
        else say(k === cfg.koPrize.length - 1 ? `🏆 CAMPEÃO DA ${cfg.name.toUpperCase()}!` : `${cfg.icon} ${cfg.name}: você eliminou o ${rival} (${round.name}).`, 'good');
      }
      return r;
    });
    const winners = ties.map((t) => t.winnerId!);
    const ko: CupRound[] = [...comp.ko.slice(0, k), { ...round, ties }];
    if (winners.length > 1) ko.push({ name: cfg.stepNames[step + 1], ties: winners.reduce<CupTie[]>((acc, w, i) => (i % 2 ? acc : [...acc, { homeId: w, awayId: winners[i + 1] }]), []) });
    next = { ...comp, ko, step: step + 1, due: false, alive: winners, championId: winners.length === 1 ? winners[0] : undefined };
  }
  return { state: { ...g, budgets, [key]: next, scorers: addScorers(g, drainGoals()), news: [...news, ...g.news].slice(0, 80) }, results };
}

export function playTieGroup(g: GameState, rng: Rng, m: { homeId: string; awayId: string }, divisionId: string, round: number, results: MatchResult[]) {
  const factor = moraleFactor(g.morale.team);
  const mods = { home: m.homeId === g.userClubId ? factor : 1, away: m.awayId === g.userClubId ? factor : 1 };
  const out = simulateMatch(lineupTeam(g, m.homeId), lineupTeam(g, m.awayId), rng, mods, { home: clubOf(g, m.homeId).name, away: clubOf(g, m.awayId).name });
  logGoals(out.events, m.homeId, m.awayId, divisionId); // artilharia
  results.push({ divisionId, round, homeId: m.homeId, awayId: m.awayId, homeGoals: out.homeGoals, awayGoals: out.awayGoals, events: isMine(g)(m) ? out.events : [] });
  return { homeGoals: out.homeGoals, awayGoals: out.awayGoals };
}

/* ---------------- Mundial de Clubes ---------------- */

const finalists = (l: LibState | undefined): [string, string] | undefined => {
  const f = l?.ko[l.ko.length - 1]?.ties[0];
  if (!l?.championId || !f) return undefined;
  return [l.championId, f.winnerId === f.homeId ? f.awayId : f.homeId];
};

export const mundialUserIn = (g: GameState) => !g.unemployed && !!g.mundial && g.mundial.alive.includes(g.userClubId) && !g.mundial.championId;
export const mundialMatchDue = (g: GameState) => !!g.mundial?.due && mundialUserIn(g);
export function mundialUserMatch(g: GameState): { homeId: string; awayId: string } | undefined {
  const m = g.mundial;
  return m?.due ? m.ko[m.step]?.ties.find(isMine(g)) : undefined;
}
export const mundialStepName = (m: MundialState) => m.ko[Math.min(m.step, m.ko.length - 1)].name;

/** Depois da última rodada: monta o Mundial com os dois finalistas da Libertadores e da Champions (semifinais cruzadas). */
export function mundialAfterLeagueRound(g: GameState): GameState {
  if (g.mundial || g.round - 1 !== g.totalRounds) return g;
  const lib = finalists(g.lib), ucl = finalists(g.ucl);
  if (!lib || !ucl) return g;
  const ties: CupTie[] = [{ homeId: ucl[0], awayId: lib[1] }, { homeId: lib[0], awayId: ucl[1] }];
  let s: GameState = { ...g, mundial: { id: MUNDIAL_ID, name: COMP_NAMES.mundial, ko: [{ name: 'Semifinal', ties }], step: 0, due: true, alive: [...ucl, ...lib] } };
  while (s.mundial?.due && !mundialUserIn(s)) s = playMundialStep(s).state;
  return s;
}

export function playMundialStep(g: GameState): { state: GameState; results: MatchResult[] } {
  const m = g.mundial;
  if (!m?.due) return { state: g, results: [] };
  clearGoals();
  const rng = makeRng(g.seed * 4271 + g.season * 59 + m.step * 11 + 5);
  const results: MatchResult[] = [];
  const news: NewsItem[] = [];
  const budgets = { ...g.budgets };
  const round = m.ko[m.step];
  const final = m.step === 1;
  const ties = round.ties.map((t) => {
    const r = playTie(g, rng, t, MUNDIAL_ID, m.step + 1, results);
    const loser = r.winnerId === t.homeId ? t.awayId : t.homeId;
    if (r.winnerId! in budgets) budgets[r.winnerId!] += prize(g, final ? MUNDIAL_PRIZE.champion : MUNDIAL_PRIZE.semi);
    if (isMine(g)(t)) {
      const rival = clubOf(g, r.winnerId === g.userClubId ? loser : r.winnerId!).name;
      const text = r.winnerId !== g.userClubId ? `🌍 Mundial: eliminado pelo ${rival} (${round.name}).` : final ? '🏆 CAMPEÃO MUNDIAL DE CLUBES!' : `🌍 Mundial: você eliminou o ${rival} e está na final!`;
      news.push({ season: g.season, round: g.round, text, tone: r.winnerId === g.userClubId ? 'good' : 'bad' });
    }
    return r;
  });
  const winners = ties.map((t) => t.winnerId!);
  const ko: CupRound[] = [{ ...round, ties }];
  const prev = m.ko.slice(0, m.step);
  let next: MundialState;
  if (final) next = { ...m, ko: [...prev, ...ko], due: false, alive: winners, championId: winners[0] };
  else next = { ...m, ko: [...prev, ...ko, { name: 'Final', ties: [{ homeId: winners[0], awayId: winners[1] }] }], step: 1, alive: winners, due: true };
  return { state: { ...g, budgets, mundial: next, scorers: addScorers(g, drainGoals()), news: [...news, ...g.news].slice(0, 80) }, results };
}
