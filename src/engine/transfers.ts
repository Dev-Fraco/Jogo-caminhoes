import { inflate } from './economy';
import { afterSigning, fairplayBlock } from './fairplay';
import { autoLineup } from './squad';
import type { GameState, Player, Position } from './types';

/** Limites de elenco. O clube que vende não pode ficar abaixo do mínimo, nem o jogador passar do máximo. */
export const MAX_SQUAD = 30;
export const MIN_SQUAD = 18;
export const MIN_BY_POS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, ATT: 3 };

/** Quanto vale um jogador em cada divisão (A → D): jogador da Série D vale uma fração do mesmo overall na Série A. */
export const DIVISION_VALUE = [1, 0.5, 0.25, 0.1, 0.05];

/**
 * Valor de mercado (R$). Cresce com o overall, cai com a idade e depende da divisão do clube onde joga.
 * Série A, 25–28 anos: overall 60 ≈ R$ 0,6 mi, 70 ≈ 2,6 mi, 80 ≈ 11 mi, 90 ≈ 47 mi. Série D: um décimo disso.
 */
export function playerValue(p: Player, divisionIndex = 0): number {
  const base = 150_000 * 1.155 ** (p.strength - 50);
  const age = p.age <= 21 ? 1.5 : p.age <= 24 ? 1.25 : p.age <= 28 ? 1 : p.age <= 31 ? 0.7 : p.age <= 34 ? 0.4 : 0.25;
  const v = base * age * DIVISION_VALUE[Math.min(Math.max(divisionIndex, 0), DIVISION_VALUE.length - 1)];
  const step = v >= 10_000_000 ? 500_000 : v >= 1_000_000 ? 100_000 : v >= 200_000 ? 50_000 : 10_000;
  return Math.max(10_000, Math.round(v / step) * step);
}

/** Índice (0 = Série A) da divisão em que o clube joga. */
export const divisionIndexOf = (g: GameState, clubId: string) => { const i = g.divisions.findIndex((d) => d.clubIds.includes(clubId)); return i < 0 ? 4 : i; }; // fora da pirâmide = nível 4

export interface MarketEntry { player: Player; clubId: string; price: number }

/** Todos os jogadores dos outros clubes, com o preço pedido. */
export function marketEntries(g: GameState): MarketEntry[] {
  const out: MarketEntry[] = [];
  for (const [clubId, team] of Object.entries(g.teams)) {
    if (clubId === g.userClubId) continue;
    const di = divisionIndexOf(g, clubId);
    for (const player of team.players) out.push({ player, clubId, price: inflate(g, playerValue(player, di)) });
  }
  return out;
}

export type BuyBlock = 'ban' | 'not-found' | 'own-player' | 'budget' | 'squad-full' | 'seller-short';

export const BUY_BLOCK_TEXT: Record<BuyBlock, string> = {
  ban: 'Transfer ban (fair play financeiro): o clube não pode contratar agora.',
  'not-found': 'Jogador não encontrado.',
  'own-player': 'Este jogador já é do seu clube.',
  budget: 'Orçamento insuficiente.',
  'squad-full': `Elenco cheio (máximo de ${MAX_SQUAD} jogadores).`,
  'seller-short': 'O clube vendedor não pode ficar com elenco menor que o mínimo.',
};

export type BuyCheck = { ok: true; price: number; fromClubId: string } | { ok: false; reason: BuyBlock; price?: number; fromClubId?: string };

export function checkBuy(g: GameState, playerId: string): BuyCheck {
  if (fairplayBlock(g)) return { ok: false, reason: 'ban' };
  const user = g.teams[g.userClubId];
  if (user.players.some((p) => p.id === playerId)) return { ok: false, reason: 'own-player' };
  const fromClubId = Object.keys(g.teams).find((id) => g.teams[id].players.some((p) => p.id === playerId));
  if (!fromClubId) return { ok: false, reason: 'not-found' };
  const seller = g.teams[fromClubId];
  const player = seller.players.find((p) => p.id === playerId)!;
  const price = inflate(g, playerValue(player, divisionIndexOf(g, fromClubId)));
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
    transfers: [...g.transfers, { kind: 'buy', season: g.season, round: g.round, playerId, playerName: player.name, pos: player.pos, strength: player.strength, fromClubId, toClubId: g.userClubId, fee: price }],
  };
  return { state: afterSigning(state), check };
}
