import { CLUBS_DATA, type ClubData } from '../data/clubs';
import { estadualClub } from '../data/estaduais_clubs';
import { COUNTRY_ORDER, WORLD_DATA } from '../data/world';
import { developPlayer } from './ai';
import { inflate } from './economy';
import { afterSigning, fairplayBlock } from './fairplay';
import { baseWage } from './finance';
import { clubOf } from './lookup';
import { clamp, hashString, makeRng } from './rng';
import { rosterOk } from './roster';
import { transferBlock } from './windows';
import { autoLineup, randomName } from './squad';
import { divisionIndexOf, MAX_SQUAD, MIN_BY_POS, MIN_SQUAD, playerValue } from './transfers';
import type { GameState, NewsItem, Player, Position, TeamState } from './types';

/* ---------- diretório de clubes (da sua liga e do mundo) ---------- */

export interface DirClub {
  id: string; name: string; shortName: string; badge: string; countryId: string; countryName: string; flag: string; leagueName: string;
  divisionId: string; divisionName: string; divIndex: number; reputation: number; primaryColor: string; secondaryColor: string; domestic: boolean;
}

const COUNTRY_WEIGHT: Record<string, number> = { EN: 1, ES: 0.95, IT: 0.9, DE: 0.9, FR: 0.8, PT: 0.6, BR: 0.5, AR: 0.5, CL: 0.35, CO: 0.35, UY: 0.35, EC: 0.3, PY: 0.3, PE: 0.3, BO: 0.25, VE: 0.25 };
/** Prestígio da liga/divisão (0 a 1): jogadores de ligas mais fortes pedem mais para vir de ligas mais fracas. */
export const leagueScore = (countryId: string, divIndex: number) => (COUNTRY_WEIGHT[countryId] ?? 0.3) * (1 - 0.2 * Math.min(divIndex, 3));

interface Foreign extends DirClub { data: ClubData }
let FOREIGN: Map<string, Foreign> | null = null;
function foreignIndex(): Map<string, Foreign> {
  if (FOREIGN) return FOREIGN;
  const m = new Map<string, Foreign>();
  for (const cid of COUNTRY_ORDER) {
    const c = WORLD_DATA[cid];
    for (const l of c.leagues) l.divisions.forEach((d, i) => {
      for (const data of CLUBS_DATA[d.id] ?? []) m.set(data.id, { id: data.id, name: data.name, shortName: data.shortName, badge: data.badge, countryId: cid, countryName: c.name, flag: c.flag, leagueName: l.name, divisionId: d.id, divisionName: d.alias ?? d.name, divIndex: i, reputation: data.reputation, primaryColor: data.primaryColor, secondaryColor: data.secondaryColor, domestic: false, data });
    });
  }
  return (FOREIGN = m);
}

/** País e liga da carreira (pela 1ª divisão da pirâmide). */
export function homeLeague(g: Pick<GameState, 'divisions'>): { countryId: string; countryName: string; flag: string; leagueName: string } {
  const first = g.divisions[0].id;
  for (const cid of COUNTRY_ORDER) for (const l of WORLD_DATA[cid].leagues) if (l.divisions[0].id === first) return { countryId: cid, countryName: WORLD_DATA[cid].name, flag: WORLD_DATA[cid].flag, leagueName: l.name };
  return { countryId: 'BR', countryName: 'Brasil', flag: '🇧🇷', leagueName: 'Campeonato' };
}

/** Todos os clubes onde dá para buscar jogadores: os da sua liga e os de outras ligas (com elencos dos dados do jogo). */
export function directory(g: GameState): DirClub[] {
  const home = homeLeague(g);
  const out: DirClub[] = [];
  g.divisions.forEach((d, i) => d.clubIds.forEach((id) => {
    if (id === g.userClubId) return;
    const c = g.clubs[id];
    out.push({ id, name: c.name, shortName: c.shortName, badge: c.badge, ...home, divisionId: d.id, divisionName: d.name, divIndex: i, reputation: c.reputation, primaryColor: c.primaryColor, secondaryColor: c.secondaryColor, domestic: true });
  }));
  for (const f of foreignIndex().values()) if (!g.teams[f.id]) { const { data: d, ...rest } = f; out.push({ ...rest, badge: d.badge }); }
  return out;
}

export const dirClub = (g: GameState, id: string): DirClub | undefined => directory(g).find((c) => c.id === id);
/** Nome de qualquer clube (da liga, da Libertadores/Champions ou de outras ligas). */
export const anyClubName = (g: GameState, id: string): string => g.clubs[id]?.name ?? g.foreign?.clubs[id]?.name ?? foreignIndex().get(id)?.name ?? estadualClub(id)?.name ?? '—';

