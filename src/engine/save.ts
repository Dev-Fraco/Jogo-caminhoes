import { ensureAiState } from './aistate';
import { CLUBS_DATA } from '../data/clubs';
import { withSpots } from './squad';
import type { GameState } from './types';

const KEY = 'caminhoes-save-v1'; // mesma chave de antes; o campo `version` do conteúdo diz o formato
export const SAVE_VERSION = 5;

export function saveGame(g: GameState) {
  try { localStorage.setItem(KEY, JSON.stringify(g)); } catch { /* armazenamento cheio/bloqueado */ }
}

/** Confere se um JSON de save tem o formato de uma versão suportada (2 a 5). */
export function isValidSave(g: unknown): g is GameState {
  const s = g as Partial<GameState> | null;
  return !!s && ((s.version as number) === 2 || (s.version as number) === 3 || (s.version as number) === 4 || s.version === SAVE_VERSION) && !!s.divisions && !!s.teams && !!s.clubs && !!s.userClubId && typeof s.round === 'number';
}

/** Completa saves antigos (v2 a v4) com os campos novos: orçamentos, histórico, humor, listas, propostas e empréstimos. */
export function migrateSave(g: GameState): GameState {
  if ((g.version as number) === SAVE_VERSION) return g;
  const data = new Map(Object.values(CLUBS_DATA).flat().map((c) => [c.id, c]));
  const budgets = g.budgets ?? Object.fromEntries(Object.keys(g.clubs).map((id) => [id, data.get(id)?.budget ?? 10_000_000]));
  const clubs = Object.fromEntries(Object.entries(g.clubs).map(([id, c]) => [id, { ...c, boardExpectation: (c as Partial<typeof c>).boardExpectation ?? data.get(id)?.boardExpectation ?? 'mid' }]));
  const transfers = (g.transfers ?? []).map((t) => ({ ...t, kind: (t as Partial<typeof t>).kind ?? ('buy' as const) }));
  return {
    ...g, version: 5, budgets, clubs, transfers, news: g.news ?? [],
    morale: g.morale ?? { team: 60, board: 60, fans: 60 }, transferList: g.transferList ?? [], loanList: g.loanList ?? [], offers: g.offers ?? [], loans: g.loans ?? [],
  };
}

/** Saves antigos: dá função (lateral, ponta, centroavante...) aos jogadores que não têm, sem mexer em quem já tem. */
export function withSpotsAll(g: GameState): GameState {
  const fix = (teams: GameState['teams']) => Object.fromEntries(Object.entries(teams).map(([id, t]) => [id, t.players.every((p) => p.spot) ? t : { ...t, players: withSpots(t.players) }]));
  return { ...g, teams: fix(g.teams), ...(g.foreign ? { foreign: { ...g.foreign, teams: fix(g.foreign.teams) } } : {}) };
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    return isValidSave(g) ? ensureAiState(withSpotsAll(migrateSave(g))) : null; // saves de versões antigas demais são ignorados
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Acesso ao JSON bruto do save (usado pelos backups). */
export function readRawSave(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function writeRawSave(raw: string): boolean {
  try { localStorage.setItem(KEY, raw); return true; } catch { return false; }
}
