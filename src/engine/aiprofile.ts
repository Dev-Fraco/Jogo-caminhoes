import { baseIncome } from './finance';
import { priceIndex } from './economy';
import { computeTable } from './table';
import { autoLineup } from './squad';
import { divisionIndexOf } from './transfers';
import type { GameState, Position, TeamState } from './types';

/* =====================================================================
   Personalidade de cada clube (IA). O perfil é CALCULADO do estado do jogo na hora, sem guardar nada no save:
   tamanho e reputação, divisão, finanças, objetivo, qualidade e idade do elenco, títulos, estrutura, torcida,
   capacidade de arrecadação, ambição da diretoria, momento esportivo e necessidades do elenco.
   Tamanho financeiro NÃO garante vitória: o perfil só muda COMO o clube decide, e clubes pequenos podem crescer.
   ===================================================================== */

export type Tier = 'gigante' | 'medio' | 'pequeno';
export type Financial = 'rico' | 'saudavel' | 'apertado' | 'crise';
export type Objective = 'titulo' | 'vaga-continental' | 'meio-de-tabela' | 'evitar-queda' | 'acesso';
export type Moment = 'embalado' | 'estavel' | 'em-crise';

export interface ClubProfile {
  clubId: string;
  /** Pontuação de tamanho (reputação + divisão + passado recente) que define o porte. */
  size: number; tier: Tier; financial: Financial; objective: Objective; moment: Moment;
  /** 0 a 1: ambição da diretoria. */
  ambition: number;
  /** 0 a 1: qualidade do time titular em relação aos outros da mesma divisão (0,5 = média). */
  squadQuality: number; avgAge: number;
  /** Pontos por títulos recentes (liga 1, copa 0,6, continental 1). */
  titles: number; infrastructure: number; fanBase: number;
  /** Receita-base anual (capacidade de arrecadar), em R$. */
  revenue: number;
  /** Fração do caixa que topa gastar numa contratação. */
  spendShare: number;
  /** Quantos pontos acima do titular mais fraco o reforço precisa ter. */
  minUpgrade: number; maxAge: number;
  /** 0 a 1: gosto por garotos baratos, por empréstimos/jogadores livres e pressão para vender e equilibrar as contas. */
  prefersYouth: number; prefersLoans: number; sellPressure: number;
  /** 0 a 1: exigência sobre o treinador (resultados cobrados). */
  coachDemand: number;
  /** Posições que mais precisam de reforço, da maior para a menor necessidade. */
  needs: { pos: Position; gap: number }[];
  label: string; traits: string[];
}

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'ATT'];
const TARGET: Record<Position, number> = { GK: 3, DEF: 8, MID: 8, ATT: 5 };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const EXPECT_AMBITION = { title: 0.9, top4: 0.7, mid: 0.45, survive: 0.25 } as const;

/** Média dos titulares (nota do time). */
export function avgXI(t: TeamState): number {
  const xi = new Set(autoLineup(t.players, t.formation));
  const ps = t.players.filter((p) => xi.has(p.id));
  return ps.reduce((s, p) => s + p.strength, 0) / Math.max(1, ps.length);
}

/** Contexto reutilizável (médias por divisão): evita recalcular a nota de todos os times a cada perfil. */
export interface ProfileCtx { divAvg: Map<number, number>; xi: Map<string, number>; /** posição relativa e aproveitamento recente de cada clube (calculados uma vez por divisão) */ moments: Map<string, { frac: number | null; form: number }> }
export function profileCtx(g: GameState): ProfileCtx {
  const xi = new Map<string, number>(), sum = new Map<number, { s: number; n: number }>();
  for (const [id, t] of Object.entries(g.teams)) {
    const a = avgXI(t); xi.set(id, a);
    const di = divisionIndexOf(g, id), c = sum.get(di) ?? { s: 0, n: 0 };
    sum.set(di, { s: c.s + a, n: c.n + 1 });
  }
  return { xi, moments: new Map(), divAvg: new Map([...sum].map(([d, v]) => [d, v.s / v.n])) };
}

/** Pontos por títulos nas últimas `years` temporadas: campeonato (a divisão mais alta), copa e torneios continentais. */
export function titlePoints(g: Pick<GameState, 'history'>, clubId: string, years = 10): number {
  let pts = 0;
  for (const h of g.history.slice(-years)) {
    if (h.divisions?.[0]?.championId === clubId) pts += 1;
    if (h.cupChampionId === clubId) pts += 0.6;
    for (const k of [h.libChampionId, h.sulaChampionId, h.uclChampionId, h.mundialChampionId]) if (k === clubId) pts += 1;
  }
  return pts;
}

