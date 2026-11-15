import { ESTADUAIS } from '../data/br_estaduais';
import { ESTADUAL_SPLIT, estadualClub, estadualClubsOf } from '../data/estaduais_clubs';
import { inflate, prize } from './economy';
import { clubOf, managed, teamOf } from './lookup';
import { moraleFactor } from './morale';
import { simulateMatch } from './match';
import { makeRng, type Rng } from './rng';
import { buildFixtures } from './schedule';
import { teamRatings } from './squad';
import { injuredSet } from './injuries';
import { aiLineup } from './rotation';
import { penaltyTakers, shootoutKicks } from './cup';
import { computeTable } from './table';
import type { EstadualComp, EstadualDivision, EstadualState, Fixture, GameState, MatchResult, TableRow, TeamState } from './types';

export const ESTADUAL_ID = 'estadual';
/** Divisões com pelo menos esse número de clubes têm mata-mata (semifinais ida/volta e final); as menores decidem por pontos. */
export const PLAYOFF_MIN = 6;
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
export function createEstaduais(extra?: { id: string; uf: string }): EstadualState {
  const comps = initialComps();
  if (extra) { // clube criado pelo jogador: entra na divisão mais baixa do estado
    const c = comps.find((x) => x.uf === extra.uf);
    if (c && !c.divisions.some((d) => d.clubIds.includes(extra.id))) c.divisions[c.divisions.length - 1].clubIds.push(extra.id);
  }
  return fresh(comps);
}

function fresh(comps: EstadualComp[]): EstadualState {
  const leagueSteps = totalStepsOf(comps);
  return { id: ESTADUAL_ID, comps, step: 1, totalSteps: leagueSteps + 3, leagueSteps, due: true, done: false };
}

/** Classificação de uma divisão de estadual. */
export function estadualTable(g: GameState, d: EstadualDivision, upTo = 999): TableRow[] {
  const nameOf = (id: string) => clubOf(g, id).name;
  const lim = Math.min(upTo, g.estadual?.leagueSteps ?? 999); // o mata-mata não conta na tabela de pontos
  const results: MatchResult[] = d.matches.filter((m) => m[0] <= lim).map(([round, h, a, hg, ag]) => ({ divisionId: ESTADUAL_ID, round, homeId: d.clubIds[h], awayId: d.clubIds[a], homeGoals: hg, awayGoals: ag, events: [] }));
  return computeTable(d.clubIds.map((id) => ({ id, name: nameOf(id) })), results);
}

/** Próxima temporada: nos 3 estados com Série B, os 2 últimos da A trocam de lugar com os 2 primeiros da B. */
export function nextEstaduais(g: GameState, prev: EstadualState): EstadualState {
  const comps = prev.comps.map((c) => {
    if (c.divisions.length < 2) return { ...c, divisions: c.divisions.map((d) => ({ ...d, matches: [] })) };
    const [a, b] = c.divisions;
    const ta = estadualRanking(g, a), tb = estadualRanking(g, b);
    const down = ta.slice(-2), up = tb.slice(0, 2);
    return { ...c, divisions: [{ ...a, clubIds: [...ta.filter((id) => !down.includes(id)), ...up], matches: [] }, { ...b, clubIds: [...tb.filter((id) => !up.includes(id)), ...down], matches: [] }] };
  });
  return fresh(comps);
}

export const estadualOfUser = (g: GameState): { comp: EstadualComp; div: EstadualDivision; divIndex: number } | undefined => {
  if (!g.estadual) return undefined;
  for (const comp of g.estadual.comps) for (let i = 0; i < comp.divisions.length; i++) if (comp.divisions[i].clubIds.includes(g.userClubId)) return { comp, div: comp.divisions[i], divIndex: i };
  return undefined;
};


/* ---------- mata-mata: 4 primeiros, semifinais (ida e volta) e final em jogo único ---------- */

export const hasPlayoff = (e: EstadualState | undefined, d: EstadualDivision): boolean => !!e && e.leagueSteps !== undefined && d.clubIds.length >= PLAYOFF_MIN;

export interface PlayoffTie { hi: string; lo: string; leg1?: [number, number]; leg2?: [number, number]; pens?: [number, number]; winner?: string }
export interface Playoff { seeds: string[]; semis: PlayoffTie[]; final?: { home: string; away: string; score?: [number, number]; pens?: [number, number]; winner?: string }; champion?: string; runnerUp?: string }

