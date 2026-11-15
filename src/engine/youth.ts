import { inflate, priceIndex } from './economy';
import { baseIncome } from './finance';
import { makeRng, type Rng } from './rng';
import { pickSpot, randomName } from './squad';
import { divisionIndexOf, MAX_SQUAD } from './transfers';
import type { GameState, NewsItem, Player, Position } from './types';

/** Um jovem da base: o jogador (idade 15–19) e o quanto ele pode chegar a ser (potencial). `exact` guarda a força com casas decimais. */
export interface Prospect { player: Player; potential: number; exact: number }
export interface YouthState { level: number; prospects: Prospect[]; seq: number; lastIntake: number }

export const MAX_LEVEL = 5;
export const MAX_PROSPECTS = 14;
export const RELEASE_AGE = 20;
const POS_BAG: Position[] = ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT', 'ATT'];

export const youthOf = (g: GameState): YouthState => g.youth ?? { level: 0, prospects: [], seq: 1, lastIntake: -1 };
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
    const age = 15 + Math.floor(rng() * 3);
    const strength = Math.round(28 + y.level * 3 + rng() * 10);
    const gem = rng() < 0.06 + y.level * 0.02;
    const potential = Math.min(97, Math.max(strength + 12, Math.round(55 + rng() * 28 + y.level * 4 + (gem ? 12 : 0))));
    fresh.push({ player: { id: `${g.userClubId}-y${seq++}`, name: randomName(rng, used), pos, spot: pickSpot(fresh.map((x) => x.player), pos), age, strength }, potential, exact: strength });
  }
  const all = [...y.prospects, ...fresh].sort((a, b) => b.potential - a.potential).slice(0, MAX_PROSPECTS);
  return { ...y, prospects: all, seq, lastIntake: g.season };
}

/** Garante que a base tenha a primeira safra. */
export function ensureYouth(g: GameState): GameState {
  if (g.youth || g.unemployed || g.observer) return g;
  const y0 = youthOf(g);
  return { ...g, youth: intake(g, y0, makeRng(g.seed * 53 + g.season * 7 + 3)) };
}

/** A cada rodada os jovens evoluem um pouco rumo ao potencial (mais rápido com academia melhor). */
export function youthTick(g: GameState): GameState {
  if (g.unemployed || g.observer) return g;
  const s = ensureYouth(g);
  const y = youthOf(s);
  const rng = makeRng(s.seed * 59 + s.season * 11 + s.round);
  const rate = 0.012 * (1 + 0.2 * y.level);
  const prospects = y.prospects.map((p) => {
    const exact = Math.min(p.potential, p.exact + (p.potential - p.exact) * rate * (0.6 + rng() * 0.8) + 0.04);
    return { ...p, exact, player: { ...p.player, strength: Math.round(exact) } };
  });
  return { ...s, youth: { ...y, prospects } };
}

/** Virada de temporada: todos ficam um ano mais velhos e crescem mais; quem chega aos 20 anos sai da base; entra uma safra nova. */
export function youthSeason(g: GameState): GameState {
  if (g.unemployed || g.observer) return g;
  let s = ensureYouth(g);
  const y = youthOf(s);
  const rng = makeRng(s.seed * 61 + s.season * 13 + 9);
  const grown = y.prospects.map((p) => {
    const exact = Math.min(p.potential, p.exact + (p.potential - p.exact) * (0.18 + y.level * 0.03) * (0.7 + rng() * 0.6) + 1);
    return { ...p, exact, player: { ...p.player, age: p.player.age + 1, strength: Math.round(exact) } };
  });
  const gone = grown.filter((p) => p.player.age >= RELEASE_AGE);
  const keep = grown.filter((p) => p.player.age < RELEASE_AGE);
  if (gone.length) s = news(s, `🌱 Saíram da base por idade: ${gone.map((p) => p.player.name).join(', ')}.`);
  s = { ...s, youth: intake(s, { ...y, prospects: keep }, rng) };
  return news(s, '🌱 Nova safra da base: novos jovens chegaram às categorias de base.', 'good');
}

/** Salário anual de um jovem promovido (R$). */
export const youthWage = (g: GameState, p: Prospect) => Math.max(18_000, Math.round(inflate(g, 20_000 + p.player.strength * 600) / 1_000) * 1_000);

export type YouthResult = { ok: true; state: GameState } | { ok: false; error: string };

export function promoteProspect(g: GameState, id: string): YouthResult {
  const y = youthOf(g);
  const p = y.prospects.find((x) => x.player.id === id);
  if (!p) return { ok: false, error: 'Jovem não encontrado.' };
  const team = g.teams[g.userClubId];
  if (team.players.length >= MAX_SQUAD) return { ok: false, error: `Elenco cheio (${MAX_SQUAD}). Venda ou dispense alguém antes.` };
  const player: Player = { ...p.player, strength: Math.round(p.exact), contract: { wage: youthWage(g, p), until: g.season + 3 } };
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
