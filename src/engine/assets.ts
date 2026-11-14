import { inflate } from './economy';
import { balanceOf, brl, createBoleto, createCharge, creditAccount, registerPurpose } from './bank';
import { notifyPhone } from './phone';
import type { AssetsState, Contract, GameState, NewsItem, OwnedAsset, PayPurpose, PixCharge } from './types';

export type VehicleKind = 'Moto' | 'Econômico' | 'Utilitário' | 'Elétrico' | 'Esportivo' | 'Luxo';
export interface Vehicle { id: string; name: string; icon: string; kind: VehicleKind; price: number; prestige: number }
export interface Home { id: string; name: string; icon: string; blurb: string; price?: number; rent?: number; prestige: number }

export const VEHICLES: Vehicle[] = [
  { id: 'moto-urbana', name: 'Moto Urbana 125', icon: '🛵', kind: 'Moto', price: 12_000, prestige: 1 },
  { id: 'hatch-popular', name: 'Hatch Popular 1.0', icon: '🚗', kind: 'Econômico', price: 70_000, prestige: 1 },
  { id: 'sedan-compacto', name: 'Sedan Compacto', icon: '🚙', kind: 'Econômico', price: 105_000, prestige: 2 },
  { id: 'moto-esportiva', name: 'Moto Esportiva 600', icon: '🏍️', kind: 'Moto', price: 65_000, prestige: 3 },
  { id: 'suv-familia', name: 'SUV Família', icon: '🚙', kind: 'Utilitário', price: 190_000, prestige: 3 },
  { id: 'picape-diesel', name: 'Picape Média Diesel', icon: '🛻', kind: 'Utilitário', price: 250_000, prestige: 3 },
  { id: 'eletrico-urbano', name: 'Elétrico Urbano', icon: '🔋', kind: 'Elétrico', price: 220_000, prestige: 4 },
  { id: 'sedan-executivo', name: 'Sedan Executivo', icon: '🚘', kind: 'Luxo', price: 380_000, prestige: 5 },
  { id: 'suv-premium', name: 'SUV Premium', icon: '🚙', kind: 'Luxo', price: 420_000, prestige: 5 },
  { id: 'eletrico-premium', name: 'Elétrico Premium', icon: '⚡', kind: 'Elétrico', price: 480_000, prestige: 6 },
  { id: 'conversivel', name: 'Conversível Esportivo', icon: '🏎️', kind: 'Esportivo', price: 650_000, prestige: 6 },
  { id: 'esportivo-cupe', name: 'Esportivo Cupê', icon: '🏎️', kind: 'Esportivo', price: 1_200_000, prestige: 7 },
  { id: 'superesportivo', name: 'Superesportivo V10', icon: '🏁', kind: 'Esportivo', price: 3_500_000, prestige: 9 },
  { id: 'hiper-eletrico', name: 'Hiperesportivo Elétrico', icon: '⚡', kind: 'Elétrico', price: 6_000_000, prestige: 10 },
  { id: 'superluxo', name: 'Superluxo Blindado', icon: '👑', kind: 'Luxo', price: 9_000_000, prestige: 10 },
];

export const HOUSES_BUY: Home[] = [
  { id: 'b-quitinete', name: 'Quitinete', icon: '🏢', blurb: '1 quarto, perto do centro.', price: 120_000, prestige: 1 },
  { id: 'b-casa-popular', name: 'Casa Popular', icon: '🏠', blurb: '2 quartos e quintal.', price: 260_000, prestige: 2 },
  { id: 'b-apto-2q', name: 'Apartamento 2 quartos', icon: '🏢', blurb: 'Condomínio com portaria.', price: 480_000, prestige: 3 },
  { id: 'b-condominio', name: 'Casa em Condomínio', icon: '🏡', blurb: '3 suítes, lazer completo.', price: 900_000, prestige: 4 },
  { id: 'b-cobertura', name: 'Cobertura', icon: '🏙️', blurb: 'Vista panorâmica da cidade.', price: 1_800_000, prestige: 6 },
  { id: 'b-praia', name: 'Casa de Praia', icon: '🏖️', blurb: 'Pé na areia.', price: 2_500_000, prestige: 6 },
  { id: 'b-mansao', name: 'Mansão', icon: '🏰', blurb: '6 suítes, piscina e cinema.', price: 6_000_000, prestige: 8 },
  { id: 'b-beira-mar', name: 'Mansão Beira-mar', icon: '🌊', blurb: 'Píer e heliponto.', price: 12_000_000, prestige: 9 },
  { id: 'b-fazenda', name: 'Fazenda de Luxo', icon: '🐎', blurb: 'Haras, lago e pista de pouso.', price: 18_000_000, prestige: 9 },
  { id: 'b-castelo', name: 'Mansão Premium', icon: '👑', blurb: 'A casa mais cara da cidade.', price: 35_000_000, prestige: 10 },
];

