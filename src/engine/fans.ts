import { divisionIndexOf } from './transfers';
import type { GameState } from './types';

/* =====================================================================
   Torcida do clube: quantos torcedores ele tem. Vem do tamanho histórico do clube (reputação), da divisão em que joga (a torcida não some ao
   cair, só encolhe um pouco), dos títulos conquistados e, no seu clube, do humor atual da torcida.
   ===================================================================== */

/** Torcedores por reputação (1 a 5). */
const BY_REP = [20_000, 150_000, 1_200_000, 6_000_000, 22_000_000];
/** Quanto da torcida fica em cada divisão (A, B, C, D, fora da pirâmide). */
const BY_DIV = [1, 0.8, 0.65, 0.5, 0.4];
/** Cada título (campeonato ou copa) soma 1,2% à torcida, até +50%. */
const PER_TITLE = 0.012, MAX_TITLES_BONUS = 0.5;

const titlesOf = (g: GameState, id: string): number => g.history.reduce((n, h) => n
  + h.divisions.filter((d) => d.championId === id).length
  + [h.cupChampionId, h.libChampionId, h.sulaChampionId, h.uclChampionId, h.mundialChampionId, h.superChampionId, h.nordesteChampionId, h.verdeChampionId, h.sulsudesteChampionId].filter((c) => c === id).length, 0);

/** Número de torcedores de um clube (arredondado para centenas). */
export function fanBase(g: GameState, id: string = g.userClubId): number {
  const rep = Math.min(5, Math.max(1, g.clubs[id]?.reputation ?? 1));
  const div = BY_DIV[Math.min(Math.max(divisionIndexOf(g, id), 0), 4)];
  const mood = id === g.userClubId && !g.observer ? 0.85 + g.morale.fans / 400 : 1; // humor da torcida: de 85% a 110%
  const titles = 1 + Math.min(MAX_TITLES_BONUS, PER_TITLE * titlesOf(g, id));
  return Math.max(100, Math.round((BY_REP[rep - 1] * div * mood * titles) / 100) * 100);
}

/** Os clubes com maior torcida entre os clubes do campeonato e a posição do seu clube. */
export function fanRanking(g: GameState, top = 5): { top: { clubId: string; fans: number }[]; position: number; total: number } {
  const ids = g.divisions.filter((d) => d.format !== 'outside').flatMap((d) => d.clubIds);
  const all = [...new Set([...ids, g.userClubId])].map((clubId) => ({ clubId, fans: fanBase(g, clubId) })).sort((a, b) => b.fans - a.fans || a.clubId.localeCompare(b.clubId));
  return { top: all.slice(0, top), position: all.findIndex((x) => x.clubId === g.userClubId) + 1, total: all.length };
}

/** "3,4 milhões", "850 mil", "12.300". */
export function formatFans(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${n >= 2_000_000 ? 'milhões' : 'milhão'}`;
  if (n >= 100_000) return `${Math.round(n / 1000).toLocaleString('pt-BR')} mil`;
  return n.toLocaleString('pt-BR');
}
