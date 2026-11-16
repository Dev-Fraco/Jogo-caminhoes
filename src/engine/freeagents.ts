import { avgXI, clubProfile, type ProfileCtx } from './aiprofile';
import type { GameState, Player } from './types';

/* =====================================================================
   Regras do mercado de jogadores livres.
   1) Só ficam livres jogadores de overall 70 ou menos: os clubes liberam apenas esses. Quem tem mais que isso e termina o contrato é
      renovado pelo clube (ou foi vendido antes): nunca vai ao mercado de graça.
   2) Cada clube só contrata, entre os livres, quem tem overall PARECIDO com o nível do próprio time: o teto é o nível dos titulares
      mais uma folga que depende do porte (pequeno 4, médio 7, grande 12), e nunca passa de 70.
   ===================================================================== */

export const FREE_AGENT_MAX = 70;
export const FREE_BAND = { pequeno: 4, medio: 7, gigante: 12 } as const;

/** Este jogador pode ir ao mercado de livres? */
export const mayBeFree = (p: Pick<Player, 'strength'>) => p.strength <= FREE_AGENT_MAX;

/** Maior overall que o clube pode contratar entre os livres. */
export function freeAgentLimit(g: GameState, clubId: string, ctx?: ProfileCtx): number {
  const t = g.teams[clubId];
  if (!t) return 0;
  const level = ctx?.xi.get(clubId) ?? avgXI(t);
  return Math.min(FREE_AGENT_MAX, Math.round(level + FREE_BAND[clubProfile(g, clubId, ctx).tier]));
}

/** Motivo de o clube não poder contratar este livre (ou undefined se pode). */
export function freeAgentBlock(g: GameState, clubId: string, p: Pick<Player, 'strength'>, limit = freeAgentLimit(g, clubId)): string | undefined {
  if (!mayBeFree(p)) return `Só jogadores de overall ${FREE_AGENT_MAX} ou menos ficam livres.`;
  if (p.strength > limit) return `Este jogador (overall ${p.strength}) está acima do nível que o clube consegue contratar entre os livres (até ${limit}, perto do nível do time).`;
  return undefined;
}