export const HOUSES_RENT: Home[] = [
  { id: 'r-kitnet', name: 'Kitnet', icon: '🏚️', blurb: 'Pequena, mas sua.', rent: 600, prestige: 1 },
  { id: 'r-quarto-sala', name: 'Quarto e sala', icon: '🏢', blurb: 'Simples e bem localizado.', rent: 1_100, prestige: 1 },
  { id: 'r-apto-1q', name: 'Apartamento 1 quarto', icon: '🏢', blurb: 'Com varanda.', rent: 1_900, prestige: 2 },
  { id: 'r-casa-2q', name: 'Casa 2 quartos', icon: '🏠', blurb: 'Quintal e garagem.', rent: 3_000, prestige: 2 },
  { id: 'r-apto-3q', name: 'Apartamento 3 quartos', icon: '🏢', blurb: 'Condomínio com piscina.', rent: 4_800, prestige: 3 },
  { id: 'r-sobrado', name: 'Sobrado moderno', icon: '🏡', blurb: '3 suítes e home office.', rent: 7_500, prestige: 4 },
  { id: 'r-condominio', name: 'Casa em condomínio fechado', icon: '🏡', blurb: 'Segurança 24h.', rent: 12_000, prestige: 5 },
  { id: 'r-cobertura', name: 'Cobertura duplex', icon: '🏙️', blurb: 'Terraço com churrasqueira.', rent: 18_000, prestige: 6 },
  { id: 'r-casa-praia', name: 'Casa de praia', icon: '🏖️', blurb: 'Vista para o mar.', rent: 26_000, prestige: 7 },
  { id: 'r-mansao', name: 'Mansão com piscina', icon: '🏰', blurb: 'Equipe de caseiros inclusa.', rent: 38_000, prestige: 9 },
  { id: 'r-mansao-premium', name: 'Mansão Premium', icon: '👑', blurb: 'O topo do mercado.', rent: 50_000, prestige: 10 },
];

export const MONTH_ROUNDS = 3; // um "mês" do jogo
export const VEHICLE_LOAN = { entry: 0.2, rate: 0.014, options: [12, 24, 36, 48] };
export const HOUSE_LOAN = { entry: 0.3, rate: 0.009, options: [24, 48, 72, 120] };
export const MAX_LATE_BEFORE_SEIZURE = 2;

export const vehicleById = (id: string) => VEHICLES.find((v) => v.id === id);
export const homeById = (id: string) => [...HOUSES_BUY, ...HOUSES_RENT].find((h) => h.id === id);

export const EMPTY_ASSETS: AssetsState = { vehicles: [], houses: [], contracts: [], seq: 1 };
export const assetsOf = (g: Pick<GameState, 'assets'>): AssetsState => g.assets ?? EMPTY_ASSETS;

export interface LoanQuote { entry: number; financed: number; monthly: number; total: number; installments: number }
/** Financiamento pela Tabela Price: entrada + parcelas fixas com juros ao mês. */
export function loanQuote(price: number, entryPct: number, rate: number, installments: number): LoanQuote {
  const entry = Math.round(price * entryPct);
  const financed = price - entry;
  const monthly = Math.round((financed * rate) / (1 - (1 + rate) ** -installments));
  return { entry, financed, monthly, total: entry + monthly * installments, installments };
}
export const vehicleQuote = (price: number, n: number) => loanQuote(price, VEHICLE_LOAN.entry, VEHICLE_LOAN.rate, n);
export const houseQuote = (price: number, n: number) => loanQuote(price, HOUSE_LOAN.entry, HOUSE_LOAN.rate, n);

const addMonth = (g: GameState, season: number, round: number) => {
  const t = round + MONTH_ROUNDS;
  return { season: season + Math.floor((t - 1) / g.totalRounds), round: ((t - 1) % g.totalRounds) + 1 };
};
const news = (g: GameState, text: string, tone: NewsItem['tone']): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });

/* ---------- compra: cria a cobrança Pix; o efeito acontece quando o Banco confirma ---------- */

export type PayMode = { type: 'cash' } | { type: 'finance'; installments: number };
type Fail = { ok: false; error: string };
type Started = { ok: true; state: GameState; charge: PixCharge };

