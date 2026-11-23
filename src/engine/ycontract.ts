import { logSpend, spend } from './academy';
import { inflate, priceIndex } from './economy';
import { baseIncome } from './finance';
import { divisionIndexOf } from './transfers';
import { hashString, clamp } from './rng';
import type { GameState, NewsItem, Player } from './types';
import { categoriesOf, homeCategory } from './categories';
import { pointsPerYear } from './training';
import { youthOf, type Prospect } from './youth';

/* =====================================================================
   Contratos, personalidade e satisfação dos jovens da base (ETAPA 6).
   - Cada jovem tem um contrato individual em `player.contract` (salário, início, fim); renovações ficam em `renewals` e no histórico.
   - A personalidade (profissionalismo, dedicação, disciplina, ambição) sai do id e é fixa; a motivação (dinâmica) fica em `mot`.
     Ela mexe pouco: no máximo ±8% na velocidade de treino. Nunca substitui os atributos.
   - A satisfação anda aos poucos rumo a uma meta que depende de oportunidades de jogo, evolução, salário, propostas e perspectiva de
     promoção. Só uma insatisfação longa vira um pedido (transferência ou não renovar): nada de saídas automáticas sem motivo.
   ===================================================================== */

export interface Personality { prof: number; ded: number; disc: number; amb: number; mot: number }
export const PERS_LABEL: Record<keyof Personality, string> = { prof: 'Profissionalismo', ded: 'Dedicação', disc: 'Disciplina', amb: 'Ambição', mot: 'Motivação' };
export const SAT_START = 70;
const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const note = (p: Prospect, season: number, text: string): Prospect => ({ ...p, history: [...(p.history ?? []), { season, text }].slice(-24) });

/** Personalidade estável do jovem (do id) + motivação atual. */
export function personalityOf(p: Pick<Prospect, 'player' | 'mot'>): Personality {
  const h = (k: string) => 20 + (hashString(`${p.player.id}:${k}`) % 71); // 20 a 90
  return { prof: h('prof'), ded: h('ded'), disc: h('disc'), amb: h('amb'), mot: p.mot ?? 60 };
}
/** Efeito da personalidade na velocidade de treino: pequeno (de −8% a +8%). */
export function personalityBoost(p: Pick<Prospect, 'player' | 'mot'>): number {
  const q = personalityOf(p);
  const traits = (q.prof * 0.35 + q.ded * 0.4 + q.disc * 0.25 - 55) / 35;   // −1 a +1
  const mot = (q.mot - 50) / 50;
  return clamp(traits * 0.05 + mot * 0.03, -0.08, 0.08);
}

/* ----------------------------- contratos ----------------------------- */

export type ContractStatus = 'ativo' | 'vencendo' | 'vencido' | 'sem contrato';
/** Salário anual justo do jovem (idade, overall e potencial). */
/** Com 200 jovens por categoria, a maioria recebe só uma bolsa de formação: criança custa pouco, o Sub-21 já custa mais. */
const AGE_WAGE = (age: number) => (age <= 14 ? 0.036 : age <= 16 ? 0.075 : 0.135);
/** A bolsa também acompanha o porte do clube (receita-base): clube pequeno não paga o que o gigante paga (a folha da base fica perto de 4% da receita). */
const clubWageScale = (g: GameState): number => {
  const inc = baseIncome(divisionIndexOf(g, g.userClubId), g.clubs[g.userClubId]?.reputation ?? 1, priceIndex(g));
  const ref = baseIncome(0, 5, priceIndex(g));
  return Math.min(1, Math.max(0.03, inc / ref));
};
export const fairWage = (g: GameState, p: Prospect): number => Math.max(100, Math.round((inflate(g, 4_000 + (p.player.age - 11) * 2_500 + p.player.strength * 250 + p.potential * 120) * AGE_WAGE(p.player.age) * clubWageScale(g)) / 100) * 100);
export const contractStatus = (g: GameState, p: Prospect): ContractStatus => { const c = p.player.contract; return !c ? 'sem contrato' : c.until < g.season ? 'vencido' : c.until === g.season ? 'vencendo' : 'ativo'; };
export const yearsLeft = (g: GameState, p: Prospect): number => (p.player.contract ? Math.max(0, p.player.contract.until - g.season + 1) : 0);
export const payroll = (y: { prospects: Prospect[] }): number => y.prospects.reduce((t, p) => t + (p.loanedTo ? 0 : p.player.contract?.wage ?? 0), 0);
/** Contratos que vencem até o fim da temporada (ou `within` temporadas depois). */
export const expiring = (g: GameState, within = 0): Prospect[] => youthOf(g).prospects.filter((p) => !p.loanFrom && p.player.contract && p.player.contract.until <= g.season + within);

