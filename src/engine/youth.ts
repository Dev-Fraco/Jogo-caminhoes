import { ACADEMY_START_AGE, ACADEMY_START_OVERALL, canPromoteAge, homeCategory, categoryDef, MIN_PRO_AGE, needsDecision } from './categories';
import { inflate, priceIndex } from './economy';
import { rollCoachQuality, rollPotential, STAR_POTENTIAL, trainTick, type Specialty, type YouthCoach } from './training';
import { attributesOf, CATEGORIES } from './categories';
import { baseIncome } from './finance';
import { makeRng, type Rng } from './rng';
import { pickSpot, randomName } from './squad';
import { divisionIndexOf, MAX_SQUAD } from './transfers';
import type { GameState, NewsItem, Player, Position } from './types';

/** Fato da vida do jovem na base (entrada, mudança de categoria, decisão pendente...). */
export interface HistoryEntry { season: number; text: string }
/** Um jovem da base: o jogador e o quanto ele pode chegar a ser (potencial). `exact` guarda a força com casas decimais.
 *  Um registro só por atleta; as categorias (Sub-13 a Sub-21) são faixas de idade sobre esta lista (ver categories.ts).
 *  `joined`, `origin` e `history` são a identidade/histórico próprios; ausentes em saves antigos (a migração completa). */
export interface Prospect { player: Player; potential: number; exact: number;
  /** Barra de treino (0 a 100 %): ao chegar a 100 o jovem ganha +1 de overall e a barra reinicia. `exact` = overall + barra/100. */
  train?: number;
  /** Os seis atributos (ordem de `ATTRIBUTES[pos]`), que acompanham o overall. */
  attrs?: number[];
  /** Especialidade de treino escolhida pelo usuário (sem escolha = equilibrado). */
  focus?: Specialty;
  joined?: number; origin?: 'academia' | 'anterior'; history?: HistoryEntry[] }
/** Ganchos reservados para as próximas etapas (treinamento, treinadores individuais, instalações, campeonatos de base, olheiros,
 *  contratos, empréstimos). Nada disso existe ainda: o campo só garante um lugar no save, sem mexer no que já está salvo. */
export interface YouthModules { training?: unknown; coaches?: unknown; facilities?: unknown; competitions?: unknown; scouting?: unknown; contracts?: unknown; loans?: unknown }
export interface YouthState { level: number; prospects: Prospect[]; seq: number; lastIntake: number; /** versão do formato da base */ schema?: number; modules?: YouthModules;
  /** Treinador de cada categoria (qualidade 1 a 5), criado automaticamente. */
  coaches?: Partial<Record<import('./categories').CategoryId, YouthCoach>> }
export const YOUTH_SCHEMA = 2;

export const MAX_LEVEL = 5;
/** Limite de jovens na base (as quatro categorias juntas). Quem aguarda decisão aos 21 anos nunca é cortado. */
export const MAX_PROSPECTS = 60;
const HISTORY_MAX = 24;
const note = (p: Prospect, season: number, text: string): Prospect => ({ ...p, history: [...(p.history ?? []), { season, text }].slice(-HISTORY_MAX) });
const POS_BAG: Position[] = ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT', 'ATT'];

export const youthOf = (g: GameState): YouthState => g.youth ?? { level: 0, prospects: [], seq: 1, lastIntake: -1, schema: YOUTH_SCHEMA };
const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });

/** Estrelas de potencial (1–5). */
export const stars = (potential: number) => Math.max(1, Math.min(5, Math.round((potential - 40) / 11)));

/** Nova safra: mais jovens e melhores conforme o nível da academia. */
function intake(g: GameState, y: YouthState, rng: Rng): YouthState {
  const used = new Set([...g.teams[g.userClubId].players.map((p) => p.name), ...y.prospects.map((p) => p.player.name)]);
  const count = 4 + y.level;
  const fresh: Prospect[] = [];
  let seq = y.seq;
  for (let i = 0; i < count; i++) {
    const pos = POS_BAG[Math.floor(rng() * POS_BAG.length)];
    const age = ACADEMY_START_AGE;
    const strength = ACADEMY_START_OVERALL;
    const potential = rollPotential(rng, y.level); // ~8% estrelas (85+); o resto fica abaixo disso
    fresh.push({ player: { id: `${g.userClubId}-y${seq++}`, name: randomName(rng, used), pos, spot: pickSpot(fresh.map((x) => x.player), pos), age, strength, pot: potential, formedAt: g.userClubId, formedSeason: g.season }, potential, exact: strength, train: 0,
      joined: g.season, origin: 'academia', history: [{ season: g.season, text: `Chegou à academia aos ${age} anos (overall ${strength})${potential >= STAR_POTENTIAL ? ' — talento excepcional (estrela)' : ''}.` }] });
    const last = fresh[fresh.length - 1]; last.attrs = attributesOf(last.player).map((a) => a.value);
  }
  const pending = y.prospects.filter((p) => needsDecision(p.player.age)); // quem aguarda decisão do clube nunca é cortado
  const rest = [...y.prospects.filter((p) => !needsDecision(p.player.age)), ...fresh].sort((a, b) => b.potential - a.potential).slice(0, MAX_PROSPECTS);
  return { ...y, prospects: [...pending, ...rest], seq, lastIntake: g.season, schema: YOUTH_SCHEMA };
}

