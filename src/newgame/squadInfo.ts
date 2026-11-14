import { autoLineup } from '../engine/squad';
import { POS_ORDER } from '../engine/game';
import type { Player, Position } from '../engine/types';

/** Os 11 titulares (melhor time num 4-4-2), em ordem de posição. */
export function startingEleven(players: Player[]): Player[] {
  const ids = new Set(autoLineup(players, '4-4-2'));
  return players.filter((p) => ids.has(p.id));
}

/** Overall do elenco = média dos 11 titulares. */
export function squadOverall(players: Player[]): number {
  const xi = startingEleven(players);
  return xi.length ? Math.round(xi.reduce((s, p) => s + p.strength, 0) / xi.length) : 0;
}

export const POSITION_LABEL: Record<Position, string> = { GK: 'Goleiros', DEF: 'Defensores', MID: 'Meio-campistas', ATT: 'Atacantes' };

/** Jogadores agrupados por posição (goleiros → atacantes), cada grupo do maior para o menor overall. */
export function groupByPosition(players: Player[]): { pos: Position; label: string; players: Player[] }[] {
  return POS_ORDER.map((pos) => ({
    pos, label: POSITION_LABEL[pos],
    players: players.filter((p) => p.pos === pos).sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name, 'pt-BR')),
  }));
}
