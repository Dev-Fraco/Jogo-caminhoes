import { attributesOf, homeCategory } from './categories';
import { logSpend, receive, spend, youthCapacity } from './academy';
import { marketValue } from './aisales';
import { clamp, hashString, makeRng, type Rng } from './rng';
import { pickSpot } from './squad';
import { fairWage, newContract, SAT_START, type YResult } from './ycontract';
import { derivedPlayer, parseDerived, youthName } from './yroster';
import { scoutWage, tryoutCost } from './yscout';
import { applyLoanGain } from './yform';
import { youthOf, type Prospect, type YouthState } from './youth';
import type { GameState, NewsItem, Player, Position } from './types';

/* =====================================================================
   Mercado de transferências e empréstimos da base (ETAPA 6).
   - `g.ymoves` diz quem está onde: cada jogador tem no máximo UM registro, então nunca fica em dois clubes. Quem não está no registro
     está no clube de origem (os jovens da IA nascem do id `clube~ano~vaga`; os seus são os Prospects da sua base).
   - Propostas de compra e de empréstimo chegam para os seus jovens; você aceita, recusa ou negocia. Também dá para comprar/pegar
     emprestado jovens da IA. Os clubes da IA negociam entre si com o caixa que têm.
   - Dinheiro sempre sai/entra do caixa real e vai para o histórico financeiro da formação.
   ===================================================================== */

export interface YMove { club: string; from: string; kind: 'venda' | 'emprestimo'; /** empréstimo: última temporada (volta no fim dela) */ until?: number; season: number;
  /** jogador que saiu do SEU clube: nome, posição, idade, overall, potencial e temporada da foto */ snap?: [string, Position, number, number, number, number]; share?: number; prev?: YMove }
export interface YOffer { id: string; kind: 'compra' | 'emprestimo'; playerId: string; club: string; fee: number; /** empréstimo: parte do salário que o outro clube paga */ share?: number; years?: number; season: number; round: number; left: number; status: 'pendente' | 'contra'; note?: string }
export interface Listing { id: string; clubId: string; kind: 'venda' | 'emprestimo'; price: number; share?: number; left: number }

