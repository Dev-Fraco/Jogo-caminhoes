import { priceIndex } from './economy';
import { baseIncome } from './finance';
import { clamp } from './rng';
import { divisionIndexOf } from './transfers';
import type { GameState, NewsItem } from './types';
import type { YouthState } from './youth';

/* =====================================================================
   Academia, instalações e investimentos (ETAPA 4).
   - A academia tem 20 níveis (0 a 20). Cada nível custa o TRIPLO da tabela original (que ia a R$ 0,08 × receita-base × (nível+1)).
   - Cinco instalações (1 a 20) sobem separadamente, cada uma com custo e benefício próprios. Todos os benefícios entram nas contas reais
     do treino, das lesões, da dedicação e da capacidade da base (veja training.ts, youth.ts e injuries.ts): nada é só indicador.
   - Tudo sai do caixa real do clube e fica registrado no histórico de investimentos. Instalações NÃO liberam treinadores de 10 estrelas:
     só a academia geral em 100% (nível 20).
   ===================================================================== */

export const MAX_ACADEMY_LEVEL = 20;
export const MAX_FACILITY_LEVEL = 20;
/** O custo de cada melhoria é este múltiplo da tabela original. */
export const COST_MULTIPLIER = 3;

export type FacilityId = 'centro' | 'fisica' | 'medico' | 'alojamento' | 'campos';
export interface FacilityDef { id: FacilityId; label: string; icon: string; /** peso do custo em relação à academia */ weight: number; benefits: readonly string[] }
export const FACILITIES: readonly FacilityDef[] = [
  { id: 'centro', label: 'Centro de treinamento', icon: '🏫', weight: 0.5, benefits: ['Treino técnico e tático rende mais (+1,2% por nível)', 'Todos os treinos rendem um pouco mais (+0,4% por nível)', 'Reforça treinadores especialistas em técnica e tática'] },
  { id: 'fisica', label: 'Academia física', icon: '🏋️', weight: 0.4, benefits: ['Treino físico rende mais (+1,5% por nível)', 'Preparação geral dos jovens (+0,3% por nível)', 'Reforça treinadores de preparação física'] },
  { id: 'medico', label: 'Centro médico', icon: '🏥', weight: 0.35, benefits: ['Lesões leves do elenco principal duram menos (−2% por nível)', 'Lesões graves também melhoram um pouco (−0,8% por nível, sempre acima de 1 mês)'] },
  { id: 'alojamento', label: 'Alojamento', icon: '🛏️', weight: 0.35, benefits: ['Dedicação dos jovens maior (+1,2% por nível)', 'Mais vagas na base (+2 por nível)'] },
  { id: 'campos', label: 'Campos de treinamento', icon: '🌱', weight: 0.45, benefits: ['Fundamentos evoluem mais rápido (+1,5% por nível)', 'Treino técnico e tático melhora (+0,6% por nível)', 'Todos os treinos práticos rendem mais (+0,2% por nível)', 'Reforça treinadores especialistas de posição'] },
];
export const facilityDef = (id: FacilityId): FacilityDef => FACILITIES.find((f) => f.id === id)!;

export type FacilityLevels = Record<FacilityId, number>;
export const START_FACILITIES: FacilityLevels = { centro: 1, fisica: 1, medico: 1, alojamento: 1, campos: 1 };

/** Uma operação financeira da formação (obra ou despesa com treinadores). */
export interface Invest { season: number; round: number; kind: 'academia' | FacilityId | 'treinador' | 'premio'; text: string; cost: number; from?: number; to?: number }
export interface YouthFinance { /** total gasto em obras (academia e instalações) */ total: number; /** total gasto com treinadores (luvas, multas e folha) */ staff: number; /** total recebido em premiações das competições da base (Etapa 5) */ prizes?: number; log: Invest[] }
export const LOG_KEEP = 120;

export const facLevel = (y: Pick<YouthState, 'fac'>, f: FacilityId): number => clamp(y.fac?.[f] ?? 1, 1, MAX_FACILITY_LEVEL);
export const facilitiesOf = (y: Pick<YouthState, 'fac'>): FacilityLevels => ({ centro: facLevel(y, 'centro'), fisica: facLevel(y, 'fisica'), medico: facLevel(y, 'medico'), alojamento: facLevel(y, 'alojamento'), campos: facLevel(y, 'campos') });
export const academyPercent = (y: Pick<YouthState, 'level'>): number => Math.round((clamp(y.level, 0, MAX_ACADEMY_LEVEL) / MAX_ACADEMY_LEVEL) * 100);

/* ----------------------------- custos ----------------------------- */

