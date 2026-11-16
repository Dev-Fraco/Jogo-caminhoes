import { avgXI, clubProfile, profileCtx, type ProfileCtx } from './aiprofile';
import { contractYears, newContract } from './aicontracts';
import { marketValue, roleOf, stance } from './aisales';
import { calOf } from './calendar';
import { baseWage, payrollOf } from './finance';
import { clamp, hashString } from './rng';
import { divisionIndexOf } from './transfers';
import type { Deal, DealTerms, GameState, Player } from './types';
import { WAGE_LIMIT } from './aicontracts';

/* =====================================================================
   Avaliação das negociações: como o clube vendedor responde (aceita, contrapropõe, recusa), como o comprador reage à contraproposta
   e como o JOGADOR decide (salário, chances de jogar, prestígio, divisão, idade, insatisfação, lealdade).
   Cada clube tem a própria margem de negociação (pressão financeira + temperamento); o jogador nem sempre aceita a oferta mais alta.
   ===================================================================== */

export const today = (g: GameState) => calOf(g).day;

/** Índice jogador → clube, compartilhado e SEMPRE conferido na consulta (se o jogador mudou de lugar, o índice é refeito). */
let INDEX = new Map<string, string>();
const rebuild = (g: GameState) => { INDEX = new Map(); for (const [id, t] of Object.entries(g.teams)) for (const p of t.players) INDEX.set(p.id, id); };
/** Registra que o jogador está agora neste clube (mantém o índice sem refazê-lo). */
export const noteMove = (playerId: string, clubId: string) => { INDEX.set(playerId, clubId); };
/** Onde está o jogador: id do clube (ou null se for jogador livre) e o jogador. undefined se não existir. */
export function locate(g: GameState, playerId: string): { clubId: string | null; player: Player } | undefined {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cid = INDEX.get(playerId);
    if (cid) { const player = g.teams[cid]?.players.find((p) => p.id === playerId); if (player) return { clubId: cid, player }; }
    if (attempt === 0) rebuild(g);
  }
  const f = (g.freeAgents ?? []).find((p) => p.id === playerId);
  return f ? { clubId: null, player: f } : undefined;
}

export const isActive = (d: Deal) => !['recusada', 'expirada', 'cancelada', 'concluida'].includes(d.state);
export const activeDeals = (g: GameState, playerId?: string) => (g.deals ?? []).filter((d) => isActive(d) && (!playerId || d.playerId === playerId || d.terms.swapPlayerIds?.includes(playerId)));

const trait = (id: string, tag: string) => (hashString(`${id}:${tag}`) % 100) / 100;

/** Valor (R$) que o vendedor enxerga na proposta: dinheiro (parcelado vale um pouco menos), jogadores da troca e cláusulas. */
export function offerValue(g: GameState, d: Deal): number {
  const t = d.terms;
  const day = today(g);
  let cash = t.fee;
  if (t.installments && t.installments.length > 1) cash = t.installments.reduce((s, i) => s + i.amount / (1 + 0.1 * Math.max(0, i.due - day) / 365), 0); // dinheiro mais tarde vale menos
  const swaps = (t.swapPlayerIds ?? []).reduce((s, id) => { const l = locate(g, id); return s + (l ? marketValue(g, d.buyerId, l.player) * 0.85 : 0); }, 0);
  const clauses = (t.clauses ?? []).reduce((s, c) => s + (c.type === 'revenda' ? (c.pct ?? 0) * t.fee * 0.4 : (c.amount ?? 0) * 0.3), 0);
  return cash + swaps + clauses;
}

export interface SellerAnswer { action: 'aceitar' | 'contra' | 'recusar'; terms?: DealTerms; note: string }

