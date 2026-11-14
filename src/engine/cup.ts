import { moraleFactor } from './morale';
import { simulateMatch } from './match';
import { makeRng, type Rng } from './rng';
import { autoLineup, teamRatings } from './squad';
import type { CupState, CupTie, GameState, MatchResult, NewsItem, TeamState } from './types';

export const COPA_DO_BRASIL = 'copa-do-brasil';
export const CUP_ROUND_NAMES = ['1ª fase', '2ª fase', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'];
/** Depois de qual rodada do campeonato cada fase é disputada. */
export const CUP_DATES = [4, 9, 14, 19, 26, 33];
/** Premiação de quem vence cada fase (R$). O campeão leva o último valor. */
export const CUP_PRIZE = [300_000, 600_000, 1_200_000, 2_500_000, 5_000_000, 60_000_000];
export const CUP_SIZE = 64;

const shuffle = <T>(rng: Rng, list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

const pair = (rng: Rng, ids: string[]): CupTie[] => {
  const s = shuffle(rng, ids);
  const ties: CupTie[] = [];
  for (let i = 0; i < s.length; i += 2) ties.push({ homeId: s[i], awayId: s[i + 1] });
  return ties;
};

/** Monta a Copa do Brasil: todos da Série A, B e C + os melhores da D, até 64 clubes (o seu clube sempre entra). 1ª fase: forte x fraco, mando do menor. */
export function createCup(g: Pick<GameState, 'divisions' | 'teams' | 'userClubId' | 'seed' | 'season'>): CupState {
  const rng = makeRng(g.seed * 31 + g.season * 7 + 11);
  const ovr = (id: string) => teamRatings(g.teams[id]).overall;
  const tiered = g.divisions.map((d, i) => [...d.clubIds].sort((a, b) => ovr(b) - ovr(a)).map((id) => ({ id, tier: i })));
  let list = tiered.flat();
  if (list.length > CUP_SIZE) {
    let keep = list.slice(0, CUP_SIZE);
    if (!keep.some((c) => c.id === g.userClubId)) keep = [...keep.slice(0, CUP_SIZE - 1), list.find((c) => c.id === g.userClubId)!];
    list = keep;
  }
  list.sort((a, b) => a.tier - b.tier || ovr(b.id) - ovr(a.id));
  const half = list.length / 2;
  const top = list.slice(0, half), bottom = shuffle(rng, list.slice(half));
  const ties: CupTie[] = top.map((c, i) => ({ homeId: bottom[i].id, awayId: c.id })); // o clube menor joga em casa
  const alive = list.map((c) => c.id);
  const total = Math.log2(list.length);
  return {
    id: COPA_DO_BRASIL, name: 'Copa do Brasil', rounds: [{ name: CUP_ROUND_NAMES[CUP_ROUND_NAMES.length - total], ties }],
    roundIndex: 0, totalRounds: total, dueAfter: CUP_DATES.slice(CUP_ROUND_NAMES.length - total), due: false, alive,
  };
}

export const userInCup = (g: GameState) => !g.unemployed && !!g.cup && g.cup.alive.includes(g.userClubId) && !g.cup.championId;
/** O próximo jogo é da copa (e o seu clube joga). */
export const cupMatchDue = (g: GameState) => !!g.cup?.due && userInCup(g);
export const userCupTie = (g: GameState): CupTie | undefined => {
  if (!g.cup?.due) return undefined;
  return g.cup.rounds[g.cup.roundIndex].ties.find((t) => t.homeId === g.userClubId || t.awayId === g.userClubId);
};

/** Depois de uma rodada do campeonato: abre a fase da copa se for a data; se o seu clube não joga, ela é simulada na hora. */
export function cupAfterLeagueRound(g: GameState): GameState {
  const c = g.cup;
  if (!c || c.due || c.championId || c.roundIndex >= c.totalRounds) return g;
  if (g.round - 1 !== c.dueAfter[c.roundIndex]) return g;
  const opened = { ...g, cup: { ...c, due: true } };
  return userInCup(opened) ? opened : playCupRound(opened).state;
}

const lineupTeam = (g: GameState, id: string): TeamState => {
  const t = g.teams[id];
  return id === g.userClubId && !g.unemployed ? t : { ...t, lineup: autoLineup(t.players, t.formation) };
};

/** Penalidades: 5 cobranças cada e depois alternadas; devolve o placar e o vencedor (leve vantagem de quem tem melhor goleiro). */
export function shootout(rng: Rng, homeGk: number, awayGk: number): [number, number] {
  const pH = 0.78 - (awayGk - homeGk) * 0.002, pA = 0.78 - (homeGk - awayGk) * 0.002;
  let h = 0, a = 0;
  for (let i = 0; i < 5; i++) { if (rng() < pH) h++; if (rng() < pA) a++; }
  while (h === a) { if (rng() < pH) h++; if (rng() < pA) a++; }
  return [h, a];
}

/** Joga a fase da copa que está esperando. O resultado do jogo do seu clube traz os lances para a narração. */
export function playCupRound(g: GameState): { state: GameState; results: MatchResult[] } {
  const cup = g.cup;
  if (!cup || !cup.due) return { state: g, results: [] };
  const rng = makeRng(g.seed * 7919 + g.season * 131 + cup.roundIndex * 17 + 3);
  const factor = moraleFactor(g.morale.team);
  const round = cup.rounds[cup.roundIndex];
  const results: MatchResult[] = [];
  const news: NewsItem[] = [];
  const ties: CupTie[] = round.ties.map((t) => {
    const mods = { home: t.homeId === g.userClubId ? factor : 1, away: t.awayId === g.userClubId ? factor : 1 };
    const out = simulateMatch(lineupTeam(g, t.homeId), lineupTeam(g, t.awayId), rng, mods, { home: g.clubs[t.homeId].name, away: g.clubs[t.awayId].name });
    let pens: [number, number] | undefined;
    let winnerId = out.homeGoals > out.awayGoals ? t.homeId : out.awayGoals > out.homeGoals ? t.awayId : '';
    if (!winnerId) {
      const gk = (id: string) => teamRatings(g.teams[id]).gk;
      pens = shootout(rng, gk(t.homeId), gk(t.awayId));
      winnerId = pens[0] > pens[1] ? t.homeId : t.awayId;
    }
    const mine = t.homeId === g.userClubId || t.awayId === g.userClubId;
    results.push({ divisionId: cup.id, round: cup.roundIndex + 1, homeId: t.homeId, awayId: t.awayId, homeGoals: out.homeGoals, awayGoals: out.awayGoals, events: mine ? out.events : [] });
    if (mine) {
      const rival = g.clubs[t.homeId === g.userClubId ? t.awayId : t.homeId].name;
      const penTxt = pens ? ` nos pênaltis (${pens[0]}–${pens[1]})` : '';
      if (winnerId === g.userClubId) news.push({ season: g.season, round: g.round, text: cup.roundIndex === cup.totalRounds - 1 ? `🏆 Campeão da ${cup.name}!` : `${cup.name}: você eliminou o ${rival}${penTxt} (${round.name}).`, tone: 'good' });
      else news.push({ season: g.season, round: g.round, text: `${cup.name}: eliminado pelo ${rival}${penTxt} (${round.name}).`, tone: 'bad' });
    }
    return { ...t, homeGoals: out.homeGoals, awayGoals: out.awayGoals, pens, winnerId };
  });

  const winners = ties.map((t) => t.winnerId!);
  const budgets = { ...g.budgets };
  for (const w of winners) budgets[w] = (budgets[w] ?? 0) + CUP_PRIZE[CUP_PRIZE.length - cup.totalRounds + cup.roundIndex];
  const rounds = [...cup.rounds.slice(0, cup.roundIndex), { ...round, ties }];
  const finished = winners.length === 1;
  if (!finished) rounds.push({ name: CUP_ROUND_NAMES[CUP_ROUND_NAMES.length - cup.totalRounds + cup.roundIndex + 1], ties: pair(rng, winners) });
  const next: CupState = { ...cup, rounds, roundIndex: cup.roundIndex + 1, due: false, alive: winners, championId: finished ? winners[0] : undefined };
  const state: GameState = { ...g, budgets, cup: next, news: [...news, ...g.news].slice(0, 80) };
  return { state, results };
}
