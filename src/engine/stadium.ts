import { inflate, priceIndex } from './economy';
import { baseIncome, gateOf } from './finance';
import { divisionIndexOf } from './transfers';
import type { GameState } from './types';

/** Um jogo em casa do seu clube: público e receita. */
export interface GateRecord { season: number; round: number; opponentId: string; attendance: number; capacity: number; price: number; revenue: number; comp?: string }
export interface StadiumState {
  capacity: number;
  /** Nível de conforto/estrutura (0–25): gramado, cadeiras, camarotes, setores premium. */
  comfort: number;
  /** Preço do ingresso (R$) escolhido pelo treinador; ausente = preço justo. */
  price?: number;
  log: GateRecord[];
}

export const MAX_COMFORT = 25;
/** Quanto cada nível de conforto valoriza o ingresso (preço justo) e atrai mais torcida (procura). */
const PRICE_PER_LEVEL = 0.07, DEMAND_PER_LEVEL = 0.03;
export const MAX_CAPACITY = 80_000;
export const LOG_MAX = 40;
/** Ocupação típica a preço justo, torcida normal. */
export const BASE_FILL = 0.65;
/** O quanto a procura cai quando o preço sobe (elasticidade). */
const ELASTICITY = 1.6;
/** Acima de quantas vezes o preço justo a torcida simplesmente boicota. */
export const BOYCOTT = 1.7;

const CAP_BY_REP = [6_000, 13_000, 24_000, 38_000, 52_000];
const CAP_BY_DIV = [1, 0.85, 0.65, 0.5, 0.35];

const rep = (g: GameState, id: string) => g.clubs[id]?.reputation ?? 1;
const defaultCapacity = (g: GameState, id: string) =>
  Math.max(2_000, Math.round((CAP_BY_REP[Math.min(Math.max(rep(g, id), 1), 5) - 1] * CAP_BY_DIV[Math.min(divisionIndexOf(g, id), 4)]) / 500) * 500);

/** Estádio do clube do treinador (o padrão vem da reputação e da divisão). */
export function stadiumOf(g: GameState): StadiumState {
  return g.stadium ?? { capacity: defaultCapacity(g, g.userClubId), comfort: 0, log: [] };
}
const capacityOf = (g: GameState, id: string) => (id === g.userClubId ? stadiumOf(g).capacity : defaultCapacity(g, id));
const comfortOf = (g: GameState, id: string) => (id === g.userClubId ? stadiumOf(g).comfort : 0);

/** Preço justo: o que dá a receita de bilheteria de referência com ocupação normal; conforto permite cobrar mais. */
export function fairPrice(g: GameState, id: string = g.userClubId): number {
  const cap = capacityOf(g, id);
  const base = gateOf({ ...g, morale: { ...g.morale, fans: 60 } }, id) / (cap * BASE_FILL);
  return Math.max(5, Math.round(base * (1 + PRICE_PER_LEVEL * comfortOf(g, id))));
}

/** Procura potencial (torcedores que viriam a preço justo): depende da torcida, do rival e do conforto. */
export function demandAt(g: GameState, id: string, opponentId: string): number {
  const fans = id === g.userClubId ? g.morale.fans : 60;
  const fill = BASE_FILL * (0.55 + fans / 133) * (0.9 + 0.05 * rep(g, opponentId)) * (1 + DEMAND_PER_LEVEL * comfortOf(g, id));
  return capacityOf(g, id) * fill;
}

/** Público para um preço (nunca passa da capacidade). */
export function attendanceAt(g: GameState, opponentId: string, price: number, id: string = g.userClubId): number {
  const fair = fairPrice(g, id);
  const ratio = Math.max(0.05, price) / fair;
  let d = demandAt(g, id, opponentId) * ratio ** -ELASTICITY;
  if (ratio > BOYCOTT) d *= Math.max(0, 1 - (ratio - BOYCOTT) * 2.5); // preço absurdo: a torcida boicota
  return Math.max(0, Math.min(capacityOf(g, id), Math.round(d)));
}

/** Preço atual (o escolhido ou o justo). */
export const ticketPriceOf = (g: GameState) => stadiumOf(g).price ?? fairPrice(g);

export function setTicketPrice(g: GameState, price: number): GameState {
  const st = stadiumOf(g);
  const fair = fairPrice(g);
  const p = Math.round(Math.min(fair * 3, Math.max(Math.round(fair * 0.2), price)));
  return { ...g, stadium: { ...st, price: p } };
}