/** Acessos e rebaixamentos recentes (positivo = clube subindo). */
function trajectory(g: Pick<GameState, 'history'>, clubId: string, years = 5): number {
  let t = 0;
  for (const h of g.history.slice(-years)) for (const d of h.divisions ?? []) { if (d.promoted.includes(clubId)) t += 1; if (d.relegated.includes(clubId)) t -= 1; }
  return t;
}

/** Posição relativa (0 = líder, 1 = lanterna) e aproveitamento dos últimos 5 jogos de todos os clubes de uma divisão, numa passada só. */
function fillMoments(g: GameState, divisionId: string, ctx: ProfileCtx) {
  const d = g.divisions.find((x) => x.id === divisionId);
  if (!d || d.format === 'outside' || d.format === 'groups') return;
  const res = g.results.filter((r) => r.divisionId === d.id);
  if (res.length > 0) {
    const t = computeTable(d.clubIds.map((id) => ({ id, name: id })), res);
    const last = new Map<string, number[]>();
    for (const r of res) for (const [id, gf, ga] of [[r.homeId, r.homeGoals, r.awayGoals], [r.awayId, r.awayGoals, r.homeGoals]] as const) { const a = last.get(id) ?? []; a.push(gf > ga ? 3 : gf === ga ? 1 : 0); last.set(id, a.length > 5 ? a.slice(-5) : a); }
    t.forEach((row, i) => { const l = last.get(row.clubId) ?? []; ctx.moments.set(row.clubId, { frac: row.played > 2 ? i / Math.max(1, t.length - 1) : null, form: l.length ? l.reduce((a, b) => a + b, 0) / (3 * l.length) : 0.5 }); });
  } else {
    const rows = g.history[g.history.length - 1]?.tables?.find((x) => x.id === d.id)?.rows;
    rows?.forEach((r, i) => ctx.moments.set(r[0], { frac: i / Math.max(1, rows.length - 1), form: 0.5 }));
  }
}

/** Momento esportivo: posição na tabela e últimos 5 jogos; fora da temporada, a colocação do ano anterior. */
function momentOf(g: GameState, clubId: string, ctx: ProfileCtx): { moment: Moment; frac: number | null } {
  const d = g.divisions.find((x) => x.clubIds.includes(clubId));
  if (!d || d.format === 'outside' || d.format === 'groups') return { moment: 'estavel', frac: null };
  if (!ctx.moments.has(clubId)) { fillMoments(g, d.id, ctx); if (!ctx.moments.has(clubId)) ctx.moments.set(clubId, { frac: null, form: 0.5 }); }
  const { frac, form } = ctx.moments.get(clubId)!;
  const moment: Moment = (frac !== null && frac <= 0.2) || form >= 0.7 ? 'embalado' : (frac !== null && frac >= 0.8) || form <= 0.25 ? 'em-crise' : 'estavel';
  return { moment, frac };
}

const LABEL_TIER: Record<Tier, string> = { gigante: 'Gigante', medio: 'Médio', pequeno: 'Pequeno' };
const LABEL_OBJ: Record<Objective, string> = { titulo: 'busca títulos', 'vaga-continental': 'quer vaga continental', 'meio-de-tabela': 'quer crescer aos poucos', 'evitar-queda': 'luta para evitar a queda', acesso: 'quer o acesso' };
const LABEL_FIN: Record<Financial, string> = { rico: 'finanças folgadas', saudavel: 'finanças saudáveis', apertado: 'finanças apertadas', crise: 'em crise financeira' };

