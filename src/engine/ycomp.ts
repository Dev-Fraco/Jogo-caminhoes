import { CATEGORIES, categoryDef, type CategoryId } from './categories';
import { CUP_ROUND_NAMES } from './cup';
import { CONTINENTALS, type Comp } from './continental';
import { estadualOfUser, hasPlayoff, singleRounds } from './estadual';
import { GROUP_ROUNDS, isGroups, KO_NAMES } from './groups';
import { logSpend } from './academy';
import { simulateMatch } from './match';
import { clubOf } from './lookup';
import { clamp, hashString, makeRng, type Rng } from './rng';
import { calOf } from './calendar';
import { buildFixtures } from './schedule';
import { computeTable } from './table';
import { enrollCheck, MIN_ROSTER, pickTeam, prepMods, rosterOf, youthName } from './yroster';
import type { GameState, NewsItem, Player, TableRow } from './types';

/* =====================================================================
   Competições das categorias de base (ETAPA 5).
   Cada competição de base copia uma competição profissional em que o SEU clube joga (estadual, divisão nacional, Copa do Brasil e
   continentais), com os mesmos participantes, nome e formato (pontos corridos, grupos + mata-mata, mata-mata, estadual com semifinais
   de ida e volta e final). Ela anda sozinha junto com a competição profissional (youthSync) e usa o motor de partidas existente
   (simulateMatch) com os jovens da base: o profissional não é tocado. O usuário acompanha; quem escala é o treinador / a IA.
   ===================================================================== */

export type SrcId = 'estadual' | 'liga' | 'copa' | Comp;
export type YPlan =
  | { k: 'rr'; n: number; legs: 1 | 2; at: number }
  | { k: 'ko'; name: string; mode: 'seeds' | 'winners' | 'cross' | 'semis' | 'final'; legs: 1 | 2; at: number };
/** [etapa, mandante (índice em clubs), visitante, gols casa, gols fora, pênaltis casa, pênaltis fora, W.O. (1)] */
export type YMatch = [number, number, number, number, number, number, number, number];
/** [gols, assistências, jogos, minutos, amarelos, vermelhos, gols sofridos (goleiro), posição (0 GK,1 DEF,2 MEI,3 ATA), idade] */
export type YStat = number[];
export interface YAwards { scorer?: string; best?: string; gk?: string; rev?: string }
export interface YComp {
  id: string; src: SrcId; cat: CategoryId; name: string; season: number;
  /** Inscritos (quem não tinha atletas suficientes ficou de fora) e não inscritos. */
  clubs: string[]; absent: string[];
  groups?: string[][];
  seeds?: [string, string][];
  plan: YPlan[];
  /** Etapas já jogadas. */
  done: number;
  m: YMatch[];
  st: Record<string, YStat>;
  /** Nomes dos jogadores do SEU clube (os da IA saem do id). */
  nm: Record<string, string>;
  /** Mata-mata em andamento: pares da rodada e vencedores já definidos (na ordem do chaveamento). */
  cur?: [string, string][]; alive?: string[];
  champion?: string; runnerUp?: string; finalText?: string;
  aw?: YAwards;
  paid?: boolean;
}
export interface YHist {
  season: number; cat: CategoryId; src: SrcId; name: string;
  champion?: string; runnerUp?: string; final?: string;
  scorer?: { name: string; club: string; goals: number }; best?: { name: string; club: string }; gk?: { name: string; club: string }; rev?: { name: string; club: string };
  top?: { name: string; club: string; goals: number }[];
  mine?: string;
  /** Desempenho do seu clube (0 a 1): campeão 1, vice 0,85, senão pela posição na tabela. Alimenta a avaliação do treinador. */
  r?: number;
}
export const YHIST_KEEP = 12;
const POS_CODE: Record<string, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
export const SRC_LABEL: Record<SrcId, string> = { estadual: 'Estadual', liga: 'Campeonato nacional', copa: 'Copa nacional', lib: 'Continental', sula: 'Continental', ucl: 'Continental' };
const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });

/* ----------------------------- passos e fixtures ----------------------------- */

export interface YStep { plan: YPlan; at: number; round: number; leg: 1 | 2; name: string; index: number }
export function stepsOf(c: Pick<YComp, 'plan'>): YStep[] {
  const out: YStep[] = [];
  for (const p of c.plan) {
    if (p.k === 'rr') for (let r = 1; r <= p.n; r++) out.push({ plan: p, at: p.at + r - 1, round: r, leg: 1, name: `Rodada ${r}`, index: out.length });
    else if (p.legs === 2) { out.push({ plan: p, at: p.at, round: 1, leg: 1, name: `${p.name} · ida`, index: out.length }); out.push({ plan: p, at: p.at + 1, round: 1, leg: 2, name: `${p.name} · volta`, index: out.length }); }
    else out.push({ plan: p, at: p.at, round: 1, leg: 1, name: p.name, index: out.length });
  }
  return out;
}
export const totalSteps = (c: Pick<YComp, 'plan'>): number => stepsOf(c).length;
export const isFinished = (c: Pick<YComp, 'done' | 'plan'>): boolean => c.done >= totalSteps(c);

