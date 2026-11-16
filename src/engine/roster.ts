import type { Rng } from './rng';
import { inflate } from './economy';
import { autoLineup } from './squad';
import { transferBlock } from './windows';
import { notifyPhone } from './phone';
import { divisionIndexOf, MAX_SQUAD, MIN_BY_POS, MIN_SQUAD, playerValue } from './transfers';
import { FORMATIONS, type GameState, type Offer, type Player, type Position, type TeamState, type Transfer } from './types';

/** O elenco cumpre o mínimo de jogadores e de cada posição? */
export function rosterOk(players: Player[]): boolean {
  return players.length >= MIN_SQUAD && (Object.keys(MIN_BY_POS) as Position[]).every((pos) => players.filter((p) => p.pos === pos).length >= MIN_BY_POS[pos]);
}

/** Depois de perder jogadores, completa os 11 titulares com os melhores reservas da mesma posição. */
export function repairLineup(team: TeamState): TeamState {
  const have = new Set(team.players.map((p) => p.id));
  const lineup = team.lineup.filter((id) => have.has(id));
  if (lineup.length === 11) return { ...team, lineup };
  const need: Record<Position, number> = { GK: 1, ...FORMATIONS[team.formation] };
  const byId = new Map(team.players.map((p) => [p.id, p]));
  for (const id of lineup) need[byId.get(id)!.pos]--;
  for (const pos of Object.keys(need) as Position[]) {
    const bench = team.players.filter((p) => p.pos === pos && !lineup.includes(p.id)).sort((a, b) => b.strength - a.strength);
    for (let i = 0; i < need[pos] && i < bench.length; i++) lineup.push(bench[i].id);
  }
  return lineup.length === 11 ? { ...team, lineup } : { ...team, lineup: autoLineup(team.players, team.formation) };
}

const mine = (g: GameState, id: string) => g.teams[g.userClubId].players.find((p) => p.id === id);
const log = (g: GameState, t: Omit<Transfer, 'season' | 'round'>): Transfer[] => [...g.transfers, { season: g.season, round: g.round, ...t }];

/** Valor do jogador pela divisão do clube do jogador (é por quanto ele costuma ser vendido). */
export const myValue = (g: GameState, p: Player) => inflate(g, playerValue(p, divisionIndexOf(g, g.userClubId)));

/* ---------------- listas de transferência e de empréstimo ---------------- */

export function toggleTransferList(g: GameState, playerId: string): GameState {
  if (!mine(g, playerId)) return g;
  const on = g.transferList.includes(playerId);
  return { ...g, transferList: on ? g.transferList.filter((x) => x !== playerId) : [...g.transferList, playerId], loanList: g.loanList.filter((x) => x !== playerId) };
}

export function toggleLoanList(g: GameState, playerId: string): GameState {
  if (!mine(g, playerId)) return g;
  const on = g.loanList.includes(playerId);
  return { ...g, loanList: on ? g.loanList.filter((x) => x !== playerId) : [...g.loanList, playerId], transferList: g.transferList.filter((x) => x !== playerId) };
}

/* ---------------- dispensar ---------------- */

export type ReleaseCheck = { ok: true } | { ok: false; text: string };

export function checkRelease(g: GameState, playerId: string): ReleaseCheck {
  if (!mine(g, playerId)) return { ok: false, text: 'Este jogador não é do seu clube.' };
  if ((g.loansIn ?? []).some((l) => l.playerId === playerId)) return { ok: false, text: 'Jogador emprestado: ele volta ao clube dono no fim da temporada.' };
  const left = g.teams[g.userClubId].players.filter((p) => p.id !== playerId);
  return rosterOk(left) ? { ok: true } : { ok: false, text: `Não dá para dispensar: o elenco ficaria abaixo do mínimo (${MIN_SQUAD} jogadores; ${MIN_BY_POS.GK} goleiros, ${MIN_BY_POS.DEF} defensores, ${MIN_BY_POS.MID} meias e ${MIN_BY_POS.ATT} atacantes).` };
}

