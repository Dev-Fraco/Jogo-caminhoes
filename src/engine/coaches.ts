import { CATEGORIES, categoryDef, homeCategory, type CategoryId } from './categories';
import { inflate } from './economy';
import { clamp, hashString, makeRng, type Rng } from './rng';
import { randomName } from './squad';
import { ACADEMY_MAX_LEVEL, academyPercent, expectedRating, pointsPerYear } from './training';
import type { GameState, NewsItem } from './types';
import type { Prospect, YouthState } from './youth';

/* =====================================================================
   Treinadores das categorias de base (ETAPA 3).
   - Um treinador exclusivo por categoria (Sub-13, Sub-15, Sub-17, Sub-21), com avaliação de 1 a 10 estrelas, especialidades e histórico.
   - O usuário contrata e demite, mas NÃO comanda o treino nem mexe nos jogadores: o treinador decide o foco (training.ts).
   - Mercado com treinadores gerados, renovado de tempos em tempos. 10 estrelas só com a academia em 100%.
   - A avaliação sobe e desce aos poucos, na virada de temporada, conforme a evolução real dos jogadores da categoria.
   ===================================================================== */

export type CoachSpecId = 'atacantes' | 'meias' | 'defensores' | 'goleiros' | 'fisica' | 'tecnica' | 'tatica';
export const COACH_SPECS: readonly { id: CoachSpecId; label: string; group: 'Técnica' | 'Preparação'; hint: string }[] = [
  { id: 'atacantes', label: 'Desenvolvimento de atacantes', group: 'Técnica', hint: 'Acelera os atacantes e treina os fundamentos ofensivos (finalização, cabeceio).' },
  { id: 'meias', label: 'Desenvolvimento de meio-campistas', group: 'Técnica', hint: 'Acelera os meias e treina os fundamentos do meio (desarme, chute de fora).' },
  { id: 'defensores', label: 'Desenvolvimento de defensores', group: 'Técnica', hint: 'Acelera os defensores e treina os fundamentos defensivos (desarme).' },
  { id: 'goleiros', label: 'Desenvolvimento de goleiros', group: 'Técnica', hint: 'Acelera os goleiros e treina os fundamentos da posição (reflexos).' },
  { id: 'fisica', label: 'Preparação física', group: 'Preparação', hint: 'Foca no físico dos jovens: velocidade, fôlego, agilidade e jogo aéreo.' },
  { id: 'tecnica', label: 'Treinamento técnico', group: 'Preparação', hint: 'Foca em passe, controle e drible.' },
  { id: 'tatica', label: 'Treinamento tático', group: 'Preparação', hint: 'Foca em posicionamento, marcação e leitura de jogo.' },
];
export const specLabel = (s: CoachSpecId): string => COACH_SPECS.find((x) => x.id === s)!.label;

export type CoachTrait = 'paciente' | 'exigente' | 'revelador' | 'metodico';
export const COACH_TRAITS: Record<CoachTrait, { label: string; hint: string }> = {
  paciente: { label: 'Paciente', hint: 'Excelente com os mais novos (até 14 anos).' },
  exigente: { label: 'Exigente', hint: 'Tira mais dos jovens de 16 anos ou mais.' },
  revelador: { label: 'Descobridor de talentos', hint: 'Desenvolve melhor quem tem potencial alto (75+).' },
  metodico: { label: 'Metódico', hint: 'Rende um pouco mais com todos, sem altos e baixos.' },
};

export const STAR_LABEL = ['', 'Muito fraco', 'Fraco', 'Abaixo da média', 'Limitado', 'Mediano', 'Razoável', 'Bom', 'Excelente', 'De elite', 'Excepcional'] as const;
export const starsOf = (rating: number): number => clamp(Math.round(rating), 1, 10);
export const starText = (n: number): string => '★'.repeat(n) + '☆'.repeat(10 - n);
export const MAX_STARS = 10;

export interface CoachEval { season: number; ratio: number; delta: number; met: boolean }
export interface CoachSeason { gained: number; expected: number; warned?: boolean }
export interface YouthCoach {
  id: string; name: string; age: number; /** anos de experiência */ exp: number;
  /** Avaliação de 1 a 10 com decimais (as estrelas são o arredondamento): muda aos poucos. */
  rating: number;
  specs: CoachSpecId[]; trait: CoachTrait;
  /** Salário anual (R$). */ wage: number;
  hiredSeason?: number;
  /** Trabalho no clube e fatos da carreira. */
  history: { season: number; text: string }[];
  /** Acumulado da temporada atual (pontos de overall ganhos × esperados dos jovens dele). */
  season?: CoachSeason;
  evals?: CoachEval[];
  /** Temporadas ruins seguidas. */
  bad?: number;
}
export interface CoachMarket { key: string; list: YouthCoach[] }
export interface CatLogEntry { season: number; text: string }