const RR = new Map<string, { homeId: string; awayId: string; round: number }[]>();
function rrFixtures(ids: string[], legs: 1 | 2): { homeId: string; awayId: string; round: number }[] {
  const key = `${legs}|${ids.join(',')}`;
  let f = RR.get(key);
  if (!f) {
    const all = buildFixtures(ids, '').fixtures;
    const n = singleRounds(ids.length);
    f = (legs === 1 ? all.filter((x) => x.round <= n) : all).map((x) => ({ homeId: x.homeId, awayId: x.awayId, round: x.round }));
    if (RR.size > 400) RR.clear();
    RR.set(key, f);
  }
  return f;
}
export const rrRounds = (m: number, legs: 1 | 2): number => (legs === 1 ? singleRounds(m) : 2 * (m % 2 ? m : m - 1));

/** Resultados da fase de pontos (rodadas) como MatchResult para a tabela. */
const rrStepCount = (c: Pick<YComp, 'plan'>): number => c.plan.reduce((t, p) => t + (p.k === 'rr' ? p.n : 0), 0);
const rrMatches = (c: YComp) => { const n = rrStepCount(c); return c.m.filter((x) => x[0] < n); };
const toResult = (c: YComp, x: YMatch) => ({ divisionId: c.id, round: x[0] + 1, homeId: c.clubs[x[1]], awayId: c.clubs[x[2]], homeGoals: x[3], awayGoals: x[4], events: [] });

/** Classificação (de cada grupo, quando há grupos). */
export function tablesOf(g: GameState, c: YComp): { name: string; rows: TableRow[] }[] {
  const res = rrMatches(c).map((x) => toResult(c, x));
  const nm = (id: string) => ({ id, name: clubOf(g, id)?.name ?? id });
  if (c.groups) return c.groups.map((ids, i) => ({ name: `Grupo ${String.fromCharCode(65 + i)}`, rows: computeTable(ids.map(nm), res.filter((r) => ids.includes(r.homeId))) }));
  return [{ name: 'Classificação', rows: computeTable(c.clubs.map(nm), res) }];
}

/* ----------------------------- criação ----------------------------- */

interface Src { src: SrcId; name: string; clubs: string[]; groups?: string[][]; seeds?: [string, string][]; plan: YPlan[] }

/** As competições profissionais em que o seu clube joga nesta temporada, com participantes e formato. */
function sourcesOf(g: GameState): Src[] {
  const out: Src[] = [];
  const me = g.userClubId;
  const mine = estadualOfUser(g);
  if (mine && g.estadual) {
    const e = g.estadual, ids = mine.div.clubIds, n = singleRounds(ids.length);
    const plan: YPlan[] = [{ k: 'rr', n, legs: 1, at: 1 }];
    if (hasPlayoff(e, mine.div)) plan.push({ k: 'ko', name: 'Semifinal', mode: 'semis', legs: 2, at: (e.leagueSteps ?? n) + 1 }, { k: 'ko', name: 'Final', mode: 'final', legs: 1, at: (e.leagueSteps ?? n) + 3 });
    out.push({ src: 'estadual', name: mine.comp.divisions.length > 1 ? `${mine.comp.name} · ${mine.div.name}` : mine.comp.name, clubs: ids, plan });
  }
  const d = g.divisions.find((x) => x.clubIds.includes(me));
  if (d && d.format !== 'outside') {
    if (isGroups(d) && d.groups) {
      const plan: YPlan[] = [{ k: 'rr', n: GROUP_ROUNDS, legs: 2, at: 1 }];
      KO_NAMES.forEach((name, i) => plan.push({ k: 'ko', name, mode: i === 0 ? 'cross' : i === KO_NAMES.length - 1 ? 'final' : 'winners', legs: 1, at: GROUP_ROUNDS + 1 + i }));
      out.push({ src: 'liga', name: d.name, clubs: d.clubIds, groups: d.groups, plan });
    } else out.push({ src: 'liga', name: d.name, clubs: d.clubIds, plan: [{ k: 'rr', n: rrRounds(d.clubIds.length, 2), legs: 2, at: 1 }] });
  }
  const cup = g.cup;
  if (cup && cup.rounds[0] && cup.rounds[0].ties.some((t) => t.homeId === me || t.awayId === me)) {
    const names = CUP_ROUND_NAMES.slice(CUP_ROUND_NAMES.length - cup.totalRounds);
    out.push({ src: 'copa', name: cup.name, clubs: cup.rounds[0].ties.flatMap((t) => [t.homeId, t.awayId]), seeds: cup.rounds[0].ties.map((t) => [t.homeId, t.awayId] as [string, string]),
      plan: names.map((name, i): YPlan => ({ k: 'ko', name, mode: i === 0 ? 'seeds' : i === names.length - 1 ? 'final' : 'winners', legs: 1, at: i + 1 })) });
  }
  for (const key of ['lib', 'sula', 'ucl'] as const) {
    const st = g[key];
    if (!st || !st.groups.some((gr) => gr.clubIds.includes(me))) continue;
    const ko = CONTINENTALS[key].stepNames.slice(6);
    out.push({ src: key, name: st.name, clubs: st.groups.flatMap((gr) => gr.clubIds), groups: st.groups.map((gr) => gr.clubIds),
      plan: [{ k: 'rr', n: 6, legs: 2, at: 1 }, ...ko.map((name, i): YPlan => ({ k: 'ko', name, mode: i === 0 ? 'cross' : i === ko.length - 1 ? 'final' : 'winners', legs: 1, at: 7 + i }))] });
  }
  return out;
}