/** Situação do mata-mata de uma divisão (só existe depois da fase de pontos corridos). */
export function playoffOf(g: GameState, d: EstadualDivision): Playoff | undefined {
  const e = g.estadual;
  if (!e || !hasPlayoff(e, d)) return undefined;
  const L = e.leagueSteps!;
  if (!(e.done || e.step > L)) return undefined;
  const seeds = estadualTable(g, d).slice(0, 4).map((r) => r.clubId);
  const ix = (id: string) => d.clubIds.indexOf(id);
  const mu = (round: number, h: string, a: string) => d.matches.find((m) => m[0] === round && m[1] === ix(h) && m[2] === ix(a));
  const pn = (round: number, h: string, a: string): [number, number] | undefined => { const p = d.pens?.find((x) => x[0] === round && x[1] === ix(h) && x[2] === ix(a)); return p ? [p[3], p[4]] : undefined; };
  const tie = (hi: string, lo: string): PlayoffTie => {
    const m1 = mu(L + 1, lo, hi), m2 = mu(L + 2, hi, lo);
    const t: PlayoffTie = { hi, lo, ...(m1 ? { leg1: [m1[3], m1[4]] as [number, number] } : {}), ...(m2 ? { leg2: [m2[3], m2[4]] as [number, number] } : {}) };
    if (m1 && m2) {
      const hiG = m1[4] + m2[3], loG = m1[3] + m2[4];
      if (hiG !== loG) t.winner = hiG > loG ? hi : lo;
      else { const p = pn(L + 2, hi, lo); if (p) { t.pens = p; t.winner = p[0] > p[1] ? hi : lo; } }
    }
    return t;
  };
  const semis = [tie(seeds[0], seeds[3]), tie(seeds[1], seeds[2])];
  const out: Playoff = { seeds, semis };
  if (semis[0].winner && semis[1].winner) {
    const [a, b] = [semis[0].winner, semis[1].winner].sort((x, y) => seeds.indexOf(x) - seeds.indexOf(y)); // melhor campanha joga em casa
    const m = mu(L + 3, a, b);
    out.final = { home: a, away: b };
    if (m) {
      out.final.score = [m[3], m[4]];
      const p = pn(L + 3, a, b);
      if (m[3] !== m[4]) out.final.winner = m[3] > m[4] ? a : b; else if (p) { out.final.pens = p; out.final.winner = p[0] > p[1] ? a : b; }
      if (out.final.winner) { out.champion = out.final.winner; out.runnerUp = out.final.winner === a ? b : a; }
    }
  }
  return out;
}

/** Classificação final de uma divisão: campeão, vice, semifinalistas e os demais pela tabela de pontos. */
export function estadualRanking(g: GameState, d: EstadualDivision): string[] {
  const league = estadualTable(g, d).map((r) => r.clubId);
  const po = playoffOf(g, d);
  if (!po?.champion) return league;
  const semiLosers = po.seeds.filter((id) => id !== po.champion && id !== po.runnerUp);
  const top = [po.champion, po.runnerUp!, ...semiLosers];
  return [...top, ...league.filter((id) => !top.includes(id))];
}

/** Jogos de uma divisão numa rodada: pontos corridos, semifinal (ida ou volta) ou final. */
export function fixturesAt(g: GameState, d: EstadualDivision, step: number): { homeId: string; awayId: string }[] {
  const e = g.estadual;
  const n = singleRounds(d.clubIds.length);
  if (!e || step <= (e.leagueSteps ?? 999) || !hasPlayoff(e, d)) {
    if (step > n) return [];
    return fixturesOf(d.clubIds).filter((x) => x.round === step).map((x) => ({ homeId: x.homeId, awayId: x.awayId }));
  }
  const po = playoffOf({ ...g, estadual: { ...e, step: Math.max(e.step, (e.leagueSteps ?? 0) + 1) } }, d);
  if (!po) return [];
  const k = step - e.leagueSteps!; // 1 = semi ida, 2 = semi volta, 3 = final
  if (k === 1) return po.semis.map((t) => ({ homeId: t.lo, awayId: t.hi }));
  if (k === 2) return po.semis.map((t) => ({ homeId: t.hi, awayId: t.lo }));
  return po.final && !po.final.score ? [{ homeId: po.final.home, awayId: po.final.away }] : [];
}