/** TABELA ORIGINAL (antes da Etapa 4): subir do nível L para L+1 custava 8% da receita-base × (L+1), arredondado a R$ 10 mil. */
export const originalCost = (income: number, level: number): number => Math.round((0.08 * income * (level + 1)) / 10_000) * 10_000;
const incomeOf = (g: GameState, clubId: string): number => baseIncome(divisionIndexOf(g, clubId), g.clubs[clubId].reputation, priceIndex(g));
/** Custo de subir a academia de `level` para `level + 1`: o TRIPLO da tabela original, mantendo a progressão entre os níveis. */
export const academyCostAt = (income: number, level: number): number => COST_MULTIPLIER * originalCost(income, level);
/** A tabela completa (20 degraus: do nível 0→1 ao 19→20) do clube. */
export const academyCostTable = (g: GameState, clubId = g.userClubId): number[] => { const inc = incomeOf(g, clubId); return Array.from({ length: MAX_ACADEMY_LEVEL }, (_, L) => academyCostAt(inc, L)); };
export const academyCost = (g: GameState, level = g.youth?.level ?? 0): number => (level >= MAX_ACADEMY_LEVEL ? 0 : academyCostAt(incomeOf(g, g.userClubId), level));
/** Custo de subir uma instalação de `level` para `level + 1` (proporcional ao da academia, conforme o peso dela). */
export const facilityCostAt = (income: number, f: FacilityId, level: number): number => Math.round((facilityDef(f).weight * academyCostAt(income, level)) / 10_000) * 10_000;
export const facilityCost = (g: GameState, f: FacilityId, level = facLevel(g.youth ?? {}, f)): number => (level >= MAX_FACILITY_LEVEL ? 0 : facilityCostAt(incomeOf(g, g.userClubId), f, level));
export const facilityCostTable = (g: GameState, f: FacilityId): number[] => { const inc = incomeOf(g, g.userClubId); return Array.from({ length: MAX_FACILITY_LEVEL - 1 }, (_, i) => facilityCostAt(inc, f, i + 1)); };

/* ----------------------------- benefícios (calculados e aplicados) ----------------------------- */

/** Velocidade do treino pela academia geral (0,90 no nível 0 a 1,20 no 20). */
export const academySpeed = (level: number): number => 0.9 + 0.015 * clamp(level, 0, MAX_ACADEMY_LEVEL);
/** Jovens novos por safra (4 a 10) e bônus no potencial sorteado. */
export const intakeCount = (level: number): number => 4 + Math.floor(clamp(level, 0, MAX_ACADEMY_LEVEL) / 3);
export const potentialBonus = (level: number): number => clamp(level, 0, MAX_ACADEMY_LEVEL) * 0.375;
/** A evolução só desacelera quando faltam menos pontos que isto para o potencial: academia melhor mantém a velocidade cheia até mais perto do teto (10 pts no nível 0, 5 no 20). */
export const gapWindow = (level: number): number => 10 - 0.25 * clamp(level, 0, MAX_ACADEMY_LEVEL);
/** Peso dos treinadores melhores no mercado (academia melhor atrai treinadores melhores). */
export const marketBias = (level: number): number => clamp(level, 0, MAX_ACADEMY_LEVEL) / MAX_ACADEMY_LEVEL;

/** Fator do treino vindo das instalações para um jovem com este foco. */
export function facilityTrainingFactor(y: Pick<YouthState, 'fac'>, focus: 'fisico' | 'tecnico' | 'tatico' | 'fundamentos' | undefined): number {
  const ct = facLevel(y, 'centro') - 1, gym = facLevel(y, 'fisica') - 1, fields = facLevel(y, 'campos') - 1;
  let f = (1 + 0.004 * ct) * (1 + 0.003 * gym) * (1 + 0.002 * fields);
  if (focus === 'tecnico' || focus === 'tatico') f *= (1 + 0.012 * ct) * (1 + 0.006 * fields);
  else if (focus === 'fisico') f *= 1 + 0.015 * gym;
  else if (focus === 'fundamentos') f *= 1 + 0.015 * fields;
  return f;
}
/** Bônus que as instalações dão às especialidades do treinador (preparação física ← academia física; técnica/tática ← centro; posição ← campos). */
export function coachSpecBonus(y: Pick<YouthState, 'fac'>, spec: string): number {
  if (spec === 'fisica') return 1 + 0.006 * (facLevel(y, 'fisica') - 1);
  if (spec === 'tecnica' || spec === 'tatica') return 1 + 0.006 * (facLevel(y, 'centro') - 1);
  return 1 + 0.005 * (facLevel(y, 'campos') - 1);
}
/** Dedicação do jovem com o alojamento (o limite sobe de 1,3 para 1,6). */
export const dedicationWith = (base: number, y: Pick<YouthState, 'fac'>): number => Math.min(1.6, base * (1 + 0.012 * (facLevel(y, 'alojamento') - 1)));
export const youthCapacity = (y: Pick<YouthState, 'fac'>): number => 60 + 2 * (facLevel(y, 'alojamento') - 1);
/** Centro médico: multiplicador da duração de uma lesão (leve: −2%/nível; grave: −0,8%/nível). */
export const injuryDurationFactor = (y: Pick<YouthState, 'fac'> | undefined, severity: 'leve' | 'media' | 'grave' | undefined): number => {
  const l = (y ? facLevel(y, 'medico') : 1) - 1;
  return severity === 'grave' ? 1 - 0.008 * l : 1 - 0.02 * l;
};

