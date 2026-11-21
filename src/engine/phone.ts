import { calOf } from './calendar';
import type { GameState, PhoneNotification, PhoneSettings, PhoneState } from './types';

export interface PhoneApp { id: string; name: string; icon: string; blurb: string; category: string; size: string; rating: number }

/** Apps que vêm no celular (não podem ser removidos). */
export const SYSTEM_APPS: PhoneApp[] = [
  { id: 'loja', name: 'Loja de Apps', icon: '🛍️', blurb: 'Baixe novos aplicativos.', category: 'Sistema', size: '—', rating: 5 },
  { id: 'mensagens', name: 'Mensagens', icon: '💬', blurb: 'Patrocínios, imprensa, diretoria e metas.', category: 'Sistema', size: '—', rating: 5 },
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
  { id: 'internetchip', name: 'Internet de Chip', icon: '📲', blurb: 'Plano mensal de internet ilimitada.', category: 'Telefonia', size: '12 MB', rating: 4.1 },
  { id: 'netfibra', name: 'NetFibra', icon: '🛜', blurb: 'Internet Wi-Fi de 1 GB para a sua casa.', category: 'Telefonia', size: '15 MB', rating: 4.3 },
];
export const APPS: PhoneApp[] = [...SYSTEM_APPS, ...STORE_APPS];
export const appById = (id: string) => APPS.find((a) => a.id === id);

export const WALLPAPERS: { id: PhoneSettings['wallpaper']; label: string; css: string }[] = [
  { id: 'azul', label: 'Azul', css: 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 380 760\' preserveAspectRatio=\'none\'><defs><linearGradient id=\'g\' x1=\'0\' y1=\'1\' x2=\'1\' y2=\'0\'><stop offset=\'0\' stop-color=\'%231d6bff\' stop-opacity=\'0\'/><stop offset=\'.55\' stop-color=\'%2362b4ff\'/><stop offset=\'1\' stop-color=\'%23c7e4ff\'/></linearGradient><filter id=\'b\' x=\'-20%25\' y=\'-20%25\' width=\'140%25\' height=\'140%25\'><feGaussianBlur stdDeviation=\'4\'/></filter></defs><g fill=\'none\' stroke=\'url(%23g)\' stroke-linecap=\'round\'><path d=\'M-10 330 Q110 140 270 95\' stroke-width=\'3\' filter=\'url(%23b)\'/><path d=\'M-10 330 Q110 140 270 95\' stroke-width=\'1.4\'/><path d=\'M-10 640 Q230 520 400 330\' stroke-width=\'4\' filter=\'url(%23b)\'/><path d=\'M-10 640 Q230 520 400 330\' stroke-width=\'1.6\'/><path d=\'M110 780 Q330 650 400 480\' stroke-width=\'4\' filter=\'url(%23b)\'/><path d=\'M110 780 Q330 650 400 480\' stroke-width=\'1.6\'/></g></svg>") center/100% 100% no-repeat, radial-gradient(120% 55% at 15% 12%, rgba(30,120,255,.5), transparent 60%), radial-gradient(100% 45% at 95% 72%, rgba(20,110,255,.45), transparent 62%), linear-gradient(165deg,#031030,#06255e 45%,#041a45 72%,#020b24)' },
  { id: 'neon', label: 'Neon', css: 'linear-gradient(160deg,#021726,#0b3a66 45%,#6a3dff 85%,#22e6ff)' },
  { id: 'ouro', label: 'Ouro', css: 'linear-gradient(160deg,#3a2a05,#a97a10 55%,#f0b92b)' },
  { id: 'noite', label: 'Noite', css: 'linear-gradient(160deg,#050812,#1b2a52 60%,#3a4f93)' },
  { id: 'campo', label: 'Gramado', css: 'linear-gradient(160deg,#052b12,#0c6b2c 55%,#35b358)' },
  { id: 'aurora', label: 'Aurora', css: 'linear-gradient(160deg,#1a0b3a,#5b2a9a 50%,#e0508a)' },
];

