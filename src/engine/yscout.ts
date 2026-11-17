import { attributesOf, categoryDef, CATEGORIES, type CategoryId } from './categories';
import { facilitiesOf, logSpend, spend, youthCapacity } from './academy';
import { inflate } from './economy';
import { clamp, hashString, makeRng, type Rng } from './rng';
import { pickSpot, randomName } from './squad';
import { evaluateWage, newContract, personalityOf, SAT_START, askWage, type YResult } from './ycontract';
import { aiOverall } from './yroster';
import { youthOf, type Prospect, type YouthState } from './youth';
import type { GameState, NewsItem, Player, Position } from './types';

/* =====================================================================
   Olheiros e peneiras (ETAPA 6): únicas portas, além da safra anual da academia, para entrarem jovens novos.
   Todo jovem descoberto tem origem e histórico registrados; ninguém é gerado só para preencher categoria.
   Os olheiros enxergam o potencial com uma margem de erro que diminui com a qualidade; talentos excepcionais são raros e nem sempre percebidos.
   ===================================================================== */

export type RegionId = 'sudeste' | 'sul' | 'nordeste' | 'norte' | 'centro-oeste' | 'america-sul' | 'europa';
/** `pot`: ajuste no potencial dos jovens da região; `wait`: rodadas a mais (ou a menos) entre descobertas; `cost`: custo por descoberta/peneira. */
export const REGIONS: { id: RegionId; label: string; pot: number; wait: number; cost: number }[] = [
  { id: 'sudeste', label: 'Sudeste', pot: 0, wait: -2, cost: 1 },
  { id: 'sul', label: 'Sul', pot: 1, wait: 0, cost: 1 },
  { id: 'nordeste', label: 'Nordeste', pot: 2, wait: 0, cost: 1.1 },
  { id: 'centro-oeste', label: 'Centro-Oeste', pot: 2, wait: 1, cost: 1.1 },
  { id: 'norte', label: 'Norte', pot: 3, wait: 2, cost: 1.3 },
  { id: 'america-sul', label: 'América do Sul', pot: 3, wait: 2, cost: 2 },
  { id: 'europa', label: 'Europa', pot: 4, wait: 4, cost: 3 },
];
export const regionOf = (id: RegionId) => REGIONS.find((r) => r.id === id)!;

export interface Scout { id: string; name: string; age: number; /** 1 a 10 */ quality: number; wage: number; hiredSeason?: number; region?: RegionId; /** rodadas até a próxima descoberta */ wait?: number; found: number; history: { season: number; text: string }[] }
export interface Candidate {
  id: string; player: Player; /** potencial verdadeiro (escondido) */ potential: number;
  origin: { kind: 'olheiro' | 'peneira'; by: string; region: RegionId; season: number; round: number };
  /** O que o relatório enxerga: faixa do potencial e se identificou um talento especial. */
  seen: { lo: number; hi: number; special: boolean };
  /** rodadas de validade restantes */ left: number;
}

export const MAX_POOL = 40;
export const CANDIDATE_LIFE = 14;
export const TRYOUT_COOLDOWN = 8;
export const TRYOUT_SIZES = { pequena: 16, media: 28, grande: 40 } as const;
export type TryoutSize = keyof typeof TRYOUT_SIZES;
export const maxScouts = (level: number): number => 1 + Math.floor(clamp(level, 0, 20) / 5);
const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const POS_BAG: Position[] = ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT', 'ATT'];

/* ----------------------------- olheiros ----------------------------- */

export const scoutWage = (g: GameState, quality: number): number => Math.round(inflate(g, 20_000 * Math.pow(1.35, quality - 1)) / 1000) * 1000;
export const scoutFee = (s: Pick<Scout, 'wage'>): number => Math.round((s.wage * 0.3) / 1000) * 1000;
/** Custo de cada descoberta do olheiro (viagens e relatórios). */
export const missionCost = (g: GameState, region: RegionId): number => Math.round((inflate(g, 15_000) * regionOf(region).cost) / 500) * 500;
/** Rodadas entre uma descoberta e outra: olheiro melhor encontra mais rápido. */
export const findInterval = (quality: number, region: RegionId): number => clamp(Math.round(14 - quality + regionOf(region).wait), 3, 18);

