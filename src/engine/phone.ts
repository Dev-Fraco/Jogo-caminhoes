import type { GameState, PhoneNotification, PhoneSettings, PhoneState } from './types';

export interface PhoneApp { id: string; name: string; icon: string; blurb: string; category: string; size: string; rating: number }

/** Apps que vêm no celular (não podem ser removidos). */
export const SYSTEM_APPS: PhoneApp[] = [
  { id: 'loja', name: 'Loja de Apps', icon: '🛍️', blurb: 'Baixe novos aplicativos.', category: 'Sistema', size: '—', rating: 5 },
  { id: 'config', name: 'Configurações', icon: '⚙️', blurb: 'Ajuste o seu celular.', category: 'Sistema', size: '—', rating: 5 },
];

/** Apps disponíveis na Loja de Apps. */
export const STORE_APPS: PhoneApp[] = [
  { id: 'banco', name: 'Banco', icon: '🏦', blurb: 'Saldo, Pix e boletos.', category: 'Finanças', size: '24 MB', rating: 4.7 },
  { id: 'linstagra', name: 'LinstaGrã', icon: '📸', blurb: 'Fotos, vídeos e seguidores.', category: 'Social', size: '88 MB', rating: 4.5 },
  { id: 'tikiteko', name: 'TikiTeko', icon: '🎵', blurb: 'Vídeos curtos e danças.', category: 'Social', size: '120 MB', rating: 4.6 },
  { id: 'noticias', name: 'Notícias', icon: '📰', blurb: 'Transferências e o que a torcida diz.', category: 'Notícias', size: '18 MB', rating: 4.3 },
  { id: 'concessionaria', name: 'Concessionária', icon: '🚗', blurb: 'Compre carros e motos.', category: 'Compras', size: '45 MB', rating: 4.4 },
  { id: 'corretor', name: 'Corretor de Imóveis', icon: '🏠', blurb: 'Casas para comprar e alugar.', category: 'Compras', size: '36 MB', rating: 4.2 },
  { id: 'cassino', name: 'Cassino', icon: '🎰', blurb: 'Aposte no vermelho, preto ou azul.', category: 'Jogos', size: '60 MB', rating: 3.9 },
];
export const APPS: PhoneApp[] = [...SYSTEM_APPS, ...STORE_APPS];
export const appById = (id: string) => APPS.find((a) => a.id === id);

export const WALLPAPERS: { id: PhoneSettings['wallpaper']; label: string; css: string }[] = [
  { id: 'neon', label: 'Neon', css: 'linear-gradient(160deg,#021726,#0b3a66 45%,#6a3dff 85%,#22e6ff)' },
  { id: 'ouro', label: 'Ouro', css: 'linear-gradient(160deg,#3a2a05,#a97a10 55%,#f0b92b)' },
  { id: 'noite', label: 'Noite', css: 'linear-gradient(160deg,#050812,#1b2a52 60%,#3a4f93)' },
  { id: 'campo', label: 'Gramado', css: 'linear-gradient(160deg,#052b12,#0c6b2c 55%,#35b358)' },
  { id: 'aurora', label: 'Aurora', css: 'linear-gradient(160deg,#1a0b3a,#5b2a9a 50%,#e0508a)' },
];

export const DEFAULT_PHONE: PhoneState = {
  installed: [],
  settings: { wallpaper: 'neon', dark: true, brightness: 100, bigText: false, dnd: false, sounds: true, vibration: true, fingerprint: false },
  notifications: [],
};

export const phoneOf = (g: Pick<GameState, 'phone'>): PhoneState => g.phone ?? DEFAULT_PHONE;
const withPhone = (g: GameState, p: PhoneState): GameState => ({ ...g, phone: p });

export const PIN_LENGTH = 4;
export const validPinFormat = (pin: string) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);

