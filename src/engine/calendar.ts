import { makeRng } from './rng';
import type { GameState } from './types';

/* =====================================================================
   Calendário real do jogo: cada jogo do seu clube cai em um dia da semana.
   Por semana são 2 jogos: no meio da semana (terça, quarta ou quinta, sorteado) e no fim (sábado ou domingo, sorteado).
   Datas são números de dias desde 01/01/1970 (UTC).
   ===================================================================== */

export interface Calendar { day: number; start: number; slot: number }

const MS = 86_400_000;
export const toDay = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / MS);
export const fromDay = (n: number) => { const t = new Date(n * MS); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: t.getUTCDay() }; };
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const pad = (n: number) => String(n).padStart(2, '0');
export const formatDay = (n: number) => { const { y, m, d } = fromDay(n); return `${pad(d)}/${pad(m)}/${y}`; };
export const formatDayLong = (n: number) => { const { y, m, d, wd } = fromDay(n); return `${WEEKDAYS[wd]}, ${d} de ${MONTHS[m - 1]} de ${y}`; };
export const formatDayShort = (n: number) => { const { m, d, wd } = fromDay(n); return `${WEEKDAYS[wd].slice(0, 3)} ${pad(d)}/${pad(m)}`; };

/** Segunda-feira de partida de uma temporada: a primeira segunda-feira a partir de 8 de janeiro (e nunca antes de `notBefore`). */
export function seasonStart(year: number, notBefore = 0): number {
  let d = Math.max(toDay(year, 1, 8), notBefore);
  while (fromDay(d).wd !== 1) d++;
  return d;
}

/** Dia do jogo número `slot` (0, 1, 2...) da temporada: par = meio da semana (ter/qua/qui), ímpar = fim de semana (sáb/dom). */
export function matchDayOf(seed: number, season: number, start: number, slot: number): number {
  const week = Math.floor(slot / 2);
  const mid = slot % 2 === 0;
  const rng = makeRng(seed * 131 + season * 17 + week * 7 + (mid ? 1 : 2));
  const offset = mid ? 1 + Math.floor(rng() * 3) : 5 + Math.floor(rng() * 2); // ter(1) qua(2) qui(3) | sáb(5) dom(6) a partir da segunda
  return start + week * 7 + offset;
}

export const calOf = (g: GameState): Calendar => g.cal ?? { day: seasonStart(g.season), start: seasonStart(g.season), slot: 0 };
export function ensureCalendar(g: GameState): GameState { return g.cal ? g : { ...g, cal: calOf(g) }; }
/** Dia do próximo jogo (evento) da temporada. */
export const nextMatchDay = (g: GameState) => { const c = calOf(g); return matchDayOf(g.seed, g.season, c.start, c.slot); };
/** Hoje é dia de jogo (ou já passou o dia)? */
export const isMatchDay = (g: GameState) => calOf(g).day >= nextMatchDay(g);
export const daysToMatch = (g: GameState) => Math.max(0, nextMatchDay(g) - calOf(g).day);

/** Avança um dia no calendário (só enquanto não for dia de jogo). */
export function advanceDay(g: GameState): GameState {
  const c = calOf(g);
  if (isMatchDay(g)) return g.cal ? g : { ...g, cal: c };
  return { ...g, cal: { ...c, day: c.day + 1 } };
}
/** Avança dia a dia até o dia do próximo jogo. */
export function advanceToMatch(g: GameState): GameState {
  let s = ensureCalendar(g);
  for (let i = 0; i < 20 && !isMatchDay(s); i++) s = advanceDay(s);
  return s;
}

/** Depois de um jogo (evento): o relógio vai para o dia dele e o próximo jogo passa a ser o seguinte. */
export function afterMatch(before: GameState, after: GameState): GameState {
  const c = calOf(before);
  const played = Math.max(c.day, matchDayOf(before.seed, before.season, c.start, c.slot));
  return { ...after, cal: { day: played, start: c.start, slot: c.slot + 1 } };
}

/** Início da temporada nova: o relógio vai para a primeira segunda-feira depois de 8 de janeiro (ou, se a anterior passou do ano, 2 semanas depois do último dia). */
export function newSeasonCalendar(g: GameState): Calendar {
  const prev = g.cal?.day ?? 0;
  const start = seasonStart(g.season, prev + 14);
  return { day: Math.max(start - 3, prev), start, slot: 0 };
}
