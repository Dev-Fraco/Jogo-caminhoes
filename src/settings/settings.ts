export type Language = 'pt-BR' | 'en' | 'es';
export type SimSpeed = 'slow' | 'normal' | 'fast';

export interface Settings {
  language: Language;
  autosave: boolean;
  simSpeed: SimSpeed;
  audio: { master: number; music: number; sfx: number; muted: boolean; /** efeitos sonoros (arquivos) ligados */ sfxEnabled?: boolean };
  // Novas seções (vídeo, controles, acessibilidade...) entram aqui como novos campos.
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'pt-BR',
  autosave: true,
  simSpeed: 'normal',
  audio: { master: 100, music: 80, sfx: 80, muted: false, sfxEnabled: true },
};

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'pt-BR', label: 'Português (Brasil)' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
];

const KEY = 'caminhoes-settings-v1';
const clampVol = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : fallback;

/** Aceita qualquer lixo vindo do armazenamento e devolve um Settings válido (campos ausentes ficam no padrão). */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<string, unknown>>;
  const a = (r.audio && typeof r.audio === 'object' ? r.audio : {}) as Partial<Record<string, unknown>>;
  const d = DEFAULT_SETTINGS;
  return {
    language: LANGUAGES.some((l) => l.id === r.language) ? (r.language as Language) : d.language,
    autosave: typeof r.autosave === 'boolean' ? r.autosave : d.autosave,
    simSpeed: r.simSpeed === 'slow' || r.simSpeed === 'normal' || r.simSpeed === 'fast' ? r.simSpeed : d.simSpeed,
    audio: {
      master: clampVol(a.master, d.audio.master),
      music: clampVol(a.music, d.audio.music),
      sfx: clampVol(a.sfx, d.audio.sfx),
      muted: typeof a.muted === 'boolean' ? a.muted : d.audio.muted,
      sfxEnabled: typeof a.sfxEnabled === 'boolean' ? a.sfxEnabled : true,
    },
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** Retorna false se não conseguiu gravar (armazenamento cheio/bloqueado). */
export function saveSettings(s: Settings): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vr-settings', { detail: s })); // o áudio relê o volume
    return true;
  } catch { return false; }
}