/** Cria as competições de base da temporada (4 categorias × competições do seu clube). Quem não tem atletas elegíveis suficientes não se inscreve. */
export function createYouthComps(g: GameState): GameState {
  if (g.unemployed || g.observer) return { ...g, ycomps: [], ycompsClub: g.userClubId };
  const srcs = sourcesOf(g);
  const ycomps: YComp[] = [];
  for (const cat of CATEGORIES) {
    const meOk = enrollCheck(g, cat.id).ok;
    for (const s of srcs) {
      const absent = meOk ? [] : [g.userClubId];
      const clubs = s.clubs.filter((id) => !absent.includes(id));
      const groups = s.groups?.map((gr) => gr.filter((id) => !absent.includes(id)));
      const seeds = s.seeds?.map(([a, b]) => [absent.includes(a) ? '' : a, absent.includes(b) ? '' : b] as [string, string]);
      // pontos corridos: o número de rodadas acompanha quem se inscreveu
      const plan = s.plan.filter((p) => !(s.src === 'estadual' && p.k === 'ko' && clubs.length < 6)).map((p) => (p.k === 'rr' && !s.groups ? { ...p, n: rrRounds(clubs.length, p.legs) } : p));
      ycomps.push({ id: `${s.src}-${cat.id}`, src: s.src, cat: cat.id, name: `${cat.label} · ${s.name}`, season: g.season, clubs, absent, ...(groups ? { groups } : {}), ...(seeds ? { seeds } : {}), plan, done: 0, m: [], st: {}, nm: {} });
    }
  }
  return { ...g, ycomps, ycompsClub: g.userClubId };
}

/* ----------------------------- progresso da competição profissional ----------------------------- */

/** Quantas etapas a competição profissional equivalente já concluiu (o relógio da competição de base). */
export function proProgress(g: GameState, src: SrcId): number {
  switch (src) {
    case 'estadual': return g.estadual ? (g.estadual.done ? g.estadual.totalSteps : Math.max(0, g.estadual.step - 1)) : 0;
    case 'liga': return Math.max(0, Math.min(g.round - 1, 99));
    case 'copa': return g.cup ? (g.cup.championId ? g.cup.totalRounds : g.cup.roundIndex) : 0;
    default: { const s = g[src]; return s ? (s.championId ? 99 : s.step) : 0; }
  }
}
const seasonFrac = (g: GameState) => clamp((g.round - 1) / Math.max(1, g.totalRounds), 0, 1);

/* ----------------------------- jogos ----------------------------- */

const clubIdxOf = (c: YComp) => new Map(c.clubs.map((id, i) => [id, i]));
const koWinnerOf = (c: YComp, x: YMatch): string => (x[3] !== x[4] ? (x[3] > x[4] ? c.clubs[x[1]] : c.clubs[x[2]]) : x[5] > x[6] ? c.clubs[x[1]] : c.clubs[x[2]]);
const nameOfPlayer = (id: string, c: YComp): string => c.nm[id] ?? youthName(id);
/** Clube pelo qual o jogador atuou por último na competição (acompanha as transferências); sem jogos, pelo id. */
export const clubOfPlayer = (c: Pick<YComp, 'clubs'> & { st?: Record<string, YStat> }, id: string, userClub: string): string => { const i = c.st?.[id]?.[9]; return i !== undefined && c.clubs[i] ? c.clubs[i] : id.includes('~') ? id.split('~')[0] : userClub; };

function bump(c: YComp, p: Player, f: { g?: number; a?: number; j?: number; m?: number; y?: number; r?: number; gc?: number }, clubId: string): void {
  const cur = c.st[p.id] ? [...c.st[p.id]] : [0, 0, 0, 0, 0, 0, 0, POS_CODE[p.pos], p.age, 0]; // cópia: o estado anterior não muda
  cur[9] = Math.max(0, c.clubs.indexOf(clubId));
  cur[0] += f.g ?? 0; cur[1] += f.a ?? 0; cur[2] += f.j ?? 0; cur[3] += f.m ?? 0; cur[4] += f.y ?? 0; cur[5] += f.r ?? 0; cur[6] += f.gc ?? 0;
  c.st[p.id] = cur;
  if (p.name !== youthName(p.id)) c.nm[p.id] = p.name; // nomes que não saem do id (jovens seus e de quem saiu do seu clube)
}

interface MatchOut { hg: number; ag: number; ph: number; pa: number; wo: number }

