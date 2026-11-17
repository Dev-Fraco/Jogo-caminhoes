import { clamp, hashString } from './rng';
import type { Player, Position } from './types';

/* =====================================================================
   Categorias de base — regras de idade (FUNDAÇÃO).
   Um atleta tem UM cadastro só (um `Prospect` em `youth.prospects`, com id único). As categorias não guardam jogadores: são
   FAIXAS DE IDADE aplicadas à lista única. Quem tem 16 ou 17 anos aparece no Sub-17 e no Sub-21 sendo o mesmo registro.
   A idade só muda na virada de temporada (`youthSeason`), no mesmo calendário do restante do jogo.
   ===================================================================== */

export type CategoryId = 'sub13' | 'sub15' | 'sub17' | 'sub21';
export interface CategoryDef { id: CategoryId; label: string; minAge: number; maxAge: number }

export const CATEGORIES: readonly CategoryDef[] = [
  { id: 'sub13', label: 'Sub-13', minAge: 12, maxAge: 13 },
  { id: 'sub15', label: 'Sub-15', minAge: 14, maxAge: 15 },
  { id: 'sub17', label: 'Sub-17', minAge: 16, maxAge: 17 },
  { id: 'sub21', label: 'Sub-21', minAge: 16, maxAge: 21 },
];

/** Todo jovem novo da academia nasce assim (o overall sobe depois, no sistema de evolução). */
export const ACADEMY_START_AGE = 12;
export const ACADEMY_START_OVERALL = 5;
/** Menores de 16 anos não podem ir ao profissional; a partir daí a decisão é só do usuário. */
export const MIN_PRO_AGE = 16;
/** Idade em que o jovem fica pendente de uma decisão do clube (profissional, empréstimo ou dispensa). */
export const DECISION_AGE = 21;

export const categoryDef = (id: CategoryId): CategoryDef => CATEGORIES.find((c) => c.id === id)!;
export const inCategory = (age: number, id: CategoryId): boolean => { const c = categoryDef(id); return age >= c.minAge && age <= c.maxAge; };
/** Categorias em que um atleta dessa idade pode atuar (16 e 17 anos: Sub-17 e Sub-21). */
export const categoriesOf = (age: number): CategoryId[] => CATEGORIES.filter((c) => age >= c.minAge && age <= c.maxAge).map((c) => c.id);
/** Categoria "de origem" (a mais jovem em que se encaixa), usada para registrar a passagem de categoria no histórico. */
export const homeCategory = (age: number): CategoryId | undefined => categoriesOf(age)[0];
export const canPromoteAge = (age: number): boolean => age >= MIN_PRO_AGE;
export const needsDecision = (age: number): boolean => age >= DECISION_AGE;

/** Quem está em cada categoria (um mesmo atleta pode estar em duas) e quem aguarda decisão (21 anos ou mais). */
export function splitByCategory<T extends { player: Pick<Player, 'age'> }>(list: readonly T[]): Record<CategoryId, T[]> {
  const out = { sub13: [], sub15: [], sub17: [], sub21: [] } as Record<CategoryId, T[]>;
  for (const p of list) for (const id of categoriesOf(p.player.age)) out[id].push(p);
  return out;
}
export const awaitingDecision = <T extends { player: Pick<Player, 'age'> }>(list: readonly T[]): T[] => list.filter((p) => needsDecision(p.player.age));

/* ----------------------- atributos individuais (derivados do overall) ----------------------- */

/** Seis atributos por posição; os primeiros são os mais fortes da função. Não são guardados: saem do overall e da identidade do jogador, então nunca desencontram. */
export const ATTRIBUTES: Record<Position, readonly string[]> = {
  GK: ['Reflexos', 'Posicionamento', 'Jogo aéreo', 'Agilidade', 'Passe', 'Saída de bola'],
  DEF: ['Marcação', 'Desarme', 'Jogo aéreo', 'Posicionamento', 'Velocidade', 'Passe'],
  MID: ['Passe', 'Visão de jogo', 'Controle', 'Desarme', 'Fôlego', 'Chute de fora'],
  ATT: ['Finalização', 'Drible', 'Velocidade', 'Controle', 'Cabeceio', 'Posicionamento'],
};
const OFFSET = [4, 2, 0, 0, -2, -4]; // soma zero: a média dos atributos fica no overall

export function attributesOf(p: Pick<Player, 'id' | 'pos' | 'strength'>): { name: string; value: number }[] {
  const names = ATTRIBUTES[p.pos];
  const jit = names.map((_, i) => (hashString(`${p.id}:attr:${i}`) % 7) - 3);
  const mean = Math.round(jit.reduce((a, b) => a + b, 0) / jit.length);
  const room = p.strength < 15 ? 0.5 : 1; // jovens muito fracos variam menos
  return names.map((name, i) => ({ name, value: clamp(Math.round(p.strength + OFFSET[i] * room + (jit[i] - mean) * room), 1, 99) }));
}
