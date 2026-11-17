import { ATTRIBUTES, attributesOf, homeCategory } from './categories';
import { clamp, hashString, type Rng } from './rng';
import type { Position } from './types';
import { academySpeed, coachSpecBonus, dedicationWith, facilityTrainingFactor, gapWindow, MAX_ACADEMY_LEVEL, potentialBonus } from './academy';
import type { CoachSpecId, YouthCoach } from './coaches';
import type { Prospect, YouthState } from './youth';

/* =====================================================================
   Treinamento e evolução dos jovens da base (ETAPA 2).
   - Cada jovem tem uma barra de treino de 0 a 100 (%). Ao chegar a 100: +1 de overall (exatamente) e a barra reinicia em 0.
   - A barra enche pouco a cada rodada (a evolução é gradual, sem saltos). Quanto enche depende da idade, da academia, do treinador da
     categoria, do potencial, da dedicação do jogador e de quanto falta para o potencial. No potencial máximo a barra para.
   - Os seis atributos acompanham o overall: a cada +1 de overall, 6 pontos de atributo são distribuídos conforme a especialidade de treino.
   Tudo é determinístico (sem sorteio na rodada): o mesmo save sempre evolui igual.
   ===================================================================== */

export type Specialty = 'fisico' | 'tecnico' | 'tatico' | 'fundamentos';
export const SPECIALTIES: readonly { id: Specialty; label: string; icon: string; hint: string }[] = [
  { id: 'fisico', label: 'Físico', icon: '💪', hint: 'Velocidade, fôlego, agilidade e jogo aéreo.' },
  { id: 'tecnico', label: 'Técnico', icon: '🎯', hint: 'Passe, controle e drible.' },
  { id: 'tatico', label: 'Tático', icon: '🧠', hint: 'Posicionamento, marcação e leitura de jogo.' },
  { id: 'fundamentos', label: 'Fundamentos', icon: '🧤', hint: 'O essencial da posição: reflexos (goleiro), desarme (defesa/meio), finalização e cabeceio (ataque).' },
];
export const specialtyLabel = (s: Specialty | undefined): string => (s ? SPECIALTIES.find((x) => x.id === s)!.label : 'Equilibrado');

/** Tipo de treino de cada um dos seis atributos (mesma ordem de `ATTRIBUTES`). */
export const ATTR_KIND: Record<Position, readonly Specialty[]> = {
  GK: ['fundamentos', 'tatico', 'fisico', 'fisico', 'tecnico', 'tatico'],
  DEF: ['tatico', 'fundamentos', 'fisico', 'tatico', 'fisico', 'tecnico'],
  MID: ['tecnico', 'tatico', 'tecnico', 'fundamentos', 'fisico', 'fundamentos'],
  ATT: ['fundamentos', 'tecnico', 'fisico', 'tecnico', 'fundamentos', 'tatico'],
};

/* ----------------------------- potencial e estrelas ----------------------------- */

/** Proporção de estrelas entre os jovens novos (~8%) e potencial mínimo para ser estrela. */
export const STAR_RATE = 0.08;
export const STAR_POTENTIAL = 85;
export const isStar = (p: Pick<Prospect, 'potential'>): boolean => p.potential >= STAR_POTENTIAL;

/** Potencial de um jovem novo. Talentos excepcionais (85+) são raros (~8%); a academia melhora só um pouco o restante. */
export function rollPotential(rng: Rng, academyLevel: number): number {
  if (rng() < STAR_RATE) return STAR_POTENTIAL + Math.floor(rng() * (97 - STAR_POTENTIAL + 1));
  return Math.min(STAR_POTENTIAL - 1, Math.round(48 + 34 * Math.pow(rng(), 0.85) + potentialBonus(academyLevel)));
}

/* ----------------------------- fatores de velocidade ----------------------------- */

/** Pontos de overall por ano para um jovem "médio" em cada idade (crianças evoluem devagar; o pico vem entre 16 e 18 anos). */
const BASE_POINTS: Record<number, number> = { 12: 3, 13: 4, 14: 6, 15: 8, 16: 9, 17: 10, 18: 9, 19: 8, 20: 6, 21: 4 };
export const basePointsAt = (age: number): number => (age <= 12 ? 3 : age >= 22 ? 1.5 : BASE_POINTS[age]);