export function newContract(g: GameState, p: Prospect, years: number, wage?: number): NonNullable<Player['contract']> {
  return { wage: wage ?? fairWage(g, p), from: g.season, until: g.season + Math.max(1, years) - 1 };
}
/** O que o jovem pede de salário: o justo, ajustado pela ambição e pela satisfação. */
export function askWage(g: GameState, p: Prospect): number {
  const q = personalityOf(p), sat = p.sat ?? SAT_START;
  return Math.round(fairWage(g, p) * (1 + (q.amb - 55) / 300 + (65 - sat) / 250) / 100) * 100;
}

export type NegResult = { result: 'aceito' | 'contra' | 'recusado'; ask: number; msg: string };
/** Avalia uma proposta de salário: aceita se chega ao que ele pede, devolve uma contraproposta se chega perto, recusa se está longe (ou se ele já decidiu não renovar). */
export function evaluateWage(g: GameState, p: Prospect, wage: number, renewing: boolean): NegResult {
  const ask = askWage(g, p);
  if (renewing && p.want === 'nao-renovar' && wage < ask * 1.25) return { result: 'recusado', ask, msg: `${p.player.name} está insatisfeito e não quer renovar${p.why?.length ? ` (${p.why[0]})` : ''}. Só reconsideraria com um salário bem acima do justo.` };
  if (wage >= ask) return { result: 'aceito', ask, msg: `${p.player.name} aceitou.` };
  if (wage >= ask * 0.8) return { result: 'contra', ask, msg: `${p.player.name} pede ${Math.round(ask / 1000)} mil por ano.` };
  return { result: 'recusado', ask, msg: `${p.player.name} recusou: a proposta está muito abaixo do que ele vale.` };
}

export type YResult = { ok: true; state: GameState; msg?: string } | { ok: false; error: string };

/** Renova o contrato de um jovem seu (negocia salário e duração). Luvas = 20% do salário anual novo. */
export function renewContract(g: GameState, id: string, wage: number, years: number): YResult & { neg?: NegResult } {
  const y = youthOf(g);
  const p = y.prospects.find((x) => x.player.id === id);
  if (!p) return { ok: false, error: 'Jovem não encontrado.' };
  if (p.loanFrom) return { ok: false, error: 'Jovem emprestado por outro clube: o contrato é do clube dono.' };
  if (years < 1 || years > 5) return { ok: false, error: 'A duração vai de 1 a 5 anos.' };
  const neg = evaluateWage(g, p, wage, true);
  if (neg.result !== 'aceito') return { ok: false, error: neg.msg, neg };
  const fee = Math.round((wage * 0.2) / 100) * 100;
  const paid = spend(g, y, { season: g.season, round: g.round, kind: 'renovacao', text: `Renovação de ${p.player.name}: ${Math.round(wage / 1000)} mil/ano por ${years} ano(s)`, cost: fee });
  if (!paid.ok) return paid;
  const until = Math.max(p.player.contract?.until ?? g.season, g.season) + years;
  const np = note({ ...p, want: p.want === 'nao-renovar' ? undefined : p.want, sat: clamp((p.sat ?? SAT_START) + 6, 0, 100), unrest: 0,
    renewals: [...(p.renewals ?? []), { season: g.season, wage, until }].slice(-8), player: { ...p.player, contract: { wage, from: p.player.contract?.from ?? g.season, until } } }, g.season, `Contrato renovado: ${Math.round(wage / 1000)} mil/ano até ${until}.`);
  const s: GameState = { ...paid.g, youth: { ...paid.g.youth!, prospects: paid.g.youth!.prospects.map((x) => (x.player.id === id ? np : x)) } };
  return { ok: true, state: news(s, `✍️ ${p.player.name} renovou até ${until} (${Math.round(wage / 1000)} mil por ano).`, 'good'), neg };
}