export function buyVehicle(g: GameState, id: string, mode: PayMode): Started | Fail {
  const v = vehicleById(id);
  if (!v) return { ok: false, error: 'Veículo não encontrado.' };
  if (assetsOf(g).vehicles.some((x) => x.id === id)) return { ok: false, error: 'Você já tem esse veículo.' };
  if (mode.type === 'finance' && !VEHICLE_LOAN.options.includes(mode.installments)) return { ok: false, error: 'Número de parcelas inválido.' };
  const price = inflate(g, v.price); // preço de hoje (com a inflação)
  const q = mode.type === 'finance' ? vehicleQuote(price, mode.installments) : null;
  const amount = q ? q.entry : price;
  const purpose: PayPurpose = { type: 'buy-vehicle', ref: id, data: { installments: q?.installments ?? 0, monthly: q?.monthly ?? 0, price } };
  const { state, charge } = createCharge(g, { merchant: 'Concessionária', description: q ? `${v.name} — entrada (financiado em ${q.installments}x de ${brl(q.monthly)})` : `${v.name} — à vista`, amount, purpose });
  return { ok: true, state, charge };
}

export function buyHome(g: GameState, id: string, mode: PayMode): Started | Fail {
  const h = HOUSES_BUY.find((x) => x.id === id);
  if (!h) return { ok: false, error: 'Imóvel não encontrado.' };
  if (assetsOf(g).houses.some((x) => x.id === id)) return { ok: false, error: 'Você já tem esse imóvel.' };
  if (mode.type === 'finance' && !HOUSE_LOAN.options.includes(mode.installments)) return { ok: false, error: 'Número de parcelas inválido.' };
  const price = inflate(g, h.price!);
  const q = mode.type === 'finance' ? houseQuote(price, mode.installments) : null;
  const amount = q ? q.entry : price;
  const purpose: PayPurpose = { type: 'buy-house', ref: id, data: { installments: q?.installments ?? 0, monthly: q?.monthly ?? 0, price } };
  const { state, charge } = createCharge(g, { merchant: 'Corretor de Imóveis', description: q ? `${h.name} — entrada (financiado em ${q.installments}x de ${brl(q.monthly)})` : `${h.name} — à vista`, amount, purpose });
  return { ok: true, state, charge };
}

export const currentRental = (g: Pick<GameState, 'assets'>): Contract | undefined => assetsOf(g).contracts.find((c) => c.kind === 'rent');

/** Alugar: o 1º mês é pago agora por Pix; os próximos viram boleto a cada "mês" (3 rodadas). */
export function rentHome(g: GameState, id: string): Started | Fail {
  const h = HOUSES_RENT.find((x) => x.id === id);
  if (!h) return { ok: false, error: 'Imóvel não encontrado.' };
  if (currentRental(g)) return { ok: false, error: 'Você já tem um aluguel. Encerre o atual antes.' };
  const { state, charge } = createCharge(g, { merchant: 'Corretor de Imóveis', description: `${h.name} — 1º mês de aluguel`, amount: inflate(g, h.rent!), purpose: { type: 'rent-start', ref: id, data: { rent: inflate(g, h.rent!) } } });
  return { ok: true, state, charge };
}

/* ---------- efeitos quando o pagamento é confirmado ---------- */

function newContract(g: GameState, c: Omit<Contract, 'id' | 'paid' | 'nextSeason' | 'nextRound'>): { state: GameState; contract: Contract } {
  const a = assetsOf(g);
  const nx = addMonth(g, g.season, g.round);
  const contract: Contract = { ...c, id: `K${a.seq}`, paid: 0, nextSeason: nx.season, nextRound: nx.round };
  return { state: { ...g, assets: { ...a, seq: a.seq + 1, contracts: [...a.contracts, contract] } }, contract };
}

/** Gera o boleto da parcela/aluguel do mês. */
function spawnBoleto(g: GameState, c: Contract): GameState {
  const label = c.kind === 'rent' ? `Aluguel — ${c.description}` : `Parcela ${c.total - (c.remaining ?? 0)}/${c.total} — ${c.description}`;
  return createBoleto(g, { merchant: c.merchant, description: label, amount: c.monthly, dueInRounds: MONTH_ROUNDS, purpose: { type: 'installment', ref: c.id } });
}

