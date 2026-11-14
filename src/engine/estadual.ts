import { ESTADUAIS } from '../data/br_estaduais';
import { ESTADUAL_SPLIT, estadualClub, estadualClubsOf } from '../data/estaduais_clubs';
import { clubOf, managed, teamOf } from './lookup';
import { moraleFactor } from './morale';
import { simulateMatch } from './match';
import { makeRng, type Rng } from './rng';
import { buildFixtures } from './schedule';
import { autoLineup, teamRatings } from './squad';
import { computeTable } from './table';
import type { EstadualComp, EstadualDivision, EstadualState, Fixture, GameState, MatchResult, TableRow, TeamState } from './types';

export const ESTADUAL_ID = 'estadual';
/** Prêmio do campeão da Série A do estadual (R$). */
export const ESTADUAL_PRIZE = 1_000_000;
const DIVISION_NAMES = ['Série A', 'Série B'];

/** Rodadas de um estadual em turno único (com número ímpar de clubes, um folga em cada rodada). */
export const singleRounds = (n: number) => (n % 2 ? n : n - 1);

const FX = new Map<string, Fixture[]>();
function fixturesOf(clubIds: string[]): Fixture[] {
  const key = clubIds.join('|');
  let f = FX.get(key);
  if (!f) { const n = singleRounds(clubIds.length); f = buildFixtures(clubIds, '').fixtures.filter((x) => x.round <= n); FX.set(key, f); }
  return f;
}

const totalStepsOf = (comps: EstadualComp[]) => Math.max(...comps.flatMap((c) => c.divisions.map((d) => singleRounds(d.clubIds.length))));

function initialComps(): EstadualComp[] {
  return ESTADUAIS.map((e) => {
    const clubs = estadualClubsOf(e.uf).map((c) => c.id);
    const split = ESTADUAL_SPLIT[e.uf];
    const divisions: EstadualDivision[] = split
      ? split.map((_, i) => ({ name: DIVISION_NAMES[i], clubIds: clubs.slice(split.slice(0, i).reduce((a, b) => a + b, 0), split.slice(0, i + 1).reduce((a, b) => a + b, 0)), matches: [] }))
      : [{ name: 'Série A', clubIds: clubs, matches: [] }];
    return { uf: e.uf, name: e.name, divisions };
  });
}

/** Os 27 estaduais da temporada, prontos para começar (a primeira rodada espera o início da temporada). */
export function createEstaduais(): EstadualState {
  const comps = initialComps();
  return { id: ESTADUAL_ID, comps, step: 1, totalSteps: totalStepsOf(comps), due: true, done: false };
}

/** Classificação de uma divisão de estadual. */
export function estadualTable(g: GameState, d: EstadualDivision, upTo = 999): TableRow[] {
  const nameOf = (id: string) => clubOf(g, id).name;
  const results: MatchResult[] = d.matches.filter((m) => m[0] <= upTo).map(([round, h, a, hg, ag]) => ({ divisionId: ESTADUAL_ID, round, homeId: d.clubIds[h], awayId: d.clubIds[a], homeGoals: hg, awayGoals: ag, events: [] }));
  return computeTable(d.clubIds.map((id) => ({ id, name: nameOf(id) })), results);
}

/** Próxima temporada: nos 3 estados com Série B, os 2 últimos da A trocam de lugar com os 2 primeiros da B. */
export function nextEstaduais(g: GameState, prev: EstadualState): EstadualState {
  const comps = prev.comps.map((c) => {
    if (c.divisions.length < 2) return { ...c, divisions: c.divisions.map((d) => ({ ...d, matches: [] })) };
    const [a, b] = c.divisions;
    const ta = estadualTable(g, a).map((r) => r.clubId), tb = estadualTable(g, b).map((r) => r.clubId);
    const down = ta.slice(-2), up = tb.slice(0, 2);
    return { ...c, divisions: [{ ...a, clubIds: [...ta.filter((id) => !down.includes(id)), ...up], matches: [] }, { ...b, clubIds: [...tb.filter((id) => !up.includes(id)), ...down], matches: [] }] };
  });
  return { id: ESTADUAL_ID, comps, step: 1, totalSteps: totalStepsOf(comps), due: true, done: false };
}

export const estadualOfUser = (g: GameState): { comp: EstadualComp; div: EstadualDivision; divIndex: number } | undefined => {
  if (!g.estadual) return undefined;
  for (const comp of g.estadual.comps) for (let i = 0; i < comp.divisions.length; i++) if (comp.divisions[i].clubIds.includes(g.userClubId)) return { comp, div: comp.divisions[i], divIndex: i };
  return undefined;
};

