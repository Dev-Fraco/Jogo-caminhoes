import { categoryDef, categoriesOf, type CategoryId, CATEGORIES } from './categories';
import { facilityTrainingFactor, START_FACILITIES, academySpeed, dedicationWith, type FacilityLevels } from './academy';
import { clamp, hashString, makeRng } from './rng';
import { autoLineup, randomName, pickSpot } from './squad';
import { basePointsAt, dedicationOf, gapFactor, potentialFactor, ratingFactor, rollPotential, categoryCoach } from './training';
import { youthOf, type Prospect } from './youth';
import type { GameState, Player, Position, TeamState } from './types';

/* =====================================================================
   Elencos da base para as COMPETIÇÕES (Etapa 5).
   - Seu clube: os jovens REAIS da sua base (Prospect), elegíveis pela idade da categoria.
   - Clubes da IA: cada clube tem a sua base (uma turma por idade, 9 atletas por turma), com identidade fixa (id = clube~ano de nascimento~vaga).
     Eles não ficam guardados no save: nome, posição, potencial e dedicação saem do id, e o overall sai da MESMA conta de treino do seu clube
     (idade, academia, instalações, treinador da categoria, potencial, dedicação), crescendo ao longo da temporada. Ninguém é inventado só para
     completar uma partida: quem não tem atletas suficientes não se inscreve (ou perde por W.O.).
   ===================================================================== */

export const MIN_ROSTER = 11;            // atletas elegíveis para inscrever o clube em uma categoria
export const COHORT_SIZE = 9;            // atletas de cada turma (idade) nos clubes da IA
const SLOT_POS: Position[] = ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT', 'ATT'];

export interface YQuality { level: number; fac: FacilityLevels; coach: number }

/** Estrutura de formação de um clube (academia, instalações e treinador da categoria): a real do seu clube, a da IA, ou uma estimada pela reputação. */
export function qualityOf(g: GameState, clubId: string, cat: CategoryId): YQuality {
  if (clubId === g.userClubId && g.youth) {
    const y = g.youth;
    return { level: y.level, fac: { ...START_FACILITIES, ...(y.fac ?? {}) }, coach: y.coaches?.[cat]?.rating ?? 0 };
  }
  const rep = g.clubs[clubId]?.reputation ?? g.foreign?.clubs[clubId]?.reputation ?? 1;
  const ac = g.aiAcademy?.[clubId];
  const idx = CATEGORIES.findIndex((c) => c.id === cat);
  const co = g.aiYouthCoaches?.[clubId]?.[idx];
  const level = ac ? ac[0] : clamp(Math.round(rep * 2.6), 0, 18);
  const fac: FacilityLevels = ac ? { centro: ac[1], fisica: ac[2], medico: ac[3], alojamento: ac[4], campos: ac[5] } : { centro: 1 + rep, fisica: 1 + rep, medico: 1 + rep, alojamento: 1 + rep, campos: 1 + rep };
  return { level, fac, coach: co ? co[0] / 10 : clamp(2 + rep * 1.1, 1, 9) };
}

/** Nome estável de um atleta da IA (sai só do id). */
export const youthName = (id: string): string => randomName(makeRng(hashString(`${id}:nome`)), new Set());

/** Pontos de overall que o atleta ganha em um ano de idade `age`, com a MESMA conta do treino do seu clube (training.ts). */
function yearGain(id: string, pot: number, ovr: number, age: number, q: YQuality): number {
  const mult = academySpeed(q.level) * facilityTrainingFactor({ fac: q.fac }, undefined) * (q.coach ? ratingFactor(q.coach) : 0.7) * potentialFactor(pot) * dedicationWith(dedicationOf(id), { fac: q.fac }) * gapFactor(ovr, pot, q.level);
  return basePointsAt(age) * clamp(mult, 0, 2.2);
}

/** Overall de um atleta da IA na idade e no ponto da temporada (`frac` de 0 a 1). Nunca passa do potencial; o potencial NÃO é força atual. */
export function aiOverall(id: string, pot: number, age: number, frac: number, q: YQuality): number {
  let ovr = 5;
  for (let a = 12; a < age; a++) ovr = Math.min(pot, ovr + yearGain(id, pot, ovr, a, q));
  return Math.round(Math.min(pot, ovr + yearGain(id, pot, ovr, age, q) * clamp(frac, 0, 1)));
}

const CACHE = new Map<string, Player[]>();
const bucket = (frac: number) => Math.round(clamp(frac, 0, 1) * 20);

/** Todos os atletas do clube elegíveis (pela idade) à categoria: os reais do seu clube ou a base derivada da IA. */
export function rosterOf(g: GameState, clubId: string, cat: CategoryId, frac: number): Player[] {
  const def = categoryDef(cat);
  if (clubId === g.userClubId && !g.unemployed && !g.observer) {
    const y = youthOf(g);
    return y.prospects.filter((p) => p.player.age >= def.minAge && p.player.age <= def.maxAge).map((p) => p.player);
  }
  const key = `${clubId}|${cat}|${g.season}|${bucket(frac)}|${g.aiAcademy?.[clubId]?.[0] ?? '-'}|${g.aiYouthCoaches?.[clubId]?.[CATEGORIES.findIndex((c) => c.id === cat)]?.[0] ?? '-'}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const q = qualityOf(g, clubId, cat);
  const out: Player[] = [];
  for (let age = def.minAge; age <= def.maxAge; age++) {
    const born = g.season - age;
    for (let j = 0; j < COHORT_SIZE; j++) {
      const id = `${clubId}~${born}~${j}`;
      const pos = SLOT_POS[j];
      const pot = rollPotential(makeRng(hashString(`${id}:pot`)), q.level);
      out.push({ id, name: youthName(id), pos, age, strength: aiOverall(id, pot, age, frac, q), pot });
    }
  }
  for (const p of out) p.spot = pickSpot(out.filter((x) => x !== p && x.spot), p.pos);
  if (CACHE.size > 6000) CACHE.clear();
  CACHE.set(key, out);
  return out;
}

/** Escalação da categoria: o treinador (ou a IA) escolhe os 11 melhores entre quem está livre. O usuário não escala. */
export function pickTeam(g: GameState, clubId: string, cat: CategoryId, frac: number, busy: Set<string>): TeamState | undefined {
  const free = rosterOf(g, clubId, cat, frac).filter((p) => !busy.has(p.id));
  if (free.length < MIN_ROSTER) return undefined;
  return { clubId, players: free, formation: '4-4-2', lineup: autoLineup(free, '4-4-2') };
}

/** Força de preparação do time (treinador e academia física): multiplica a força dele na simulação, de leve. */
export function prepMods(g: GameState, clubId: string, cat: CategoryId): number {
  const q = qualityOf(g, clubId, cat);
  return 1 + 0.004 * ((q.coach || 3) - 5) + 0.0015 * (q.fac.fisica - 1);
}

/** O seu clube pode se inscrever na categoria? (precisa de atletas elegíveis suficientes) */
export const enrollCheck = (g: GameState, cat: CategoryId): { ok: boolean; have: number; need: number } => {
  const have = rosterOf(g, g.userClubId, cat, 0).length;
  return { ok: have >= MIN_ROSTER, have, need: MIN_ROSTER };
};

export { categoriesOf, categoryCoach };
export type { Prospect };