/** Resumo do PIN (não guardamos o número em texto puro no save). */
export function hashPin(pin: string): string {
  let h = 2166136261;
  for (const ch of `vrfc:${pin}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export const hasPin = (g: Pick<GameState, 'phone'>) => !!phoneOf(g).pinHash;
export const checkPin = (g: Pick<GameState, 'phone'>, pin: string) => hasPin(g) && phoneOf(g).pinHash === hashPin(pin);

export type PinResult = { ok: true; state: GameState } | { ok: false; error: string };

/** Primeiro acesso: cadastra o PIN (digitado duas vezes). */
export function registerPin(g: GameState, pin: string, confirm: string): PinResult {
  if (hasPin(g)) return { ok: false, error: 'O PIN já foi cadastrado.' };
  if (!validPinFormat(pin)) return { ok: false, error: `O PIN deve ter ${PIN_LENGTH} números.` };
  if (pin !== confirm) return { ok: false, error: 'Os PINs não são iguais.' };
  if (/^(\d)\1+$/.test(pin) || pin === '1234' || pin === '4321') return { ok: false, error: 'Escolha um PIN menos óbvio.' };
  return { ok: true, state: withPhone(g, { ...phoneOf(g), pinHash: hashPin(pin) }) };
}

export function changePin(g: GameState, current: string, pin: string, confirm: string): PinResult {
  if (!checkPin(g, current)) return { ok: false, error: 'PIN atual incorreto.' };
  if (!validPinFormat(pin)) return { ok: false, error: `O novo PIN deve ter ${PIN_LENGTH} números.` };
  if (pin !== confirm) return { ok: false, error: 'Os PINs novos não são iguais.' };
  if (/^(\d)\1+$/.test(pin) || pin === '1234' || pin === '4321') return { ok: false, error: 'Escolha um PIN menos óbvio.' };
  return { ok: true, state: withPhone(g, { ...phoneOf(g), pinHash: hashPin(pin) }) };
}

export const isInstalled = (g: Pick<GameState, 'phone'>, id: string) => SYSTEM_APPS.some((a) => a.id === id) || phoneOf(g).installed.includes(id);
export const installedApps = (g: Pick<GameState, 'phone'>): PhoneApp[] => [...SYSTEM_APPS, ...phoneOf(g).installed.map(appById).filter((a): a is PhoneApp => !!a)];

export function installApp(g: GameState, id: string): GameState {
  if (!STORE_APPS.some((a) => a.id === id) || isInstalled(g, id)) return g;
  const p = phoneOf(g);
  return withPhone(g, { ...p, installed: [...p.installed, id] });
}
export function uninstallApp(g: GameState, id: string): GameState {
  const p = phoneOf(g);
  if (!p.installed.includes(id)) return g;
  return withPhone(g, { ...p, installed: p.installed.filter((x) => x !== id) });
}

export function updatePhoneSettings(g: GameState, patch: Partial<PhoneSettings>): GameState {
  const p = phoneOf(g);
  const s = { ...p.settings, ...patch };
  s.brightness = Math.max(30, Math.min(100, Math.round(s.brightness)));
  return withPhone(g, { ...p, settings: s });
}

/** Adiciona uma notificação (os apps usam isso nas próximas etapas). Mantém só as 30 mais recentes. */
export function notifyPhone(g: GameState, app: string, text: string): GameState {
  const p = phoneOf(g);
  const n: PhoneNotification = { id: `${g.season}-${g.round}-${p.notifications.length}-${app}`, app, text, season: g.season, round: g.round, read: false };
  return withPhone(g, { ...p, notifications: [n, ...p.notifications].slice(0, 30) });
}
export const unreadCount = (g: Pick<GameState, 'phone'>) => phoneOf(g).notifications.filter((n) => !n.read).length;
export function markAllRead(g: GameState): GameState {
  const p = phoneOf(g);
  return p.notifications.some((n) => !n.read) ? withPhone(g, { ...p, notifications: p.notifications.map((n) => ({ ...n, read: true })) }) : g;
}
export function clearNotifications(g: GameState): GameState {
  return withPhone(g, { ...phoneOf(g), notifications: [] });
}