/** O jogo do seu clube na rodada atual do estadual (se houver). */
export function userEstadualMatch(g: GameState): { homeId: string; awayId: string } | undefined {
  const e = g.estadual;
  const mine = estadualOfUser(g);
  if (!e?.due || !mine || g.unemployed) return undefined;
  const f = fixturesOf(mine.div.clubIds).find((x) => x.round === e.step && (x.homeId === g.userClubId || x.awayId === g.userClubId));
  return f ? { homeId: f.homeId, awayId: f.awayId } : undefined;
}

const poisson = (rng: Rng, lambda: number): number => { const L = Math.exp(-lambda); let k = 0, p = 1; do { k++; p *= rng(); } while (p > L && k < 12); return k - 1; };

/** Placar rápido entre duas forças (para jogos em que o seu clube não está). */
export function quickScore(rng: Rng, rh: number, ra: number): [number, number] {
  const d = rh - ra;
  return [poisson(rng, Math.min(4, 1.5 * Math.exp(0.035 * d))), poisson(rng, Math.min(4, 1.1 * Math.exp(-0.035 * d)))];
}

/** Joga a rodada atual de todos os estaduais. Se o seu clube joga, o jogo dele é simulado em detalhe (com narração). */
export function playEstadualStep(g: GameState): { state: GameState; results: MatchResult[] } {
  const e = g.estadual;
  if (!e || !e.due) return { state: g, results: [] };
  const step = e.step;
  const rng = makeRng(g.seed * 8191 + g.season * 131 + step * 17 + 5);
  const results: MatchResult[] = [];
  const ratingCache = new Map<string, number>();
  const rating = (id: string) => { let r = ratingCache.get(id); if (r === undefined) { r = g.teams[id] ? teamRatings(g.teams[id]).overall : (estadualClub(id)?.rating ?? 45); ratingCache.set(id, r); } return r; };
  const lineup = (id: string): TeamState => { const t = teamOf(g, id); return managed(g, id) ? t : { ...t, lineup: autoLineup(t.players, t.formation) }; };
  const factor = moraleFactor(g.morale.team);

  const comps: EstadualComp[] = e.comps.map((c) => ({
    ...c,
    divisions: c.divisions.map((d) => {
      const add = fixturesOf(d.clubIds).filter((f) => f.round === step).map((f): [number, number, number, number, number] => {
        const mine = managed(g, f.homeId) || managed(g, f.awayId);
        let hg: number, ag: number;
        if (mine) {
          const mods = { home: managed(g, f.homeId) ? factor : 1, away: managed(g, f.awayId) ? factor : 1 };
          const out = simulateMatch(lineup(f.homeId), lineup(f.awayId), rng, mods, { home: clubOf(g, f.homeId).name, away: clubOf(g, f.awayId).name });
          hg = out.homeGoals; ag = out.awayGoals;
          results.push({ divisionId: ESTADUAL_ID, round: step, homeId: f.homeId, awayId: f.awayId, homeGoals: hg, awayGoals: ag, events: out.events });
        } else [hg, ag] = quickScore(rng, rating(f.homeId), rating(f.awayId));
        return [step, d.clubIds.indexOf(f.homeId), d.clubIds.indexOf(f.awayId), hg, ag];
      });
      return { ...d, matches: [...d.matches, ...add] };
    }),
  }));

  const done = step >= e.totalSteps;
  let state: GameState = { ...g, estadual: { ...e, comps, step: done ? step : step + 1, due: !done, done } };
  if (done) {
    // campeões recebem um prêmio e o seu estado vira notícia
    const budgets = { ...state.budgets };
    const news = [...state.news];
    for (const c of comps) {
      const champ = estadualTable(state, c.divisions[0])[0].clubId;
      if (champ in budgets) budgets[champ] += ESTADUAL_PRIZE;
      if (!g.unemployed && !g.observer && c.divisions.some((d) => d.clubIds.includes(g.userClubId))) {
        const mineDiv = c.divisions.find((d) => d.clubIds.includes(g.userClubId))!;
        const pos = estadualTable(state, mineDiv).findIndex((r) => r.clubId === g.userClubId) + 1;
        news.unshift({ season: g.season, round: g.round, text: pos === 1 ? `🏆 Campeão do ${c.name}${mineDiv === c.divisions[0] ? '' : ' (Série B)'}!` : `🏟️ ${c.name}: você terminou em ${pos}º lugar.`, tone: pos === 1 ? 'good' : pos <= 4 ? 'info' : 'bad' });
      }
    }
    state = { ...state, budgets, news: news.slice(0, 80) };
  }
  return { state, results };
}

/** Campeões de todos os estaduais (para o histórico). */
export function estadualChampions(g: GameState): NonNullable<import('./types').SeasonSummary['estadualChampions']> {
  return (g.estadual?.comps ?? []).map((c) => ({ uf: c.uf, name: c.name, divisions: c.divisions.map((d) => ({ name: d.name, championId: estadualTable(g, d)[0]?.clubId ?? '' })).filter((x) => x.championId) }));
}