registerPurpose('buy-vehicle', (g, _amount, p) => {
  const id = p.ref!; const price = Number(p.data?.price); const n = Number(p.data?.installments); const monthly = Number(p.data?.monthly);
  const v = vehicleById(id)!;
  let s = g;
  let contractId: string | undefined;
  if (n > 0) {
    const r = newContract(s, { kind: 'loan', assetKind: 'vehicle', assetId: id, merchant: 'Concessionária', description: v.name, monthly, remaining: n - 1, total: n });
    s = spawnBoleto(r.state, r.contract); contractId = r.contract.id;
  }
  const a = assetsOf(s);
  s = { ...s, assets: { ...a, vehicles: [...a.vehicles, { id, price, season: g.season, contractId }] } };
  return notifyPhone(news(s, `🚗 Você comprou: ${v.name}!`, 'good'), 'concessionaria', `Parabéns pela compra do ${v.name}!`);
});

registerPurpose('buy-house', (g, _amount, p) => {
  const id = p.ref!; const price = Number(p.data?.price); const n = Number(p.data?.installments); const monthly = Number(p.data?.monthly);
  const h = homeById(id)!;
  let s = g;
  let contractId: string | undefined;
  if (n > 0) {
    const r = newContract(s, { kind: 'loan', assetKind: 'house', assetId: id, merchant: 'Corretor de Imóveis', description: h.name, monthly, remaining: n - 1, total: n });
    s = spawnBoleto(r.state, r.contract); contractId = r.contract.id;
  }
  const a = assetsOf(s);
  s = { ...s, assets: { ...a, houses: [...a.houses, { id, price, season: g.season, contractId }] } };
  return notifyPhone(news(s, `🏠 Você comprou: ${h.name}!`, 'good'), 'corretor', `Parabéns pelo seu novo imóvel: ${h.name}!`);
});

registerPurpose('rent-start', (g, _amount, p) => {
  const h = homeById(p.ref!)!;
  const r = newContract(g, { kind: 'rent', assetKind: 'house', assetId: h.id, merchant: 'Corretor de Imóveis', description: h.name, monthly: Number(p.data?.rent), remaining: null, total: 0 });
  return notifyPhone(news(r.state, `🔑 Você alugou: ${h.name}.`, 'info'), 'corretor', `Aluguel de ${h.name} confirmado. Os boletos chegam todo mês.`);
});

/** Parcela paga: conta e, se foi a última, quita o financiamento. */
registerPurpose('installment', (g, _amount, p) => {
  const a = assetsOf(g);
  const c = a.contracts.find((x) => x.id === p.ref);
  if (!c) return g;
  const paid = c.paid + 1;
  if (c.kind === 'loan' && c.remaining === 0 && paid >= c.total) {
    const clear = (list: OwnedAsset[]) => list.map((x) => (x.contractId === c.id ? { ...x, contractId: undefined } : x));
    const s: GameState = { ...g, assets: { ...a, contracts: a.contracts.filter((x) => x.id !== c.id), vehicles: clear(a.vehicles), houses: clear(a.houses) } };
    return notifyPhone(news(s, `🎉 Financiamento quitado: ${c.description}!`, 'good'), c.assetKind === 'vehicle' ? 'concessionaria' : 'corretor', `Financiamento do ${c.description} quitado!`);
  }
  return { ...g, assets: { ...a, contracts: a.contracts.map((x) => (x.id === c.id ? { ...x, paid } : x)) } };
});

/* ---------- vender / encerrar ---------- */

/** Valor de revenda: perde 12% do preço por ano, até o mínimo de 35%. */
export const resaleValue = (price: number, boughtSeason: number, season: number) => Math.round(price * Math.max(0.35, 1 - 0.12 * Math.max(0, season - boughtSeason)));

export function sellAsset(g: GameState, kind: 'vehicle' | 'house', id: string): { ok: true; state: GameState; value: number } | Fail {
  const a = assetsOf(g);
  const list = kind === 'vehicle' ? a.vehicles : a.houses;
  const item = list.find((x) => x.id === id);
  if (!item) return { ok: false, error: 'Bem não encontrado.' };
  if (item.contractId) return { ok: false, error: 'Quite o financiamento antes de vender.' };
  const value = resaleValue(item.price, item.season, g.season);
  const name = kind === 'vehicle' ? vehicleById(id)!.name : homeById(id)!.name;
  const next = { ...a, ...(kind === 'vehicle' ? { vehicles: a.vehicles.filter((x) => x.id !== id) } : { houses: a.houses.filter((x) => x.id !== id) }) };
  return { ok: true, state: creditAccount({ ...g, assets: next }, 'Venda de bem', name, value), value };
}

