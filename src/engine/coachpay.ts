import { COUNTRY_ORDER, WORLD_DATA } from '../data/world';
import { clamp } from './rng';
import type { GameState } from './types';

/* =====================================================================
   Salário e overall do treinador.
   - O salário é MENSAL, vive numa faixa (mínimo e máximo) que depende da divisão e é escolhido pela qualidade do clube:
     50% overall médio de TODO o elenco + 50% reputação do clube, e valorizado pelo overall do treinador. Nunca passa do teto da divisão.
   - O overall do treinador (1 a 100) começa conforme a dificuldade e sobe/desce com resultados, entrevistas e objetivos.
   Tudo aqui é configurável em PAY_CONFIG.
   ===================================================================== */

export type PayTier = 'estadual' | 'serieD' | 'serieC' | 'serieB' | 'serieA' | 'europa';
export const TIER_LABEL: Record<PayTier, string> = { estadual: 'Estadual', serieD: 'Série D', serieC: 'Série C', serieB: 'Série B', serieA: 'Série A', europa: 'Elite europeia' };

export const PAY_CONFIG = {
  /** Faixa de salário MENSAL (R$) de cada divisão: [mínimo, máximo]. O máximo é o teto. */
  range: { estadual: [1_000, 10_000], serieD: [1_000, 10_000], serieC: [3_000, 30_000], serieB: [10_000, 100_000], serieA: [20_000, 800_000], europa: [30_000, 1_000_000] } as Record<PayTier, [number, number]>,
  /** Países das grandes ligas europeias (só a 1ª divisão deles pode chegar ao teto de R$ 1 milhão, e só os grandes clubes). */
  europeCountries: ['EN', 'ES', 'IT', 'DE', 'FR', 'PT'],
  /** Grande clube europeu: qualidade mínima (0–1) e reputação mínima. Os demais ficam com o teto da Série A (R$ 800 mil). */
  bigClub: { minQuality: 0.6, minReputation: 4 },
  /** Peso de cada indicador na qualidade do clube. */
  weights: { squadOverall: 0.5, reputation: 0.5 },
  /**
   * Janela de normalização por divisão: o overall médio do elenco inteiro e a reputação são levados para 0–1 dentro dela
   * (cada divisão tem a sua realidade: um bom clube de Série D não precisa ter o elenco de um da Série A).
   */
  window: {
    estadual: { ovr: [35, 50], rep: [1, 2] }, serieD: { ovr: [35, 50], rep: [1, 2] }, serieC: { ovr: [40, 62], rep: [1, 3] },
    serieB: { ovr: [45, 70], rep: [1, 4] }, serieA: { ovr: [55, 85], rep: [1, 5] }, europa: { ovr: [55, 85], rep: [1, 5] },
  } as Record<PayTier, { ovr: [number, number]; rep: [number, number] }>,
  /** Valorização pelo overall do treinador: fator = base + span × (overall/100). Overall 15 ≈ 0,64; 55 ≈ 0,88; 100 = 1,15. */
  coachFactor: { base: 0.55, span: 0.6 },
  /** Curvatura da faixa: > 1 deixa os valores altos mais raros (clube mediano não ganha como gigante). */
  curve: 1.5,
  /** Overall inicial do treinador por dificuldade (independe da reputação escolhida no perfil). */
  startOverall: { easy: 70, normal: 55, hard: 30, legend: 15 } as Record<string, number>,
  /** Evolução do overall do treinador (valores base, ajustados pela distância até 100). */
  evolve: {
    win: 0.1, draw: 0.02, loss: -0.06, winStreakBonus: 0.04, lossStreakPenalty: -0.12, relegationZone: -0.2, interview: 0.12,
    season: { great: 2.5, good: 1.2, meh: -0.4, bad: -3 },
  },
};

const clamp01 = (v: number) => clamp(v, 0, 1);
const norm = (v: number, [lo, hi]: [number, number]) => clamp01((v - lo) / (hi - lo));
const roundMoney = (v: number) => (v >= 10_000 ? Math.round(v / 500) * 500 : Math.round(v / 100) * 100);

/** País da liga da carreira (pela 1ª divisão da pirâmide). */
export function leagueCountry(g: Pick<GameState, 'divisions'>): string | undefined {
  const first = g.divisions.find((d) => d.format !== 'outside')?.id;
  for (const cid of COUNTRY_ORDER) for (const l of WORLD_DATA[cid].leagues) if (l.divisions[0].id === first) return cid;
  return undefined;
}

