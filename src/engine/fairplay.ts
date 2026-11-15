import { calOf, formatDay, YEAR_DAYS } from './calendar';
import { notifyPhone } from './phone';
import type { GameState, NewsItem } from './types';

/* =====================================================================
   Fair play financeiro: no máximo 5 contratações por temporada (compra ou empréstimo recebido).
   Na 5ª, o jogo avisa que a meta foi atingida. Se o treinador fizer a 6ª, o clube sofre um transfer ban de 1 ano.
   ===================================================================== */

export const FAIRPLAY_LIMIT = 5;

/** Contratações do seu clube na temporada (compras e empréstimos recebidos). Vendas e empréstimos cedidos não contam. */
export const signingsThisSeason = (g: GameState): number =>
  g.transfers.filter((t) => t.season === g.season && t.toClubId === g.userClubId && (t.kind === 'buy' || t.kind === 'loanin')).length;

/** Transfer ban em vigor (se houver). */
export const banOf = (g: GameState) => (g.transferBan && g.transferBan.clubId === g.userClubId && calOf(g).day < g.transferBan.until ? g.transferBan : undefined);

/** Motivo para o clube não poder contratar agora (transfer ban). */
export function fairplayBlock(g: GameState): string | undefined {
  const b = banOf(g);
  return b ? `⛔ Transfer ban (fair play financeiro): o clube está proibido de contratar até ${formatDay(b.until)}.` : undefined;
}

/** Aviso quando a meta já foi atingida e uma nova contratação causaria o transfer ban. */
export function fairplayWarning(g: GameState): string | undefined {
  if (banOf(g) || signingsThisSeason(g) < FAIRPLAY_LIMIT) return undefined;
  return `⚠️ Você já atingiu a meta de transferência (${FAIRPLAY_LIMIT} contratações na temporada). Se realizar outra transferência, o clube sofrerá um transfer ban de 1 ano.`;
}

const news = (g: GameState, text: string, tone: NewsItem['tone']): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });

/** Chamado logo depois de uma contratação registrada: avisa na 3ª e pune a 4ª em diante. */
export function afterSigning(g: GameState): GameState {
  const n = signingsThisSeason(g);
  if (n === FAIRPLAY_LIMIT) return notifyPhone(news(g, fairplayWarning(g)!, 'bad'), 'noticias', 'Fair play: você atingiu a meta de transferência. Mais uma contratação gera transfer ban de 1 ano.');
  if (n > FAIRPLAY_LIMIT && !banOf(g)) {
    const day = calOf(g).day;
    const s: GameState = { ...g, transferBan: { clubId: g.userClubId, since: day, until: day + YEAR_DAYS } };
    return notifyPhone(news(s, `⛔ Fair play financeiro: ${n} contratações na temporada! O clube sofreu um transfer ban e não pode contratar até ${formatDay(day + YEAR_DAYS)}.`, 'bad'), 'noticias', 'Transfer ban: o clube foi punido pelo fair play financeiro e não pode contratar por 1 ano.');
  }
  return g;
}