export function endRent(g: GameState): { ok: true; state: GameState } | Fail {
  const c = currentRental(g);
  if (!c) return { ok: false, error: 'Você não tem aluguel.' };
  if ((g.bank?.boletos ?? []).some((b) => b.status !== 'paid' && b.purpose.ref === c.id)) return { ok: false, error: 'Pague os boletos do aluguel antes de encerrar.' };
  const a = assetsOf(g);
  return { ok: true, state: news({ ...g, assets: { ...a, contracts: a.contracts.filter((x) => x.id !== c.id) } }, `🔑 Aluguel encerrado: ${c.description}.`, 'info') };
}

/* ---------- a cada rodada ---------- */

const isDue = (g: GameState, c: Contract) => g.season > c.nextSeason || (g.season === c.nextSeason && g.round >= c.nextRound);

/** Gera os boletos mensais, e retoma o bem (ou despeja) se houver 2 boletos vencidos do mesmo contrato. */
export function tickContracts(g: GameState): GameState {
  const a0 = assetsOf(g);
  if (a0.contracts.length === 0) return g;
  let s = g;
  for (const c0 of a0.contracts) {
    const c = assetsOf(s).contracts.find((x) => x.id === c0.id);
    if (!c) continue;
    const late = (s.bank?.boletos ?? []).filter((b) => b.status === 'late' && b.purpose.ref === c.id).length;
    if (late >= MAX_LATE_BEFORE_SEIZURE) {
      const a = assetsOf(s);
      const open = new Set((s.bank?.boletos ?? []).filter((b) => b.status !== 'paid' && b.purpose.ref === c.id).map((b) => b.id));
      s = {
        ...s,
        assets: { ...a, contracts: a.contracts.filter((x) => x.id !== c.id), vehicles: a.vehicles.filter((x) => x.contractId !== c.id), houses: a.houses.filter((x) => x.contractId !== c.id) },
        bank: s.bank ? { ...s.bank, boletos: s.bank.boletos.filter((b) => !open.has(b.id)) } : s.bank,
      };
      const msg = c.kind === 'rent' ? `Despejo! Aluguel atrasado: ${c.description}.` : `${c.description} foi retomado por falta de pagamento!`;
      s = notifyPhone(news(s, `⚠️ ${msg}`, 'bad'), c.assetKind === 'vehicle' ? 'concessionaria' : 'corretor', msg);
      continue;
    }
    if (!isDue(s, c)) continue;
    const nx = addMonth(s, s.season, s.round);
    if (c.kind === 'rent' || (c.remaining ?? 0) > 0) {
      const spawned = c.kind === 'rent'
        ? createBoleto(s, { merchant: c.merchant, description: `Aluguel — ${c.description}`, amount: c.monthly, dueInRounds: MONTH_ROUNDS, purpose: { type: 'installment', ref: c.id } })
        : createBoleto(s, { merchant: c.merchant, description: `Parcela ${c.total - (c.remaining ?? 0) + 1}/${c.total} — ${c.description}`, amount: c.monthly, dueInRounds: MONTH_ROUNDS, purpose: { type: 'installment', ref: c.id } });
      const a = assetsOf(spawned);
      s = { ...spawned, assets: { ...a, contracts: a.contracts.map((x) => (x.id === c.id ? { ...x, remaining: x.remaining === null ? null : x.remaining - 1, nextSeason: nx.season, nextRound: nx.round } : x)) } };
    }
  }
  return s;
}

export const ownsVehicle = (g: Pick<GameState, 'assets'>, id: string) => assetsOf(g).vehicles.some((v) => v.id === id);
export const ownsHouse = (g: Pick<GameState, 'assets'>, id: string) => assetsOf(g).houses.some((h) => h.id === id);
/** Soma do prestígio dos bens (usado pelos apps sociais). */
export function prestigeScore(g: Pick<GameState, 'assets'>): number {
  const a = assetsOf(g);
  const best = (xs: OwnedAsset[], f: (id: string) => number) => xs.reduce((m, x) => Math.max(m, f(x.id)), 0);
  return best(a.vehicles, (id) => vehicleById(id)?.prestige ?? 0) + best(a.houses, (id) => homeById(id)?.prestige ?? 0) + (currentRental(g) ? (homeById(currentRental(g)!.assetId)?.prestige ?? 0) : 0);
}
/** Preço de hoje (base × inflação) de um veículo, imóvel ou aluguel. */
export const priceOf = (g: GameState, base: number) => inflate(g, base);
export const canAfford = (g: GameState, amount: number) => balanceOf(g) >= amount;