/** Joga uma partida de base com o motor existente; sem 11 atletas livres o clube perde por W.O. (3 x 0). */
function playOne(g: GameState, c: YComp, homeId: string, awayId: string, rng: Rng, busy: Set<string>, ko: boolean): MatchOut {
  const frac = seasonFrac(g);
  const ht = pickTeam(g, homeId, c.cat, frac, busy), at = pickTeam(g, awayId, c.cat, frac, busy);
  if (!ht || !at) return { hg: ht ? 3 : 0, ag: at ? 3 : 0, ph: 0, pa: 0, wo: 1 };
  const mods = { home: prepMods(g, homeId, c.cat), away: prepMods(g, awayId, c.cat) };
  const out = simulateMatch(ht, at, rng, mods, { home: clubOf(g, homeId)?.name ?? homeId, away: clubOf(g, awayId)?.name ?? awayId });
  const lineH = ht.lineup.map((id) => ht.players.find((p) => p.id === id)!), lineA = at.lineup.map((id) => at.players.find((p) => p.id === id)!);
  const mins = new Map<string, number>([...lineH, ...lineA].map((p) => [p.id, 90]));
  const byName = (list: Player[], name?: string) => list.find((p) => p.name === name);
  const squadOf = (side: 'home' | 'away') => (side === 'home' ? ht : at).players;
  const subs = new Map<string, Player>(); // reservas que entraram (lesão em campo): contam jogo e alguns minutos
  const gkOf = (list: Player[]) => list.find((p) => p.pos === 'GK') ?? list[0];
  const goalsAgainst = new Map<string, number>();
  const tally = (list: Player[], cid: string, e: (typeof out.events)[number], opp: Player[]) => {
    const p = byName(list, e.player) ?? byName(squadOf(e.side as 'home' | 'away'), e.player);
    if (p && !mins.has(p.id)) { mins.set(p.id, 30); subs.set(p.id, p); }
    if (e.type === 'goal' && !e.annulled && p) {
      bump(c, p, { g: 1 }, cid);
      const m = /\((?:cruzamento|assistência) de ([^)]+)\)/.exec(e.text);
      const helper = m ? byName(list, m[1]) ?? byName(squadOf(e.side as 'home' | 'away'), m[1]) : undefined;
      if (helper && !mins.has(helper.id)) { mins.set(helper.id, 30); subs.set(helper.id, helper); }
      if (helper) bump(c, helper, { a: 1 }, cid);
      const gk = gkOf(opp); goalsAgainst.set(gk.id, (goalsAgainst.get(gk.id) ?? 0) + 1);
    } else if (e.type === 'yellow' && !e.annulled && p) bump(c, p, { y: 1 }, cid);
    else if (e.type === 'red' && !e.annulled && p) { bump(c, p, { r: 1 }, cid); mins.set(p.id, Math.min(mins.get(p.id) ?? 90, e.minute)); }
  };
  for (const e of out.events) { if (e.side === 'home') tally(lineH, homeId, e, lineA); else if (e.side === 'away') tally(lineA, awayId, e, lineH); }
  for (const p of [...lineH, ...[...subs.values()].filter((x) => ht.players.includes(x))]) bump(c, p, { j: 1, m: mins.get(p.id) ?? 90, gc: goalsAgainst.get(p.id) ?? 0 }, homeId);
  for (const p of [...lineA, ...[...subs.values()].filter((x) => at.players.includes(x))]) bump(c, p, { j: 1, m: mins.get(p.id) ?? 90, gc: goalsAgainst.get(p.id) ?? 0 }, awayId);
  ht.lineup.forEach((id) => busy.add(id)); at.lineup.forEach((id) => busy.add(id));
  let ph = 0, pa = 0;
  if (ko && out.homeGoals === out.awayGoals) { const homeWins = rng() < 0.5; const w = 4 + Math.floor(rng() * 2), l = 2 + Math.floor(rng() * 2); ph = homeWins ? w : l; pa = homeWins ? l : w; }
  return { hg: out.homeGoals, ag: out.awayGoals, ph, pa, wo: 0 };
}

/** Pares do mata-mata da etapa (a partir dos resultados anteriores). Clube ausente = o adversário avança sem jogar. */
function koPairs(g: GameState, c: YComp, st: YStep): [string, string][] {
  const p = st.plan as Extract<YPlan, { k: 'ko' }>;
  if (st.leg === 2 && c.cur) return c.cur.map(([a, b]) => [b, a] as [string, string]); // volta: inverte o mando da ida
  if (p.mode === 'seeds') return (c.seeds ?? []).map(([a, b]) => [a, b] as [string, string]);
  if (p.mode === 'cross') {
    const tabs = tablesOf(g, c);
    const first = tabs.map((t) => t.rows[0]?.clubId ?? ''), second = tabs.map((t) => t.rows[1]?.clubId ?? '');
    return first.map((f, i) => [f, second[i ^ 1] ?? ''] as [string, string]);
  }
  if (p.mode === 'semis') {
    const t = tablesOf(g, c)[0].rows.map((r) => r.clubId);
    const [a, b, d2, e] = [t[0], t[1], t[2], t[3]];
    const pairs: [string, string][] = [[a, e], [b, d2]]; // 1º x 4º e 2º x 3º; o melhor decide em casa
    return st.leg === 1 ? pairs.map(([hi, lo]) => [lo, hi] as [string, string]) : pairs;
  }
  const w = c.alive ?? [];
  const out: [string, string][] = [];
  for (let i = 0; i < w.length; i += 2) out.push([w[i], w[i + 1] ?? '']);
  return out;
}