/* ---------- elencos de fora ---------- */

/** Elenco de um clube de outra liga: os dados do jogo, envelhecidos pelos anos da carreira (veteranos viram garotos), com as vendas e compras feitas por você. */
export function foreignSquad(g: GameState, clubId: string): Player[] {
  const f = foreignIndex().get(clubId);
  if (!f) return [];
  let players = f.data.squad;
  for (let i = 1; i <= g.history.length; i++) {
    const rng = makeRng(hashString(`${clubId}:${i}`));
    players = players.map((p) => developPlayer(p, rng));
    const used = new Set(players.map((p) => p.name));
    const avg = players.reduce((t, p) => t + p.strength, 0) / players.length;
    players = players.map((p) => (p.age >= 36 ? { id: `${p.id}r${i}`, name: randomName(rng, used), pos: p.pos, age: 18, strength: clamp(Math.round(avg - 14 + (rng() - 0.5) * 6), 30, 90) } : p));
  }
  const deal = g.foreignDeals?.[clubId];
  if (deal) players = [...players.filter((p) => !deal.out.includes(p.id)), ...deal.in];
  return players;
}

export function clubPlayers(g: GameState, clubId: string): Player[] {
  return g.teams[clubId]?.players ?? foreignSquad(g, clubId);
}

/* ---------- preço, salário e regras da negociação ---------- */

export interface Quote {
  club: DirClub; player: Player;
  price: number; askFee: number; minFee: number;
  wageDemand: number; yearsMin: number; yearsMax: number;
  role: 'best' | 'starter' | 'reserve';
  refuses?: string;
}

const yearsFor = (age: number): [number, number] => (age <= 21 ? [3, 5] : age <= 27 ? [2, 5] : age <= 31 ? [1, 3] : [1, 2]);

export function quote(g: GameState, clubId: string, playerId: string): Quote | null {
  const club = dirClub(g, clubId);
  const squad = club ? clubPlayers(g, clubId) : [];
  const player = squad.find((p) => p.id === playerId);
  if (!club || !player) return null;
  const mine = homeLeague(g);
  const international = club.countryId !== mine.countryId;
  const ranked = [...squad].sort((a, b) => b.strength - a.strength);
  const idx = ranked.findIndex((p) => p.id === playerId);
  const role = idx === 0 ? 'best' : idx < 11 ? 'starter' : 'reserve';
  const price = Math.round(inflate(g, playerValue(player, club.divIndex)) * (international ? 1.1 : 1) / 10_000) * 10_000;
  const askFee = Math.round(price * (role === 'best' ? 1.25 : role === 'starter' ? 1.05 : 1) / 10_000) * 10_000;
  const minFee = Math.round(price * (role === 'best' ? 1.1 : role === 'starter' ? 0.97 : 0.88) / 10_000) * 10_000;
  const myScore = leagueScore(mine.countryId, divisionIndexOf(g, g.userClubId));
  const theirScore = leagueScore(club.countryId, club.divIndex);
  const gap = Math.max(0, theirScore - myScore);
  const wageDemand = Math.round(baseWage(g, g.userClubId, player) * (1.1 + 0.9 * gap) / 1_000) * 1_000;
  const [yearsMin, yearsMax] = yearsFor(player.age);
  const refuses = player.strength >= 85 && gap > 0.35 ? 'Ele só aceitaria jogar numa liga mais forte.' : player.strength >= 88 && g.clubs[g.userClubId].reputation <= 2 ? 'Um craque desse nível não aceita um clube tão pequeno.' : undefined;
  return { club, player, price, askFee, minFee, wageDemand, yearsMin, yearsMax, role, refuses };
}

export const MAX_TALKS_PER_ROUND = 4;
const talksLeft = (g: GameState, playerId: string) => {
  const t = g.talks?.[playerId];
  return t && t.season === g.season && t.round === g.round ? Math.max(0, MAX_TALKS_PER_ROUND - t.tries) : MAX_TALKS_PER_ROUND;
};
export { talksLeft };

export interface Proposal { fee: number; wage: number; years: number }
export interface Verdict { ok: boolean; text: string; counter?: number }
export interface NegotiationResult { state: GameState; deal: boolean; club: Verdict; player: Verdict; blocked?: string }

const news = (g: GameState, text: string, tone: NewsItem['tone']): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const fmt = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;

