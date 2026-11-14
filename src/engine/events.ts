import { COPA_DO_BRASIL, cupMatchDue, playCupRound, userCupTie } from './cup';
import { CONTINENTALS, matchDue, mundialMatchDue, mundialStepName, mundialUserMatch, playContStep, playMundialStep, stepName, userMatch, type Comp } from './continental';
import { socialAfterMatch } from './social';
import type { GameState, MatchResult } from './types';

export type EventKind = 'cup' | 'lib' | 'sula' | 'ucl' | 'mundial';
export interface PendingEvent { kind: EventKind; /** id da competição (divisionId dos resultados) */ id: string; label: string; match: { homeId: string; awayId: string } }

/** Jogo especial esperando o seu clube (copa nacional, Libertadores, Champions ou Mundial), se houver. */
export function pendingEvent(g: GameState): PendingEvent | undefined {
  if (cupMatchDue(g) && g.cup) { const t = userCupTie(g); if (t) return { kind: 'cup', id: COPA_DO_BRASIL, label: `🏆 ${g.cup.name} · ${g.cup.rounds[g.cup.roundIndex].name}`, match: t }; }
  for (const key of ['lib', 'sula', 'ucl'] as Comp[]) {
    const l = g[key];
    if (l && matchDue(g, key)) { const m = userMatch(g, key); if (m) return { kind: key, id: l.id, label: `${CONTINENTALS[key].icon} ${l.name} · ${stepName(key, l)}`, match: m }; }
  }
  if (g.mundial && mundialMatchDue(g)) { const m = mundialUserMatch(g); if (m) return { kind: 'mundial', id: g.mundial.id, label: `🌍 ${g.mundial.name} · ${mundialStepName(g.mundial)}`, match: m }; }
  return undefined;
}

/** Joga o evento pendente do seu clube. */
export function playEvent(g: GameState, kind: EventKind): { state: GameState; results: MatchResult[] } {
  const r = kind === 'cup' ? playCupRound(g) : kind === 'mundial' ? playMundialStep(g) : playContStep(g, kind);
  const my = r.results.find((x) => x.homeId === g.userClubId || x.awayId === g.userClubId);
  if (!my || g.unemployed) return r;
  const home = my.homeId === g.userClubId;
  return { ...r, state: socialAfterMatch(r.state, home ? my.homeGoals : my.awayGoals, home ? my.awayGoals : my.homeGoals, 0.6) }; // copas pesam um pouco menos
}