const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const money = (v: number) => (v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi` : `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`);
export const OFFER_LIFE = 6;
export const LISTING_LIFE = 14;
const aiClubs = (g: GameState): string[] => Object.keys(g.teams).filter((id) => id !== g.userClubId);
const nameOfClub = (g: GameState, id: string) => g.clubs[id]?.name ?? id;
const moveSnap = (g: GameState, p: Prospect): YMove['snap'] => [p.player.name, p.player.pos, p.player.age, p.player.strength, p.potential, g.season];
const setMove = (g: GameState, id: string, m: YMove | undefined): GameState => { const mv = { ...(g.ymoves ?? {}) }; if (m) mv[id] = m; else delete mv[id]; return { ...g, ymoves: mv }; };
/** Termina um registro: volta ao que era antes (se havia), ou ao clube de origem. */
export const endMove = (g: GameState, id: string): GameState => setMove(g, id, g.ymoves?.[id]?.prev);

/* ----------------------------- valor de mercado ----------------------------- */

/** Valor de um jovem: idade, overall, potencial, contrato, desempenho e interesse de outros clubes. */
export function youthValue(g: GameState, p: Prospect, clubId = g.userClubId): number {
  const blend = clamp(Math.round(p.player.strength * 0.4 + p.potential * 0.6 - 5), 10, 95);
  const base = marketValue(g, clubId, { ...p.player, strength: blend, pot: p.potential });
  const left = p.player.contract ? Math.max(0, p.player.contract.until - g.season + 1) : 1;
  const contract = left <= 1 ? 0.82 : left >= 3 ? 1.06 : 1;
  let perf = 1;
  for (const c of g.ycomps ?? []) { const v = c.st[p.player.id]; if (v) perf += Math.min(0.06, (v[0] * 2 + v[1]) / 400); }
  const interest = 1 + Math.min(0.12, (youthOf(g).offers ?? []).filter((o) => o.playerId === p.player.id).length * 0.04);
  return Math.max(10_000, Math.round((base * contract * Math.min(1.15, perf) * interest) / 10_000) * 10_000);
}
/** Compensação de formação: sobe com o tempo que o jovem passou na base (até +30% do valor). */
export const formationComp = (g: GameState, p: Prospect, base: number): number => Math.round((base * Math.min(0.3, 0.05 * Math.max(0, g.season - (p.joined ?? g.season)))) / 10_000) * 10_000;
const derivedProspectValue = (g: GameState, pl: Player, clubId: string): number => marketValue(g, clubId, { ...pl, strength: clamp(Math.round(pl.strength * 0.4 + (pl.pot ?? pl.strength) * 0.6 - 5), 10, 95) });

/* ----------------------------- propostas para os seus jovens ----------------------------- */

/** A cada rodada, clubes da IA podem se interessar pelos seus jovens (mais interesse em quem tem potencial e overall). */
export function offersTick(g: GameState): GameState {
  const y = g.youth;
  if (!y || g.unemployed || g.observer) return g;
  const rng = makeRng(hashString(`ofertas:${g.seed}:${g.season}:${g.round}`));
  let offers = (y.offers ?? []).map((o) => ({ ...o, left: o.left - 1 })).filter((o) => o.left > 0 && y.prospects.some((p) => p.player.id === o.playerId));
  let s = g;
  const clubs = aiClubs(g);
  for (const p of y.prospects) {
    if (offers.length >= 5) break;
    if (p.player.age < 13 || p.loanFrom || p.loanedTo || offers.some((o) => o.playerId === p.player.id)) continue;
    const a = clamp((p.potential - 55) / 40, 0, 1) * 0.6 + clamp((p.player.strength - 25) / 50, 0, 1) * 0.4;
    if (rng() > 0.012 * a * (1 + (p.want ? 1 : 0))) continue;
    const pool = clubs.filter((id) => (g.budgets[id] ?? 0) > 0 && (g.clubs[id]?.reputation ?? 1) >= 2);
    if (!pool.length) continue;
    const weights = pool.map((id) => (g.clubs[id]?.reputation ?? 1) ** 2);
    let r = rng() * weights.reduce((t, w) => t + w, 0), club = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r < 0) { club = pool[i]; break; } }
    const loan = (p.sat ?? SAT_START) < 60 || rng() < 0.22;
    const value = youthValue(g, p), rep = g.clubs[club]?.reputation ?? 2;
    const fee = loan ? 0 : Math.round((value * (0.82 + 0.3 * rng()) * (1 + 0.04 * (rep - 3))) / 10_000) * 10_000;
    if (!loan && (g.budgets[club] ?? 0) < fee * 2) continue;
    const o: YOffer = { id: `of-${g.season}-${g.round}-${p.player.id}`, kind: loan ? 'emprestimo' : 'compra', playerId: p.player.id, club, fee, ...(loan ? { share: 0.5 + Math.round(rng() * 4) / 10, years: 1 } : {}), season: g.season, round: g.round, left: OFFER_LIFE, status: 'pendente' };
    offers = [...offers, o];
    s = news(s, `📩 ${nameOfClub(g, club)} quer ${loan ? 'o empréstimo de' : 'comprar'} ${p.player.name} (${p.player.age} anos)${loan ? '' : ` por ${money(fee)}`}.`, 'info');
  }
  return { ...s, youth: { ...(s.youth ?? y), offers } };
}

const dropOffersFor = (y: YouthState, id: string): YouthState => ({ ...y, offers: (y.offers ?? []).filter((o) => o.playerId !== id) });

/** Vende um jovem seu a um clube da IA: o dinheiro entra no caixa real (valor + compensação de formação) e o jogador sai da sua base. */
function executeSale(g: GameState, p: Prospect, club: string, fee: number): YResult {
  const y = youthOf(g);
  if (p.loanFrom || p.loanedTo) return { ok: false, error: 'Jovem emprestado não pode ser vendido agora.' };
  const total0 = fee + formationComp(g, p, fee);
  if ((g.budgets[club] ?? 0) < total0) return { ok: false, error: `${nameOfClub(g, club)} não tem mais caixa para essa compra.` };   // o clube comprador nunca fica no negativo
  if (g.ymoves?.[p.player.id] && g.ymoves[p.player.id].club !== g.userClubId) return { ok: false, error: 'Esse jogador já está registrado em outro clube.' };
  const comp = formationComp(g, p, fee);
  const total = fee + comp;
  let s: GameState = { ...g, budgets: { ...g.budgets, [club]: (g.budgets[club] ?? 0) - total }, youth: { ...dropOffersFor({ ...y, prospects: y.prospects.filter((x) => x.player.id !== p.player.id) }, p.player.id) } };
  s = receive(s, s.youth!, { season: g.season, round: g.round, kind: 'venda', text: `Venda de ${p.player.name} para ${nameOfClub(g, club)}${comp ? ` (valor ${money(fee)} + compensação de formação ${money(comp)})` : ''}`, cost: total });
  s = setMove(s, p.player.id, { club, from: g.userClubId, kind: 'venda', season: g.season, snap: moveSnap(g, p) });
  return { ok: true, state: news(s, `💸 ${p.player.name} foi vendido ao ${nameOfClub(g, club)} por ${money(total)}.`, 'good') };
}

export function acceptOffer(g: GameState, offerId: string): YResult {
  const y = youthOf(g);
  const o = y.offers?.find((x) => x.id === offerId);
  const p = o && y.prospects.find((x) => x.player.id === o.playerId);
  if (!o || !p) return { ok: false, error: 'Proposta não encontrada.' };
  if (o.kind === 'emprestimo') return loanOut(g, p.player.id, o.club, o.years ?? 1, o.share ?? 0.5);
  return executeSale(g, p, o.club, o.fee);
}
export function rejectOffer(g: GameState, offerId: string): GameState {
  const y = youthOf(g);
  const o = y.offers?.find((x) => x.id === offerId);
  if (!o) return g;
  const prospects = y.prospects.map((p) => (p.player.id === o.playerId && p.want === 'transferencia' ? { ...p, sat: clamp((p.sat ?? SAT_START) - 5, 0, 100) } : p)); // recusar quem queria sair pesa
  return { ...g, youth: { ...y, prospects, offers: (y.offers ?? []).filter((x) => x.id !== offerId) } };
}
/** Resultado de uma contraproposta: vendido, nova proposta do clube (sobe até o teto) ou desistência. */
export type Counter = { ok: false; error: string } | { ok: true; state: GameState; outcome: 'vendido' | 'contra' | 'desistiu'; msg: string; counter?: number };
/** Contraproposta do usuário: o clube aceita até um teto (valor justo + margem), responde com o teto se chegou perto, ou desiste. */
export function counterOffer(g: GameState, offerId: string, fee: number): Counter {
  const y = youthOf(g);
  const o = y.offers?.find((x) => x.id === offerId);
  const p = o && y.prospects.find((x) => x.player.id === o.playerId);
  if (!o || !p) return { ok: false, error: 'Proposta não encontrada.' };
  if (o.kind !== 'compra') return { ok: false, error: 'Empréstimos não têm valor para negociar.' };
  const cap = Math.min(youthValue(g, p) * (1.12 + 0.04 * ((g.clubs[o.club]?.reputation ?? 2) - 2)), (g.budgets[o.club] ?? 0) * 0.5);
  if (fee <= o.fee || fee <= cap) { const r = executeSale(g, p, o.club, Math.max(fee, o.fee)); return r.ok ? { ok: true, state: r.state, outcome: 'vendido', msg: 'Negócio fechado.' } : r; }
  if (fee <= cap * 1.15) {
    const c = Math.round(cap / 10_000) * 10_000;
    const msg = `${nameOfClub(g, o.club)} sobe para ${money(c)} e não passa disso.`;
    return { ok: true, state: { ...g, youth: { ...y, offers: (y.offers ?? []).map((x) => (x.id === offerId ? { ...x, fee: c, status: 'contra' as const, left: OFFER_LIFE, note: msg } : x)) } }, outcome: 'contra', msg, counter: c };
  }
  const msg = `${nameOfClub(g, o.club)} desistiu da negociação: o pedido está muito acima do valor.`;
  return { ok: true, state: { ...g, youth: { ...y, offers: (y.offers ?? []).filter((x) => x.id !== offerId) } }, outcome: 'desistiu', msg };
}

/* ----------------------------- empréstimos ----------------------------- */

/** Clubes da IA que aceitariam um jovem seu emprestado (com chance real de jogar: o overall dele chega ao nível de lá). */
export function loanTargets(g: GameState, id: string): { club: string; share: number; fit: number }[] {
  const p = youthOf(g).prospects.find((x) => x.player.id === id);
  if (!p) return [];
  const rng = makeRng(hashString(`alvos:${id}:${g.season}:${g.round}`));
  const cat = homeCategory(p.player.age) ?? 'sub21';
  const clubs = aiClubs(g).filter((c) => (g.budgets[c] ?? 0) > 0);
  const out: { club: string; share: number; fit: number }[] = [];
  for (let i = 0; i < 40 && out.length < 4; i++) {
    const club = clubs[Math.floor(rng() * clubs.length)];
    if (!club || out.some((o) => o.club === club)) continue;
    const rep = g.clubs[club]?.reputation ?? 2;
    const fit = clamp(p.player.strength / Math.max(8, 10 + rep * 9 + (cat === 'sub13' ? -8 : 0)), 0, 1.4);
    if (fit >= 0.55) out.push({ club, share: Math.round((0.3 + rng() * 0.4) * 10) / 10, fit: Math.round(fit * 100) / 100 });
  }
  return out.sort((a, b) => b.fit - a.fit);
}

/** Empresta um jovem seu: ele continua seu (e na sua folha), o outro clube paga a parte combinada do salário; volta no fim do empréstimo. */
export function loanOut(g: GameState, id: string, club: string, years: number, share: number): YResult {
  const y = youthOf(g);
  const p = y.prospects.find((x) => x.player.id === id);
  if (!p) return { ok: false, error: 'Jovem não encontrado.' };
  if (p.loanFrom || p.loanedTo) return { ok: false, error: 'Esse jovem já está em empréstimo.' };
  if (years < 1 || years > 3) return { ok: false, error: 'O empréstimo dura de 1 a 3 temporadas.' };
  const until = g.season + years - 1;
  const lp: Prospect = { ...p, loanedTo: { club, until, share }, history: [...(p.history ?? []), { season: g.season, text: `Emprestado ao ${nameOfClub(g, club)} até ${until} (${Math.round(share * 100)}% do salário pago por eles).` }].slice(-24) };
  let s: GameState = { ...g, youth: dropOffersFor({ ...y, prospects: y.prospects.map((x) => (x.player.id === id ? lp : x)) }, id) };
  s = setMove(s, id, { club, from: g.userClubId, kind: 'emprestimo', until, season: g.season, share, snap: moveSnap(g, p), prev: g.ymoves?.[id] });
  return { ok: true, state: news(s, `🤝 ${p.player.name} foi emprestado ao ${nameOfClub(g, club)} por ${years} temporada(s).`, 'good') };
}
export function recallLoan(g: GameState, id: string): YResult {
  const y = youthOf(g);
  const p = y.prospects.find((x) => x.player.id === id && x.loanedTo);
  if (!p) return { ok: false, error: 'Esse jovem não está emprestado.' };
  const years = (g.season - (g.ymoves?.[id]?.season ?? g.season)) + g.round / Math.max(1, g.totalRounds); // tempo que ficou fora (o ganho é proporcional)
  const r = applyLoanGain({ ...p, loanedTo: undefined }, g.season, years);
  const s0: GameState = { ...g, youth: { ...y, prospects: y.prospects.map((x) => (x.player.id === id ? { ...r.p, history: [...(r.p.history ?? []), { season: g.season, text: `Voltou do empréstimo antes do prazo: +${r.gain} de overall.` }] } : x)) } };
  return { ok: true, state: news(endMove(s0, id), `↩️ ${p.player.name} voltou do empréstimo antes do prazo com overall ${r.p.player.strength} (+${r.gain}).`, 'good') };
}

/** Virada de temporada: empréstimos que terminam voltam ao clube de origem (os seus saem de volta, os recebidos são devolvidos). */
export function returnLoans(g: GameState): GameState {
  const y = g.youth;
  if (!y) return g;
  let s = g;
  const keep: Prospect[] = [];
  for (const p of y.prospects) {
    if (p.loanedTo && p.loanedTo.until < g.season) {
      const years = p.loanedTo.until - (g.ymoves?.[p.player.id]?.season ?? p.loanedTo.until) + 1; // temporadas que passou fora
      const r = applyLoanGain({ ...p, loanedTo: undefined }, g.season, years);
      const back: Prospect = { ...r.p, history: [...(r.p.history ?? []), { season: g.season, text: `Voltou do empréstimo muito mais maduro: +${r.gain} de overall (agora ${r.p.player.strength}).` }] };
      s = news(endMove(s, p.player.id), `↩️ ${p.player.name} voltou do empréstimo ao ${nameOfClub(g, p.loanedTo.club)} com overall ${r.p.player.strength} (+${r.gain}).`, 'good'); keep.push(back); continue;
    }
    if (p.loanFrom && p.loanFrom.until < g.season) { s = news(endMove(s, p.player.id), `↩️ ${p.player.name} foi devolvido ao ${nameOfClub(g, p.loanFrom.club)} (fim do empréstimo).`); continue; }
    keep.push(p);
  }
  // empréstimos entre clubes da IA que acabaram
  const mv = { ...(s.ymoves ?? {}) };
  for (const [id, m] of Object.entries(mv)) if (m.kind === 'emprestimo' && m.until !== undefined && m.until < g.season && m.from !== g.userClubId && m.club !== g.userClubId) { if (m.prev) mv[id] = m.prev; else delete mv[id]; }
  return { ...s, ymoves: mv, youth: { ...(s.youth ?? y), prospects: keep } };
}

/* ----------------------------- comprar e pegar emprestado da IA ----------------------------- */

/** Jogadores da base de clubes da IA que estão à venda ou para empréstimo (renovado de tempos em tempos). */
export function refreshListings(g: GameState, y: YouthState): YouthState {
  const rng = makeRng(hashString(`mercado:${g.seed}:${g.season}:${g.round}`));
  const clubs = aiClubs(g);
  const list: Listing[] = [];
  for (let i = 0; i < 60 && list.length < 10; i++) {
    const club = clubs[Math.floor(rng() * clubs.length)];
    const born = g.season - (14 + Math.floor(rng() * 6)), j = Math.floor(rng() * 9);
    const id = `${club}~${born}~${j}`;
    if (list.some((l) => l.id === id) || g.ymoves?.[id]) continue;
    const pl = derivedPlayer(g, id, 0.5);
    if (!pl || (pl.pot ?? 0) < 58) continue;
    const loan = rng() < 0.3;
    list.push({ id, clubId: club, kind: loan ? 'emprestimo' : 'venda', price: loan ? 0 : Math.round((derivedProspectValue(g, pl, club) * (0.95 + rng() * 0.3)) / 10_000) * 10_000, ...(loan ? { share: 0.5 } : {}), left: LISTING_LIFE });
  }
  return { ...y, listings: list };
}
export const listingPlayer = (g: GameState, l: Listing): Player | undefined => derivedPlayer(g, l.id, 0.5);

/** Compra (ou pega emprestado) um jogador à venda de um clube da IA. O jogador mantém o id e a identidade e deixa o clube de origem. */
export function buyListing(g: GameState, id: string, opts: { years?: number } = {}): YResult {
  const y = youthOf(g);
  const l = y.listings?.find((x) => x.id === id);
  if (!l) return { ok: false, error: 'Esse jogador não está mais no mercado.' };
  const pl = derivedPlayer(g, id, 0.5);
  if (!pl || g.ymoves?.[id] || y.prospects.some((p) => p.player.id === id)) return { ok: false, error: 'Esse jogador já está registrado em outro clube.' };
  if (y.prospects.length >= youthCapacity(y)) return { ok: false, error: `A base está cheia (${youthCapacity(y)} vagas).` };
  const loan = l.kind === 'emprestimo';
  const proto: Prospect = { player: pl, potential: pl.pot ?? pl.strength, exact: pl.strength };
  const wage = fairWage(g, proto);
  const years = loan ? clamp(opts.years ?? 1, 1, 3) : 3;
  const until = g.season + years - 1;
  let s = g;
  if (!loan) {
    const paid = spend(g, y, { season: g.season, round: g.round, kind: 'compra', text: `Compra de ${pl.name} (${nameOfClub(g, l.clubId)})`, cost: l.price });
    if (!paid.ok) return paid;
    s = { ...paid.g, budgets: { ...paid.g.budgets, [l.clubId]: (paid.g.budgets[l.clubId] ?? 0) + l.price } };
  }
  const p: Prospect = { ...proto, player: { ...pl, contract: newContract(g, proto, years, wage), formedAt: l.clubId, formedSeason: g.season - (pl.age - 12) }, train: 0, base: pl.strength, attrs: attributesOf(pl).map((a) => a.value), joined: g.season, origin: 'mercado', sat: 75, mot: 65,
    ...(loan ? { loanFrom: { club: l.clubId, until, share: l.share ?? 0.5 } } : {}),
    history: [{ season: g.season, text: loan ? `Chegou por empréstimo do ${nameOfClub(g, l.clubId)} até ${until}.` : `Comprado do ${nameOfClub(g, l.clubId)} por ${money(l.price)} aos ${pl.age} anos (overall ${pl.strength}).` }] };
  const ny = { ...s.youth!, prospects: [...s.youth!.prospects, p], listings: (s.youth!.listings ?? []).filter((x) => x.id !== id) };
  s = setMove({ ...s, youth: ny }, id, { club: g.userClubId, from: l.clubId, kind: loan ? 'emprestimo' : 'venda', season: g.season, ...(loan ? { until, share: l.share ?? 0.5 } : {}) });
  return { ok: true, state: news(s, loan ? `🤝 ${pl.name} chegou por empréstimo do ${nameOfClub(g, l.clubId)}.` : `✍️ ${pl.name} foi comprado do ${nameOfClub(g, l.clubId)} por ${money(l.price)}.`, 'good') };
}

/* ----------------------------- clubes da IA negociando entre si ----------------------------- */

/** Virada de temporada: clubes da IA com caixa compram e emprestam jovens uns dos outros (o jogador muda de registro: nunca fica em dois clubes). */
export function aiYouthMarket(g: GameState, rng: Rng): GameState {
  const clubs = aiClubs(g).filter((id) => g.teams[id]);
  if (clubs.length < 4) return g;
  let s = g;
  const budgets = { ...g.budgets };
  const mv = { ...(g.ymoves ?? {}) };
  const log = [...(g.yMarketLog ?? [])];
  const weight = (id: string) => Math.max(1, (budgets[id] ?? 0) / 1e6) * (g.clubs[id]?.reputation ?? 1);
  const pick = (list: string[], w: (id: string) => number) => { let r = rng() * list.reduce((t, id) => t + w(id), 0); for (const id of list) { r -= w(id); if (r < 0) return id; } return list[0]; };
  for (let n = 0; n < 14; n++) {
    const buyer = pick(clubs, weight), seller = clubs[Math.floor(rng() * clubs.length)];
    if (buyer === seller) continue;
    const born = g.season - (15 + Math.floor(rng() * 4)), j = Math.floor(rng() * 9);
    const id = `${seller}~${born}~${j}`;
    if (mv[id]) continue;
    const pl = derivedPlayer({ ...g, ymoves: mv }, id, 1);
    if (!pl || (pl.pot ?? 0) < 62) continue;
    const loan = rng() < 0.35;
    const fee = loan ? 0 : Math.round((derivedProspectValue(g, pl, seller) * (0.9 + rng() * 0.25)) / 10_000) * 10_000;
    if (!loan && (budgets[buyer] ?? 0) < fee * 5) continue;        // só gasta o que tem, com reserva
    if (!loan) { budgets[buyer] -= fee; budgets[seller] = (budgets[seller] ?? 0) + fee; }
    mv[id] = { club: buyer, from: seller, kind: loan ? 'emprestimo' : 'venda', season: g.season, ...(loan ? { until: g.season, share: 0.5 } : {}) };
    log.push({ season: g.season, text: `${nameOfClub(g, buyer)} ${loan ? 'pegou emprestado' : 'comprou'} ${youthName(id)} (${pl.age} anos) do ${nameOfClub(g, seller)}`, fee });
  }
  // limpa registros de quem já passou da idade da base (o save não cresce sem limite)
  for (const [id, m] of Object.entries(mv)) {
    const age = m.snap ? m.snap[2] + (g.season + 1 - m.snap[5]) : (() => { const d = parseDerived(id); return d ? g.season + 1 - d.born : 99; })();
    if (age > 22 && !(m.kind === 'emprestimo' && m.until !== undefined && m.until >= g.season)) delete mv[id];
  }
  s = { ...s, budgets, ymoves: mv, yMarketLog: log.slice(-60) };
  return s;
}

export { logSpend, pickSpot };
export type { Position };

/** Cada rodada: propostas envelhecem/chegam e a lista de jogadores à venda é renovada de tempos em tempos. */
export function ymarketTick(g: GameState): GameState {
  const y = g.youth;
  if (!y || g.unemployed || g.observer) return g;
  let ny: YouthState = { ...y, listings: (y.listings ?? []).map((l) => ({ ...l, left: l.left - 1 })).filter((l) => l.left > 0 && !g.ymoves?.[l.id]) };
  if (!ny.listings!.length || (g.round > 1 && (g.round - 1) % 12 === 0)) ny = refreshListings(g, ny);
  return offersTick({ ...g, youth: ny });
}

/** Virada de temporada: olheiros e peneiras dos clubes da IA. Cada clube só gasta o que tem (reserva grande); os grandes têm mais olheiros e fazem peneiras. */
export function aiScoutingYear(g: GameState, rng: Rng): GameState {
  const budgets = { ...g.budgets };
  const sc: Record<string, number[]> = { ...(g.aiScouting ?? {}) };
  for (const id of aiClubs(g)) {
    if (!g.teams[id] || !g.clubs[id]) continue;
    const rep = g.clubs[id].reputation;
    let [q, last] = sc[id] ?? [Math.max(0, Math.round(rep * 1.2) - 1), 0];
    const target = clamp(Math.round(rep * 1.7 - 1 + ((budgets[id] ?? 0) > 2e8 ? 1 : 0)), 0, 9);
    if (q < target && (budgets[id] ?? 0) >= scoutWage(g, q + 1) * 14 && rng() < 0.5) q++;            // contrata/promove um olheiro melhor
    if (q > 0) { const cost = scoutWage(g, q); if ((budgets[id] ?? 0) >= cost * 8) budgets[id] -= cost; else q = Math.max(0, q - 1); } // salário do olheiro; sem caixa, dispensa
    const tc = tryoutCost(g, 'media', 'sudeste');
    if ((budgets[id] ?? 0) >= tc * 20 && rng() < 0.2 + rep * 0.1) { budgets[id] -= tc; last = g.season; }   // peneira
    sc[id] = [q, last];
  }
  return { ...g, budgets, aiScouting: sc };
}
