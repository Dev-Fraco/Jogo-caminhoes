import { estadualOfUser, estadualTable, playEstadualStep, stepLabel, userEstadualMatch } from './estadual';
import { playHomeGate } from './stadium';
import { applyInjuries, hitsFromEvents, pruneInjuries } from './injuries';
import { inboxTick } from './inbox';
import './dataplan';
import { updateMorale } from './morale';
import { COPA_DO_BRASIL, cupMatchDue, playCupRound, userCupTie } from './cup';
import { CONTINENTALS, matchDue, mundialMatchDue, mundialStepName, mundialUserMatch, playContStep, playMundialStep, stepName, userMatch, type Comp } from './continental';
import { playSuperStep, superMatchDue, superStepName, superUserMatch } from './supermundial';
import { socialAfterMatch } from './social';
import type { GameState, MatchResult } from './types';

export type EventKind = 'estadual' | 'cup' | 'lib' | 'sula' | 'ucl' | 'mundial' | 'super';
export interface PendingEvent { kind: EventKind; /** id da competição (divisionId dos resultados) */ id: string; label: string; match: { homeId: string; awayId: string } }

/** Jogo especial esperando o seu clube (copa nacional, Libertadores, Champions ou Mundial), se houver. */
export function pendingEvent(g: GameState): PendingEvent | undefined {
  if (g.estadual?.due) { const m = userEstadualMatch(g); const mine = estadualOfUser(g); if (m && mine) return { kind: 'estadual', id: 'estadual', label: `🏟️ ${mine.comp.name}${mine.divIndex ? ' (Série B)' : ''} · ${stepLabel(g.estadual, g.estadual.step)}`, match: m }; }
  if (cupMatchDue(g) && g.cup) { const t = userCupTie(g); if (t) return { kind: 'cup', id: COPA_DO_BRASIL, label: `🏆 ${g.cup.name} · ${g.cup.rounds[g.cup.roundIndex].name}`, match: t }; }
  for (const key of ['lib', 'sula', 'ucl'] as Comp[]) {
    const l = g[key];
    if (l && matchDue(g, key)) { const m = userMatch(g, key); if (m) return { kind: key, id: l.id, label: `${CONTINENTALS[key].icon} ${l.name} · ${stepName(key, l)}`, match: m }; }
  }
  if (g.mundial && mundialMatchDue(g)) { const m = mundialUserMatch(g); if (m) return { kind: 'mundial', id: g.mundial.id, label: `🌍 ${g.mundial.name} · ${mundialStepName(g.mundial)}`, match: m }; }
  if (g.superMundial && superMatchDue(g)) { const m = superUserMatch(g); if (m) return { kind: 'super', id: g.superMundial.id, label: `🌐 ${g.superMundial.name} · ${superStepName(g.superMundial)}`, match: m }; }
  return undefined;
}

/** Joga o evento pendente do seu clube. */
export function playEvent(g: GameState, kind: EventKind): { state: GameState; results: MatchResult[] } {
  const r = kind === 'estadual' ? playEstadualStep(g) : kind === 'cup' ? playCupRound(g) : kind === 'mundial' ? playMundialStep(g) : kind === 'super' ? playSuperStep(g) : playContStep(g, kind);
  const my = r.results.find((x) => x.homeId === g.userClubId || x.awayId === g.userClubId);
  if (my) r.state = pruneInjuries(applyInjuries(r.state, hitsFromEvents(my.events, my.homeId, my.awayId), g.round)); // lesões do seu jogo na copa/estadual/continental
  if (!my || g.unemployed) return r;
  const home = my.homeId === g.userClubId;
  const gf = home ? my.homeGoals : my.awayGoals, ga = home ? my.awayGoals : my.homeGoals;
  let state = socialAfterMatch(r.state, gf, ga, 0.6); // copas pesam um pouco menos
  if (kind === 'estadual') {
    // a diretoria também acompanha o estadual (para quem está fora da pirâmide, é a única competição)
    const mine = estadualOfUser(state);
    if (mine) {
      const rows = estadualTable(state, mine.div, my.round);
      state = { ...state, morale: updateMorale(g.morale, { gf, ga, home, position: rows.findIndex((x) => x.clubId === g.userClubId) + 1, size: Math.max(20, rows.length), round: Math.max(4, my.round), expectation: g.clubs[g.userClubId].boardExpectation }) };
      if (home && state.budgets[g.userClubId] !== undefined) state = playHomeGate(state, my.awayId, 'Estadual').state; // público e bilheteria do jogo em casa
    }
  }
  return { ...r, state: g.unemployed ? state : inboxTick(state) };
}
