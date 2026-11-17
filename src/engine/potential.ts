import { clamp, hashString, type Rng } from './rng';
import type { GameState, Player } from './types';

/* =====================================================================
   Potencial e desenvolvimento dos jovens. Todo jogador de até 25 anos tem um potencial (o overall que pode alcançar). A evolução é gradual:
   a cada temporada o jogador cobre uma fração do que falta para o potencial, conforme a idade, o ritmo individual (alguns estagnam),
   a estrutura de formação do clube e as partidas que jogou. Talentos excepcionais são raros.
   ===================================================================== */

export const PEAK_AGE = 25;
export type TalentTier = 'comum' | 'interessante' | 'grande' | 'excepcional';
export const TALENT_LABEL: Record<TalentTier, string> = { comum: 'Promessa comum', interessante: 'Potencial interessante', grande: 'Grande promessa', excepcional: 'Talento excepcional' };

/** Fração do caminho até o potencial que o jogador costuma ter feito em cada idade. */
const PROGRESS: Record<number, number> = { 16: 0.55, 17: 0.62, 18: 0.69, 19: 0.76, 20: 0.82, 21: 0.87, 22: 0.91, 23: 0.94, 24: 0.97, 25: 1 };
export const progressAt = (age: number) => (age <= 16 ? 0.55 : age >= PEAK_AGE ? 1 : PROGRESS[age]);
/** Fração do que falta que o jogador cobre em um ano. */
const RATE = (age: number) => (age <= 17 ? 0.24 : age === 18 ? 0.26 : age <= 20 ? 0.28 : age <= 22 ? 0.3 : 0.4);

/** Nível de talento a partir do potencial. */
export const tierOf = (pot: number): TalentTier => (pot >= 88 ? 'excepcional' : pot >= 80 ? 'grande' : pot >= 70 ? 'interessante' : 'comum');

/** Ritmo individual de evolução (0,35 a 1,3): estável por jogador. ~12% evoluem pouco ou estagnam; a maioria evolui no esperado. */
export function devRateOf(playerId: string): number {
  const u = (hashString(`${playerId}:ritmo`) % 1000) / 1000;
  return u < 0.12 ? 0.35 + u * 2 : u < 0.8 ? 0.8 + (u - 0.12) * 0.7 : 1.1 + (u - 0.8);
}

/** Potencial de um jogador que ainda não tem (saves antigos e jogadores do cadastro): deduzido da idade, do overall e de um sorteio estável. */
export function impliedPot(p: Pick<Player, 'id' | 'age' | 'strength'>): number {
  const yrs = Math.max(0, PEAK_AGE - p.age);
  const u = (hashString(`${p.id}:pot`) % 1000) / 1000;
  return clamp(p.strength + Math.round(yrs * (0.5 + 4.2 * u ** 2.4)), p.strength, 95);
}
/** Potencial do jogador (o registrado ou o deduzido). Depois dos 25 anos é o próprio overall. */
export const potentialOf = (p: Player): number => (p.age > PEAK_AGE ? Math.max(p.strength, p.pot ?? p.strength) : Math.max(p.strength, p.pot ?? impliedPot(p)));

/** Garante potencial em todos os jogadores de até 25 anos que ainda não têm (migração e jogadores do cadastro). Idempotente. */
export function ensurePotentials(g: GameState): GameState {
  let changed = false;
  const fix = (ps: Player[]) => ps.map((p) => (p.pot === undefined && p.age <= PEAK_AGE ? ((changed = true), { ...p, pot: impliedPot(p) }) : p));
  const teams: GameState['teams'] = {};
  for (const [id, t] of Object.entries(g.teams)) { const ps = fix(t.players); teams[id] = ps.some((p, i) => p !== t.players[i]) ? { ...t, players: ps } : t; }
  const freeAgents = g.freeAgents ? fix(g.freeAgents) : g.freeAgents;
  return changed ? { ...g, teams, freeAgents } : g;
}

/** Sorteia o potencial de um garoto novo: poucos grandes talentos, raríssimos excepcionais; clubes de mais estrutura têm chance um pouco maior, mas todos podem revelar. */
export function rollPotential(rng: Rng, infrastructure: number, level: number): { pot: number; tier: TalentTier } {
  const boost = 0.8 + 0.5 * infrastructure;          // 0,8 (estrutura fraca) a 1,3
  const r = rng();
  let tier: TalentTier = r < 0.004 * boost ? 'excepcional' : r < 0.004 * boost + 0.075 * boost ? 'grande' : r < 0.004 * boost + 0.075 * boost + 0.28 ? 'interessante' : 'comum';
  const u = rng();
  const pot = tier === 'excepcional' ? 88 + Math.round(u * 6) : tier === 'grande' ? 80 + Math.round(u * 7) : tier === 'interessante' ? 70 + Math.round(u * 9) : clamp(Math.round(level - 14 + u * 16), 45, 69);
  tier = tierOf(pot);
  return { pot, tier };
}

/** Overall de partida de um garoto da idade dada com esse potencial. */
export function startStrength(pot: number, age: number, rng: Rng): number {
  return clamp(Math.round(25 + (pot - 25) * progressAt(age) * (0.92 + 0.12 * rng())), 25, Math.max(25, pot - 1));
}

/**
 * Evolução anual de um jovem (até os 25 anos) em direção ao potencial. `apps` = partidas como titular na temporada (undefined = não se sabe),
 * `infra` = estrutura de formação do clube (0 a 1).
 */
export function growYoung(p: Player, rng: Rng, apps?: number, infra = 0.5, boost = 1): Player {
  const age = p.age;
  const pot = potentialOf(p);
  const remaining = Math.max(0, pot - p.strength);
  const play = apps === undefined ? 1 : apps >= 15 ? 1.15 : apps >= 5 ? 1 : age >= 18 ? 0.75 : 0.9; // jogar acelera, ficar parado atrasa
  const grow = Math.min(10, remaining * RATE(age) * devRateOf(p.id) * play * (0.9 + 0.2 * infra) * boost + (rng() - 0.5) * 1.6); // no máximo +10 por ano: nunca explode
  const next = clamp(Math.round(p.strength + grow), 25, Math.max(p.strength, pot));
  return { ...p, age: age + 1, strength: next, pot };
}