export const EVAL_KEEP = 8;
export const MARKET_SIZE = 12;
const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const addLog = (y: YouthState, cat: CategoryId, season: number, text: string): YouthState => ({ ...y, catLog: { ...(y.catLog ?? {}), [cat]: [...(y.catLog?.[cat] ?? []), { season, text }].slice(-30) } });
const note = (c: YouthCoach, season: number, text: string): YouthCoach => ({ ...c, history: [...c.history, { season, text }].slice(-30) });

/** Academia em 100% = nível máximo. É a regra para contratar treinadores de 10 estrelas. */
export const canHireStars = (y: YouthState, stars: number): boolean => stars < MAX_STARS || academyPercent(y) >= 100;
export { academyPercent };

/** Salário anual do treinador: cresce rápido com as estrelas e um pouco com cada especialidade a mais. */
export const coachWage = (g: GameState, stars: number, nSpecs: number): number => Math.round(inflate(g, 15_000 * Math.pow(1.38, stars - 1) * (1 + 0.1 * (nSpecs - 1))) / 1000) * 1000;
/** Luvas pagas ao contratar e multa paga ao demitir. */
export const hireFee = (c: YouthCoach): number => Math.round((c.wage * 0.3) / 1000) * 1000;
export const severance = (c: YouthCoach): number => Math.round((c.wage * 0.25) / 1000) * 1000;

const STAR_WEIGHTS = [6, 9, 12, 14, 16, 14, 12, 9, 6, 2]; // 1★ a 10★ (10★ é raro)
function rollStars(rng: Rng): number {
  const t = STAR_WEIGHTS.reduce((a, b) => a + b, 0); let r = rng() * t;
  for (let i = 0; i < STAR_WEIGHTS.length; i++) { r -= STAR_WEIGHTS[i]; if (r < 0) return i + 1; }
  return 5;
}
const TRAIT_IDS = Object.keys(COACH_TRAITS) as CoachTrait[];

/** Gera um treinador. `stars` fixo ou sorteado; especialidades (1 a 3) e característica sorteadas. */
export function genCoach(g: GameState, rng: Rng, used: Set<string>, opts: { stars?: number; specs?: CoachSpecId[]; trait?: CoachTrait } = {}): YouthCoach {
  const stars = opts.stars ?? rollStars(rng);
  const n = opts.specs?.length ?? (rng() < 0.55 ? 1 : rng() < 0.78 ? 2 : 3);
  const pool = COACH_SPECS.map((s) => s.id);
  const specs: CoachSpecId[] = opts.specs ? [...opts.specs] : [];
  while (specs.length < n) { const s = pool[Math.floor(rng() * pool.length)]; if (!specs.includes(s)) specs.push(s); }
  const name = randomName(rng, used); used.add(name);
  const age = 29 + Math.floor(rng() * 33);
  const exp = clamp(Math.round((age - 25) * (0.4 + rng() * 0.5) + stars * 0.3), 1, 35);
  const trait = opts.trait ?? TRAIT_IDS[Math.floor(rng() * TRAIT_IDS.length)];
  return { id: `tc-${g.season}-${Math.floor(rng() * 1e9).toString(36)}`, name, age, exp, rating: stars, specs, trait, wage: coachWage(g, stars, specs.length), history: [{ season: g.season, text: `Carreira de ${exp} anos na formação de jovens.` }] };
}

/** Treinadores que o clube já tem (a vaga é exclusiva: o mesmo treinador não ocupa duas categorias). */
export const employedIds = (y: YouthState): Set<string> => new Set(Object.values(y.coaches ?? {}).map((c) => c!.id));
export const vacancies = (y: YouthState): CategoryId[] => CATEGORIES.filter((c) => !y.coaches?.[c.id]).map((c) => c.id);

