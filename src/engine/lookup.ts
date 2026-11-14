import type { ClubInfo, GameState, TeamState } from './types';

/** Clube do campeonato ou de fora (Libertadores). */
export const clubOf = (g: Pick<GameState, 'clubs' | 'foreign'>, id: string): ClubInfo => g.clubs[id] ?? g.foreign!.clubs[id];
export const teamOf = (g: Pick<GameState, 'teams' | 'foreign'>, id: string): TeamState => g.teams[id] ?? g.foreign!.teams[id];