/** Libera um jovem (rescisão): multa de 30% do que falta do contrato. Quem está emprestado não pode ser liberado. */
export function releaseWithContract(g: GameState, id: string): YResult {
  const y = youthOf(g);
  const p = y.prospects.find((x) => x.player.id === id);
  if (!p) return { ok: false, error: 'Jovem não encontrado.' };
  if (p.loanedTo || p.loanFrom) return { ok: false, error: 'Jovem emprestado: espere o fim do empréstimo.' };
  const left = yearsLeft(g, p), wage = p.player.contract?.wage ?? 0;
  const cost = Math.round((wage * Math.max(0, left - 1) * 0.3) / 100) * 100; // o ano corrente já está pago na folha
  let s = g;
  if (cost > 0) { const paid = spend(g, y, { season: g.season, round: g.round, kind: 'multa', text: `Rescisão de ${p.player.name} (${left} ano(s) de contrato)`, cost }); if (!paid.ok) return paid; s = paid.g; }
  const ny = s.youth ?? y;
  s = { ...s, youth: { ...ny, prospects: ny.prospects.filter((x) => x.player.id !== id) } };
  return { ok: true, state: news(s, `📄 ${p.player.name} foi liberado${cost ? ` (multa de ${Math.round(cost / 1000)} mil)` : ''}.`) };
}

/** Folha anual dos jovens (paga na virada de temporada): salário de quem é seu e está aqui; empréstimos entram com a divisão combinada. */
export function payWages(g: GameState): GameState {
  const y = g.youth;
  if (!y) return g;
  let own = 0, borrowed = 0, lentIn = 0;
  for (const p of y.prospects) {
    const w = p.player.contract?.wage ?? 0;
    if (p.loanFrom) borrowed += w * p.loanFrom.share;           // recebido por empréstimo: você paga a parte combinada
    else if (p.loanedTo) { own += w * (1 - p.loanedTo.share); lentIn += w * p.loanedTo.share; } // emprestado: o outro clube paga a parte dele
    else own += w;
  }
  const out = Math.round(own + borrowed), inc = Math.round(lentIn);
  if (out <= 0 && inc <= 0) return g;
  let s: GameState = { ...g, budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] - out + inc }, youth: y };
  let ny = y;
  if (out > 0) ny = logSpend(ny, { season: g.season, round: g.round, kind: 'salario', text: `Folha dos jovens da base (${y.prospects.length})`, cost: out });
  if (inc > 0) ny = logSpend(ny, { season: g.season, round: g.round, kind: 'emprestimo', income: true, text: 'Salários pagos por clubes que têm jovens seus emprestados', cost: inc });
  s = { ...s, youth: ny };
  return news(s, `💼 Folha dos jovens da base paga: R$ ${(out / 1000).toLocaleString('pt-BR')} mil${inc ? ` (clubes parceiros pagaram R$ ${(inc / 1000).toLocaleString('pt-BR')} mil)` : ''}.`);
}

/* ----------------------------- satisfação ----------------------------- */

export interface SatFactors { play: number; evolution: number; salary: number; interest: number; promotion: number }
/** Meta de satisfação do jovem agora (70 = neutro). Cada fator mexe poucos pontos; ambição aumenta a exigência. */
export function satFactors(g: GameState, p: Prospect, ctx: { share?: number; expected: number; gained: number; bench: number; offers: number }): SatFactors {
  const q = personalityOf(p), age = p.player.age;
  const amb = 0.7 + q.amb / 100;                                       // 0,9 a 1,6
  const play = ctx.share === undefined || age < 14 ? 0 : clamp((ctx.share - 0.45) * 40 * amb, -18, 8);
  const ratio = ctx.expected > 0.3 ? ctx.gained / ctx.expected : 1;
  const evolution = p.player.strength >= p.potential ? 0 : clamp((ratio - 0.9) * 22, -14, 8);
  const wage = p.player.contract?.wage ?? 0, fair = fairWage(g, p);
  const salary = clamp((wage / Math.max(1, fair) - 0.95) * 30 * amb, -14, 6);
  const interest = -Math.min(10, ctx.offers * 4) * (q.amb / 100 + 0.4);
  const promotion = age >= 17 && p.player.strength >= ctx.bench - 4 && !p.loanedTo ? clamp(-(age - 16) * 2.2 * amb, -14, 0) : age >= 19 && p.player.strength < ctx.bench - 18 ? -6 : 0;
  return { play, evolution, salary, interest, promotion };
}
export const targetSat = (f: SatFactors): number => clamp(SAT_START + f.play + f.evolution + f.salary + f.interest + f.promotion, 8, 96);
export const reasonsOf = (f: SatFactors): string[] => ([['play', 'poucas oportunidades de jogar'], ['evolution', 'falta de evolução'], ['salary', 'salário incompatível'], ['interest', 'propostas de outros clubes'], ['promotion', 'falta de perspectiva de promoção']] as [keyof SatFactors, string][]).filter(([k]) => f[k] <= -4).sort((a, b) => f[a[0]] - f[b[0]]).map(([, t]) => t);
export const mood = (sat: number): string => (sat >= 75 ? 'Satisfeito' : sat >= 55 ? 'Tranquilo' : sat >= 38 ? 'Descontente' : 'Insatisfeito');
export const isUnhappy = (p: Prospect): boolean => (p.sat ?? SAT_START) < 45 || !!p.want;