/** Faixa salarial do clube: estadual, Série D, C, B, A (ou elite europeia, na 1ª divisão das grandes ligas). */
export function payTierOf(g: GameState, clubId: string): PayTier {
  const d = g.divisions.find((x) => x.clubIds.includes(clubId));
  if (!d || d.format === 'outside') return 'estadual';           // só estadual: faixa de estaduais
  const idx = g.divisions.filter((x) => x.format !== 'outside').indexOf(d); // quem joga Série D e estadual usa a Série D (idx 3)
  if (idx <= 0) { const c = leagueCountry(g); return c && PAY_CONFIG.europeCountries.includes(c) ? 'europa' : 'serieA'; }
  return (['serieA', 'serieB', 'serieC', 'serieD'] as const)[Math.min(idx, 3)];
}

export interface ClubQuality { ovr: number; rep: number; quality: number; tier: PayTier }
/** Qualidade do clube: 50% overall médio de TODOS os jogadores do elenco + 50% reputação, ambos normalizados dentro da janela da divisão. */
export function clubQuality(g: GameState, clubId: string): ClubQuality {
  const tier = payTierOf(g, clubId);
  const ps = g.teams[clubId]?.players ?? [];
  const ovr = ps.length ? ps.reduce((a, p) => a + p.strength, 0) / ps.length : 0;
  const rep = clamp(g.clubs[clubId]?.reputation ?? 1, 1, 5);
  const w = PAY_CONFIG.window[tier], k = PAY_CONFIG.weights;
  return { ovr, rep, tier, quality: clamp01(k.squadOverall * norm(ovr, w.ovr) + k.reputation * norm(rep, w.rep)) };
}

/** Faixa [mínimo, máximo] mensal do clube. Na elite europeia, só grande clube tem o teto de R$ 1 milhão; os demais ficam com o da Série A. */
export function salaryRange(g: GameState, clubId: string): { tier: PayTier; min: number; max: number } {
  const q = clubQuality(g, clubId);
  if (q.tier === 'europa' && !(q.quality >= PAY_CONFIG.bigClub.minQuality && q.rep >= PAY_CONFIG.bigClub.minReputation)) {
    const [min, max] = PAY_CONFIG.range.serieA;
    return { tier: 'europa', min, max };
  }
  const [min, max] = PAY_CONFIG.range[q.tier];
  return { tier: q.tier, min, max };
}

export const coachFactor = (overall: number) => PAY_CONFIG.coachFactor.base + PAY_CONFIG.coachFactor.span * (clamp(overall, 1, 100) / 100);

/** Salário MENSAL que o clube paga a um treinador com este overall. Sempre dentro da faixa da divisão. */
export function monthlySalaryFor(g: GameState, clubId: string, coachOv: number): number {
  const { min, max } = salaryRange(g, clubId);
  const x = clamp01(clubQuality(g, clubId).quality * coachFactor(coachOv));
  return clamp(roundMoney(min + (max - min) * x ** PAY_CONFIG.curve), min, max);
}

/* ---------- overall do treinador ---------- */

export const startingOverall = (difficulty: string) => PAY_CONFIG.startOverall[difficulty] ?? PAY_CONFIG.startOverall.normal;
/** Overall do treinador (1–100). Saves antigos sem o campo recebem o valor inicial da dificuldade. */
export const coachOverallOf = (g: Pick<GameState, 'coachOverall' | 'difficulty'>) => g.coachOverall ?? startingOverall(g.difficulty);
export const coachOverallInt = (g: Pick<GameState, 'coachOverall' | 'difficulty'>) => clamp(Math.round(coachOverallOf(g)), 1, 100);

/** Muda o overall: ganhar fica mais difícil perto de 100 e perder pesa menos para quem já é fraco. */
export function bumpOverall(g: GameState, delta: number): GameState {
  const cur = coachOverallOf(g);
  const scale = delta >= 0 ? clamp((100 - cur) / 55, 0.15, 1.3) : clamp(cur / 50, 0.4, 1.2);
  const next = clamp(Math.round((cur + delta * scale) * 100) / 100, 1, 100);
  return next === g.coachOverall ? g : { ...g, coachOverall: next };
}

/** Salário mensal do treinador no clube que ele comanda (ou o que comandou por último). */
export function coachMonthly(g: GameState): number {
  const { min, max } = salaryRange(g, g.userClubId);
  const base = monthlySalaryFor(g, g.userClubId, coachOverallOf(g));
  return clamp(roundMoney(base * (g.payMult ?? 1)), min, max); // aumentos/cortes negociados mexem no valor, mas a faixa da divisão manda
}