/** Nome da fase de uma rodada do estadual. */
export function stepLabel(e: EstadualState, step: number): string {
  if (e.leagueSteps === undefined || step <= e.leagueSteps) return `Rodada ${step}`;
  return ['Semifinal · ida', 'Semifinal · volta', 'Final'][step - e.leagueSteps - 1] ?? `Rodada ${step}`;
}

/** Jogo do seu clube numa rodada do estadual (undefined = folga). */
export function userEstadualMatchAt(g: GameState, step: number): { homeId: string; awayId: string } | undefined {
  const mine = estadualOfUser(g);
  if (!mine || g.unemployed) return undefined;
  const f = fixturesAt(g, mine.div, step).find((x) => x.homeId === g.userClubId || x.awayId === g.userClubId);
  return f ? { homeId: f.homeId, awayId: f.awayId } : undefined;
}

export function userEstadualMatch(g: GameState): { homeId: string; awayId: string } | undefined {
  const e = g.estadual;
  const mine = estadualOfUser(g);
  if (!e?.due || !mine || g.unemployed) return undefined;
  const f = fixturesAt(g, mine.div, e.step).find((x) => x.homeId === g.userClubId || x.awayId === g.userClubId);
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
  const injSet = injuredSet(g);
  const lineup = (id: string): TeamState => { const t = teamOf(g, id); return managed(g, id) ? t : { ...t, lineup: aiLineup(g, t, injSet, 1.1) }; };
  const factor = moraleFactor(g.morale.team);

  const comps: EstadualComp[] = e.comps.map((c) => ({
    ...c,
    divisions: c.divisions.map((d) => {
      const pensAdd: [number, number, number, number, number][] = [];
      const k = e.leagueSteps === undefined || !hasPlayoff(e, d) ? 0 : step - e.leagueSteps; // 2 = volta da semi, 3 = final
      const add = fixturesAt(g, d, step).map((f): [number, number, number, number, number] => {
        const mine = managed(g, f.homeId) || managed(g, f.awayId);
        let hg: number, ag: number;
        if (mine) {
          const mods = { home: managed(g, f.homeId) ? factor : 1, away: managed(g, f.awayId) ? factor : 1 };
          const out = simulateMatch(lineup(f.homeId), lineup(f.awayId), rng, mods, { home: clubOf(g, f.homeId).name, away: clubOf(g, f.awayId).name });
          hg = out.homeGoals; ag = out.awayGoals;
          results.push({ divisionId: ESTADUAL_ID, round: step, homeId: f.homeId, awayId: f.awayId, homeGoals: hg, awayGoals: ag, events: out.events });
        } else [hg, ag] = quickScore(rng, rating(f.homeId), rating(f.awayId));
        // mata-mata empatado (no agregado da semifinal ou na final): pênaltis
        let tied = false;
        if (k === 3) tied = hg === ag;
        else if (k === 2) { const l1 = d.matches.find((m) => m[0] === step - 1 && m[1] === d.clubIds.indexOf(f.awayId) && m[2] === d.clubIds.indexOf(f.homeId)); tied = !!l1 && l1[4] + hg === l1[3] + ag; }
        if (tied) {
          const gk = (id: string) => teamRatings(lineup(id)).gk;
          const sk = shootoutKicks(rng, gk(f.homeId), gk(f.awayId), mine ? penaltyTakers(lineup(f.homeId)) : [], mine ? penaltyTakers(lineup(f.awayId)) : []);
          pensAdd.push([step, d.clubIds.indexOf(f.homeId), d.clubIds.indexOf(f.awayId), sk.score[0], sk.score[1]]);
          if (mine) { const r = results[results.length - 1]; r.pens = sk.score; r.penKicks = { home: sk.home, away: sk.away }; }
        }
        return [step, d.clubIds.indexOf(f.homeId), d.clubIds.indexOf(f.awayId), hg, ag];
      });
      return { ...d, matches: [...d.matches, ...add], ...(pensAdd.length ? { pens: [...(d.pens ?? []), ...pensAdd] } : {}) };
    }),
  }));

  const done = step >= e.totalSteps;
  let state: GameState = { ...g, estadual: { ...e, comps, step: done ? step : step + 1, due: !done, done } };
  if (done) {
    // campeões recebem um prêmio e o seu estado vira notícia
    const budgets = { ...state.budgets };
    const news = [...state.news];
    for (const c of comps) {
      const champ = estadualRanking(state, c.divisions[0])[0];
      if (champ in budgets) budgets[champ] += prize(g, ESTADUAL_PRIZE);
      if (!g.unemployed && !g.observer && c.divisions.some((d) => d.clubIds.includes(g.userClubId))) {
        const mineDiv = c.divisions.find((d) => d.clubIds.includes(g.userClubId))!;
        const pos = estadualRanking(state, mineDiv).indexOf(g.userClubId) + 1;
        const champName = clubOf(g, estadualRanking(state, mineDiv)[0]).name;
        news.unshift({ season: g.season, round: g.round, text: pos === 1 ? `🏆 Campeão do ${c.name}${mineDiv === c.divisions[0] ? '' : ' (Série B)'}!` : `🏟️ ${c.name} encerrado: campeão ${champName}; você terminou em ${pos}º lugar.`, tone: pos === 1 ? 'good' : pos <= 4 ? 'info' : 'bad' });
      }
    }
    state = { ...state, budgets, news: news.slice(0, 80) };
  }
  return { state, results };
}