/** Remove o jogador de todas as listas e propostas e tira dele o lugar na escalação. */
function withoutPlayer(g: GameState, playerId: string): GameState {
  const team = g.teams[g.userClubId];
  const players = team.players.filter((p) => p.id !== playerId);
  return {
    ...g,
    teams: { ...g.teams, [g.userClubId]: repairLineup({ ...team, players }) },
    transferList: g.transferList.filter((x) => x !== playerId),
    loanList: g.loanList.filter((x) => x !== playerId),
    offers: g.offers.filter((o) => o.playerId !== playerId),
  };
}

export function releasePlayer(g: GameState, playerId: string): GameState {
  const p = mine(g, playerId);
  if (!p || !checkRelease(g, playerId).ok) return g;
  const s = withoutPlayer(g, playerId);
  return { ...s, transfers: log(g, { kind: 'release', playerId, playerName: p.name, pos: p.pos, strength: p.strength, fromClubId: g.userClubId, toClubId: '', fee: 0 }) };
}

/* ---------------- propostas dos outros clubes ---------------- */

const VALID_FOR = 3; // rodadas

/** Chance, por rodada, de aparecer proposta por um jogador listado. */
/** Chance por rodada de um clube procurar um jogador que você colocou na lista (antes 35% e 25%). */
export const OFFER_CHANCE = { buy: 0.6, loan: 0.45 };
/** Chance por rodada de um clube se interessar por um destaque do seu elenco mesmo sem ele estar à venda (a proposta vem com ágio). */
export const STAR_INTEREST = 0.07;
/** Quantos destaques do elenco (os de maior overall) atraem propostas espontâneas. */
export const STAR_COUNT = 8;
export const MAX_OPEN_OFFERS = 8;
export const LOAN_FEE_RATE = 0.08;

/** Depois de uma rodada: apaga propostas vencidas e sorteia novas para os jogadores das listas. */
export function generateOffers(g: GameState, rng: Rng): GameState {
  if (g.unemployed) return { ...g, offers: [] };
  let offers = g.offers.filter((o) => o.expiresRound >= g.round && mine(g, o.playerId));
  const userPlayers = g.teams[g.userClubId].players;
  const others = Object.keys(g.teams).filter((id) => id !== g.userClubId);

  const tryOffer = (playerId: string, kind: Offer['kind']) => {
    const p = userPlayers.find((x) => x.id === playerId);
    if (!p || offers.some((o) => o.playerId === playerId)) return;
    if (!rosterOk(userPlayers.filter((x) => x.id !== playerId))) return; // aceitar deixaria o elenco inválido
    if (rng() >= OFFER_CHANCE[kind]) return;
    const value = myValue(g, p);
    const fee = kind === 'buy' ? Math.max(10_000, Math.round((value * (0.85 + 0.3 * rng())) / 10_000) * 10_000) : Math.max(10_000, Math.round((value * LOAN_FEE_RATE) / 10_000) * 10_000);
    const buyers = others.filter((id) => g.teams[id].players.length < MAX_SQUAD && (g.budgets[id] ?? 0) >= fee);
    if (!buyers.length) return;
    const clubId = buyers[Math.floor(rng() * buyers.length)];
    offers = [...offers, { id: `${g.season}-${g.round}-${playerId}-${kind}`, kind, playerId, clubId, fee, season: g.season, expiresRound: g.round + VALID_FOR - 1 }];
  };
  for (const id of g.transferList) tryOffer(id, 'buy');
  for (const id of g.loanList) tryOffer(id, 'loan');
  // os destaques do elenco chamam a atenção de outros clubes mesmo sem estar à venda: propostas com ágio
  const stars = [...userPlayers].sort((a, b) => b.strength - a.strength).slice(0, STAR_COUNT);
  for (const p of stars) {
    if (g.transferList.includes(p.id) || offers.some((o) => o.playerId === p.id) || offers.length >= MAX_OPEN_OFFERS) continue;
    if (!rosterOk(userPlayers.filter((x) => x.id !== p.id))) continue;
    if (rng() >= STAR_INTEREST) continue;
    const fee = Math.max(10_000, Math.round((myValue(g, p) * (1.1 + 0.4 * rng())) / 10_000) * 10_000);
    const buyers = others.filter((id) => g.teams[id].players.length < MAX_SQUAD && (g.budgets[id] ?? 0) >= fee);
    if (!buyers.length) continue;
    const clubId = buyers[Math.floor(rng() * buyers.length)];
    offers = [...offers, { id: `${g.season}-${g.round}-${p.id}-buy`, kind: 'buy', playerId: p.id, clubId, fee, season: g.season, expiresRound: g.round + VALID_FOR - 1 }];
  }
  // avisa no celular as propostas novas
  const known = new Set(g.offers.map((o) => o.id));
  let s: GameState = { ...g, offers };
  for (const o of offers) {
    if (known.has(o.id)) continue;
    const pl = userPlayers.find((x) => x.id === o.playerId);
    if (pl) s = notifyPhone(s, 'noticias', `${g.clubs[o.clubId]?.name ?? 'Um clube'} quer ${o.kind === 'buy' ? 'comprar' : 'emprestar'} ${pl.name} (${Math.round(o.fee / 1000).toLocaleString('pt-BR')} mil).`);
  }
  return s;
}