/** Dedicação do jovem (0,7 a 1,3): traço individual, fixo pela identidade. */
export const dedicationOf = (playerId: string): number => 0.7 + ((hashString(`${playerId}:dedicacao`) % 1000) / 1000) * 0.6;
export const dedicationLabel = (d: number): string => (d >= 1.1 ? 'Alta' : d >= 0.85 ? 'Média' : 'Baixa');

/** A academia tem 20 níveis; 100% de desenvolvimento = nível 20 (regra dos treinadores de 10 estrelas). */
export const ACADEMY_MAX_LEVEL = MAX_ACADEMY_LEVEL;
export { academyPercent } from './academy';
export const academyFactor = (level: number): number => academySpeed(level);
export const potentialFactor = (pot: number): number => 0.8 + 0.4 * clamp((pot - 40) / 57, 0, 1);
/** Perto do potencial a evolução desacelera; no potencial para de vez. */
export const gapFactor = (ovr: number, pot: number, level = 0): number => clamp((pot - ovr) / gapWindow(level), 0, 1);
/** A especialidade rende mais ou menos conforme a idade (crianças não devem sobrecarregar o físico). */
export function focusAgeFactor(focus: Specialty | undefined, age: number): number {
  if (focus === 'fisico') return age <= 13 ? 0.75 : age >= 16 ? 1.1 : 1;
  if (focus === 'tecnico') return age <= 15 ? 1.1 : 1;
  if (focus === 'tatico') return age <= 13 ? 0.8 : age >= 16 ? 1.08 : 1;
  return 1;
}

/* ----------------------------- treinadores das categorias (Etapa 3) ----------------------------- */

/** Treinador da categoria "de origem" do jovem (16 e 17 anos: Sub-17; 18 a 21: Sub-21). */
export const categoryCoach = (y: YouthState, age: number): YouthCoach | undefined => { const c = homeCategory(age); return c ? y.coaches?.[c] : undefined; };
/** Sem treinador na vaga (demitido e ainda não substituído) o treino rende bem menos. */
export const NO_COACH_FACTOR = 0.7;
/** Avaliação (1 a 10, com decimais) → velocidade: 1★ = 0,86 · 5★ = 1,02 · 10★ = 1,22. */
export const ratingFactor = (rating: number): number => 0.82 + 0.04 * clamp(rating, 1, 10);
/** Avaliação que a diretoria espera de um treinador conforme a academia (cumprir o objetivo = render isso ou mais). */
export const expectedRating = (level: number): number => 3 + 0.3 * level; // 3★ no nível 0 a 9★ no nível 20

const POS_SPEC: Record<Position, CoachSpecId> = { GK: 'goleiros', DEF: 'defensores', MID: 'meias', ATT: 'atacantes' };
const PREP_KIND: Record<'fisica' | 'tecnica' | 'tatica', Specialty> = { fisica: 'fisico', tecnica: 'tecnico', tatica: 'tatico' };
const PREP_OF = (s: CoachSpecId): Specialty | undefined => (s === 'fisica' || s === 'tecnica' || s === 'tatica' ? PREP_KIND[s] : undefined);

/** Média dos atributos de cada tipo de treino do jogador. */
function kindMeans(p: Prospect): Record<Specialty, number> {
  const kinds = ATTR_KIND[p.player.pos], a = attrsOf(p);
  const out = {} as Record<Specialty, number>;
  for (const s of SPECIALTIES) { const idx = kinds.map((k, i) => (k === s.id ? i : -1)).filter((i) => i >= 0); out[s.id] = idx.reduce((t, i) => t + a[i], 0) / Math.max(1, idx.length); }
  return out;
}

/** O TREINADOR decide o foco de cada jovem: especialista na posição → fundamentos; com preparação (física/técnica/tática) → a dele
 *  que mais falta ao jovem; generalista → o ponto mais fraco do jovem. Sem treinador: equilibrado. O usuário não escolhe. */
export function assignFocus(p: Prospect, coach: YouthCoach | undefined): Specialty | undefined {
  if (!coach) return undefined;
  if (coach.specs.includes(POS_SPEC[p.player.pos])) return 'fundamentos';
  const m = kindMeans(p);
  const preps = coach.specs.map(PREP_OF).filter((x): x is Specialty => !!x);
  const pool = preps.length ? preps : SPECIALTIES.map((x) => x.id);
  return [...pool].sort((x, y) => m[x] - m[y])[0];
}

