import { ensureAiCoaches } from './aicoaches';
import { ensureAiContracts } from './aicontracts';
import { freezeGoals } from './aigoals';
import { ensureAiYouth } from './aiyouth';
import { makeRng } from './rng';
import type { GameState, Player } from './types';

/**
 * Compatibilidade de saves: completa o que a IA precisa (contratos, treinadores, base, objetivos) em carreiras criadas antes desses
 * sistemas, sem mexer no que já existe (elencos, caixa, histórico e o seu clube ficam como estão). Idempotente e determinística:
 * a mesma carreira sempre gera o mesmo resultado, então abrir o save várias vezes não cria decisões novas.
 */
export function ensureAiState(g: GameState): GameState {
  let s = g;
  s = dedupePlayers(s);
  s = ensureAiContracts(s);
  s = ensureAiCoaches(s);
  s = s.aiYouth ? s : ensureAiYouth(s, makeRng(s.seed * 67 + s.season * 11 + 3));
  s = freezeGoals(s);
  return s;
}

/** Garante que nenhum jogador esteja em dois lugares (clubes, livres ou base): fica no primeiro clube e as cópias saem. Nada é apagado de saves íntegros. */
export function dedupePlayers(g: GameState): GameState {
  const seen = new Set<string>();
  let changed = false;
  const teams = { ...g.teams };
  for (const [id, t] of Object.entries(g.teams)) {
    const players = t.players.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    if (players.length !== t.players.length) { teams[id] = { ...t, players, lineup: t.lineup.filter((x) => players.some((p) => p.id === x)) }; changed = true; }
  }
  let freeAgents = g.freeAgents;
  if (freeAgents) { const f = freeAgents.filter((p: Player) => (seen.has(p.id) ? false : (seen.add(p.id), true))); if (f.length !== freeAgents.length) { freeAgents = f; changed = true; } }
  return changed ? { ...g, teams, freeAgents } : g;
}