/** Campeões de todos os estaduais (para o histórico). */
export function estadualChampions(g: GameState): NonNullable<import('./types').SeasonSummary['estadualChampions']> {
  return (g.estadual?.comps ?? []).map((c) => ({ uf: c.uf, name: c.name, divisions: c.divisions.map((d) => ({ name: d.name, championId: estadualRanking(g, d)[0] ?? '' })).filter((x) => x.championId) }));
}

/* ---------- caminho dos estaduais até a Série D ---------- */

/** Quantos clubes de estadual entram na Série D a cada ano (e quantos da D saem para os estaduais). */
export const SERIE_D_SLOTS = 8;

const ratingOf = (g: GameState, id: string) => (g.teams[id] ? teamRatings(g.teams[id]).overall : (estadualClub(id)?.rating ?? 40));

/**
 * Clubes que sobem dos estaduais para a Série D: em cada estado, o melhor colocado da Série A estadual que não esteja na pirâmide
 * (se terminou entre os 2 primeiros). Entram os 8 de maior força; o clube do jogador, se for um deles, sempre entra.
 */
export function serieDQualifiers(g: GameState): string[] {
  if (!g.estadual?.done) return [];
  const pyramid = new Set(g.divisions.filter((d) => d.format !== 'outside').flatMap((d) => d.clubIds));
  const cands: string[] = [];
  for (const c of g.estadual.comps) {
    const rows = estadualRanking(g, c.divisions[0]);
    const i = rows.findIndex((id) => !pyramid.has(id));
    if (i >= 0 && i < 2) cands.push(rows[i]);
  }
  const mine = cands.includes(g.userClubId) && !g.unemployed ? g.userClubId : undefined;
  const picked = cands.filter((id) => id !== mine).sort((a, b) => ratingOf(g, b) - ratingOf(g, a)).slice(0, SERIE_D_SLOTS - (mine ? 1 : 0));
  return mine ? [mine, ...picked] : picked;
}

/** Traz para o jogo um clube de estadual que sobe à Série D: elenco, orçamento e ficha. */
export function adoptClub(g: GameState, id: string): GameState {
  if (g.teams[id]) return g;
  const c = estadualClub(id);
  if (!c) return g;
  const team = teamOf(g, id);
  const info = clubOf(g, id);
  return { ...g, teams: { ...g.teams, [id]: team }, clubs: { ...g.clubs, [id]: { ...info, reputation: 1 } }, budgets: { ...g.budgets, [id]: inflate(g, 1_500_000) } };
}

/** Resumo do estadual encerrado para o seu clube (aviso de fim): campeão, posição final e vaga na Série D. */
export interface EstadualSummary { compName: string; divName: string; championId: string; runnerUpId?: string; pos: number; size: number; playoff: boolean; outside: boolean; serieD: boolean }
export function estadualSummary(g: GameState): EstadualSummary | undefined {
  const mine = estadualOfUser(g);
  if (!g.estadual?.done || !mine || g.unemployed || g.observer) return undefined;
  const rank = estadualRanking(g, mine.div);
  const outside = g.divisions.some((d) => d.format === 'outside' && d.clubIds.includes(g.userClubId));
  return { compName: mine.comp.name, divName: mine.div.name, championId: rank[0], runnerUpId: rank[1], pos: rank.indexOf(g.userClubId) + 1, size: rank.length, playoff: hasPlayoff(g.estadual, mine.div), outside, serieD: serieDQualifiers(g).includes(g.userClubId) };
}
