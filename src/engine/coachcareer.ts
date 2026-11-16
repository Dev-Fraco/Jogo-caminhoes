import { bumpOverall, payTierOf, PAY_CONFIG, TIER_LABEL, PAY_CONFIG as C } from './coachpay';
import { postTierMessage } from './inbox';
import type { GameState, NewsItem } from './types';

/* =====================================================================
   Carreira do treinador ligada ao dinheiro: evolução do overall (resultados, sequências, objetivos),
   reputação dos clubes (sobe devagar, no fim da temporada) e avisos de mudança de divisão/limite salarial.
   ===================================================================== */

const note = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).replace(/\u00a0/g, ' ');

/** Depois de um jogo do seu time: vitória, empate ou derrota mexem no overall; sequências pesam mais. */
export function coachAfterMatch(g: GameState, goalsFor: number, goalsAgainst: number): GameState {
  if (g.unemployed || g.observer) return g;
  const e = C.evolve, prev = g.coachStreak ?? 0;
  let streak: number, delta: number;
  if (goalsFor > goalsAgainst) { streak = prev > 0 ? prev + 1 : 1; delta = e.win + (streak >= 3 ? e.winStreakBonus * (Math.min(streak, 8) - 2) : 0); }
  else if (goalsFor < goalsAgainst) { streak = prev < 0 ? prev - 1 : -1; delta = e.loss + (streak <= -3 ? e.lossStreakPenalty * (Math.min(-streak, 8) - 2) : 0); }
  else { streak = 0; delta = e.draw; }
  return bumpOverall({ ...g, coachStreak: streak }, delta);
}

/** Risco de rebaixamento: a cada 4 rodadas na zona da degola o treinador perde reconhecimento. */
export function coachRelegationRisk(g: GameState, position: number, size: number, relegN: number): GameState {
  if (g.unemployed || g.observer || g.round < 10 || g.round % 4 !== 0) return g;
  return position > size - relegN ? bumpOverall(g, C.evolve.relegationZone) : g;
}

const TOP_BY_EXPECTATION: Record<string, number> = { title: 1, top4: 4, mid: 10, survive: 16 };
export type SeasonGrade = 'great' | 'good' | 'meh' | 'bad';

/** Nota da temporada: acesso/título (ótima), objetivo cumprido (boa), abaixo do esperado (fraca), rebaixamento (ruim). */
export function seasonGrade(g: GameState, position: number, movement: 'promoted' | 'relegated' | 'stay'): SeasonGrade {
  if (movement === 'relegated') return 'bad';
  if (movement === 'promoted' || position === 1) return 'great';
  const goal = TOP_BY_EXPECTATION[g.clubs[g.userClubId].boardExpectation] ?? 10;
  return position <= Math.min(goal, 6) ? 'good' : 'meh';
}

/** Fim da temporada: objetivos da diretoria e títulos mexem no overall do treinador. */
export function coachSeasonEval(g: GameState, position: number, movement: 'promoted' | 'relegated' | 'stay', titlesWon: number): GameState {
  if (g.unemployed || g.observer) return g;
  const grade = seasonGrade(g, position, movement);
  const delta = C.evolve.season[grade] + Math.min(3, titlesWon) * 0.8;
  const before = Math.round(g.coachOverall ?? 0);
  let s = bumpOverall({ ...g, coachStreak: 0 }, delta);
  const after = Math.round(s.coachOverall ?? 0);
  if (before && after !== before) s = note(s, `🧑‍💼 Seu overall de treinador ${after > before ? 'subiu' : 'caiu'} de ${before} para ${after}.`, after > before ? 'good' : 'bad');
  return s;
}

/**
 * Reputação dos clubes (1 a 5), só no fim da temporada e devagar: o clube cujo elenco inteiro já está no nível médio dos clubes da
 * reputação seguinte ganha um ponto de pressão; com 2 temporadas seguidas assim, a reputação sobe 1. Nunca passa de 5 nem sobe duas vezes seguidas.
 */
export function reputationDrift(g: GameState): GameState {
  const ids = g.divisions.filter((d) => d.format !== 'outside').flatMap((d) => d.clubIds).filter((id) => g.teams[id] && g.clubs[id]);
  const avg = (id: string) => g.teams[id].players.reduce((a, p) => a + p.strength, 0) / Math.max(1, g.teams[id].players.length);
  const byRep = new Map<number, number[]>();
  for (const id of ids) { const r = g.clubs[id].reputation; (byRep.get(r) ?? byRep.set(r, []).get(r)!).push(avg(id)); }
  const mean = (r: number) => { const l = byRep.get(r); return l && l.length >= 3 ? l.reduce((a, b) => a + b, 0) / l.length : undefined; };
  const pressure = { ...(g.repPressure ?? {}) };
  let clubs = g.clubs, s = g;
  for (const id of ids) {
    const r = g.clubs[id].reputation;
    const target = r < 5 ? mean(r + 1) : undefined;
    if (target === undefined || avg(id) < target) { if (pressure[id]) delete pressure[id]; continue; }
    const p = (pressure[id] ?? 0) + 1;
    if (p >= 2) {
      delete pressure[id];
      clubs = { ...clubs, [id]: { ...clubs[id], reputation: r + 1 } };
      if (id === g.userClubId && !g.unemployed) s = note(s, `⭐ O elenco do ${g.clubs[id].name} já joga no nível de clubes maiores: a reputação do clube sobe para ${r + 1}.`, 'good');
    } else pressure[id] = p;
  }
  return { ...s, clubs, repPressure: pressure };
}

/** Registra a faixa salarial do clube atual (sem avisar). */
export function stampPayTier(g: GameState): GameState {
  if (g.unemployed) return g;
  const tier = payTierOf(g, g.userClubId);
  return g.payTier?.clubId === g.userClubId && g.payTier.tier === tier ? g : { ...g, payTier: { clubId: g.userClubId, tier, season: g.season } };
}

/** Início da temporada: se a divisão mudou (acesso/rebaixamento) avisa o novo limite salarial, uma única vez. */
export function payTierNotice(g: GameState): GameState {
  if (g.unemployed || g.observer) return g;
  const tier = payTierOf(g, g.userClubId);
  const prev = g.payTier;
  if (!prev || prev.clubId !== g.userClubId) return stampPayTier(g);
  if (prev.tier === tier) return g;
  const was = PAY_CONFIG.range[prev.tier as keyof typeof PAY_CONFIG.range]?.[1], now = PAY_CONFIG.range[tier][1];
  const up = now > (was ?? 0);
  const club = g.clubs[g.userClubId].name;
  const text = up
    ? `Parabéns! O seu clube conquistou o acesso à ${TIER_LABEL[tier]}.\n\nSeu limite salarial mudou de ${brl(was ?? 0)} para ${brl(now)} mensais.\n\nSeu salário será recalculado conforme a nova divisão e a qualidade do elenco.`
    : `Seu clube foi rebaixado para ${TIER_LABEL[tier] === 'Estadual' ? 'os estaduais' : `a ${TIER_LABEL[tier]}`}.\n\nO limite salarial agora é de ${brl(now)} mensais.\n\nSeu novo salário será recalculado conforme a nova realidade do clube.`;
  const title = up ? 'PROMOÇÃO' : 'REBAIXAMENTO';
  const base = { ...g, payTier: { clubId: g.userClubId, tier, season: g.season } };
  return postTierMessage(note(base, `${up ? '🔼' : '🔽'} ${title} · ${club}: novo limite salarial ${brl(now)}/mês.`, up ? 'good' : 'bad'), title, text);
}
