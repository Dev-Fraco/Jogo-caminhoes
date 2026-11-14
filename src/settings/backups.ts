import { readRawSave, writeRawSave } from '../engine/save';
import type { GameState } from '../engine/types';

export interface Backup {
  id: string;
  createdAt: number; // ms desde 1970
  clubName: string;
  season: number;
  round: number;
  data: string; // JSON do save da carreira
}

export const MAX_BACKUPS = 5; // cada backup guarda a carreira inteira; o limite protege o espaço do localStorage
const KEY = 'caminhoes-backups-v1';

export function listBackups(): Backup[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(arr)) return [];
    return (arr as Backup[]).filter((b) => b && typeof b.id === 'string' && typeof b.data === 'string').sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

const write = (list: Backup[]): boolean => {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
};

export type CreateResult = { ok: true; backup: Backup } | { ok: false; reason: 'no-save' | 'limit' | 'storage' };

/** Copia a carreira salva atual para um novo backup com data/hora. */
export function createBackup(now = Date.now()): CreateResult {
  const raw = readRawSave();
  if (!raw) return { ok: false, reason: 'no-save' };
  let g: GameState;
  try { g = JSON.parse(raw) as GameState; } catch { return { ok: false, reason: 'no-save' }; }
  const list = listBackups();
  if (list.length >= MAX_BACKUPS) return { ok: false, reason: 'limit' };
  const club = g.clubs?.find((c) => c.id === g.userClubId);
  const backup: Backup = {
    id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now, clubName: club?.name ?? '?', season: g.season, round: g.round, data: raw,
  };
  return write([backup, ...list]) ? { ok: true, backup } : { ok: false, reason: 'storage' };
}

/** Substitui a carreira salva pelo conteúdo do backup. Retorna false se o backup não existir ou estiver inválido. */
export function restoreBackup(id: string): boolean {
  const b = listBackups().find((x) => x.id === id);
  if (!b) return false;
  try { if ((JSON.parse(b.data) as GameState).version !== 1) return false; } catch { return false; }
  return writeRawSave(b.data);
}

export function deleteBackup(id: string): void {
  write(listBackups().filter((b) => b.id !== id));
}