/** Treinadores iniciais do clube (carreira nova ou save antigo sem treinadores): modestos, 2 a 4 estrelas. Idempotente. */
export function ensureCoaches(g: GameState, y: YouthState): YouthState {
  if (y.coachesInit) return y;
  const coaches = { ...(y.coaches ?? {}) };
  const used = new Set(Object.values(coaches).map((c) => c!.name));
  for (const c of CATEGORIES) {
    if (coaches[c.id]) continue;
    const rng = makeRng(g.seed * 71 + c.minAge * 13 + c.maxAge);
    const stars = 2 + (hashString(`${g.seed}:${c.id}:inicial`) % 3);
    coaches[c.id] = { ...genCoach(g, rng, used, { stars, specs: undefined }), hiredSeason: g.season };
    coaches[c.id] = note(coaches[c.id]!, g.season, `Já trabalhava no clube no ${categoryDef(c.id).label} quando o sistema de treinadores começou.`);
    used.add(coaches[c.id]!.name);
  }
  return { ...y, coaches, coachesInit: true };
}

/** Nível de academia (0–MAX_LEVEL) em % para as telas. */
export const academyText = (y: YouthState): string => `${academyPercent(y)}% (nível ${y.level} de ${ACADEMY_MAX_LEVEL})`;

/* ----------------------------- mercado de treinadores ----------------------------- */

const mkey = (g: GameState, mode: string) => `${g.season}:${mode}`;
/** Renova o mercado. `full` troca todos (virada de temporada); `partial` troca cerca de 40% (janelas ao longo da temporada). */
export function refreshMarket(g: GameState, y: YouthState, mode: 'full' | 'partial'): YouthState {
  const rng = makeRng(g.seed * 83 + g.season * 17 + g.round * 5 + (mode === 'full' ? 1 : 2));
  const keepList = mode === 'full' ? [] : (y.market?.list ?? []).filter((_, i) => i % 5 >= 2);
  const used = new Set([...employedIds(y), ...Object.values(y.coaches ?? {}).map((c) => c!.name), ...keepList.map((c) => c.name)]);
  const list = [...keepList];
  while (list.length < MARKET_SIZE) list.push(genCoach(g, rng, used));
  return { ...y, market: { key: mkey(g, `${mode}:${g.round}`), list: list.sort((a, b) => b.rating - a.rating) } };
}
/** Garante um mercado e o renova nas janelas (a cada 12 rodadas). */
export function marketTick(g: GameState, y: YouthState): YouthState {
  if (!y.market) return refreshMarket(g, y, 'full');
  if ((g.round - 1) % 12 === 0 && y.market.key !== mkey(g, `partial:${g.round}`) && !y.market.key.startsWith(`${g.season}:full:${g.round}`)) return refreshMarket(g, y, 'partial');
  return y;
}
/** Rodadas até a próxima renovação do mercado (para a tela). */
export const roundsToRefresh = (g: GameState): number => 12 - ((g.round - 1) % 12);

export type CoachResult = { ok: true; state: GameState } | { ok: false; error: string };

export function hireCoach(g: GameState, cat: CategoryId, candidateId: string): CoachResult {
  const y = g.youth;
  if (!y) return { ok: false, error: 'A base ainda não foi criada.' };
  const c = y.market?.list.find((x) => x.id === candidateId);
  if (!c) return { ok: false, error: 'Esse treinador não está mais disponível no mercado.' };
  if (y.coaches?.[cat]) return { ok: false, error: `O ${categoryDef(cat).label} já tem treinador. Demita o atual antes de contratar outro.` };
  if (employedIds(y).has(c.id)) return { ok: false, error: `${c.name} já trabalha em outra categoria: o mesmo treinador não pode comandar duas.` };
  if (!canHireStars(y, starsOf(c.rating))) return { ok: false, error: `Treinadores de 10 estrelas só podem ser contratados com a academia em 100% (hoje ${academyPercent(y)}%).` };
  const fee = hireFee(c);
  if ((g.budgets[g.userClubId] ?? 0) < fee) return { ok: false, error: 'O clube não tem caixa para as luvas do treinador.' };
  const hired: YouthCoach = { ...note(c, g.season, `Contratado para o ${categoryDef(cat).label}.`), hiredSeason: g.season, season: { gained: 0, expected: 0 } };
  let ny: YouthState = { ...y, coaches: { ...(y.coaches ?? {}), [cat]: hired }, market: { ...y.market!, list: y.market!.list.filter((x) => x.id !== c.id) } };
  ny = addLog(ny, cat, g.season, `${c.name} (${starsOf(c.rating)}★) assumiu o ${categoryDef(cat).label}.`);
  const s: GameState = { ...g, youth: ny, budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] - fee } };
  return { ok: true, state: news(s, `🧑‍🏫 ${c.name} (${starsOf(c.rating)}★) é o novo treinador do ${categoryDef(cat).label}.`, 'good') };
}

