import { CLUBS_DATA } from '../data/clubs';
import type { GameState } from './types';

const KEY = 'caminhoes-save-v1'; // mesma chave de antes; o campo `version` do conteúdo diz o formato
export const SAVE_VERSION = 3;

export function saveGame(g: GameState) {
  try { localStorage.setItem(KEY, JSON.stringify(g)); } catch { /* armazenamento cheio/bloqueado */ }
}

/** Confere se um JSON de save tem o formato de uma versão suportada (2 ou 3). */
export function isValidSave(g: unknown): g is GameState {
  const s = g as Partial<GameState> | null;
  return !!s && ((s.version as number) === 2 || s.version === SAVE_VERSION) && !!s.divisions && !!s.teams && !!s.clubs && !!s.userClubId && typeof s.round === 'number';
}

/** Saves da versão 2 não tinham orçamento nem histórico de transferências: completa com os valores iniciais dos clubes. */
export function migrateSave(g: GameState): GameState {
  if ((g.version as number) === SAVE_VERSION) return g;
  const initial = new Map(Object.values(CLUBS_DATA).flat().map((c) => [c.id, c.budget]));
  const budgets = Object.fromEntries(Object.keys(g.clubs).map((id) => [id, initial.get(id) ?? 10_000_000]));
  return { ...g, version: 3, budgets, transfers: [] };
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    return isValidSave(g) ? migrateSave(g) : null; // saves de versões antigas demais são ignorados
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
