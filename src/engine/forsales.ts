import { marketValue } from './aisales';
import { baseWage } from './finance';
import { inflate } from './economy';
import { clubPlayers, directory, type DirClub } from './market';
import { notifyPhone } from './phone';
import { repairLineup, rosterOk } from './roster';
import { clamp, hashString, type Rng } from './rng';
import { transferBlock } from './windows';
import type { ForeignSale, GameState, NewsItem, Player } from './types';

/* =====================================================================
   Vendas para clubes do mundo: clubes de outros países fazem propostas pelos seus jogadores à venda (e, às vezes, pelos seus destaques).
   O pagamento é à vista, no ato do aceite. O jogador entra no elenco do clube de fora, e depois você pode até contratá-lo de volta no mercado.
   ===================================================================== */

export const MAX_OPEN_SALES = 4;
export const SALE_LIFE = 3;               // rodadas de validade
const CHANCE_LISTED = 0.32, CHANCE_STAR = 0.06;
const STARS = 3;

const WEALTHY = new Set(['EN', 'ES', 'IT', 'DE', 'FR']);
/** Até quanto o clube consegue pagar por um jogador (R$): cresce com a reputação e com a força financeira do país. */
export const wealthCap = (g: GameState, c: Pick<DirClub, 'reputation' | 'countryId'>): number =>
  inflate(g, [2e6, 6e6, 18e6, 50e6, 150e6][clamp(c.reputation, 1, 5) - 1] * (WEALTHY.has(c.countryId) ? 1.8 : c.countryId === 'PT' || c.countryId === 'BR' || c.countryId === 'AR' ? 1 : 0.6));