/** Saves antigos: completa os jovens já existentes (origem, histórico, barra de treino, atributos) e os treinadores das categorias.
 *  Idade, overall e potencial NÃO mudam. A barra começa com a parte fracionária que o jovem já tinha. Idempotente. */
export function ensureCategoryState(g: GameState): GameState {
  const y = g.youth;
  if (!y) return g;
  const done = y.schema === YOUTH_SCHEMA && CATEGORIES.every((c) => y.coaches?.[c.id]) && y.prospects.every((p) => p.origin && p.history && p.train !== undefined && p.attrs);
  if (done) return g;
  const prospects = y.prospects.map((p) => {
    if (p.origin && p.history && p.train !== undefined && p.attrs) return p;
    const train = p.train ?? Math.max(0, Math.min(99, Math.round((p.exact - p.player.strength) * 100)));
    return { ...p, origin: p.origin ?? ('anterior' as const), history: p.history ?? [{ season: g.season, text: 'Já estava na base quando o sistema de categorias foi ativado.' }], train,
      attrs: p.attrs ?? attributesOf(p.player).map((a) => a.value), exact: Math.min(p.potential, p.player.strength + train / 100) };
  });
  return { ...g, youth: ensureCoaches(g, { ...y, prospects, schema: YOUTH_SCHEMA }) };
}

/** Garante que a base tenha a primeira safra. */
export function ensureYouth(g: GameState): GameState {
  if (g.youth || g.unemployed || g.observer) return g;
  const y0 = youthOf(g);
  return { ...g, youth: ensureCoaches(g, intake(g, y0, makeRng(g.seed * 53 + g.season * 7 + 3))) };
}

/** Treinador de cada categoria: criado uma vez, com qualidade que depende da academia. Idempotente. */
export function ensureCoaches(g: GameState, y: YouthState): YouthState {
  if (CATEGORIES.every((c) => y.coaches?.[c.id])) return y;
  const coaches = { ...(y.coaches ?? {}) };
  const used = new Set<string>();
  for (const c of CATEGORIES) {
    if (coaches[c.id]) { used.add(coaches[c.id]!.name); continue; }
    coaches[c.id] = { name: randomName(makeRng(g.seed * 71 + c.minAge * 13 + c.maxAge), used), quality: rollCoachQuality(g.seed, c.id, y.level) };
    used.add(coaches[c.id]!.name);
  }
  return { ...y, coaches };
}

/** A cada rodada a barra de treino de cada jovem enche um pouco (veja training.ts). Roda sozinho durante a temporada, com ou sem a tela aberta. */
export function youthTick(g: GameState): GameState {
  if (g.unemployed || g.observer) return g;
  const s = ensureYouth(g);
  const y = ensureCoaches(s, youthOf(s));
  const ticks = Math.max(1, s.totalRounds);
  return { ...s, youth: { ...y, prospects: y.prospects.map((p) => trainTick(p, y, ticks)) } };
}

/** Escolhe a especialidade de treino de um jovem (undefined = equilibrado). */
export function setFocus(g: GameState, id: string, focus: Specialty | undefined): GameState {
  const y = youthOf(g);
  if (!y.prospects.some((p) => p.player.id === id)) return g;
  return { ...g, youth: { ...y, prospects: y.prospects.map((p) => (p.player.id === id ? { ...p, focus } : p)) } };
}