/** Preço pedido pelo vendedor pelo jogador (R$), considerando a postura e os outros clubes interessados. */
export function askOf(g: GameState, d: Deal, ctx: ProfileCtx = profileCtx(g)): { ask: number; willing: boolean; refusal?: string; marginPct: number } {
  const seller = d.sellerId!;
  const l = locate(g, d.playerId)!;
  const st = stance(g, seller, l.player, d.buyerId, ctx);
  const prof = clubProfile(g, seller, ctx);
  const rivals = activeDeals(g, d.playerId).filter((x) => x.id !== d.id && x.buyerId !== d.buyerId && x.kind !== 'emprestimo').length;
  const mv = marketValue(g, seller, l.player);
  const loan = d.kind === 'emprestimo';
  const push = loan && /^cedido:/.test(d.reason ?? ''); // o próprio clube quer ceder (jovem sem espaço): aceita pouco ou nada de taxa
  let ask = loan ? mv * (push ? 0.01 : 0.1) * Math.max(0.8, st.ask) : mv * st.ask;
  ask *= 1 + Math.min(0.15, 0.05 * rivals); // concorrência: vários clubes interessados
  // pressionado financeiramente cede mais; clube estável (e de temperamento duro) exige mais
  const marginPct = clamp(0.03 + 0.14 * prof.sellPressure + 0.05 * trait(seller, 'neg'), 0.02, 0.2);
  return { ask: push ? 0 : Math.round(ask / 10_000) * 10_000 || 10_000, willing: st.willing || (loan && st.refusal === 'promessa'), refusal: st.refusal, marginPct: push ? 1 : marginPct };
}

const REFUSAL_TEXT: Record<string, string> = {
  fundamental: 'é peça fundamental e não há substituto à altura', 'sem-reposicao': 'a posição ficaria sem reposição', 'titular-sem-substituto': 'é titular e o clube briga por objetivos grandes',
  'nao-quer-descer': 'não quer perder um titular para uma divisão inferior', 'limite-de-titulares': 'já vendeu titulares demais nesta janela', promessa: 'é uma promessa que o clube quer desenvolver',
};

/** Pagamento aceitável para o vendedor? Clube em crise só aceita à vista; apertado exige entrada de metade e no máximo 3 parcelas. */
function paymentFix(g: GameState, d: Deal, ctx: ProfileCtx): DealTerms | null {
  const t = d.terms;
  if (!t.installments || t.installments.length < 2) return null;
  const fin = clubProfile(g, d.sellerId!, ctx).financial;
  const total = t.installments.reduce((s, i) => s + i.amount, 0);
  const first = t.installments[0].amount;
  if (fin === 'crise') return { ...t, installments: undefined };
  if (fin === 'apertado' && (first < total * 0.5 || t.installments.length > 3)) {
    const day = today(g);
    const entry = Math.round(total * 0.5 / 10_000) * 10_000;
    return { ...t, installments: [{ due: day, amount: entry }, { due: day + 90, amount: total - entry }] };
  }
  return null;
}

/** Resposta do clube vendedor a uma proposta (ou contraproposta do comprador). */
export function sellerAnswer(g: GameState, d: Deal, ctx: ProfileCtx = profileCtx(g)): SellerAnswer {
  const l = locate(g, d.playerId);
  if (!l || l.clubId !== d.sellerId) return { action: 'recusar', note: 'o jogador não está mais no clube' };
  const a = askOf(g, d, ctx);
  const name = g.clubs[d.sellerId!]?.name ?? 'O clube';
  if (!a.willing) return { action: 'recusar', note: `${name} recusa: ${l.player.name} ${REFUSAL_TEXT[a.refusal ?? ''] ?? 'não está à venda'}.` };
  if (d.round >= 5) return { action: 'recusar', note: `${name} encerra a conversa: sem acordo depois de várias rodadas.` };
  const ov = offerValue(g, d);
  const floor = a.ask * (1 - a.marginPct);
  if (ov >= floor) {
    const fix = paymentFix(g, d, ctx);
    if (fix) return { action: 'contra', terms: fix, note: `${name} aceita o valor, mas exige outra forma de pagamento.` };
    // promessa jovem e valiosa: o clube formador exige uma parte da venda futura (uma única vez por negociação)
    const hasResale = (d.terms.clauses ?? []).some((c) => c.type === 'revenda');
    if (d.kind === 'compra' && !hasResale && l.player.age <= 23 && a.ask >= 1_500_000 && trait(d.sellerId!, 'revenda') > 0.5 && !d.history.some((h) => h.by === 'vendedor' && h.action === 'contraproposta' && /venda futura/.test(h.note))) {
      const pct = Math.round((0.1 + 0.1 * trait(d.sellerId!, 'revpct')) * 20) / 20;
      return { action: 'contra', terms: { ...d.terms, clauses: [...(d.terms.clauses ?? []), { type: 'revenda', pct, base: 'lucro' }] }, note: `${name} aceita o valor, mas exige ${Math.round(pct * 100)}% da venda futura de ${l.player.name} (cláusula de revenda).` };
    }
    return { action: 'aceitar', note: `${name} aceita a proposta por ${l.player.name}.` };
  }
  const ratio = ov / a.ask;
  if (ratio >= 0.55) {
    const counter = Math.round(a.ask * (1 - a.marginPct * 0.4) / 10_000) * 10_000;
    return { action: 'contra', terms: { ...d.terms, fee: Math.max(10_000, counter - (ov - d.terms.fee)), installments: d.terms.installments ? rescale(d.terms, Math.max(10_000, counter - (ov - d.terms.fee))) : undefined }, note: `${name} pede ${fmt(counter)} por ${l.player.name}.` };
  }
  if (ratio >= 0.35) return { action: 'contra', terms: { ...d.terms, fee: Math.round(a.ask / 10_000) * 10_000, installments: d.terms.installments ? rescale(d.terms, Math.round(a.ask / 10_000) * 10_000) : undefined }, note: `${name} considera a oferta muito baixa e pede ${fmt(a.ask)}.` };
  return { action: 'recusar', note: `${name} recusa: a oferta por ${l.player.name} é ofensiva.` };
}