/** Quanto o jovem joga nas competições da base: jogos dele ÷ jogos do seu clube nas competições da faixa dele (sem dados: neutro). */
export function playShare(g: GameState, p: Prospect): number | undefined {
  const cats = categoriesOf(p.player.age);
  let games = 0, mine = 0;
  for (const c of g.ycomps ?? []) {
    if (!cats.includes(c.cat) || !c.clubs.includes(g.userClubId)) continue;
    for (const m of c.m) if (!m[7] && (c.clubs[m[1]] === g.userClubId || c.clubs[m[2]] === g.userClubId)) mine++;
    games += c.st[p.player.id]?.[2] ?? 0;
  }
  return mine >= 3 ? Math.min(1, games / mine) : undefined;
}
/** Nível do elenco profissional que o jovem precisa alcançar (o 18º melhor). */
export function benchmark(g: GameState): number {
  const sorted = [...(g.teams[g.userClubId]?.players ?? []).map((x) => x.strength)].sort((a, b) => b - a);
  return sorted.length ? sorted[Math.min(17, sorted.length - 1)] : 0;
}

/** A cada rodada a satisfação anda um pouco rumo à meta. Insatisfação longa (≥ 10 rodadas abaixo de 42; 4 se o contrato está acabando) vira pedido. */
export function satTick(g: GameState): GameState {
  const y = g.youth;
  if (!y || g.unemployed || g.observer) return g;
  const frac = clamp((g.round - 1) / Math.max(1, g.totalRounds), 0.05, 1);
  const bench = benchmark(g);
  let s = g;
  const prospects = y.prospects.map((p) => {
    if (p.loanFrom) return p;
    const offers = (y.offers ?? []).filter((o) => o.playerId === p.player.id && o.status === 'pendente').length;
    const f = satFactors(g, p, { share: playShare(g, p), expected: pointsPerYear(p, y, true) * frac, gained: Math.max(0, p.exact - (p.base ?? p.exact)), bench, offers });
    const q = personalityOf(p);
    const cur = p.sat ?? SAT_START, target = targetSat(f);
    const rate = 0.07 * (1 - q.prof / 300);
    const sat = clamp(cur + (target - cur) * rate, 0, 100);
    const mot = clamp((p.mot ?? 60) + (sat - 60) * 0.02 + (sat > cur ? 0.2 : -0.2), 10, 95);
    let unrest = sat < 42 ? (p.unrest ?? 0) + 1 : sat > 55 ? 0 : p.unrest ?? 0;
    let want = p.want;
    const ending = !!p.player.contract && p.player.contract.until <= g.season;
    if (!want && unrest >= (ending ? 4 : 10)) {
      want = offers > 0 && q.amb > 45 ? 'transferencia' : 'nao-renovar';
      const why = reasonsOf(f);
      s = news(s, `😠 ${p.player.name} (${p.player.age} anos) ${want === 'transferencia' ? 'pediu para ser negociado' : 'avisou que não quer renovar'}${why.length ? `: ${why.join(', ')}` : ''}.`, 'bad');
      unrest = 0;
    }
    if (want && sat > 65) { want = undefined; s = news(s, `🙂 ${p.player.name} está mais satisfeito e voltou atrás no pedido.`, 'good'); }
    const base: Prospect = { ...p, sat: Math.round(sat * 10) / 10, mot: Math.round(mot * 10) / 10, unrest, want, why: sat < 55 ? reasonsOf(f) : [] };
    return want && !p.want ? note(base, g.season, `Insatisfeito: ${want === 'transferencia' ? 'pediu transferência' : 'não quer renovar'}${base.why?.length ? ` (${base.why.join(', ')})` : ''}.`) : base;
  });
  return { ...s, youth: { ...(s.youth ?? y), prospects } };
}
export { homeCategory };