export function dismissCoach(g: GameState, cat: CategoryId, why: 'demissao' | 'saida' = 'demissao'): CoachResult {
  const y = g.youth;
  if (!y) return { ok: false, error: 'A base ainda não foi criada.' };
  const c = y.coaches?.[cat];
  if (!c) return { ok: false, error: 'A categoria não tem treinador.' };
  const cost = why === 'demissao' ? severance(c) : 0;
  if (why === 'demissao' && (g.budgets[g.userClubId] ?? 0) < cost) return { ok: false, error: 'O clube não tem caixa para a multa da demissão.' };
  const coaches = { ...(y.coaches ?? {}) }; delete coaches[cat];
  let ny: YouthState = { ...y, coaches };
  ny = addLog(ny, cat, g.season, why === 'demissao' ? `${c.name} foi demitido do ${categoryDef(cat).label}.` : `${c.name} deixou o ${categoryDef(cat).label}.`);
  const s: GameState = { ...g, youth: ny, budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] - cost } };
  return { ok: true, state: news(s, why === 'demissao' ? `🧑‍🏫 ${c.name} foi demitido do ${categoryDef(cat).label}. A vaga está aberta: escolha outro treinador no mercado.` : `🧑‍🏫 ${c.name} pediu demissão do ${categoryDef(cat).label} por falta de resultados. Contrate outro treinador.`, why === 'demissao' ? 'info' : 'bad') };
}

/* ----------------------------- desempenho e avaliação ----------------------------- */

/** Registra o treino de uma rodada na conta do treinador de cada jovem (esperado × realizado). */
export function trackSeason(y: YouthState, before: Prospect[], after: Prospect[], ticks: number): YouthState {
  if (!y.coaches) return y;
  const coaches = { ...y.coaches };
  let changed = false;
  for (let i = 0; i < after.length; i++) {
    const cat = homeCategory(after[i].player.age);
    const c = cat && coaches[cat];
    if (!c) continue;
    const gained = after[i].exact - before[i].exact;
    const expected = pointsPerYear(before[i], y, true) / Math.max(1, ticks);
    const cur = c.season ?? { gained: 0, expected: 0 };
    coaches[cat!] = { ...c, season: { ...cur, gained: cur.gained + gained, expected: cur.expected + expected } };
    changed = true;
  }
  return changed ? { ...y, coaches } : y;
}
export const ratioOf = (c: YouthCoach): number => (c.season && c.season.expected > 0.05 ? c.season.gained / c.season.expected : 1);

/** No meio da temporada avisa quando um treinador está rendendo abaixo do esperado (uma vez por temporada). */
export function midSeasonCheck(g: GameState, y: YouthState): { g: GameState; y: YouthState } {
  let s = g, ny = y;
  for (const cat of CATEGORIES.map((c) => c.id)) {
    const c = ny.coaches?.[cat];
    if (!c || c.season?.warned || !c.season || c.season.expected < 0.5) continue;
    if (ratioOf(c) < 0.9) {
      ny = { ...ny, coaches: { ...ny.coaches, [cat]: { ...note(c, g.season, 'Desempenho abaixo do esperado no meio da temporada.'), season: { ...c.season, warned: true } } } };
      s = news(s, `⚠️ O treinador do ${categoryDef(cat).label} (${c.name}) está rendendo abaixo do esperado: os jovens evoluem menos do que a diretoria espera.`, 'bad');
    }
  }
  return { g: s, y: ny };
}

/** Variação da avaliação em uma temporada: pequena e gradual (no máximo ±0,8 estrela), por evolução, talentos e objetivo. */
export function ratingDelta(ratio: number, talent: number, rating: number): number {
  const base = clamp((ratio - 1) * 2, -0.8, 0.8);
  const t = clamp(talent, -0.3, 0.3);
  const raw = base + t;
  return clamp(raw > 0 ? raw * ((10.4 - rating) / 6) : raw, -0.8, 0.8); // lá em cima fica mais difícil subir
}

