import { fromDay, formatDay, toDay } from './calendar';
import { homeLeague } from './market';
import { notifyPhone } from './phone';
import type { GameState, NewsItem, TransferWindow } from './types';

/* =====================================================================
   Janelas de transferências. Cada país tem as suas (calendário por região) e elas são calculadas só pela DATA do calendário do jogo:
   não dependem de nada salvo, então passar os dias, salvar e reabrir nunca abre ou fecha uma janela errada.
   O estado (`windowState`) só guarda a última situação avisada, para as notificações de abertura e fechamento saírem uma vez só.
   ===================================================================== */

const EUROPE = new Set(['EN', 'ES', 'IT', 'DE', 'FR', 'PT']);
/** Regras configuráveis de registro fora da janela. */
export const WINDOW_RULES = { freeAgentsOutside: true, loansNeedWindow: true, warnDays: 7 };

type MD = [number, number];
/** Janelas por região: [abre, fecha] como [mês, dia], inclusive. */
const REGION_WINDOWS: Record<'europa' | 'sul', { label: string; open: MD; close: MD }[]> = {
  europa: [{ label: 'Janela de inverno', open: [1, 1], close: [1, 31] }, { label: 'Janela de verão', open: [7, 1], close: [8, 31] }],
  sul: [{ label: 'Janela principal', open: [1, 2], close: [4, 5] }, { label: 'Janela de meio de ano', open: [7, 1], close: [8, 31] }],
};
export const regionOf = (countryId: string): 'europa' | 'sul' => (EUROPE.has(countryId) ? 'europa' : 'sul');

/** Janelas do país no ano de calendário `year`. */
export function windowsOfYear(countryId: string, year: number): TransferWindow[] {
  return REGION_WINDOWS[regionOf(countryId)].map((w, i) => ({ id: `${countryId}-${year}-${i + 1}`, countryId, label: w.label, opens: toDay(year, w.open[0], w.open[1]), closes: toDay(year, w.close[0], w.close[1]) }));
}

const countryOf = (g: Pick<GameState, 'divisions'>) => homeLeague(g).countryId;
const dayOf = (g: GameState) => g.cal?.day ?? toDay(g.season, 1, 8);

export interface WindowInfo { open: boolean; window?: TransferWindow; daysLeft?: number; next?: TransferWindow; daysToNext?: number }

/** Situação da janela do país da carreira num dia (padrão: hoje). */
export function windowInfo(g: GameState, day = dayOf(g)): WindowInfo {
  const country = countryOf(g);
  const y = fromDay(day).y;
  const all = [...windowsOfYear(country, y - 1), ...windowsOfYear(country, y), ...windowsOfYear(country, y + 1)].sort((a, b) => a.opens - b.opens);
  const cur = all.find((w) => day >= w.opens && day <= w.closes);
  const next = all.find((w) => w.opens > day);
  return cur ? { open: true, window: cur, daysLeft: cur.closes - day, next, daysToNext: next ? next.opens - day : undefined } : { open: false, next, daysToNext: next ? next.opens - day : undefined };
}

export type TransferKind = 'comum' | 'livre' | 'emprestimo';

/** Motivo de uma transferência não poder ser registrada agora (ou undefined se pode). `urgent`: clube abaixo do mínimo de elenco. */
export function transferBlock(g: GameState, kind: TransferKind, opts: { day?: number; urgent?: boolean } = {}): string | undefined {
  const info = windowInfo(g, opts.day);
  if (info.open) return undefined;
  if (kind === 'livre' && (WINDOW_RULES.freeAgentsOutside || opts.urgent)) return undefined;
  if (kind === 'emprestimo' && !WINDOW_RULES.loansNeedWindow) return undefined;
  const nxt = info.next ? ` A próxima janela abre em ${formatDay(info.next.opens)} (${info.next.label.toLowerCase()}).` : '';
  return `🔒 Mercado fechado: transferências só podem ser registradas com a janela aberta.${nxt}`;
}

export const windowLabel = (g: GameState): string => {
  const i = windowInfo(g);
  if (i.open) return `${i.window!.label} aberta · fecha em ${i.daysLeft === 0 ? 'hoje' : `${i.daysLeft} ${i.daysLeft === 1 ? 'dia' : 'dias'}`} (${formatDay(i.window!.closes)})`;
  return i.next ? `Mercado fechado · ${i.next.label.toLowerCase()} abre em ${formatDay(i.next.opens)} (${i.daysToNext} dias)` : 'Mercado fechado';
};

const news = (g: GameState, text: string, tone: NewsItem['tone']): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const LOG_CAP = 40;

/**
 * Chamado todo dia (dayTick): avisa abertura, fechamento próximo e encerramento uma única vez e registra no histórico das janelas.
 * Em saves sem `windowState`, só registra a situação atual (sem enxurrada de avisos).
 */
export function windowTick(g: GameState): GameState {
  const info = windowInfo(g);
  const id = info.open ? info.window!.id : null;
  const prev = g.windowState;
  const day = dayOf(g);
  if (!prev) return { ...g, windowState: { id } };
  let s = g;
  if (prev.id !== id) {
    const log = [...(s.windowLog ?? [])];
    if (prev.id) { log.push({ id: prev.id, event: 'fechada', day }); s = notifyPhone(news(s, `🔒 A janela de transferências fechou. ${info.next ? `Próxima: ${formatDay(info.next.opens)}.` : ''}`, 'info'), 'noticias', 'A janela de transferências fechou.'); }
    if (id) { log.push({ id, event: 'aberta', day }); s = notifyPhone(news(s, `🔓 ${info.window!.label} aberta até ${formatDay(info.window!.closes)}: o mercado está funcionando.`, 'good'), 'noticias', `${info.window!.label} aberta até ${formatDay(info.window!.closes)}.`); }
    s = { ...s, windowState: { id }, windowLog: log.slice(-LOG_CAP) };
  } else if (info.open && info.daysLeft! <= WINDOW_RULES.warnDays && prev.closingWarned !== id) {
    s = notifyPhone(news(s, `⏳ A janela de transferências fecha em ${info.daysLeft} ${info.daysLeft === 1 ? 'dia' : 'dias'} (${formatDay(info.window!.closes)}).`, 'bad'), 'noticias', `A janela fecha em ${info.daysLeft} dia(s).`);
    s = { ...s, windowState: { id, closingWarned: id! } };
  }
  return s;
}