/** Confere regras que independem da conversa: elenco cheio, orçamento, clube vendedor sem jogadores e rodadas de negociação. */
function blocker(g: GameState, q: Quote, fee: number): string | undefined {
  if (g.unemployed) return 'Você está sem clube.';
  const ban = fairplayBlock(g);
  if (ban) return ban;
  const closed = transferBlock(g, 'comum');
  if (closed) return closed;
  if (g.teams[g.userClubId].players.some((p) => p.id === q.player.id)) return 'Este jogador já é do seu clube.';
  if (g.teams[g.userClubId].players.length >= MAX_SQUAD) return `Elenco cheio (máximo de ${MAX_SQUAD} jogadores).`;
  if ((g.budgets[g.userClubId] ?? 0) < fee) return 'Orçamento do clube insuficiente para essa proposta.';
  const left = clubPlayers(g, q.club.id).filter((p) => p.id !== q.player.id);
  if (left.length < MIN_SQUAD || (Object.keys(MIN_BY_POS) as Position[]).some((pos) => left.filter((p) => p.pos === pos).length < MIN_BY_POS[pos])) return 'O clube vendedor não pode ficar com elenco menor que o mínimo.';
  if (talksLeft(g, q.player.id) === 0) return 'As negociações travaram. Tente de novo na próxima rodada.';
  return undefined;
}

/** O clube vendedor e o jogador respondem à proposta. Se os dois aceitarem, a contratação é fechada na hora. */
export function negotiate(g: GameState, clubId: string, playerId: string, p: Proposal): NegotiationResult {
  const q = quote(g, clubId, playerId);
  const none: Verdict = { ok: false, text: '' };
  if (!q) return { state: g, deal: false, club: none, player: none, blocked: 'Jogador não encontrado.' };
  const fee = Math.max(0, Math.round(p.fee)), wage = Math.max(0, Math.round(p.wage)), years = Math.round(p.years);
  const block = blocker(g, q, fee);
  if (block) return { state: g, deal: false, club: none, player: none, blocked: block };

  // clube
  let club: Verdict;
  if (fee >= q.minFee) club = { ok: true, text: `${q.club.name} aceitou ${fmt(fee)}.` };
  else if (fee >= q.minFee * 0.75) club = { ok: false, counter: q.minFee, text: `${q.club.name} quer pelo menos ${fmt(q.minFee)}.` };
  else club = { ok: false, text: `${q.club.name} achou a proposta ofensiva e nem quis conversar.` };

  // jogador
  let player: Verdict;
  const yearsOk = years >= q.yearsMin && years <= q.yearsMax;
  const need = yearsOk ? q.wageDemand * 0.95 : q.wageDemand * 1.1;
  if (q.refuses) player = { ok: false, text: q.refuses };
  else if (wage >= need) player = { ok: true, text: `${q.player.name} aceitou o contrato de ${years} ${years === 1 ? 'ano' : 'anos'}.` };
  else if (!yearsOk) player = { ok: false, counter: Math.round(q.wageDemand * 1.1 / 1_000) * 1_000, text: `${q.player.name} prefere um contrato de ${q.yearsMin} a ${q.yearsMax} anos; com ${years} pediria ${fmt(q.wageDemand * 1.1)} por ano.` };
  else player = { ok: false, counter: q.wageDemand, text: `${q.player.name} quer ${fmt(q.wageDemand)} por ano.` };

  const tk = g.talks?.[playerId];
  const tries = tk && tk.season === g.season && tk.round === g.round ? tk.tries + 1 : 1;
  let state: GameState = { ...g, talks: { ...(g.talks ?? {}), [playerId]: { season: g.season, round: g.round, tries } } };
  if (club.ok && player.ok) return { state: sign(state, q, fee, wage, years), deal: true, club, player };
  return { state, deal: false, club, player };
}

/** Fecha a contratação: dinheiro ao vendedor, jogador no elenco com contrato. */
export function sign(g: GameState, q: Quote, fee: number, wage: number, years: number): GameState {
  const player: Player = { ...q.player, contract: { wage, until: g.season + years - 1 } };
  const me = g.teams[g.userClubId];
  const buyer: TeamState = { ...me, players: [...me.players, player] };
  const log = { kind: 'buy' as const, season: g.season, round: g.round, playerId: player.id, playerName: player.name, pos: player.pos, strength: player.strength, fromClubId: q.club.id, toClubId: g.userClubId, fee };
  let s: GameState;
  if (g.teams[q.club.id]) {
    const seller = g.teams[q.club.id];
    const left = seller.players.filter((x) => x.id !== player.id);
    s = { ...g, teams: { ...g.teams, [q.club.id]: { ...seller, players: left, lineup: autoLineup(left, seller.formation) }, [g.userClubId]: buyer }, budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] - fee, [q.club.id]: (g.budgets[q.club.id] ?? 0) + fee } };
  } else {
    const deal = g.foreignDeals?.[q.club.id] ?? { out: [], in: [] };
    const wasIn = deal.in.some((x) => x.id === player.id);
    s = {
      ...g, teams: { ...g.teams, [g.userClubId]: buyer }, budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] - fee },
      foreignDeals: { ...(g.foreignDeals ?? {}), [q.club.id]: { out: wasIn ? deal.out : [...deal.out, player.id], in: deal.in.filter((x) => x.id !== player.id) } },
    };
  }
  s = { ...s, transfers: [...s.transfers, log] };
  return afterSigning(news(s, `✍️ Contratado: ${player.name} (overall ${player.strength}) do ${q.club.name} por ${fmt(fee)}, contrato de ${years} ${years === 1 ? 'ano' : 'anos'}.`, 'good'));
}