/** Virada de temporada: todos ficam um ano mais velhos e crescem mais; quem chega aos 20 anos sai da base; entra uma safra nova. */
export function youthSeason(g: GameState): GameState {
  if (g.unemployed || g.observer) return g;
  let s = ensureYouth(g);
  const y = youthOf(s);
  const rng = makeRng(s.seed * 61 + s.season * 13 + 9);
  const moved: string[] = [], decide: string[] = [];
  const grown = y.prospects.map((p) => {
    const age = p.player.age + 1; // o overall NÃO muda na virada: ele só sobe pela barra de treino, rodada a rodada
    let q: Prospect = { ...p, player: { ...p.player, age } };
    // a idade sobe só aqui, na virada de temporada; o histórico registra a passagem de categoria e a decisão dos 21 anos
    if (needsDecision(age) && !needsDecision(p.player.age)) { q = note(q, s.season, `Completou ${age} anos: o clube decide entre profissional, empréstimo ou dispensa.`); decide.push(p.player.name); }
    else if (!needsDecision(age) && homeCategory(age) !== homeCategory(p.player.age) && homeCategory(age)) { q = note(q, s.season, `Passou para o ${categoryDef(homeCategory(age)!).label} (${age} anos).`); moved.push(p.player.name); }
    else if (age === MIN_PRO_AGE) q = note(q, s.season, 'Completou 16 anos: já pode ser promovido ao profissional.');
    return q;
  });
  if (decide.length) s = news(s, `🌱 Aguardando decisão do clube (21 anos): ${decide.join(', ')}. Escolha entre profissional, empréstimo ou dispensa.`, 'info');
  if (moved.length) s = news(s, `🌱 ${moved.length} jovem(ns) mudaram de categoria na base.`);
  s = { ...s, youth: intake(s, ensureCoaches(s, { ...y, prospects: grown }), rng) };
  return news(s, '🌱 Nova safra da base: novos jovens chegaram às categorias de base.', 'good');
}

/** Salário anual de um jovem promovido (R$). */
export const youthWage = (g: GameState, p: Prospect) => Math.max(18_000, Math.round(inflate(g, 20_000 + p.player.strength * 600) / 1_000) * 1_000);

export type YouthResult = { ok: true; state: GameState } | { ok: false; error: string };

export function promoteProspect(g: GameState, id: string): YouthResult {
  const y = youthOf(g);
  const p = y.prospects.find((x) => x.player.id === id);
  if (!p) return { ok: false, error: 'Jovem não encontrado.' };
  if (!canPromoteAge(p.player.age)) return { ok: false, error: `${p.player.name} tem ${p.player.age} anos: só a partir dos ${MIN_PRO_AGE} anos o jovem pode ser promovido ao profissional.` };
  const team = g.teams[g.userClubId];
  if (team.players.length >= MAX_SQUAD) return { ok: false, error: `Elenco cheio (${MAX_SQUAD}). Venda ou dispense alguém antes.` };
  const player: Player = { ...p.player, strength: p.player.strength, pot: p.potential, formedAt: p.player.formedAt ?? g.userClubId, formedSeason: p.player.formedSeason ?? p.joined ?? g.season, contract: { wage: youthWage(g, p), until: g.season + 3 } };
  const s: GameState = { ...g, teams: { ...g.teams, [g.userClubId]: { ...team, players: [...team.players, player] } }, youth: { ...y, prospects: y.prospects.filter((x) => x !== p) } };
  return { ok: true, state: news(s, `🌱 ${player.name} (${player.age} anos) subiu da base para o elenco principal.`, 'good') };
}

export function releaseProspect(g: GameState, id: string): GameState {
  const y = youthOf(g);
  if (!y.prospects.some((x) => x.player.id === id)) return g;
  return { ...g, youth: { ...y, prospects: y.prospects.filter((x) => x.player.id !== id) } };
}

export const academyCost = (g: GameState) => Math.round((0.08 * baseIncome(divisionIndexOf(g, g.userClubId), g.clubs[g.userClubId].reputation, priceIndex(g)) * (youthOf(g).level + 1)) / 10_000) * 10_000;

export function upgradeAcademy(g: GameState): YouthResult {
  const y = youthOf(g);
  if (y.level >= MAX_LEVEL) return { ok: false, error: 'A academia já está no nível máximo.' };
  const cost = academyCost(g);
  if ((g.budgets[g.userClubId] ?? 0) < cost) return { ok: false, error: 'O clube não tem caixa para a obra.' };
  const s: GameState = { ...g, budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] - cost }, youth: { ...y, level: y.level + 1 } };
  return { ok: true, state: news(s, `🌱 Academia da base melhorada (nível ${y.level + 1}): mais jovens, melhores e crescendo mais rápido.`, 'good') };
}