/** Quanto o treinador acelera (ou não) ESTE jovem: avaliação, característica profissional e especialidades que casam com ele. */
export function coachFactorFor(coach: YouthCoach | undefined, p: Prospect, y?: Pick<YouthState, 'fac'>): number {
  if (!coach) return NO_COACH_FACTOR;
  const age = p.player.age;
  let f = ratingFactor(coach.rating);
  if (coach.trait === 'paciente' && age <= 14) f *= 1.1;
  else if (coach.trait === 'exigente' && age >= 16) f *= 1.07;
  else if (coach.trait === 'revelador' && p.potential >= 75) f *= 1.08;
  else if (coach.trait === 'metodico') f *= 1.03;
  if (coach.specs.includes(POS_SPEC[p.player.pos])) f *= 1.15 * (y ? coachSpecBonus(y, POS_SPEC[p.player.pos]) : 1); // especialista na posição do jovem (+ campos)
  const prepSpec = p.focus ? coach.specs.find((x) => PREP_OF(x) === p.focus) : undefined;
  if (prepSpec) f *= 1.1 * (y ? coachSpecBonus(y, prepSpec) : 1); // o foco dele é uma preparação em que o treinador é especialista (+ instalação)
  return f;
}

/* ----------------------------- a barra de treino ----------------------------- */

/** Pontos de overall por ano que ESTE jovem ganharia agora (já com todos os fatores). `benchmark` troca o treinador real por um treinador
 *  "esperado" (sem especialidade nem característica): é o ritmo que a diretoria espera, usado para avaliar o treinador. */
export function pointsPerYear(p: Prospect, y: YouthState, benchmark = false): number {
  const age = p.player.age;
  const coachF = benchmark ? ratingFactor(expectedRating(y.level)) : coachFactorFor(categoryCoach(y, age), p, y);
  const focus = benchmark ? undefined : p.focus;
  const mult = academyFactor(y.level) * facilityTrainingFactor(y, focus) * coachF * potentialFactor(p.potential) * dedicationWith(dedicationOf(p.player.id), y) * focusAgeFactor(focus, age) * gapFactor(p.player.strength, p.potential, y.level);
  return basePointsAt(age) * clamp(mult, 0, 2.2);
}

/** Atributos guardados do jovem (ou os derivados do overall, em saves antigos). */
export function attrsOf(p: Prospect): number[] {
  return p.attrs && p.attrs.length === 6 ? p.attrs : attributesOf(p.player).map((a) => a.value);
}
export const attrNames = (pos: Position): readonly string[] => ATTRIBUTES[pos];

/** +1 de overall = 6 pontos de atributo, distribuídos pela especialidade (sem foco: um ponto para cada). A soma sempre fecha. */
export function distributeAttrs(attrs: readonly number[], pos: Position, focus: Specialty | undefined): number[] {
  const kinds = ATTR_KIND[pos];
  const w = kinds.map((k) => (focus && k === focus ? 4 : 1));
  const sum = w.reduce((a, b) => a + b, 0);
  const quota = w.map((x) => (6 * x) / sum);
  const add = quota.map(Math.floor);
  let left = 6 - add.reduce((a, b) => a + b, 0);
  quota.map((q, i) => ({ i, f: q - Math.floor(q) })).sort((a, b) => b.f - a.f || a.i - b.i).forEach(({ i }) => { if (left > 0) { add[i]++; left--; } });
  return attrs.map((v, i) => Math.min(99, v + add[i]));
}

/** Um passo de treino (uma rodada). `ticks` = quantos passos tem a temporada. Nunca passa do potencial e nunca dá mais de +1 por passo. */
export function trainTick(p0: Prospect, y: YouthState, ticks: number): Prospect {
  const focus = assignFocus(p0, categoryCoach(y, p0.player.age)); // o treinador decide o foco
  const p = p0.focus === focus ? p0 : { ...p0, focus };
  const ovr = p.player.strength;
  if (ovr >= p.potential) return p.train === 0 && p.exact === ovr ? p : { ...p, train: 0, exact: ovr };
  let train = (p.train ?? 0) + (pointsPerYear(p, y) / Math.max(1, ticks)) * 100;
  let strength = ovr, attrs = p.attrs ?? attrsOf(p);
  if (train >= 100) { strength = ovr + 1; train = 0; attrs = distributeAttrs(attrs, p.player.pos, p.focus); }
  return { ...p, train, attrs, exact: strength + train / 100, player: strength === ovr ? p.player : { ...p.player, strength } };
}