/** Joga a próxima etapa da competição (rodada, ida/volta, fase do mata-mata). */
function playStep(g: GameState, c: YComp, busy: Set<string>): { g: GameState; c: YComp } {
  const steps = stepsOf(c), st = steps[c.done];
  const idx = clubIdxOf(c);
  const rng = makeRng(hashString(`${c.id}:${g.season}:${g.seed}:${st.index}`));
  const nc: YComp = { ...c, m: [...c.m], st: { ...c.st }, nm: { ...c.nm } };
  const add = (home: string, away: string, r: MatchOut) => nc.m.push([st.index, idx.get(home) ?? -1, idx.get(away) ?? -1, r.hg, r.ag, r.ph, r.pa, r.wo]);
  if (st.plan.k === 'rr') {
    const sets = nc.groups ?? [nc.clubs];
    for (const ids of sets) for (const f of rrFixtures(ids, st.plan.legs).filter((x) => x.round === st.round)) add(f.homeId, f.awayId, playOne(g, nc, f.homeId, f.awayId, rng, busy, false));
  } else {
    const pairs = koPairs(g, nc, st);
    if (st.leg === 1) nc.cur = pairs;
    const winners: string[] = [];
    pairs.forEach(([a, b], i) => {
      if (!a || !b) { winners[i] = a || b; return; }                                    // adversário não inscrito: avança
      const two = st.plan.k === 'ko' && st.plan.legs === 2;
      const r = playOne(g, nc, a, b, rng, busy, !two || st.leg === 2);
      add(a, b, r);
      if (!two) winners[i] = r.hg !== r.ag ? (r.hg > r.ag ? a : b) : r.ph > r.pa ? a : b;
      else if (st.leg === 2) {
        // agregado: ida (a era visitante da ida) + volta
        const first = nc.m.find((x) => x[0] === st.index - 1 && ((nc.clubs[x[1]] === b && nc.clubs[x[2]] === a)));
        const ga = r.hg + (first ? first[4] : 0), gb = r.ag + (first ? first[3] : 0);
        winners[i] = ga !== gb ? (ga > gb ? a : b) : r.ph > r.pa ? a : b;
      }
    });
    const roundEnds = st.plan.k === 'ko' && (st.plan.legs === 1 || st.leg === 2);
    if (roundEnds) { nc.alive = winners.filter(Boolean); nc.cur = undefined; }
  }
  nc.done = c.done + 1;
  let s = g;
  if (isFinished(nc)) { const f = finalize(s, nc); s = f.g; return { g: s, c: f.c }; }
  return { g: s, c: nc };
}

/* ----------------------------- fim da competição: campeão, prêmios ----------------------------- */

const scoreOf = (v: YStat) => v[0] * 3 + v[1] * 2 + v[2] * 0.3 + (v[3] / 90) * 0.2;

export function computeAwards(c: YComp, userClub: string): YAwards {
  const entries = Object.entries(c.st);
  const clubOf2 = (id: string) => clubOfPlayer(c, id, userClub);
  const scorer = [...entries].filter(([, v]) => v[0] > 0).sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1] || a[1][3] - b[1][3] || a[0].localeCompare(b[0]))[0];
  const bonus = (id: string) => (clubOf2(id) === c.champion ? 2 : clubOf2(id) === c.runnerUp ? 1 : 0);
  const best = [...entries].filter(([, v]) => v[2] >= 3).sort((a, b) => scoreOf(b[1]) + bonus(b[0]) - scoreOf(a[1]) - bonus(a[0]) || a[0].localeCompare(b[0]))[0];
  const maxJ = entries.reduce((m, [, v]) => Math.max(m, v[2]), 0);
  const gk = [...entries].filter(([, v]) => v[7] === 0 && v[2] >= Math.max(2, Math.round(maxJ * 0.4))).sort((a, b) => a[1][6] / a[1][2] - b[1][6] / b[1][2] || b[1][2] - a[1][2] || a[0].localeCompare(b[0]))[0];
  const young = categoryDef(c.cat).minAge + (c.cat === 'sub21' ? 3 : c.cat === 'sub13' ? 0 : 1);
  const rev = [...entries].filter(([, v]) => v[8] <= young && v[2] >= 3).sort((a, b) => scoreOf(b[1]) + bonus(b[0]) - scoreOf(a[1]) - bonus(a[0]) || a[0].localeCompare(b[0]))[0];
  return { ...(scorer ? { scorer: scorer[0] } : {}), ...(best ? { best: best[0] } : {}), ...(gk ? { gk: gk[0] } : {}), ...(rev ? { rev: rev[0] } : {}) };
}