export type OfferResult = { ok: true } | { ok: false; text: string };

export function acceptOffer(g: GameState, offerId: string): { state: GameState; result: OfferResult } {
  const offer = g.offers.find((o) => o.id === offerId);
  const drop = (text: string) => ({ state: { ...g, offers: g.offers.filter((o) => o.id !== offerId) }, result: { ok: false as const, text } });
  if (!offer) return { state: g, result: { ok: false, text: 'Proposta não encontrada.' } };
  const p = mine(g, offer.playerId);
  if (!p) return drop('O jogador não está mais no seu clube.');
  const closed = transferBlock(g, offer.kind === 'loan' ? 'emprestimo' : 'comum');
  if (closed) return { state: g, result: { ok: false, text: closed } };
  if ((g.loansIn ?? []).some((l) => l.playerId === p.id)) return drop('Jogador emprestado não pode ser vendido.');
  const host = g.teams[offer.clubId];
  if ((g.budgets[offer.clubId] ?? 0) < offer.fee) return drop('O clube não tem mais orçamento para essa proposta.');
  if (host.players.length >= MAX_SQUAD) return drop('O clube não tem mais vaga no elenco.');
  if (!checkRelease(g, offer.playerId).ok) return { state: g, result: { ok: false, text: 'Você ficaria com o elenco abaixo do mínimo. Contrate um reforço antes de aceitar.' } };

  const s = withoutPlayer(g, offer.playerId);
  const state: GameState = {
    ...s,
    teams: { ...s.teams, [offer.clubId]: { ...host, players: [...host.players, p] } },
    budgets: { ...s.budgets, [g.userClubId]: s.budgets[g.userClubId] + offer.fee, [offer.clubId]: s.budgets[offer.clubId] - offer.fee },
    loans: offer.kind === 'loan' ? [...g.loans, { playerId: p.id, hostClubId: offer.clubId, season: g.season }] : g.loans,
    transfers: log(g, { kind: offer.kind === 'buy' ? 'sale' : 'loan', playerId: p.id, playerName: p.name, pos: p.pos, strength: p.strength, fromClubId: g.userClubId, toClubId: offer.clubId, fee: offer.fee }),
  };
  return { state, result: { ok: true } };
}

export const rejectOffer = (g: GameState, offerId: string): GameState => ({ ...g, offers: g.offers.filter((o) => o.id !== offerId) });

/** No fim da temporada, os jogadores emprestados voltam para o seu clube. */
export function returnLoans(g: GameState): GameState {
  let teams = g.teams;
  for (const l of g.loans) {
    const host = teams[l.hostClubId];
    const p = host?.players.find((x) => x.id === l.playerId);
    if (!p) continue;
    const owner = teams[g.userClubId];
    teams = { ...teams, [l.hostClubId]: { ...host, players: host.players.filter((x) => x.id !== l.playerId) }, [g.userClubId]: { ...owner, players: [...owner.players, p] } };
  }
  // jogadores que vieram emprestados de outros clubes voltam ao dono
  for (const l of g.loansIn ?? []) {
    const me = teams[g.userClubId];
    const p = me?.players.find((x) => x.id === l.playerId);
    const owner = teams[l.ownerClubId];
    if (!p || !owner) continue;
    const { contract: _c, ...back } = p;
    teams = { ...teams, [g.userClubId]: repairLineup({ ...me, players: me.players.filter((x) => x.id !== l.playerId) }), [l.ownerClubId]: { ...owner, players: [...owner.players, back] } };
  }
  return { ...g, teams, loans: [], loansIn: [] };
}
