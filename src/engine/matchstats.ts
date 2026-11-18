import type { MatchEvent, MatchResult } from './types';

/** Estatísticas de uma partida, tiradas SÓ dos lances que o motor registrou (a mesma lista serve a quem simula e a quem assiste). */
export interface SideStats { goals: number; shots: number; onTarget: number; saves: number; fouls: number; yellow: number; red: number; corners: number; offsides: number; penalties: number; injuries: number; changes: number; varReviews: number }
export interface MatchStats { home: SideStats; away: SideStats }

const blank = (): SideStats => ({ goals: 0, shots: 0, onTarget: 0, saves: 0, fouls: 0, yellow: 0, red: 0, corners: 0, offsides: 0, penalties: 0, injuries: 0, changes: 0, varReviews: 0 });

/** Conta os lances até `minute` (padrão: a partida toda). Finalização = gol + defesa + chute para fora; "no alvo" = gol + defesa. */
export function matchStats(events: MatchEvent[], minute = 999): MatchStats {
  const s: MatchStats = { home: blank(), away: blank() };
  for (const e of events) {
    if (e.minute > minute || e.side === 'none') continue;
    const me = s[e.side], op = s[e.side === 'home' ? 'away' : 'home'];
    switch (e.type) {
      case 'goal': me.shots++; me.onTarget++; if (!e.annulled) me.goals++; break; // gol anulado pelo VAR conta como finalização, não como gol
      case 'var': me.varReviews++; break;
      case 'save': me.shots++; me.onTarget++; op.saves++; break; // a defesa é do goleiro do outro time
      case 'miss': me.shots++; break;
      case 'foul': me.fouls++; if (e.pen) op.penalties++; break; // o pênalti é do time que sofreu a falta
      case 'offside': me.offsides++; break;
      case 'yellow': if (!e.annulled) me.yellow++; break;
      case 'red': if (!e.annulled) me.red++; break;
      case 'corner': me.corners++; break;
      case 'injury': me.injuries++; break;
      case 'tactic': me.changes++; break;
    }
  }
  return s;
}

/** Os lances que valem destaque na simulação (gols, cartões, lesões, mudanças e intervalo/fim). */
export const isHighlight = (e: MatchEvent) => e.type === 'goal' || e.type === 'var' || (e.type === 'foul' && !!e.pen) || e.type === 'yellow' || e.type === 'red' || e.type === 'injury' || e.type === 'tactic' || e.type === 'halftime' || e.type === 'fulltime';

/** O placar do resultado confere com os gols da lista de lances? (a simulação e a partida assistida usam a mesma lista) */
export const consistent = (r: Pick<MatchResult, 'homeGoals' | 'awayGoals' | 'events'>): boolean => {
  if (!r.events.length) return true; // jogos sem narração guardada (outros clubes)
  const st = matchStats(r.events);
  return st.home.goals === r.homeGoals && st.away.goals === r.awayGoals;
};
