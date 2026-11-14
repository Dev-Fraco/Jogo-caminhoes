import { autoLineup } from './squad';
import type { GameState, Player, Position } from './types';

/** Limites de elenco. O clube que vende não pode ficar abaixo do mínimo, nem o jogador passar do máximo. */
export const MAX_SQUAD = 30;
export const MIN_SQUAD = 18;
export const MIN_BY_POS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, ATT: 3 };

/** Valor de mercado (R$): sobe rápido com o overall e cai com a idade. 60 ≈ R$ 1,4 mi, 70 ≈ 5,7 mi, 80 ≈ 23 mi, 90 ≈ 93 mi (jogador de 25–28 anos). */
export function playerValue(p: Player): number {
  const base = 350_000 * 1.15 ** (p.strength - 50);
  const age = p.age <= 21 ? 1.5 : p.age <= 24 ? 1.25 : p.age <= 28 ? 1 : p.age <= 31 ? 0.7 : p.age <= 34 ? 0.4 : 0.25;
  return Math.max(50_000, Math.round((base * age) / 50_000) * 50_000);
}

export interface MarketEntry { player: Player; clubId: string; price: number }

/** Todos os jogadores dos outros clubes, com o preço pedido. */
export function marketEntries(g: GameState): MarketEntry[] {
  const out: MarketEntry[] = [];
  for (const [clubId, team] of Object.entries(g.teams)) {
    if (clubId === g.userClubId) continue;
    for (const player of team.players) out.push({ player, clubId, price: playerValue(player) });
  }
  return out;
}

export type BuyBlock = 'not-found' | 'own-player' | 'budget' | 'squad-full' | 'seller-short';

export const BUY_BLOCK_TEXT: Record<BuyBlock, string> = {
  'not-found': 'Jogador não encontrado.',
  'own-player': 'Este jogador já é do seu clube.',
  budget: 'Orçamento insuficiente.',
  'squad-full': `Elenco cheio (máximo de ${MAX_SQUAD} jogadores).`,
  'seller-short': 'O clube vendedor não pode ficar com elenco menor que o mínimo.',
};

export type BuyCheck = { ok: true; price: number; fromClubId: string } | { ok: false; reason: BuyBlock; price?: number; fromClubId?: string };

export function checkBuy(g: GameState, playerId: string): BuyCheck {
  const user = g.teams[g.userClubId];
  if (user.players.some((p) => p.id === playerId)) return { ok: false, reason: 'own-player' };
  const fromClubId = Object.keys(g.teams).find((id) => g.teams[id].players.some((p) => p.id === playerId));
  if (!fromClubId) return { ok: false, reason: 'not-found' };
  const seller = g.teams[fromClubId];
  const player = seller.players.find((p) => p.id === playerId)!;
  const price = playerValue(player);
  if (user.players.length >= MAX_SQUAD) return { ok: false, reason: 'squad-full', price, fromClubId };
  if ((g.budgets[g.userClubId] ?? 0) < price) return { ok: false, reason: 'budget', price, fromClubId };
  const left = seller.players.filter((p) => p.id !== playerId);
  const short = left.length < MIN_SQUAD || (Object.keys(MIN_BY_POS) as Position[]).some((pos) => left.filter((p) => p.pos === pos).length < MIN_BY_POS[pos]);
  if (short) return { ok: false, reason: 'seller-short', price, fromClubId };
  return { ok: true, price, fromClubId };
}

/** Contrata um jogador de outro clube: o dinheiro vai para o vendedor, o jogador entra no elenco como reserva. */
export function buyPlayer(g: GameState, playerId: string): { state: GameState; check: BuyCheck } {
  const check = checkBuy(g, playerId);
  if (!check.ok) return { state: g, check };
  const { price, fromClubId } = check;
  const seller = g.teams[fromClubId];
  const player = seller.players.find((p) => p.id === playerId)!;
  const left = seller.players.filter((p) => p.id !== playerId);
  const buyer = g.teams[g.userClubId];
  const state: GameState = {
    ...g,
    teams: {
      ...g.teams,
      [fromClubId]: { ...seller, players: left, lineup: autoLineup(left, seller.formation) },
      [g.userClubId]: { ...buyer, players: [...buyer.players, player] },
    },
    budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] - price, [fromClubId]: (g.budgets[fromClubId] ?? 0) + price },
    transfers: [...g.transfers, { season: g.season, round: g.round, playerId, playerName: player.name, pos: player.pos, strength: player.strength, fromClubId, toClubId: g.userClubId, fee: price }],
  };
  return { state, check };
}