/** Preço que dá a maior receita contra um adversário. */
export function bestPrice(g: GameState, opponentId: string): number {
  const fair = fairPrice(g);
  let best = fair, bestRev = -1;
  for (let p = Math.max(1, Math.round(fair * 0.4)); p <= fair * 2.2; p += Math.max(1, Math.round(fair / 40))) {
    const r = p * attendanceAt(g, opponentId, p);
    if (r > bestRev) { bestRev = r; best = p; }
  }
  return best;
}

/** Jogo em casa do seu clube: público, receita e efeito do preço na torcida. */
export function playHomeGate(g: GameState, opponentId: string, comp = ''): { state: GameState; record: GateRecord } {
  const st = stadiumOf(g);
  const price = ticketPriceOf(g);
  const attendance = attendanceAt(g, opponentId, price);
  const revenue = attendance * price;
  const record: GateRecord = { season: g.season, round: g.round, opponentId, attendance, capacity: st.capacity, price, revenue, ...(comp ? { comp } : {}) };
  const fair = fairPrice(g);
  const full = attendance >= st.capacity * 0.97;
  let fans = g.morale.fans;
  if (price > fair * 1.3 && !full) fans -= Math.min(2, (price / fair - 1.3) * 3); // ingresso caro e estádio vazio irritam a torcida
  else if (price < fair * 0.85) fans += 0.6; // ingresso barato agrada
  const ledger = g.ledger && g.ledger.season === g.season ? { ...g.ledger, gate: g.ledger.gate + revenue } : { season: g.season, gate: revenue, wages: 0, coachCover: 0, coachSalary: 0 };
  return {
    record,
    state: {
      ...g,
      morale: { ...g.morale, fans: Math.max(0, Math.min(100, Math.round(fans * 10) / 10)) },
      stadium: { ...st, log: [record, ...st.log].slice(0, LOG_MAX) },
      budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] + revenue },
      ledger,
    },
  };
}

// ---- melhorias ----
export const capacityStep = (g: GameState) => Math.max(1_000, Math.round((stadiumOf(g).capacity * 0.1) / 500) * 500); // cada obra soma ~10%
/** Arquibancada: R$ 450 por lugar novo (antes R$ 1.800). */
export const expandCost = (g: GameState) => Math.round((capacityStep(g) * inflate(g, 450)) / 10_000) * 10_000;
/** Modernização: 25 etapas, cada uma bem mais barata que antes (e um pouco mais cara a cada nível). Cada etapa valoriza o ingresso em 7% e atrai mais torcida. */
export const comfortCost = (g: GameState) => {
  const st = stadiumOf(g);
  return Math.max(10_000, Math.round((0.018 * baseIncome(divisionIndexOf(g, g.userClubId), rep(g, g.userClubId), priceIndex(g)) * (1 + 0.1 * st.comfort)) / 10_000) * 10_000);
};

export type UpgradeKind = 'capacity' | 'comfort';
export function canUpgrade(g: GameState, kind: UpgradeKind): { ok: boolean; reason?: string; cost: number } {
  const st = stadiumOf(g);
  const cost = kind === 'capacity' ? expandCost(g) : comfortCost(g);
  if (kind === 'capacity' && st.capacity >= MAX_CAPACITY) return { ok: false, reason: 'Capacidade máxima atingida.', cost };
  if (kind === 'comfort' && st.comfort >= MAX_COMFORT) return { ok: false, reason: 'Estrutura no nível máximo.', cost };
  if (g.budgets[g.userClubId] < cost) return { ok: false, reason: 'O clube não tem caixa para a obra.', cost };
  return { ok: true, cost };
}

export function upgradeStadium(g: GameState, kind: UpgradeKind): GameState {
  const chk = canUpgrade(g, kind);
  if (!chk.ok) return g;
  const st = stadiumOf(g);
  const next = kind === 'capacity' ? { ...st, capacity: Math.min(MAX_CAPACITY, st.capacity + capacityStep(g)) } : { ...st, comfort: st.comfort + 1 };
  const text = kind === 'capacity' ? `🏟️ Obra concluída: o estádio agora comporta ${next.capacity.toLocaleString('pt-BR')} torcedores.` : `🏟️ Estádio modernizado (nível ${next.comfort}): mais conforto e ingressos mais valorizados.`;
  return {
    ...g,
    stadium: next,
    budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] - chk.cost },
    morale: { ...g.morale, fans: Math.min(100, g.morale.fans + 3) },
    news: [{ season: g.season, round: g.round, text, tone: 'good' as const }, ...g.news].slice(0, 80),
  };
}