/** Reescala as parcelas para somarem o novo valor, mantendo a proporção e os vencimentos. */
export function rescale(t: DealTerms, fee: number) {
  const inst = t.installments;
  if (!inst?.length) return undefined;
  const total = inst.reduce((s, i) => s + i.amount, 0) || 1;
  const out = inst.map((i) => ({ ...i, amount: Math.round((i.amount / total) * fee / 10_000) * 10_000 }));
  out[out.length - 1].amount += fee - out.reduce((s, i) => s + i.amount, 0); // a soma das parcelas é sempre o valor negociado
  return out;
}

export const fmt = (n: number) => (n >= 1e6 ? `R$ ${(Math.round(n / 1e5) / 10).toString().replace('.', ',')} mi` : `R$ ${Math.round(n / 1e3)} mil`);

/** O que o comprador da IA aceita pagar pelo jogador (R$): depende da urgência da necessidade, do temperamento e do caixa. */
export function maxPayOf(g: GameState, d: Deal): number {
  const l = locate(g, d.playerId);
  if (!l || !d.sellerId) return 0;
  const mv = marketValue(g, d.sellerId, l.player);
  const urgency = d.reason?.includes('falta') ? 1.45 : d.reason?.includes('titular') ? 1.25 : 1.1;
  const tier = clubProfile(g, d.buyerId).tier;
  return mv * urgency * (tier === 'gigante' ? 1.25 : tier === 'medio' ? 1.1 : 1) * (0.95 + 0.15 * trait(d.buyerId, 'pay'));
}

export interface BuyerAnswer { action: 'aceitar' | 'contra' | 'cancelar'; terms?: DealTerms; note: string }

/** Reação do comprador (IA) à contraproposta do vendedor. */
export function buyerAnswer(g: GameState, d: Deal): BuyerAnswer {
  const buyer = g.clubs[d.buyerId]?.name ?? 'O comprador';
  const l = locate(g, d.playerId);
  if (!l) return { action: 'cancelar', note: `${buyer} desiste: o jogador não está mais disponível.` };
  const maxPay = maxPayOf(g, d);
  const ov = offerValue(g, d);
  const cash = d.terms.installments ? d.terms.installments.filter((i) => i.due <= today(g)).reduce((s, i) => s + i.amount, 0) : d.terms.fee;
  const budget = g.budgets[d.buyerId] ?? 0;
  if (ov <= maxPay && cash <= budget) return { action: 'aceitar', note: `${buyer} aceita a contraproposta.` };
  if (d.round < 4 && ov <= maxPay * 1.15 && budget > cash * 0.5) {
    const mid = Math.round(Math.min(maxPay, (d.terms.fee + maxPay) / 2) / 10_000) * 10_000;
    return { action: 'contra', terms: { ...d.terms, fee: mid, installments: d.terms.installments ? rescale(d.terms, mid) : undefined }, note: `${buyer} oferece ${fmt(mid)}.` };
  }
  return { action: 'cancelar', note: `${buyer} desiste: o valor passou do que o clube quer pagar.` };
}

export interface PlayerAnswer { action: 'aceitar' | 'recusar' | 'pedir-mais'; wage?: number; note: string; score: number }