/** Virada de temporada: avalia cada treinador pelo que os jovens dele evoluíram, ajusta a avaliação e decide saídas. */
export function evaluateCoaches(g: GameState, y: YouthState): { g: GameState; y: YouthState } {
  let s = g, ny = y;
  const coaches = { ...(ny.coaches ?? {}) } as Record<string, YouthCoach>;
  for (const cat of CATEGORIES.map((c) => c.id)) {
    const c = coaches[cat];
    if (!c) continue;
    const players = ny.prospects.filter((p) => homeCategory(p.player.age) === cat); // chamada antes de envelhecer
    const ratio = ratioOf(c);
    const exp = (c.season?.expected ?? 0) / Math.max(1, players.length);
    let talent = 0;
    for (const p of players) if (p.potential >= 80) talent += (p.exact - (p.base ?? p.exact)) >= exp * 1.1 ? 0.1 : -0.1;
    const delta = c.season && c.season.expected > 0.05 ? ratingDelta(ratio, talent, c.rating) : 0;
    const rating = clamp(Math.round((c.rating + delta) * 100) / 100, 1, 10);
    const met = ratio >= 0.95;
    const bad = delta <= -0.2 || ratio < 0.85 ? (c.bad ?? 0) + 1 : 0;
    const before = starsOf(c.rating), after = starsOf(rating);
    let nc: YouthCoach = { ...c, rating, bad, evals: [...(c.evals ?? []), { season: g.season, ratio: Math.round(ratio * 100) / 100, delta: Math.round(delta * 100) / 100, met }].slice(-EVAL_KEEP), season: { gained: 0, expected: 0 } };
    nc = note(nc, g.season, `Temporada ${g.season}: rendeu ${Math.round(ratio * 100)}% do esperado — objetivo ${met ? 'cumprido' : 'não cumprido'}${after !== before ? `; avaliação ${after > before ? 'subiu' : 'caiu'} para ${after}★` : ''}.`);
    if (after !== before) s = news(s, `🧑‍🏫 ${c.name} (${categoryDef(cat).label}) ${after > before ? 'melhorou' : 'perdeu'} a avaliação: ${before}★ → ${after}★.`, after > before ? 'good' : 'bad');
    coaches[cat] = nc;
    if (nc.bad! >= 2 && nc.rating <= 4) { // desempenho ruim seguido: o treinador pede para sair
      delete coaches[cat];
      ny = addLog({ ...ny, coaches }, cat, g.season, `${c.name} deixou o ${categoryDef(cat).label} por falta de resultados.`);
      s = news(s, `🧑‍🏫 ${c.name} pediu demissão do ${categoryDef(cat).label} por falta de resultados. Contrate outro treinador.`, 'bad');
    }
  }
  return { g: s, y: { ...ny, coaches } };
}

/** Folha anual dos treinadores: paga na virada de temporada. */
export function payCoaches(g: GameState, y: YouthState): GameState {
  const total = Object.values(y.coaches ?? {}).reduce((t, c) => t + (c?.wage ?? 0), 0);
  if (total <= 0) return g;
  const s: GameState = { ...g, budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] - total } };
  return news(s, `🧑‍🏫 Folha dos treinadores da base paga: R$ ${(total / 1000).toLocaleString('pt-BR')} mil.`);
}

export { expectedRating };

/** Save da Etapa 2: o treinador automático (qualidade 1 a 5) vira um treinador completo, com avaliação equivalente. Idempotente. */
export function upgradeLegacyCoaches(g: GameState, y: YouthState): YouthState {
  const cur = (y.coaches ?? {}) as Record<string, YouthCoach & { quality?: number }>;
  if (!Object.values(cur).some((c) => c && c.rating === undefined)) return y;
  const coaches: Record<string, YouthCoach> = {};
  const used = new Set<string>();
  for (const cat of CATEGORIES.map((c) => c.id)) {
    const c = cur[cat];
    if (!c) continue;
    if (c.rating !== undefined) { coaches[cat] = c; used.add(c.name); continue; }
    const stars = clamp(Math.round((0.9 + 0.06 * (c.quality ?? 2) - 0.82) / 0.04), 2, 8); // mesma velocidade que o treinador antigo tinha
    const g0 = genCoach(g, makeRng(g.seed * 73 + hashString(cat)), used, { stars });
    coaches[cat] = { ...g0, name: c.name, hiredSeason: g.season, history: [{ season: g.season, text: `Já trabalhava no ${categoryDef(cat).label} quando o sistema de treinadores começou.` }] };
    used.add(c.name);
  }
  return { ...y, coaches, coachesInit: true };
}
