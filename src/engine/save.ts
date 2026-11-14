import type { GameState } from './types';

const KEY = 'caminhoes-save-v1'; // mesma chave de antes; o campo `version` do conteúdo diz o formato
export const SAVE_VERSION = 2;

export function saveGame(g: GameState) {
  try { localStorage.setItem(KEY, JSON.stringify(g)); } catch { /* armazenamento cheio/bloqueado */ }
}

/** Confere se um JSON de save tem o formato atual. */
export function isValidSave(g: unknown): g is GameState {
  const s = g as Partial<GameState> | null;
  return !!s && s.version === SAVE_VERSION && !!s.divisions && !!s.teams && !!s.clubs && !!s.userClubId && typeof s.round === 'number';
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    return isValidSave(g) ? g : null; // saves de versões antigas são ignorados
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
