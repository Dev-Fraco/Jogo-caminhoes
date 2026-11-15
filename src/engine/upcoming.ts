import { calOf, matchDayOf } from './calendar';
import { estadualOfUser, stepLabel, userEstadualMatchAt } from './estadual';
import { pendingEvent } from './events';
import { fixturesOfRound, userDivision } from './game';
import type { GameState } from './types';

export interface UpcomingMatch { day: number; homeId: string; awayId: string; label: string; home: boolean }

/**
 * Próximos jogos do seu clube com a data de cada um.
 * O próximo é exato (copa ou continental pendente, rodada do estadual ou do campeonato); depois dele vêm as rodadas
 * seguintes do estadual e do campeonato. Jogos de copa e continentais aparecem no calendário quando o sorteio chega.
 */
export function upcomingMatches(g: GameState, limit = 12): UpcomingMatch[] {
  if (g.unemployed) return [];
  const c = calOf(g);
  const out: UpcomingMatch[] = [];
  let slot = c.slot;
  const push = (m: { homeId: string; awayId: string } | undefined, label: string) => {
    if (m && out.length < limit) out.push({ day: matchDayOf(g.seed, g.season, c.start, slot), homeId: m.homeId, awayId: m.awayId, label, home: m.homeId === g.userClubId });
    slot++;
  };
  const ev = pendingEvent(g);
  if (ev) push(ev.match, ev.label.replace(/^\S+\s/, ''));
  if (g.estadual?.due) {
    const mine = estadualOfUser(g);
    const from = ev && ev.kind === 'estadual' ? g.estadual.step + 1 : g.estadual.step;
    for (let s = from; s <= g.estadual.totalSteps && out.length < limit; s++) push(userEstadualMatchAt(g, s), mine ? `${mine.comp.name} · ${stepLabel(g.estadual, s)}` : `Estadual · ${stepLabel(g.estadual, s)}`);
  }
  const div = userDivision(g);
  if (div && div.format !== 'outside') {
    for (let r = g.round; r <= g.totalRounds && out.length < limit; r++) {
      const f = fixturesOfRound(g, r, div.id).find((x) => x.homeId === g.userClubId || x.awayId === g.userClubId);
      push(f ? { homeId: f.homeId, awayId: f.awayId } : undefined, `${div.name} · Rodada ${r}`);
    }
  }
  return out;
}
