import { ATTRIBUTES, attributesOf, homeCategory, type CategoryId } from './categories';
import { clamp, hashString, type Rng } from './rng';
import type { Position } from './types';
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
  return Math.min(STAR_POTENTIAL - 1, Math.round(48 + 34 * Math.pow(rng(), 0.85) + academyLevel * 1.5));
}

/* ----------------------------- fatores de velocidade ----------------------------- */

/** Pontos de overall por ano para um jovem "médio" em cada idade (crianças evoluem devagar; o pico vem entre 16 e 18 anos). */
const BASE_POINTS: Record<number, number> = { 12: 3, 13: 4, 14: 6, 15: 8, 16: 9, 17: 10, 18: 9, 19: 8, 20: 6, 21: 4 };
export const basePointsAt = (age: number): number => (age <= 12 ? 3 : age >= 22 ? 1.5 : BASE_POINTS[age]);

/** Dedicação do jovem (0,7 a 1,3): traço individual, fixo pela identidade. */
export const dedicationOf = (playerId: string): number => 0.7 + ((hashString(`${playerId}:dedicacao`) % 1000) / 1000) * 0.6;
export const dedicationLabel = (d: number): string => (d >= 1.1 ? 'Alta' : d >= 0.85 ? 'Média' : 'Baixa');

export const academyFactor = (level: number): number => 0.9 + 0.05 * level;
export const coachFactor = (quality: number): number => 0.9 + 0.06 * quality;
export const potentialFactor = (pot: number): number => 0.8 + 0.4 * clamp((pot - 40) / 57, 0, 1);
/** Perto do potencial a evolução desacelera; no potencial para de vez. */
export const gapFactor = (ovr: number, pot: number): number => clamp((pot - ovr) / 10, 0, 1);
/** A especialidade rende mais ou menos conforme a idade (crianças não devem sobrecarregar o físico). */
export function focusAgeFactor(focus: Specialty | undefined, age: number): number {
  if (focus === 'fisico') return age <= 13 ? 0.75 : age >= 16 ? 1.1 : 1;
  if (focus === 'tecnico') return age <= 15 ? 1.1 : 1;
  if (focus === 'tatico') return age <= 13 ? 0.8 : age >= 16 ? 1.08 : 1;
  return 1;
}

/* ----------------------------- treinadores das categorias ----------------------------- */

export interface YouthCoach { name: string; /** 1 a 5 */ quality: number }
export const coachOf = (y: YouthState, age: number): YouthCoach | undefined => { const c = homeCategory(age); return c ? y.coaches?.[c] : undefined; };
export const coachQualityFor = (y: YouthState, age: number): number => coachOf(y, age)?.quality ?? 2;
/** Qualidade de um treinador novo: depende da academia e de um traço estável da categoria. */
export const rollCoachQuality = (seed: number, cat: CategoryId, academyLevel: number): number => clamp(1 + Math.round(academyLevel * 0.5) + (hashString(`${seed}:${cat}:treinador`) % 3), 1, 5);

/* ----------------------------- a barra de treino ----------------------------- */

/** Pontos de overall por ano que ESTE jovem ganharia agora (já com todos os fatores). */
export function pointsPerYear(p: Prospect, y: YouthState): number {
  const age = p.player.age;
  const mult = academyFactor(y.level) * coachFactor(coachQualityFor(y, age)) * potentialFactor(p.potential) * dedicationOf(p.player.id) * focusAgeFactor(p.focus, age) * gapFactor(p.player.strength, p.potential);
  return basePointsAt(age) * clamp(mult, 0, 1.8);
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
export function trainTick(p: Prospect, y: YouthState, ticks: number): Prospect {
  const ovr = p.player.strength;
  if (ovr >= p.potential) return p.train === 0 && p.exact === ovr ? p : { ...p, train: 0, exact: ovr };
  let train = (p.train ?? 0) + (pointsPerYear(p, y) / Math.max(1, ticks)) * 100;
  let strength = ovr, attrs = p.attrs ?? attrsOf(p);
  if (train >= 100) { strength = ovr + 1; train = 0; attrs = distributeAttrs(attrs, p.player.pos, p.focus); }
  return { ...p, train, attrs, exact: strength + train / 100, player: strength === ovr ? p.player : { ...p.player, strength } };
}