/** Premiação (R$) por competição e prêmio. Teto de R$ 500 mil. Competições menores não pagam prêmios individuais. */
export const PRIZE_CAP = 500_000;
type Prize = 'champion' | 'runnerUp' | 'scorer' | 'best' | 'gk' | 'rev';
const PRIZES: Record<SrcId, Partial<Record<Prize, number>>> = {
  estadual: { champion: 120_000, runnerUp: 50_000, scorer: 15_000 },
  liga: { champion: 300_000, runnerUp: 120_000, scorer: 30_000, best: 30_000, gk: 20_000, rev: 20_000 },
  copa: { champion: 250_000, runnerUp: 100_000 },
  lib: { champion: 500_000, runnerUp: 200_000, scorer: 40_000, best: 40_000, gk: 25_000, rev: 25_000 },
  ucl: { champion: 500_000, runnerUp: 200_000, scorer: 40_000, best: 40_000, gk: 25_000, rev: 25_000 },
  sula: { champion: 350_000, runnerUp: 150_000, scorer: 30_000, best: 30_000, gk: 20_000, rev: 20_000 },
};
/** Peso da categoria: o Sub-13 não tem premiação em dinheiro (formação), o Sub-15 paga metade. */
export const CAT_PRIZE: Record<CategoryId, number> = { sub13: 0, sub15: 0.5, sub17: 1, sub21: 1 };
export const prizeOf = (src: SrcId, cat: CategoryId, p: Prize): number => Math.min(PRIZE_CAP, Math.round(((PRIZES[src][p] ?? 0) * CAT_PRIZE[cat]) / 1000) * 1000);
export const prizeTable = (src: SrcId, cat: CategoryId): { prize: Prize; label: string; value: number }[] => ([['champion', 'Campeão'], ['runnerUp', 'Vice-campeão'], ['scorer', 'Artilheiro'], ['best', 'Melhor jogador'], ['gk', 'Melhor goleiro'], ['rev', 'Revelação']] as [Prize, string][]).filter(([p]) => PRIZES[src][p] !== undefined).map(([p, label]) => ({ prize: p, label, value: prizeOf(src, cat, p) }));

function finalize(g: GameState, c: YComp): { g: GameState; c: YComp } {
  const nc: YComp = { ...c };
  const last = nc.plan[nc.plan.length - 1];
  if (last.k === 'ko') {
    const fm = nc.m.filter((x) => x[0] === totalSteps(nc) - 1)[0];
    if (fm) { const w = koWinnerOf(nc, fm); nc.champion = w; nc.runnerUp = w === nc.clubs[fm[1]] ? nc.clubs[fm[2]] : nc.clubs[fm[1]]; nc.finalText = `${clubOf(g, nc.clubs[fm[1]])?.name ?? ''} ${fm[3]} x ${fm[4]} ${clubOf(g, nc.clubs[fm[2]])?.name ?? ''}${fm[5] || fm[6] ? ` (pên. ${fm[5]} x ${fm[6]})` : ''}`; }
    else if (nc.alive?.length) nc.champion = nc.alive[0];
  } else { const t = tablesOf(g, nc)[0].rows; nc.champion = t[0]?.clubId; nc.runnerUp = t[1]?.clubId; }
  nc.aw = computeAwards(nc, g.userClubId);
  return { g: payPrizes(g, nc), c: { ...nc, paid: true } };
}

/** Paga ao SEU clube (caixa real + histórico da formação) o que ganhou: título, vice e prêmios individuais de jogadores dele. */
function payPrizes(g: GameState, c: YComp): GameState {
  if (c.paid || g.unemployed) return g;
  const me = g.userClubId;
  const mineOf = (id?: string) => !!id && clubOfPlayer(c, id, me) === me;
  const wins: { p: Prize; text: string }[] = [];
  if (c.champion === me) wins.push({ p: 'champion', text: 'título' });
  if (c.runnerUp === me) wins.push({ p: 'runnerUp', text: 'vice-campeonato' });
  if (mineOf(c.aw?.scorer)) wins.push({ p: 'scorer', text: `artilheiro (${nameOfPlayer(c.aw!.scorer!, c)})` });
  if (mineOf(c.aw?.best)) wins.push({ p: 'best', text: `melhor jogador (${nameOfPlayer(c.aw!.best!, c)})` });
  if (mineOf(c.aw?.gk)) wins.push({ p: 'gk', text: `melhor goleiro (${nameOfPlayer(c.aw!.gk!, c)})` });
  if (mineOf(c.aw?.rev)) wins.push({ p: 'rev', text: `revelação (${nameOfPlayer(c.aw!.rev!, c)})` });
  let s = g;
  for (const w of wins) {
    const v = prizeOf(c.src, c.cat, w.p);
    if (v <= 0) { s = news(s, `🏆 ${c.name}: ${w.text} do seu clube (sem premiação em dinheiro nesta categoria).`, 'good'); continue; }
    const y = s.youth ?? undefined;
    s = { ...s, budgets: { ...s.budgets, [me]: (s.budgets[me] ?? 0) + v }, ...(y ? { youth: logSpend(y, { season: s.season, round: s.round, kind: 'premio', text: `Prêmio · ${c.name}: ${w.text}`, cost: v }) } : {}) };
    s = news(s, `🏆 ${c.name}: ${w.text}! Premiação de R$ ${(v / 1000).toLocaleString('pt-BR')} mil para o caixa.`, 'good');
  }
  return s;
}