/** Contratação direta pelo preço pedido (aba Mercado), com um contrato padrão. */
export function quickSign(g: GameState, clubId: string, playerId: string): NegotiationResult {
  const q = quote(g, clubId, playerId);
  if (!q) return { state: g, deal: false, club: { ok: false, text: '' }, player: { ok: false, text: '' }, blocked: 'Jogador não encontrado.' };
  return negotiate(g, clubId, playerId, { fee: q.askFee, wage: Math.round(q.wageDemand * 1.05 / 1_000) * 1_000, years: Math.min(q.yearsMax, Math.max(q.yearsMin, 3)) });
}

/* ---------- contratos e renovação ---------- */

/** Temporadas que faltam no contrato (incluindo a atual). Sem contrato negociado: null. */
export const contractLeft = (g: Pick<GameState, 'season'>, p: Player): number | null => (p.contract ? p.contract.until - g.season + 1 : null);

export interface RenewalQuote { wageDemand: number; yearsMin: number; yearsMax: number; current: number }
export function renewalQuote(g: GameState, playerId: string): RenewalQuote | null {
  const p = g.teams[g.userClubId]?.players.find((x) => x.id === playerId);
  if (!p) return null;
  const current = p.contract?.wage ?? baseWage(g, g.userClubId, p);
  const [yearsMin, yearsMax] = yearsFor(p.age);
  return { wageDemand: Math.round(Math.max(current, baseWage(g, g.userClubId, p)) * 1.08 / 1_000) * 1_000, yearsMin, yearsMax, current };
}

export function renew(g: GameState, playerId: string, wage: number, years: number): { state: GameState; ok: boolean; text: string; counter?: number } {
  const q = renewalQuote(g, playerId);
  const p = g.teams[g.userClubId]?.players.find((x) => x.id === playerId);
  if (!q || !p) return { state: g, ok: false, text: 'Jogador não encontrado.' };
  if (p.age >= 37) return { state: g, ok: false, text: `${p.name} quer se aposentar e não renova.` };
  const yearsOk = years >= q.yearsMin && years <= q.yearsMax;
  const need = yearsOk ? q.wageDemand * 0.95 : q.wageDemand * 1.1;
  if (wage < need) return { state: g, ok: false, counter: Math.round((yearsOk ? q.wageDemand : q.wageDemand * 1.1) / 1_000) * 1_000, text: yearsOk ? `${p.name} quer ${fmt(q.wageDemand)} por ano.` : `${p.name} prefere de ${q.yearsMin} a ${q.yearsMax} anos; com ${years} pediria ${fmt(q.wageDemand * 1.1)}.` };
  const t = g.teams[g.userClubId];
  const players = t.players.map((x) => (x.id === playerId ? { ...x, contract: { wage: Math.round(wage), until: g.season + years - 1 } } : x));
  return { state: news({ ...g, teams: { ...g.teams, [g.userClubId]: { ...t, players } } }, `📄 ${p.name} renovou por ${years} ${years === 1 ? 'ano' : 'anos'} (${fmt(wage)} por ano).`, 'good'), ok: true, text: `${p.name} renovou o contrato!` };
}

/** Virada de temporada: contratos que terminaram. O jogador sai (a menos que isso deixe o elenco inválido: aí o contrato é estendido por 1 ano). */
export function expireContracts(g: GameState): GameState {
  if (g.unemployed) return g;
  const t = g.teams[g.userClubId];
  let players = t.players;
  let s = g;
  for (const p of t.players) {
    if (!p.contract || p.contract.until > g.season) continue;
    const next = players.filter((x) => x.id !== p.id);
    if (rosterOk(next)) { players = next; s = news(s, `📄 O contrato de ${p.name} terminou e ele deixou o clube.`, 'info'); }
    else players = players.map((x) => (x.id === p.id ? { ...x, contract: { ...x.contract!, until: g.season + 1 } } : x));
  }
  if (players === t.players) return s;
  return { ...s, teams: { ...s.teams, [g.userClubId]: { ...t, players, lineup: autoLineup(players, t.formation) } } };
}

export { clubOf };