export function genScout(g: GameState, rng: Rng, used: Set<string>, quality?: number): Scout {
  const q = quality ?? clamp(1 + Math.floor(rng() * rng() * 10) + (rng() < 0.4 ? 1 : 0), 1, 10);
  const name = randomName(rng, used); used.add(name);
  return { id: `sc-${g.season}-${Math.floor(rng() * 1e9).toString(36)}`, name, age: 28 + Math.floor(rng() * 35), quality: q, wage: scoutWage(g, q), found: 0, history: [{ season: g.season, text: 'Carreira como observador de jovens talentos.' }] };
}
export function refreshScoutMarket(g: GameState, y: YouthState): YouthState {
  const rng = makeRng(g.seed * 97 + g.season * 13 + g.round * 3 + 5);
  const used = new Set([...(y.scouts ?? []).map((s) => s.name), ...y.prospects.map((p) => p.player.name)]);
  const lvl = y.level / 20;
  const list = Array.from({ length: 6 }, () => genScout(g, rng, used, clamp(Math.round(1 + rng() * 6 + lvl * 3 * rng()), 1, 10)));
  return { ...y, scoutMarket: list.sort((a, b) => b.quality - a.quality) };
}

export function hireScout(g: GameState, id: string): YResult {
  const y = youthOf(g);
  const sc = y.scoutMarket?.find((x) => x.id === id);
  if (!sc) return { ok: false, error: 'Esse olheiro não está mais disponível.' };
  if ((y.scouts?.length ?? 0) >= maxScouts(y.level)) return { ok: false, error: `Com a academia no nível ${y.level} você pode ter até ${maxScouts(y.level)} olheiro(s). Melhore a academia para ter mais.` };
  const paid = spend(g, y, { season: g.season, round: g.round, kind: 'olheiro', text: `Contratação do olheiro ${sc.name} (${sc.quality}★)`, cost: scoutFee(sc) });
  if (!paid.ok) return paid;
  const hired: Scout = { ...sc, hiredSeason: g.season, history: [...sc.history, { season: g.season, text: 'Contratado pelo clube.' }] };
  const ny = { ...paid.g.youth!, scouts: [...(paid.g.youth!.scouts ?? []), hired], scoutMarket: (paid.g.youth!.scoutMarket ?? []).filter((x) => x.id !== id) };
  return { ok: true, state: news({ ...paid.g, youth: ny }, `🔭 ${sc.name} (${sc.quality}★) é o novo olheiro do clube.`, 'good') };
}
export function fireScout(g: GameState, id: string): YResult {
  const y = youthOf(g);
  const sc = y.scouts?.find((x) => x.id === id);
  if (!sc) return { ok: false, error: 'Olheiro não encontrado.' };
  const cost = Math.round((sc.wage * 0.25) / 1000) * 1000;
  const paid = spend(g, y, { season: g.season, round: g.round, kind: 'multa', text: `Dispensa do olheiro ${sc.name}`, cost });
  if (!paid.ok) return paid;
  return { ok: true, state: news({ ...paid.g, youth: { ...paid.g.youth!, scouts: (paid.g.youth!.scouts ?? []).filter((x) => x.id !== id) } }, `🔭 ${sc.name} deixou o clube.`) };
}
export function sendScout(g: GameState, id: string, region: RegionId): YResult {
  const y = youthOf(g);
  const sc = y.scouts?.find((x) => x.id === id);
  if (!sc) return { ok: false, error: 'Olheiro não encontrado.' };
  const ns: Scout = { ...sc, region, wait: findInterval(sc.quality, region), history: [...sc.history, { season: g.season, text: `Enviado para ${regionOf(region).label}.` }].slice(-12) };
  return { ok: true, state: { ...g, youth: { ...y, scouts: (y.scouts ?? []).map((x) => (x.id === id ? ns : x)) } }, msg: `${sc.name} foi para ${regionOf(region).label}.` };
}
export function recallScout(g: GameState, id: string): GameState {
  const y = youthOf(g);
  return { ...g, youth: { ...y, scouts: (y.scouts ?? []).map((x) => (x.id === id ? { ...x, region: undefined, wait: undefined } : x)) } };
}
/** Folha anual dos olheiros (paga na virada de temporada). */
export function payScouts(g: GameState): GameState {
  const y = g.youth;
  const total = (y?.scouts ?? []).reduce((t, s) => t + s.wage, 0);
  if (!y || total <= 0) return g;
  return news({ ...g, budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] - total }, youth: logSpend(y, { season: g.season, round: g.round, kind: 'olheiro', text: `Salários dos olheiros (${y.scouts!.length})`, cost: total }) }, `🔭 Salários dos olheiros pagos: R$ ${(total / 1000).toLocaleString('pt-BR')} mil.`);
}