const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const fmt = (v: number) => `R$ ${v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.', ',')} mi` : `${Math.round(v / 1e3)} mil`}`;
const yearsFor = (age: number) => (age <= 21 ? 4 : age <= 27 ? 3 : age <= 31 ? 2 : 1);
const onLoan = (g: GameState, pid: string) => g.loans.some((l) => l.playerId === pid) || (g.loansIn ?? []).some((l) => l.playerId === pid) || (g.aiLoans ?? []).some((l) => l.playerId === pid);

export const openSales = (g: GameState): ForeignSale[] => (g.foreignSales ?? []).filter((o) => o.season === g.season && o.expires >= g.round);

/** Depois de cada rodada: tira as propostas vencidas ou inválidas e, com a janela aberta, clubes de fora fazem propostas pelos seus jogadores à venda. */
export function foreignSalesTick(g0: GameState, rng: Rng): GameState {
  if (g0.unemployed || g0.observer) return g0;
  const user = g0.teams[g0.userClubId]; if (!user) return g0;
  let g = g0;
  const alive = (g.foreignSales ?? []).filter((o) => o.season === g.season && o.expires >= g.round && user.players.some((p) => p.id === o.playerId) && !onLoan(g, o.playerId));
  if (alive.length !== (g.foreignSales ?? []).length) g = { ...g, foreignSales: alive };
  if (transferBlock(g, 'comum')) return g;
  const sales = [...alive];
  const dir = directory(g).filter((c) => !c.domestic);
  if (!dir.length) return g;
  const stars = [...user.players].sort((a, b) => b.strength - a.strength).slice(0, STARS).map((p) => p.id);
  const candidates: [string, number, boolean][] = [...g.transferList.map((id): [string, number, boolean] => [id, CHANCE_LISTED, true]), ...stars.filter((id) => !g.transferList.includes(id)).map((id): [string, number, boolean] => [id, CHANCE_STAR, false])];
  for (const [pid, chance, listed] of candidates) {
    if (sales.length >= MAX_OPEN_SALES) break;
    const p = user.players.find((x) => x.id === pid);
    if (!p || sales.some((o) => o.playerId === pid) || onLoan(g, pid) || rng() >= chance) continue;
    if (!rosterOk(user.players.filter((x) => x.id !== pid))) continue;
    const value = marketValue(g, g.userClubId, p);
    const fee = Math.max(50_000, Math.round(value * (0.9 + 0.45 * rng()) * (listed ? 1 : 1.25) / 10_000) * 10_000);
    let chosen: DirClub | undefined;
    for (let t = 0; t < 40 && !chosen; t++) {
      const c = dir[Math.floor(rng() * dir.length)];
      if (wealthCap(g, c) < fee) continue;
      const sq = clubPlayers(g, c.id); if (sq.length >= 34) continue;
      const rank = [...sq].sort((a, b) => b.strength - a.strength);
      if (p.strength >= (rank[10]?.strength ?? 0) - 2 && p.strength <= (rank[0]?.strength ?? 99) + 4) chosen = c; // o jogador serve ao clube (não é pior que o 11º nem absurdo para o time)
    }
    if (!chosen) continue;
    const wage = Math.round(baseWage(g, g.userClubId, p) * 1.3 / 1_000) * 1_000;
    sales.push({ id: `${chosen.id}:${pid}:${g.season}:${g.round}`, clubId: chosen.id, playerId: pid, fee, wage, years: yearsFor(p.age), season: g.season, round: g.round, expires: g.round + SALE_LIFE });
    g = news(g, `📨 ${chosen.name} (${chosen.flag} ${chosen.countryName}) faz proposta por ${p.name}: ${fmt(fee)}.`, 'info');
    g = notifyPhone(g, 'noticias', `${chosen.name} quer ${p.name}: ${fmt(fee)}.`);
  }
  return sales.length !== alive.length ? { ...g, foreignSales: sales } : g;
}

export type SaleResult = { state: GameState; ok: boolean; text: string };

/** Aceita a proposta: o jogador sai, o dinheiro entra à vista e ele passa a jogar no clube de fora. */
export function acceptForeignSale(g: GameState, id: string): SaleResult {
  const o = openSales(g).find((x) => x.id === id);
  const fail = (text: string): SaleResult => ({ state: g, ok: false, text });
  if (!o) return fail('Essa proposta não está mais valendo.');
  if (g.unemployed) return fail('Sem clube não dá para vender.');
  const block = transferBlock(g, 'comum'); if (block) return fail(block);
  const team = g.teams[g.userClubId], p = team.players.find((x) => x.id === o.playerId);
  if (!p) return fail('O jogador não está mais no seu elenco.');
  if (onLoan(g, p.id)) return fail('Jogador emprestado não pode ser vendido.');
  const left = team.players.filter((x) => x.id !== p.id);
  if (!rosterOk(left)) return fail('Sem ele o elenco ficaria incompleto (faltam jogadores em alguma posição). Contrate um substituto antes.');
  const club = directory(g).find((c) => c.id === o.clubId); if (!club) return fail('Clube inválido.');
  const moved: Player = { ...p, contract: { wage: o.wage, until: g.season + o.years - 1, from: g.season } };
  const deal = g.foreignDeals?.[o.clubId] ?? { out: [], in: [] };
  let s: GameState = {
    ...g,
    teams: { ...g.teams, [g.userClubId]: repairLineup({ ...team, players: left }) },
    budgets: { ...g.budgets, [g.userClubId]: (g.budgets[g.userClubId] ?? 0) + o.fee },
    foreignDeals: { ...(g.foreignDeals ?? {}), [o.clubId]: { out: deal.out, in: [...deal.in.filter((x) => x.id !== p.id), moved] } },
    transferList: g.transferList.filter((x) => x !== p.id), loanList: g.loanList.filter((x) => x !== p.id),
    foreignSales: (g.foreignSales ?? []).filter((x) => x.playerId !== p.id),
    transfers: [...g.transfers, { kind: 'sale', season: g.season, round: g.round, playerId: p.id, playerName: p.name, pos: p.pos, strength: p.strength, fromClubId: g.userClubId, toClubId: o.clubId, fee: o.fee }],
  };
  if (s.listed?.[p.id]) { const { [p.id]: _a, ...rest } = s.listed; s = { ...s, listed: rest }; }
  if (s.mood?.[p.id]) { const { [p.id]: _b, ...rest } = s.mood; s = { ...s, mood: rest }; }
  const text = `💰 ${p.name} (overall ${p.strength}) foi vendido ao ${club.name} (${club.flag} ${club.countryName}) por ${fmt(o.fee)}, à vista.`;
  return { state: notifyPhone(news(s, text, 'good'), 'noticias', text.replace(/^\S+\s/, '')), ok: true, text };
}

export function refuseForeignSale(g: GameState, id: string): GameState {
  const o = (g.foreignSales ?? []).find((x) => x.id === id); if (!o) return g;
  return { ...g, foreignSales: (g.foreignSales ?? []).filter((x) => x.id !== id) };
}

/** Pede 15% a mais (uma vez por proposta): o clube topa na maior parte das vezes (se couber no bolso dele); senão desiste e retira a proposta. */
export function counterForeignSale(g: GameState, id: string): SaleResult {
  const o = openSales(g).find((x) => x.id === id);
  if (!o) return { state: g, ok: false, text: 'Essa proposta não está mais valendo.' };
  if (o.countered) return { state: g, ok: false, text: 'Você já fez uma contraproposta nesta oferta.' };
  const club = directory(g).find((c) => c.id === o.clubId); const fee = Math.round(o.fee * 1.15 / 10_000) * 10_000;
  if (!club || fee > wealthCap(g, club) || hashString(o.id) % 10 >= 6) return { state: { ...g, foreignSales: (g.foreignSales ?? []).filter((x) => x.id !== id) }, ok: false, text: `${club?.name ?? 'O clube'} não pode pagar mais e retirou a proposta.` };
  const next = (g.foreignSales ?? []).map((x) => (x.id === id ? { ...x, fee, countered: true } : x));
  return { state: { ...g, foreignSales: next }, ok: true, text: `${club.name} aceitou subir para ${fmt(fee)}. Falta você confirmar a venda.` };
}