/** Decisão do jogador sobre mudar de clube. Pesa salário, chances de jogar, prestígio, divisão, idade/momento, insatisfação e lealdade. */
export function playerDecision(g: GameState, d: Deal, ctx: ProfileCtx = profileCtx(g)): PlayerAnswer {
  const l = locate(g, d.playerId);
  if (!l) return { action: 'recusar', note: 'jogador indisponível', score: -9 };
  const p = l.player;
  const from = l.clubId, to = d.buyerId;
  const curWage = p.contract?.wage ?? (from ? baseWage(g, from, p) : baseWage(g, to, p) * 0.8);
  const offered = d.terms.wage ?? newContract(g, to, p, 1).wage;
  const fair = baseWage(g, to, { ...p, contract: undefined });
  // salário em relação ao que ele ganha (ou ao justo, se for livre/sem contrato) — pesa mais para veteranos
  const ref = Math.max(curWage, fair * 0.9);
  const ratio = offered / Math.max(1, ref);
  const wageW = p.age >= 30 ? 1.6 : p.age <= 22 ? 0.7 : 1.1;
  let score = clamp((ratio - 1) * 3, -3, 3) * wageW;
  // chances de jogar no clube novo × no atual
  const lvlTo = avgXI(g.teams[to]);
  const posPeers = g.teams[to].players.filter((q) => q.pos === p.pos).sort((a, b) => b.strength - a.strength);
  const slots = { GK: 1, DEF: 4, MID: 3, ATT: 3 }[p.pos];
  const startsNew = posPeers.slice(0, slots).every((q) => q.strength <= p.strength + 2) || p.strength >= (posPeers[slots - 1]?.strength ?? 0);
  const curRole = from ? roleOf(g, from, p, ctx).role : 'reserva';
  const playW = p.age <= 23 ? 1.6 : p.age >= 31 ? 0.6 : 1;
  score += (startsNew ? 1.6 : -1.4) * playW;
  if (curRole === 'craque' || curRole === 'titular') score -= startsNew ? 0 : 2.2; // titular não vira reserva por dinheiro
  if (curRole === 'excedente') score += 1.2;
  // prestígio e divisão
  const repTo = g.clubs[to]?.reputation ?? 2, repFrom = from ? g.clubs[from]?.reputation ?? 2 : 2;
  const prestW = p.age >= 31 ? 0.5 : 1;
  score += clamp((repTo - repFrom) * 1.1, -3, 3) * prestW;
  const dTo = divisionIndexOf(g, to), dFrom = from ? divisionIndexOf(g, from) : dTo;
  score += clamp((dFrom - dTo) * 1.0, -2, 2);
  if (p.strength >= lvlTo + 6 && repTo <= 2) score -= 1; // craque não se encaixa num clube pequeno
  // insatisfação (quer sair) e lealdade
  const mood = g.mood?.[p.id];
  if (mood?.want === 'sair') score += 0.8 + mood.level;
  const loyal = from ? trait(p.id, 'lealdade') : 0;
  score -= loyal * 1.6;
  if (d.kind === 'emprestimo') score += 0.8; // empréstimo é um compromisso menor
  if (!from) score += 0.6; // sem clube, qualquer clube é uma oportunidade
  if (score >= 0.4) return { action: 'aceitar', score, note: `${p.name} aceitou a proposta do ${g.clubs[to].name}.` };
  if (score >= -1.6) {
    const want = Math.round(Math.max(offered * 1.15, ref * 1.1) / 1_000) * 1_000;
    return { action: 'pedir-mais', wage: want, score, note: `${p.name} pede salário maior para aceitar: ${fmt(want)} por ano.` };
  }
  const why = !startsNew && (curRole === 'craque' || curRole === 'titular') ? 'não quer perder a titularidade' : repTo < repFrom ? 'não considera o clube à altura da carreira dele' : dTo > dFrom ? 'não quer jogar numa divisão inferior' : loyal > 0.6 ? 'quer continuar no clube' : 'prefere outro destino';
  return { action: 'recusar', score, note: `${p.name} recusou: ${why}.` };
}

/** Contrato padrão oferecido pelo comprador (salário da fórmula do clube e prazo pela idade). */
export const defaultContract = (g: GameState, buyerId: string, p: Player) => { const c = newContract(g, buyerId, p, 1); return { wage: c.wage, years: contractYears(p) }; };

/** O salário extra cabe na folha do clube (limite do porte)? */
export function wageFits(g: GameState, clubId: string, extra: number): boolean {
  const prof = clubProfile(g, clubId);
  return payrollOf(g, clubId) + extra <= prof.revenue * WAGE_LIMIT[prof.tier] * 1.05;
}