/* ----------------------------- candidatos (descobertas) ----------------------------- */

/** Qualidade neutra usada para dar o overall de quem foi descoberto (a mesma conta de treino dos rivais). */
const neutralQ = (level: number) => ({ level: Math.min(12, level), fac: { centro: 1, fisica: 1, medico: 1, alojamento: 1, campos: 1 }, coach: 4, scout: 0 });

/** Potencial de um descoberto. Estrela (85+) é rara: de 1,2% a 6% conforme a estrutura e a qualidade de quem observa. */
export function rollCandidatePotential(rng: Rng, bonus: number, starRate: number): number {
  if (rng() < starRate) return 85 + Math.floor(Math.pow(rng(), 1.6) * 11);
  return Math.min(84, Math.round(46 + 36 * Math.pow(rng(), 0.9) + bonus));
}
/** Margem de erro do relatório: a qualidade de quem observou define o quanto o potencial é conhecido. */
const reportWidth = (q: number) => clamp(24 - 2.2 * q, 3, 24);

function makeCandidate(g: GameState, y: YouthState, rng: Rng, p: { age: number; bonus: number; starRate: number; quality: number; kind: 'olheiro' | 'peneira'; by: string; region: RegionId }, used: Set<string>, seq: number): Candidate {
  const id = `${g.userClubId}-s${seq}`;
  const pos = POS_BAG[Math.floor(rng() * POS_BAG.length)];
  const potential = rollCandidatePotential(rng, p.bonus, p.starRate);
  const name = randomName(rng, used); used.add(name);
  const strength = aiOverall(id, potential, p.age, 0.5, neutralQ(y.level));
  const w = reportWidth(p.quality), center = potential + (rng() - 0.5) * (w * 0.66);
  const player: Player = { id, name, pos, spot: pickSpot([], pos), age: p.age, strength, pot: potential, formedAt: g.userClubId, formedSeason: g.season };
  return { id, player, potential, origin: { kind: p.kind, by: p.by, region: p.region, season: g.season, round: g.round },
    seen: { lo: clamp(Math.round(center - w / 2), strength, 99), hi: clamp(Math.round(center + w / 2), strength, 99), special: potential >= 85 && rng() < 0.35 + p.quality * 0.06 }, left: CANDIDATE_LIFE };
}
const AGE_BAG = [12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17, 18];