/* ----------------------------- investimentos (caixa real + histórico) ----------------------------- */

const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const money = (v: number): string => (v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`);
export const emptyFinance = (): YouthFinance => ({ total: 0, staff: 0, log: [] });

/** Registra uma operação no histórico da formação (não mexe no caixa; quem chama desconta). */
export function logSpend(y: YouthState, e: Invest): YouthState {
  const fin = y.fin ?? emptyFinance();
  const obra = e.kind !== 'treinador' && e.kind !== 'premio';
  return { ...y, fin: { total: fin.total + (obra ? e.cost : 0), staff: fin.staff + (e.kind === 'treinador' ? e.cost : 0), ...(e.kind === 'premio' || fin.prizes ? { prizes: (fin.prizes ?? 0) + (e.kind === 'premio' ? e.cost : 0) } : {}), log: [...fin.log, e].slice(-LOG_KEEP) } };
}
/** Desconta do caixa real do clube e registra, tudo junto. Sem saldo, não faz nada. */
export function spend(g: GameState, y: YouthState, e: Invest): { ok: true; g: GameState } | { ok: false; error: string } {
  if (e.cost < 0) return { ok: false, error: 'Valor inválido.' };
  if ((g.budgets[g.userClubId] ?? 0) < e.cost) return { ok: false, error: `O clube não tem caixa (${money(e.cost)} necessários, ${money(g.budgets[g.userClubId] ?? 0)} disponíveis).` };
  return { ok: true, g: { ...g, budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] - e.cost }, youth: logSpend(y, e) } };
}

export type AcademyResult = { ok: true; state: GameState } | { ok: false; error: string };

export function upgradeAcademy(g: GameState): AcademyResult {
  const y = g.youth ?? { level: 0, prospects: [], seq: 1, lastIntake: -1 };
  if (y.level >= MAX_ACADEMY_LEVEL) return { ok: false, error: `A academia já está no nível máximo (${MAX_ACADEMY_LEVEL}).` };
  const cost = academyCost(g, y.level);
  const r = spend(g, y, { season: g.season, round: g.round, kind: 'academia', text: `Academia: nível ${y.level} → ${y.level + 1}`, cost, from: y.level, to: y.level + 1 });
  if (!r.ok) return r;
  const s: GameState = { ...r.g, youth: { ...r.g.youth!, level: y.level + 1 } };
  return { ok: true, state: news(s, `🌱 Academia melhorada para o nível ${y.level + 1} de ${MAX_ACADEMY_LEVEL} (${money(cost)}): treino mais rápido, safras maiores e treinadores melhores no mercado.`, 'good') };
}

export function upgradeFacility(g: GameState, f: FacilityId): AcademyResult {
  const y = g.youth ?? { level: 0, prospects: [], seq: 1, lastIntake: -1 };
  const cur = facLevel(y, f);
  if (cur >= MAX_FACILITY_LEVEL) return { ok: false, error: `${facilityDef(f).label} já está no nível máximo (${MAX_FACILITY_LEVEL}).` };
  const cost = facilityCost(g, f, cur);
  const r = spend(g, y, { season: g.season, round: g.round, kind: f, text: `${facilityDef(f).label}: nível ${cur} → ${cur + 1}`, cost, from: cur, to: cur + 1 });
  if (!r.ok) return r;
  const ny = { ...r.g.youth!, fac: { ...facilitiesOf(y), [f]: cur + 1 } };
  return { ok: true, state: news({ ...r.g, youth: ny }, `🏗️ ${facilityDef(f).label} melhorado para o nível ${cur + 1} de ${MAX_FACILITY_LEVEL} (${money(cost)}).`, 'good') };
}

/** Quanto já foi investido (obras) e gasto com treinadores. */
export const totals = (y: Pick<YouthState, 'fin'>): { obras: number; treinadores: number } => ({ obras: y.fin?.total ?? 0, treinadores: y.fin?.staff ?? 0 });
export { money as formatMoney };
