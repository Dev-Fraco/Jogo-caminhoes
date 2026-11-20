import { regionalDueAny } from './regional';
import { calOf, daysToMatch, isMatchDay } from './calendar';
import { advanceToMatchDays } from './daily';
import { pendingEvent } from './events';
import { fixturesOfRound, isSeasonOver, playNext, userDivision } from './game';
import { upcomingMatches } from './upcoming';
import type { GameState, MatchResult, NewsItem } from './types';

/* =====================================================================
   Avanço do calendário até a próxima partida OFICIAL do seu clube.
   O calendário tem datas de jogo (rodadas, estaduais, copas, continentais). Em muitas delas só jogam outros clubes (o seu está de folga,
   eliminado ou fora da competição). Essas datas não precisam de você: o jogo as simula na hora, uma a uma, com tudo o que elas geram
   (resultados, classificações, bilheteria, salários e o mercado dos dias que passam) e só para no dia do SEU próximo jogo.
   ===================================================================== */

/** O seu clube joga na próxima data do calendário? (mesma regra com que `playNext` decide o que acontece nela) */
export function userPlaysNextSlot(g: GameState): boolean {
  if (g.unemployed || g.observer) return false;
  if (pendingEvent(g)) return true;                      // jogo seu de estadual, copa, continental ou Mundial
  if (g.estadual?.due || g.mundial?.due || g.superMundial?.due || regionalDueAny(g)) return false;   // etapa em que o seu clube não entra
  if (g.round > g.totalRounds) return false;
  const div = userDivision(g);
  if (!div || div.format === 'outside') return false;    // clube que só disputa o estadual: as rodadas do campeonato não são dele
  return fixturesOfRound(g, g.round, div.id).some((f) => f.homeId === g.userClubId || f.awayId === g.userClubId);
}

/** Dia do próximo jogo do seu clube (se a próxima data do calendário não for sua, procura a seguinte conhecida). */
export function nextUserMatchDay(g: GameState): number | undefined {
  if (g.unemployed) return undefined;
  const c = calOf(g);
  if (userPlaysNextSlot(g)) return Math.max(c.day, upcomingMatches(g, 1)[0]?.day ?? c.day);
  return upcomingMatches(g, 1)[0]?.day;
}

export interface AdvanceReport { state: GameState; /** resultados da última data simulada (dos outros clubes) */ results: MatchResult[]; /** datas do calendário simuladas sem o seu clube */ simulated: number; /** dias corridos avançados */ days: number; stoppedBy: 'jogo' | 'fim-da-temporada' | 'demitido' | 'sem-progresso' }

const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });

/**
 * Avança os dias até o dia da próxima partida do seu clube. Cada data de jogo que não é sua (domingos de outros clubes etc.) é simulada
 * por inteiro, inclusive o que ela gera; os dias entre elas passam um a um (salários, vencimentos, mercado). Para EXATAMENTE no dia do seu
 * jogo, sem jogá-lo. Termina também se a temporada acabar ou se você for demitido no caminho.
 */
export function advanceToUserMatch(g: GameState): AdvanceReport {
  const day0 = calOf(g).day;
  if (g.unemployed || g.observer) { const s = advanceToMatchDays(g); return { state: s, results: [], simulated: 0, days: calOf(s).day - day0, stoppedBy: 'sem-progresso' }; }
  let s = g, results: MatchResult[] = [], simulated = 0, stoppedBy: AdvanceReport['stoppedBy'] = 'jogo';
  for (let guard = 0; guard < 500; guard++) {
    if (isSeasonOver(s)) { stoppedBy = 'fim-da-temporada'; break; }
    if (userPlaysNextSlot(s)) { s = advanceToMatchDays(s); break; }                 // o próximo jogo é seu: só chega ao dia dele
    const before = calOf(s).day, round = s.round;
    s = advanceToMatchDays(s);                                                        // passa os dias até a próxima data (um a um)
    if (!isMatchDay(s)) { stoppedBy = 'sem-progresso'; break; }                       // travado (ex.: sem moradia): não insiste
    const r = playNext(s);                                                            // a data é só de outros clubes: simula tudo
    if (r.state === s || (calOf(r.state).day === before && r.state.round === round && !r.results.length)) { stoppedBy = 'sem-progresso'; break; }
    s = r.state; results = r.results; simulated++;
    if (s.unemployed) { stoppedBy = 'demitido'; break; }
  }
  const days = calOf(s).day - day0;
  if (simulated > 0) s = news(s, `📆 ${simulated} ${simulated === 1 ? 'data do calendário simulada' : 'datas do calendário simuladas'} (só outros clubes jogavam), ${days} dias até ${stoppedBy === 'fim-da-temporada' ? 'o fim da temporada' : 'o seu próximo jogo'}.`);
  void daysToMatch;
  return { state: s, results, simulated, days, stoppedBy };
}
