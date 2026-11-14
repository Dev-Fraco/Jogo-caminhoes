import type { GameState } from './types';

const KEY = 'caminhoes-save-v1';

export function saveGame(g: GameState) {
  try { localStorage.setItem(KEY, JSON.stringify(g)); } catch { /* armazenamento cheio/bloqueado */ }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as GameState;
    return g.version === 1 ? g : null;
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
