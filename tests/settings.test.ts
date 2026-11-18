import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGame, saveGame } from '../src/engine/save';
import { t } from '../src/i18n/strings';
import { makeCareer } from './helpers';
import { createBackup, deleteBackup, listBackups, MAX_BACKUPS, restoreBackup } from '../src/settings/backups';
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, saveSettings } from '../src/settings/settings';

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

describe('configurações', () => {
  it('padrões: PT-BR, autosave ligado, normal, 100/80/80, sem mudo', () => {
    expect(DEFAULT_SETTINGS).toEqual({ language: 'pt-BR', autosave: true, simSpeed: 'normal', graphics: 'medium', audio: { master: 100, music: 80, sfx: 80, muted: false } });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
  it('persiste e recarrega', () => {
    const s = { ...DEFAULT_SETTINGS, language: 'es' as const, autosave: false, audio: { master: 10, music: 20, sfx: 30, muted: true } };
    expect(saveSettings(s)).toBe(true);
    expect(loadSettings()).toEqual(s);
  });
  it('sanitiza lixo e limita volumes', () => {
    const s = sanitizeSettings({ language: 'fr', autosave: 'sim', simSpeed: 'turbo', audio: { master: 250, music: -5, sfx: 'x', muted: 1 } });
    expect(s).toEqual({ ...DEFAULT_SETTINGS, audio: { master: 100, music: 0, sfx: 80, muted: false } });
  });
});

describe('traduções', () => {
  it('troca de idioma e preenche variáveis', () => {
    expect(t('pt-BR', 'options.title')).toBe('Opções');
    expect(t('en', 'options.title')).toBe('Options');
    expect(t('es', 'options.title')).toBe('Opciones');
    expect(t('en', 'options.backups.err.limit', { n: 5 })).toContain('5');
  });
});

describe('backups', () => {
  it('sem carreira salva não cria backup', () => {
    expect(createBackup()).toEqual({ ok: false, reason: 'no-save' });
    expect(listBackups()).toEqual([]);
  });
  it('cria, restaura e exclui', () => {
    const g = makeCareer('flamengo', 1);
    saveGame(g);
    const r = createBackup(1000);
    expect(r.ok).toBe(true);
    saveGame({ ...g, season: 9 });
    const [b] = listBackups();
    expect(b.clubName).toBe('Sporting Navegantes');
    expect(restoreBackup(b.id)).toBe(true);
    expect(loadGame()!.season).toBe(2026);
    deleteBackup(b.id);
    expect(listBackups()).toEqual([]);
    expect(restoreBackup('nao-existe')).toBe(false);
  });
  it('respeita o limite', () => {
    saveGame(makeCareer('palmeiras', 2));
    for (let i = 0; i < MAX_BACKUPS; i++) expect(createBackup(i).ok).toBe(true);
    expect(createBackup(99)).toEqual({ ok: false, reason: 'limit' });
  });
});

describe('saves de versões antigas', () => {
  it('save v1 (carreira de uma liga só) é ignorado e não restaura', () => {
    localStorage.setItem('caminhoes-save-v1', JSON.stringify({ version: 1, userClubId: 'fla', clubs: [], season: 1, round: 1 }));
    expect(loadGame()).toBeNull();
    expect(createBackup()).toEqual({ ok: false, reason: 'no-save' });
  });
});
