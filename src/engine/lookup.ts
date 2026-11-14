import { estadualClub } from '../data/estaduais_clubs';
import { generateSquad, teamFromPlayers } from './squad';
import type { ClubInfo, GameState, TeamState } from './types';

const GEN = new Map<string, TeamState>();
/** Elenco de um clube "só estadual": gerado na hora a partir da força fixa dele (sempre o mesmo). */
function estadualTeam(id: string): TeamState | undefined {
  const c = estadualClub(id);
  if (!c) return undefined;
  let t = GEN.get(id);
  if (!t) { t = teamFromPlayers(id, generateSquad({ id, name: c.name, short: c.shortName, color: c.primaryColor, strength: c.rating || 50 }, 2026)); GEN.set(id, t); }
  return t;
}
function estadualInfo(id: string): ClubInfo | undefined {
  const c = estadualClub(id);
  return c ? { id, name: c.name, shortName: c.shortName, badge: `assets/badges/${id}.png`, primaryColor: c.primaryColor, secondaryColor: c.secondaryColor, stadium: 'Estádio Municipal', city: c.city, reputation: 1, boardExpectation: 'mid' } : undefined;
}

/** Clube do campeonato, de fora (Libertadores/Champions) ou "só estadual". */
export const clubOf = (g: Pick<GameState, 'clubs' | 'foreign'>, id: string): ClubInfo => g.clubs[id] ?? g.foreign?.clubs[id] ?? estadualInfo(id)!;
export const teamOf = (g: Pick<GameState, 'teams' | 'foreign'>, id: string): TeamState => g.teams[id] ?? g.foreign?.teams[id] ?? estadualTeam(id)!;

/** O clube é dirigido pelo jogador (e não pela IA)? Sem clube, o antigo vira da IA. */
export const managed = (g: Pick<GameState, 'userClubId' | 'unemployed'>, id: string) => id === g.userClubId && !g.unemployed;