/* ----------------------------- andar junto com o profissional ----------------------------- */

/** Chamado depois de cada evento do profissional: joga, na ordem, as etapas de base que já podem acontecer. O Sub-17 e o Sub-21 nunca usam o mesmo atleta no mesmo dia. */
export function youthSync(g: GameState): GameState {
  if (g.unemployed || g.observer) return g;
  let s = g;
  if (!s.ycomps || s.ycompsClub !== s.userClubId) s = createYouthComps(s);
  for (let guard = 0; guard < 200; guard++) {
    const slots = new Map<number, Set<string>>();
    let moved = false;
    const list = [...(s.ycomps ?? [])];
    for (const cat of CATEGORIES) {
      let slot = 0;
      for (const c of list.filter((x) => x.cat === cat.id && !isFinished(x))) {
        const step = stepsOf(c)[c.done];
        if (step.at <= proProgress(s, c.src)) {
          if (!slots.has(slot)) slots.set(slot, new Set());
          const r = playStep(s, c, slots.get(slot)!);
          s = r.g;
          list[list.findIndex((x) => x.id === c.id)] = r.c;
          s = { ...s, ycomps: list };
          moved = true;
        }
        slot++;
      }
    }
    if (!moved) break;
  }
  return s.ycomps === g.ycomps ? s : { ...s, ycomps: s.ycomps };
}

/** Fim da temporada: termina o que faltar, registra a história e limpa os jogos (campeões, artilheiros e finais ficam). */
export function youthSeasonEnd(g: GameState): GameState {
  if (!g.ycomps?.length) return g;
  let s = g;
  for (let guard = 0; guard < 300; guard++) {
    const open = (s.ycomps ?? []).find((c) => !isFinished(c));
    if (!open) break;
    const r = playStep(s, open, new Set());
    s = { ...r.g, ycomps: (r.g.ycomps ?? s.ycomps)!.map((c) => (c.id === open.id ? r.c : c)) };
  }
  const hist: YHist[] = (s.ycomps ?? []).map((c) => historyOf(s, c));
  return { ...s, yhist: [...(s.yhist ?? []), ...hist].slice(-(YHIST_KEEP * 24)), ycomps: [] };
}

const playerLine = (g: GameState, c: YComp, id?: string): { name: string; club: string } | undefined => (id ? { name: nameOfPlayer(id, c), club: clubOf(g, clubOfPlayer(c, id, g.userClubId))?.name ?? '' } : undefined);

/** Desempenho do seu clube na competição (0 a 1). */
function perfOf(g: GameState, c: YComp): number {
  if (c.champion === g.userClubId) return 1;
  if (c.runnerUp === g.userClubId) return 0.85;
  const t = tablesOf(g, c).find((x) => x.rows.some((r) => r.clubId === g.userClubId));
  if (!t) return 0.5;
  const i = t.rows.findIndex((r) => r.clubId === g.userClubId);
  return Math.round((0.1 + 0.8 * clamp(1 - i / Math.max(1, t.rows.length - 1), 0, 1)) * 100) / 100;
}

export function historyOf(g: GameState, c: YComp): YHist {
  const top = Object.entries(c.st).filter(([, v]) => v[0] > 0).sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1] || a[0].localeCompare(b[0])).slice(0, 3).map(([id, v]) => ({ name: nameOfPlayer(id, c), club: clubOf(g, clubOfPlayer(c, id, g.userClubId))?.name ?? '', goals: v[0] }));
  const sc = c.aw?.scorer ? playerLine(g, c, c.aw.scorer) : undefined;
  const mePos = c.absent.includes(g.userClubId) ? 'não inscrito' : c.champion === g.userClubId ? 'campeão' : c.runnerUp === g.userClubId ? 'vice-campeão' : (() => { const t = tablesOf(g, c).find((x) => x.rows.some((r) => r.clubId === g.userClubId)); const i = t ? t.rows.findIndex((r) => r.clubId === g.userClubId) : -1; return i >= 0 ? `${i + 1}º colocado${c.groups ? ' no grupo' : ''}` : ''; })();
  return { season: c.season, cat: c.cat, src: c.src, name: c.name, champion: c.champion ? clubOf(g, c.champion)?.name : undefined, runnerUp: c.runnerUp ? clubOf(g, c.runnerUp)?.name : undefined, final: c.finalText,
    ...(enrolledMine(c, g.userClubId) ? { r: perfOf(g, c) } : {}), ...(sc ? { scorer: { ...sc, goals: c.st[c.aw!.scorer!][0] } } : {}), ...(playerLine(g, c, c.aw?.best) ? { best: playerLine(g, c, c.aw?.best)! } : {}), ...(playerLine(g, c, c.aw?.gk) ? { gk: playerLine(g, c, c.aw?.gk)! } : {}), ...(playerLine(g, c, c.aw?.rev) ? { rev: playerLine(g, c, c.aw?.rev)! } : {}), top, mine: mePos };
}