/** Cada rodada: os olheiros em missão contam o tempo e, quando chega a hora, descobrem um jovem (cobrando a viagem). Candidatos antigos expiram. */
export function scoutTick(g: GameState): GameState {
  const y = g.youth;
  if (!y || g.unemployed || g.observer) return g;
  let s = g;
  let ny: YouthState = { ...y, pool: (y.pool ?? []).map((c) => ({ ...c, left: c.left - 1 })).filter((c) => c.left > 0) };
  const used = new Set([...y.prospects.map((p) => p.player.name), ...(ny.pool ?? []).map((c) => c.player.name)]);
  let seq = y.seq;
  const scouts = (y.scouts ?? []).map((sc) => {
    if (!sc.region) return sc;
    const wait = (sc.wait ?? findInterval(sc.quality, sc.region)) - 1;
    if (wait > 0) return { ...sc, wait };
    const cost = missionCost(g, sc.region);
    if ((s.budgets[s.userClubId] ?? 0) < cost) { s = news(s, `🔭 ${sc.name} voltou sem relatório: o clube não tem caixa para a viagem.`, 'bad'); return { ...sc, wait: 3 }; }
    const rng = makeRng(hashString(`${sc.id}:${g.season}:${g.round}:${sc.found}`));
    const age = AGE_BAG[Math.floor(rng() * AGE_BAG.length)];
    const star = clamp(0.015 + sc.quality * 0.004 + y.level * 0.0008, 0.015, 0.06);
    const cand = makeCandidate(g, y, rng, { age, bonus: y.level * 0.15 + sc.quality * 0.5 + regionOf(sc.region).pot, starRate: star, quality: sc.quality, kind: 'olheiro', by: sc.name, region: sc.region }, used, seq++);
    s = { ...s, budgets: { ...s.budgets, [s.userClubId]: s.budgets[s.userClubId] - cost } };
    ny = logSpend({ ...ny, pool: [cand, ...(ny.pool ?? [])].slice(0, MAX_POOL) }, { season: g.season, round: g.round, kind: 'olheiro', text: `Viagem de ${sc.name} (${regionOf(sc.region).label})`, cost });
    s = news(s, `🔭 ${sc.name} (${regionOf(sc.region).label}) observou ${cand.player.name}, ${cand.player.age} anos${cand.seen.special ? ' — parece um talento especial!' : ''}. Veja o relatório.`, cand.seen.special ? 'good' : 'info');
    return { ...sc, wait: findInterval(sc.quality, sc.region), found: sc.found + 1 };
  });
  return { ...s, youth: { ...ny, scouts, seq } };
}

/* ----------------------------- peneiras ----------------------------- */

export const tryoutCost = (g: GameState, size: TryoutSize, region: RegionId): number => Math.round((inflate(g, 75_000) * (TRYOUT_SIZES[size] / 28) * regionOf(region).cost) / 1000) * 1000;
export const roundsSince = (g: GameState, last?: { season: number; round: number }): number => (last ? (g.season - last.season) * g.totalRounds + (g.round - last.round) : 999);
export const tryoutReady = (g: GameState): number => Math.max(0, TRYOUT_COOLDOWN - roundsSince(g, g.youth?.lastTryout));
const bestScoutIn = (y: YouthState, region: RegionId): number => Math.max(0, ...(y.scouts ?? []).filter((s) => s.region === region).map((s) => s.quality));

/** Organiza uma peneira: custa dinheiro, gera os participantes (idades da categoria) e os coloca na lista de observados. */
export function holdTryout(g: GameState, size: TryoutSize, cat: CategoryId | 'todas', region: RegionId): YResult {
  const y = youthOf(g);
  if (g.unemployed) return { ok: false, error: 'Sem clube.' };
  const wait = tryoutReady(g);
  if (wait > 0) return { ok: false, error: `Uma nova peneira só pode ser feita em ${wait} rodada(s).` };
  const cost = tryoutCost(g, size, region);
  const paid = spend(g, y, { season: g.season, round: g.round, kind: 'peneira', text: `Peneira ${size} em ${regionOf(region).label}${cat === 'todas' ? '' : ` (${categoryDef(cat).label})`}`, cost });
  if (!paid.ok) return paid;
  const ny0 = paid.g.youth!;
  const sq = bestScoutIn(ny0, region), quality = sq || clamp(2 + ny0.level * 0.15, 1, 5);
  const ages = cat === 'todas' ? AGE_BAG : Array.from({ length: categoryDef(cat).maxAge - categoryDef(cat).minAge + 1 }, (_, i) => categoryDef(cat).minAge + i);
  const rng = makeRng(hashString(`peneira:${g.seed}:${g.season}:${g.round}:${size}:${region}`));
  const used = new Set([...ny0.prospects.map((p) => p.player.name), ...(ny0.pool ?? []).map((c) => c.player.name)]);
  const star = clamp(0.012 + ny0.level * 0.0006 + sq * 0.002, 0.012, 0.045);
  let seq = ny0.seq;
  const list: Candidate[] = [];
  for (let i = 0; i < TRYOUT_SIZES[size]; i++) list.push(makeCandidate(g, ny0, rng, { age: ages[Math.floor(rng() * ages.length)], bonus: ny0.level * 0.08 + sq * 0.3 + regionOf(region).pot * 0.6, starRate: star, quality, kind: 'peneira', by: 'Peneira', region }, used, seq++));
  const ny: YouthState = { ...ny0, seq, lastTryout: { season: g.season, round: g.round }, pool: [...list, ...(ny0.pool ?? [])].slice(0, MAX_POOL) };
  const best = [...list].sort((a, b) => b.seen.hi - a.seen.hi)[0];
  return { ok: true, state: news({ ...paid.g, youth: ny }, `🧢 Peneira em ${regionOf(region).label}: ${list.length} jovens avaliados${best ? `; destaque: ${best.player.name} (${best.player.age} anos, potencial ${best.seen.lo}–${best.seen.hi})` : ''}. Veja os observados.`, 'good'), msg: `${list.length} jovens avaliados.` };
}