export const DEFAULT_PHONE: PhoneState = {
  installed: [],
  settings: { wallpaper: 'azul', dark: true, brightness: 100, bigText: false, dnd: false, sounds: true, vibration: true, fingerprint: false },
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
  if (p.noPhone || p.installed.length >= modelOf(g).apps) return g; // sem celular ou memória cheia
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

/* ---------- conexões (painel rápido) ---------- */
export type Conn = 'wifi' | 'mobileData' | 'airplane';
export const connOf = (g: Pick<GameState, 'phone'>) => { const s = phoneOf(g).settings; return { wifi: !!s.wifi && !s.airplane, mobileData: !!s.mobileData && !s.airplane, airplane: !!s.airplane }; };

/** Liga/desliga Wi-Fi, dados móveis ou modo avião. O modo avião desliga as outras duas; ligar uma delas tira o avião. */
export function toggleConn(g: GameState, key: Conn): GameState {
  const s = phoneOf(g).settings;
  if (key === 'airplane') return updatePhoneSettings(g, s.airplane ? { airplane: false } : { airplane: true, wifi: false, mobileData: false, wifiNet: undefined });
  const on = key === 'wifi' ? !!s.wifi && !s.airplane : !!s.mobileData && !s.airplane;
  return updatePhoneSettings(g, { airplane: false, [key]: !on, ...(key === 'wifi' && on ? { wifiNet: undefined } : {}) });
}

/* ---------- internet: Wi-Fi grátis (ruim) e 5G (rápido) ---------- */
export interface FreeWifi { id: string; name: string; signal: 1 | 2 | 3 }
/** Redes grátis por perto: todas com conexão ruim. */
export const FREE_WIFI: FreeWifi[] = [
  { id: 'praca', name: 'Praça_Livre', signal: 2 },
  { id: 'padaria', name: 'Padaria do Zé - Cliente', signal: 3 },
  { id: 'free5', name: 'WIFI_GRATIS_Rua5', signal: 1 },
  { id: 'rodoviaria', name: 'Rodoviária Free', signal: 2 },
];

export function connectWifi(g: GameState, name: string): GameState {
  if (!FREE_WIFI.some((w) => w.name === name)) return g;
  return updatePhoneSettings(g, { airplane: false, wifi: true, wifiNet: name });
}
export const disconnectWifi = (g: GameState): GameState => updatePhoneSettings(g, { wifiNet: undefined });

export type NetSpeed = 'none' | 'slow' | 'fast';
export interface NetState { kind: 'none' | 'wifi' | '5g' | 'fibra'; speed: NetSpeed; label: string; note: string }
/** Qual internet o celular tem agora: dados móveis (5G, rápido) ou Wi-Fi grátis (ruim). Sem nada ligado ou conectado, não há internet. */
export function netState(g: Pick<GameState, 'phone' | 'season' | 'round' | 'cal'>): NetState {
  const s = phoneOf(g).settings;
  if (s.airplane) return { kind: 'none', speed: 'none', label: 'Modo avião', note: 'Desligue o modo avião e conecte-se a uma rede.' };
  if (s.wifi && s.wifiNet && fibraReady(g) && phoneOf(g).fibra!.ssid === s.wifiNet) return { kind: 'fibra', speed: 'fast', label: `NetFibra · ${s.wifiNet}`, note: '1 GB de download e 1 GB de upload: muito mais rápida que o 5G (abre os apps 70% mais rápido).' };
  if (s.mobileData && !chipOf(g) && !s.wifiNet) return chipBlocked(g) ? { kind: 'none', speed: 'none', label: 'Chip bloqueado', note: 'O chip venceu (1 ano). Compre um novo na Mega-zona Luiz.' } : { kind: 'none', speed: 'none', label: 'Dados móveis sem chip', note: 'Compre um chip na Mega-zona Luiz.' };
  if (s.mobileData && chipOf(g) && planActive(g)) return { kind: '5g', speed: 'fast', label: '5G', note: 'Conexão rápida.' };
  if (s.mobileData && chipOf(g) && !s.wifiNet) return { kind: 'none', speed: 'none', label: 'Dados móveis sem plano', note: 'Assine o plano no app Internet de Chip (use um Wi-Fi grátis para isso).' };
  if (s.wifi && s.wifiNet && phoneOf(g).fibra?.ssid === s.wifiNet) return { kind: 'none', speed: 'none', label: 'Wi-Fi sem internet', note: fibraDown(g) ? 'A NetFibra caiu. Use os dados móveis (5G) até ela voltar.' : 'O plano da NetFibra venceu. Renove no app NetFibra.' };
  if (s.wifi && s.wifiNet) return { kind: 'wifi', speed: 'slow', label: `Wi-Fi · ${s.wifiNet}`, note: 'A conexão é ruim: apps e downloads vão demorar.' };
  if (s.wifi) return { kind: 'none', speed: 'none', label: 'Wi-Fi sem rede', note: 'Escolha uma rede Wi-Fi ou ligue os dados móveis.' };
  return { kind: 'none', speed: 'none', label: 'Sem conexão', note: 'Ligue o Wi-Fi ou os dados móveis no painel rápido.' };
}
/** Apps que precisam de internet para abrir. */
export const OFFLINE_SCREENS = ['home', 'config', 'calc', 'nonet', 'boot'];
export const needsInternet = (screen: string) => !OFFLINE_SCREENS.includes(screen);
/** Tempo (ms) para abrir um app e para baixar um app, conforme a conexão. */
/** Tempo base (ms) para abrir um app, multiplicado pela velocidade do aparelho. Wi-Fi ruim soma 3,5 s; 5G reduz 44%; NetFibra (Wi-Fi próprio) reduz 70%. */
export const OPEN_BASE_MS = 2500;
export const WIFI_BAD_EXTRA_MS = 3500;
export const openDelayMs = (g: Pick<GameState, 'phone' | 'season' | 'round' | 'cal'>) => {
  const n = netState(g), base = OPEN_BASE_MS * modelOf(g).speed;
  return Math.round(n.kind === 'fibra' ? base * 0.3 : n.kind === '5g' ? base * 0.56 : n.speed === 'slow' ? base + WIFI_BAD_EXTRA_MS : base);
};
export const downloadMs = (g: Pick<GameState, 'phone' | 'season' | 'round' | 'cal'>) => Math.round((netState(g).speed === 'slow' ? 9000 : 1600) * (netState(g).kind === 'fibra' ? 0.5 : 1) * modelOf(g).speed);
export const INSTALL_MS = 1800;

/* ---------- plano de dados (app Internet de Chip) ---------- */
export const PLAN_PRICE = 5_000;
const ABS = 200;
const nowAbs = (g: Pick<GameState, 'season' | 'round'>) => g.season * ABS + g.round;
type TG = Pick<GameState, 'phone' | 'season' | 'round' | 'cal'>;
const nowDay = (g: TG) => calOf(g).day;
/** Validades agora são DIAS do calendário. Saves antigos guardavam rodadas: convertemos (1 rodada ≈ 3 dias). */
export const asDay = (v: number, g: TG) => (v > 100_000 ? nowDay(g) + Math.round((v - nowAbs(g)) * 3) : v);
/** Dias que ainda restam no plano (0 = sem plano ou vencido). */
export const planLeft = (g: TG) => { const u = phoneOf(g).plan?.until; return u === undefined ? 0 : Math.max(0, asDay(u, g) - nowDay(g)); };
export const planUntil = (g: TG) => { const u = phoneOf(g).plan?.until; return u === undefined ? undefined : asDay(u, g); };
export const planActive = (g: Pick<GameState, 'phone' | 'season' | 'round' | 'cal'>) => planLeft(g) > 0;

/* ---------- aparelhos e chips (Mega-zona Luiz) ---------- */
export interface PhoneModel { id: string; name: string; brand: string; price: number; /** quantos apps da Loja cabem */ apps: number; /** multiplicador do tempo de abrir/baixar (menor = mais rápido) */ speed: number; storage: string; ram: string; color: string; blurb: string }
export const PHONE_MODELS: PhoneModel[] = [
  { id: 'zap', name: 'Zap Simples', brand: 'Zap', price: 5_000, apps: 2, speed: 1.9, storage: '8 GB', ram: '1 GB', color: '#7a8594', blurb: 'O mais barato da prateleira. Pouca memória e bem lento.' },
  { id: 'fenix', name: 'Fênix A1', brand: 'Fênix', price: 8_000, apps: 3, speed: 1.6, storage: '16 GB', ram: '1 GB', color: '#c8643c', blurb: 'Básico para o dia a dia.' },
  { id: 'nova', name: 'Nova Lite', brand: 'Nova', price: 14_000, apps: 4, speed: 1.3, storage: '32 GB', ram: '2 GB', color: '#3c8ec8', blurb: 'Dá conta do recado.' },
  { id: 'orbit', name: 'Orbit S', brand: 'Orbit', price: 24_000, apps: 5, speed: 1.05, storage: '64 GB', ram: '4 GB', color: '#7a54d0', blurb: 'Bom custo-benefício.' },
  { id: 'titan', name: 'Titan 5G', brand: 'Titan', price: 38_000, apps: 6, speed: .85, storage: '128 GB', ram: '6 GB', color: '#2fa86a', blurb: 'Rápido, com câmera boa.' },
  { id: 'aurora', name: 'Aurora Pro', brand: 'Aurora', price: 52_000, apps: 7, speed: .65, storage: '256 GB', ram: '8 GB', color: '#e0a21a', blurb: 'Topo de linha, tela dobrável.' },
  { id: 'zenith', name: 'Zenith Max', brand: 'Zenith', price: 66_000, apps: 8, speed: .5, storage: '512 GB', ram: '12 GB', color: '#d0407a', blurb: 'Quase o melhor que existe.' },
  { id: 'imperial', name: 'Imperial X', brand: 'Imperial', price: 80_000, apps: 99, speed: .35, storage: '1 TB', ram: '16 GB', color: '#101820', blurb: 'O mais caro da loja: memória de sobra e velocidade máxima.' },
];
/** Saves antigos (de antes da loja) ficam com um aparelho intermediário com espaço para todos os apps. */
const LEGACY_MODEL: PhoneModel = { id: 'legado', name: 'Seu celular', brand: '—', price: 0, apps: 99, speed: 1, storage: '—', ram: '—', color: '#3c8ec8', blurb: '' };
export const modelOf = (g: Pick<GameState, 'phone'>): PhoneModel => PHONE_MODELS.find((m) => m.id === phoneOf(g).model) ?? LEGACY_MODEL;
export const ownsPhone = (g: Pick<GameState, 'phone'>) => !phoneOf(g).noPhone;
export const appsUsed = (g: Pick<GameState, 'phone'>) => phoneOf(g).installed.length;

export type ChipId = 'morto' | 'escuro' | 'toim';
export interface ChipInfo { id: ChipId; name: string; price: number }
export const CHIP_PRICE = 2_000;
export const CHIPS: ChipInfo[] = [{ id: 'morto', name: 'Morto', price: CHIP_PRICE }, { id: 'escuro', name: 'Escuro', price: CHIP_PRICE }, { id: 'toim', name: 'Toim', price: CHIP_PRICE }];
/** Chip em uso (null se bloqueado). Saves antigos (sem aparelho da loja) mantêm um chip que nunca bloqueia. */
const rawChip = (g: Pick<GameState, 'phone'>): ChipInfo | undefined => { const p = phoneOf(g); return CHIPS.find((c) => c.id === (p.chip ?? (p.model || p.noPhone ? undefined : 'toim'))); };
/** O chip NUNCA bloqueia mais (antes vencia em 1 ano). O campo chipUntil dos saves antigos é ignorado. */
export const chipBlocked = (_g: Pick<GameState, 'phone' | 'season' | 'round' | 'cal'>) => false;
export const chipOf = (g: Pick<GameState, 'phone' | 'season' | 'round' | 'cal'>): ChipInfo | undefined => (chipBlocked(g) ? undefined : rawChip(g));
export const chipRaw = rawChip;
/** Dias até o chip bloquear: nunca (o chip não bloqueia). */
export const chipLeft = (_g: Pick<GameState, 'phone' | 'season' | 'round' | 'cal'>): number | undefined => undefined;
export const chipNumberOf = (g: Pick<GameState, 'phone'>) => phoneOf(g).chipNumber;

/* ---------- NetFibra (Wi-Fi residencial) ---------- */
export const FIBRA_MONTHLY = 100_000;
export const FIBRA_ENTRY = 50_000;
export const fibraOf = (g: Pick<GameState, 'phone'>) => phoneOf(g).fibra;
export const fibraLeft = (g: TG) => { const u = phoneOf(g).fibra?.until; return u === undefined ? 0 : Math.max(0, asDay(u, g) - nowDay(g)); };
export const fibraUntil = (g: TG) => { const u = phoneOf(g).fibra?.until; return u === undefined ? undefined : asDay(u, g); };
export const fibraActive = (g: Pick<GameState, 'phone' | 'season' | 'round' | 'cal'>) => fibraLeft(g) > 0;
export const fibraDown = (g: TG) => { const d = phoneOf(g).fibra?.down; return d !== undefined && asDay(d, g) > nowDay(g); };
/** Rede configurada, plano em dia e sem queda. */
export const fibraReady = (g: Pick<GameState, 'phone' | 'season' | 'round' | 'cal'>) => !!phoneOf(g).fibra?.ssid && fibraActive(g) && !fibraDown(g);

/** Conecta na sua rede NetFibra com a senha que você criou. */
export function connectHome(g: GameState, password: string): { ok: true; state: GameState } | { ok: false; error: string } {
  const f = phoneOf(g).fibra;
  if (!f?.ssid) return { ok: false, error: 'Configure sua rede no app NetFibra.' };
  if (f.password !== password) return { ok: false, error: 'Senha incorreta.' };
  return { ok: true, state: updatePhoneSettings(g, { airplane: false, wifi: true, wifiNet: f.ssid }) };
}