/** Perfil de comportamento de um clube da IA (ou do seu, se quiser consultar). */
export function clubProfile(g: GameState, clubId: string, ctx: ProfileCtx = profileCtx(g)): ClubProfile {
  const info = g.clubs[clubId], team = g.teams[clubId];
  const di = divisionIndexOf(g, clubId);
  const rep = info?.reputation ?? 1;
  const titles = titlePoints(g, clubId), traj = trajectory(g, clubId);
  const { moment } = momentOf(g, clubId, ctx);
  const revenue = baseIncome(di, rep, priceIndex(g));
  const ratio = (g.budgets[clubId] ?? 0) / Math.max(1, revenue);
  const financial: Financial = ratio >= 1.2 ? 'rico' : ratio >= 0.6 ? 'saudavel' : ratio >= 0.2 ? 'apertado' : 'crise';
  // tamanho: reputação + divisão + passado recente (títulos e acessos fazem um clube pequeno crescer)
  const size = rep + (di === 0 ? 0.5 : di === 1 ? -0.3 : di === 2 ? -0.6 : -0.9) + Math.min(1.4, titles * 0.4) + Math.max(-0.6, Math.min(1.0, traj * 0.3));
  const tier: Tier = size >= 4.3 ? 'gigante' : size >= 2.4 ? 'medio' : 'pequeno';
  const exp = info?.boardExpectation ?? 'mid';
  const objective: Objective = di > 0 && (exp === 'title' || exp === 'top4') ? 'acesso' : exp === 'title' ? 'titulo' : exp === 'top4' ? 'vaga-continental' : exp === 'mid' ? 'meio-de-tabela' : 'evitar-queda';
  const ambition = clamp01(EXPECT_AMBITION[exp] + (moment === 'embalado' ? 0.1 : moment === 'em-crise' ? -0.05 : 0) + Math.min(0.1, titles * 0.04) + (tier === 'gigante' ? 0.05 : 0));
  const q = team ? ctx.xi.get(clubId) ?? avgXI(team) : 50;
  const squadQuality = clamp01(0.5 + (q - (ctx.divAvg.get(di) ?? q)) / 16);
  const avgAge = team ? team.players.reduce((s, p) => s + p.age, 0) / Math.max(1, team.players.length) : 26;
  const infrastructure = clamp01(0.2 + 0.14 * rep + (di === 0 ? 0.15 : di === 1 ? 0.05 : 0) + Math.min(0.15, titles * 0.05));
  const fanBase = clamp01(0.15 + 0.15 * rep + (di === 0 ? 0.1 : 0) + (moment === 'embalado' ? 0.05 : 0) + Math.min(0.1, titles * 0.03));

  const baseShare = { rico: 0.55, saudavel: 0.4, apertado: 0.22, crise: 0.08 }[financial];
  const spendShare = Math.min(0.65, baseShare * (0.8 + 0.4 * ambition) * (tier === 'pequeno' ? 0.9 : 1));
  const minUpgrade = tier === 'gigante' ? 5 : tier === 'medio' ? 3 : 2;
  const maxAge = tier === 'gigante' ? 33 : tier === 'medio' ? 32 : 30;
  const prefersYouth = tier === 'gigante' ? 0.15 : tier === 'medio' ? 0.5 : 0.85;
  const prefersLoans = clamp01((tier === 'gigante' ? 0.1 : tier === 'medio' ? 0.4 : 0.8) + (financial === 'crise' ? 0.15 : 0));
  const sellPressure = clamp01({ rico: 0.05, saudavel: 0.2, apertado: 0.55, crise: 0.9 }[financial] * (tier === 'gigante' ? 0.6 : tier === 'pequeno' ? 1.15 : 1));
  const coachDemand = clamp01((tier === 'gigante' ? 0.85 : tier === 'medio' ? 0.55 : 0.3) + (objective === 'titulo' ? 0.1 : objective === 'evitar-queda' ? -0.05 : 0));

  // necessidades: titular mais fraco da posição e falta de gente (profundidade)
  const needs: { pos: Position; gap: number }[] = [];
  if (team) {
    const xi = new Set(autoLineup(team.players, team.formation));
    for (const pos of POSITIONS) {
      const all = team.players.filter((p) => p.pos === pos), starters = all.filter((p) => xi.has(p.id));
      const weak = starters.length ? Math.min(...starters.map((p) => p.strength)) : 30;
      needs.push({ pos, gap: Math.max(0, q - weak) + Math.max(0, TARGET[pos] - all.length) * 3 });
    }
    needs.sort((a, b) => b.gap - a.gap);
  }
  const traits = [LABEL_OBJ[objective], LABEL_FIN[financial]];
  if (prefersYouth >= 0.8) traits.push('aposta em jovens baratos');
  if (sellPressure >= 0.5) traits.push('precisa vender para fechar as contas');
  if (moment === 'embalado') traits.push('embalado'); else if (moment === 'em-crise') traits.push('em má fase');
  return { clubId, size, tier, financial, objective, moment, ambition, squadQuality, avgAge, titles, infrastructure, fanBase, revenue, spendShare, minUpgrade, maxAge, prefersYouth, prefersLoans, sellPressure, coachDemand, needs, label: `${LABEL_TIER[tier]} · ${traits.join(' · ')}`, traits };
}

/** Pontuação de um reforço para este clube: gigantes querem qualidade; médios, equilíbrio entre qualidade e preço; pequenos, o melhor custo-benefício (com garotos em alta). */
export function signingScore(p: ClubProfile, gain: number, price: number, age: number): number {
  const youth = age <= 23 ? 1 : age <= 26 ? 0.4 : age >= 30 ? -0.5 : 0;
  if (p.tier === 'gigante') return gain + 0.6 * youth * p.prefersYouth;
  const cost = Math.max(20_000, price);
  const value = (gain + 3 * youth * p.prefersYouth) / (cost / 1e6 + 0.15) ** (p.tier === 'pequeno' ? 0.55 : 0.3);
  return value;
}