/* ----------------------------- contratar um observado ----------------------------- */

/** Prospect de teste para o salário pedido pelo descoberto. */
const asProspect = (c: Candidate): Prospect => ({ player: c.player, potential: c.potential, exact: c.player.strength });
export const candidateAsk = (g: GameState, c: Candidate): number => askWage(g, { ...asProspect(c), sat: SAT_START });

/** Contrata um observado: negocia o salário, cobra as luvas e coloca o jovem na base (origem e histórico registrados). */
export function signCandidate(g: GameState, id: string, wage: number, years: number): YResult & { ask?: number } {
  const y = youthOf(g);
  const c = y.pool?.find((x) => x.id === id);
  if (!c) return { ok: false, error: 'Esse jovem não está mais disponível.' };
  if (y.prospects.length >= youthCapacity(y)) return { ok: false, error: `A base está cheia (${youthCapacity(y)} vagas). Libere alguém ou melhore o alojamento.` };
  if (y.prospects.some((p) => p.player.id === id) || g.ymoves?.[id]) return { ok: false, error: 'Esse jovem já está registrado em um clube.' };
  if (years < 1 || years > 5) return { ok: false, error: 'A duração vai de 1 a 5 anos.' };
  const neg = evaluateWage(g, { ...asProspect(c), sat: SAT_START }, wage, false);
  if (neg.result !== 'aceito') return { ok: false, error: neg.msg, ask: neg.ask };
  const fee = Math.round((wage * 0.2) / 100) * 100;
  const paid = spend(g, y, { season: g.season, round: g.round, kind: 'contratacao', text: `Contratação de ${c.player.name} (${c.origin.kind === 'peneira' ? 'peneira' : 'olheiro'})`, cost: fee });
  if (!paid.ok) return paid;
  const by = c.origin.kind === 'olheiro' ? `pelo olheiro ${c.origin.by} em ${regionOf(c.origin.region).label}` : `em peneira em ${regionOf(c.origin.region).label}`;
  const p: Prospect = {
    player: { ...c.player, contract: newContract(g, asProspect(c), years, wage), pot: c.potential }, potential: c.potential, exact: c.player.strength, train: 0, base: c.player.strength,
    attrs: attributesOf(c.player).map((a) => a.value), joined: g.season, origin: c.origin.kind, sat: 78, mot: 70,
    history: [{ season: g.season, text: `Descoberto ${by} aos ${c.player.age} anos (overall ${c.player.strength}). Contrato de ${years} ano(s), ${Math.round(wage / 1000)} mil por ano.` }],
  };
  const ny = { ...paid.g.youth!, prospects: [...paid.g.youth!.prospects, p], pool: (paid.g.youth!.pool ?? []).filter((x) => x.id !== id) };
  return { ok: true, state: news({ ...paid.g, youth: ny }, `✍️ ${c.player.name} (${c.player.age} anos) foi contratado para a base.`, 'good') };
}
export const discardCandidate = (g: GameState, id: string): GameState => ({ ...g, youth: { ...youthOf(g), pool: (youthOf(g).pool ?? []).filter((c) => c.id !== id) } });
export { facilitiesOf, CATEGORIES, personalityOf };