/** Começo de temporada: cria as competições novas (a base do usuário e os rivais já estão no estado novo). */
export const youthStartSeason = (g: GameState): GameState => createYouthComps({ ...g, ycomps: undefined });

/* ----------------------------- consultas para a tela ----------------------------- */

export const compsOf = (g: GameState, cat: CategoryId): YComp[] => (g.ycomps ?? []).filter((c) => c.cat === cat);
/** Cada categoria joga em dias próprios da semana (calendário independente, sem coincidir com os jogos do profissional). */
const CAT_DAY: Record<CategoryId, number> = { sub13: 0, sub15: 1, sub17: 4, sub21: 5 };
export function stepDay(g: GameState, c: Pick<YComp, 'plan' | 'cat'>, idx: number): number {
  const st = stepsOf(c)[idx]; const k = Math.max(0, (st?.at ?? 1) - 1);
  return calOf(g).start + Math.floor(k / 2) * 7 + (k % 2 ? 3 : 0) + CAT_DAY[c.cat];
}
export interface YGame { step: number; day: number; round: string; homeId: string; awayId: string; hg?: number; ag?: number; pens?: [number, number]; wo?: boolean; mine: boolean }

/** Todos os jogos (jogados e a jogar nas rodadas de pontos já conhecidas) da competição. */
export function gamesOf(g: GameState, c: YComp): YGame[] {
  const steps = stepsOf(c);
  const out: YGame[] = c.m.map((x) => ({ step: x[0], day: stepDay(g, c, x[0]), round: steps[x[0]]?.name ?? '', homeId: c.clubs[x[1]], awayId: c.clubs[x[2]], hg: x[3], ag: x[4], ...(x[5] || x[6] ? { pens: [x[5], x[6]] as [number, number] } : {}), wo: !!x[7], mine: c.clubs[x[1]] === g.userClubId || c.clubs[x[2]] === g.userClubId }));
  // próximas rodadas de pontos corridos (os confrontos são conhecidos de antemão)
  for (const st of steps.slice(c.done)) {
    if (st.plan.k !== 'rr') break;
    for (const ids of c.groups ?? [c.clubs]) for (const f of rrFixtures(ids, st.plan.legs).filter((x) => x.round === st.round)) out.push({ step: st.index, day: stepDay(g, c, st.index), round: st.name, homeId: f.homeId, awayId: f.awayId, mine: f.homeId === g.userClubId || f.awayId === g.userClubId });
  }
  return out;
}
export const nextGamesOf = (g: GameState, c: YComp, n = 4): YGame[] => gamesOf(g, c).filter((x) => x.hg === undefined && x.mine).slice(0, n);
export const lastGamesOf = (g: GameState, c: YComp, n = 4): YGame[] => gamesOf(g, c).filter((x) => x.hg !== undefined && x.mine).slice(-n).reverse();

export interface YLeader { id: string; name: string; clubId: string; club: string; pos: number; age: number; v: number[] }
export function leaders(g: GameState, c: YComp, by: 'gols' | 'assist' | 'jogos' | 'minutos' | 'amarelos' | 'vermelhos', n = 10): YLeader[] {
  const idx = { gols: 0, assist: 1, jogos: 2, minutos: 3, amarelos: 4, vermelhos: 5 }[by];
  return Object.entries(c.st).filter(([, v]) => v[idx] > 0).sort((a, b) => b[1][idx] - a[1][idx] || b[1][0] - a[1][0] || a[0].localeCompare(b[0])).slice(0, n)
    .map(([id, v]) => { const clubId = clubOfPlayer(c, id, g.userClubId); return { id, name: nameOfPlayer(id, c), clubId, club: clubOf(g, clubId)?.name ?? '', pos: v[7], age: v[8], v }; });
}
export const awardLines = (g: GameState, c: YComp): { label: string; name: string; club: string; prize: number }[] => {
  const lines: { label: string; name: string; club: string; prize: number }[] = [];
  const cn = (id?: string) => (id ? clubOf(g, id)?.name ?? '' : '');
  if (c.champion) lines.push({ label: 'Campeão', name: cn(c.champion), club: '', prize: prizeOf(c.src, c.cat, 'champion') });
  if (c.runnerUp) lines.push({ label: 'Vice-campeão', name: cn(c.runnerUp), club: '', prize: prizeOf(c.src, c.cat, 'runnerUp') });
  for (const [k, label, p] of [['scorer', 'Artilheiro', 'scorer'], ['best', 'Melhor jogador', 'best'], ['gk', 'Melhor goleiro', 'gk'], ['rev', 'Revelação', 'rev']] as const) {
    const id = c.aw?.[k]; if (!id || PRIZES[c.src][p] === undefined) continue;
    lines.push({ label, name: nameOfPlayer(id, c), club: cn(clubOfPlayer(c, id, g.userClubId)), prize: prizeOf(c.src, c.cat, p) });
  }
  return lines;
};
export const enrolledMine = (c: YComp, userClub: string): boolean => c.clubs.includes(userClub);
export { MIN_ROSTER, rosterOf };
