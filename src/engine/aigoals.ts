import { standing } from './aicoaches';
import { divisionIndexOf } from './transfers';
import type { GameState } from './types';

/* =====================================================================
   Planejamento esportivo. Cada clube tem o objetivo da temporada (liga + extras como copa, estadual e competição internacional),
   derivado da divisão, da reputação e da expectativa da diretoria. Durante o ano a IA acompanha a situação e muda o jeito de contratar:
   quem foge do rebaixamento busca experiência; quem disputa título/acesso/vaga busca gente que melhore o time na hora.
   ===================================================================== */

export type LeagueGoal = 'titulo' | 'continental' | 'acesso' | 'permanecer' | 'rebaixamento';
export type ExtraKind = 'copa' | 'estadual' | 'internacional';
export interface ClubGoals { league: LeagueGoal; leagueLabel: string; extras: { kind: ExtraKind; label: string }[] }
export type GoalMode = 'sobrevivencia' | 'disputa' | 'normal';
export interface GoalStatus { mode: GoalMode; label: string; goals: ClubGoals }

const LEAGUE_LABEL: Record<LeagueGoal, string> = {
  titulo: 'Disputar o título', continental: 'Classificar-se para competição continental', acesso: 'Conseguir o acesso',
  permanecer: 'Permanecer na divisão', rebaixamento: 'Evitar o rebaixamento',
};

/** Objetivos do clube nesta temporada. */
export function clubGoals(g: GameState, clubId: string): ClubGoals {
  const info = g.clubs[clubId];
  const di = divisionIndexOf(g, clubId);
  const exp = info?.boardExpectation ?? 'mid';
  const league: LeagueGoal = exp === 'survive' ? 'rebaixamento' : exp === 'mid' ? 'permanecer' : di === 0 ? (exp === 'title' ? 'titulo' : 'continental') : 'acesso';
  const extras: ClubGoals['extras'] = [];
  if (g.cup && (info?.reputation ?? 0) >= 4) extras.push({ kind: 'copa', label: `Ganhar a ${g.cup.name}` });
  if (g.estadual?.comps.some((c) => c.divisions.some((d) => d.clubIds.includes(clubId)))) extras.push({ kind: 'estadual', label: 'Conquistar o campeonato estadual' });
  const intl = (['lib', 'sula', 'ucl'] as const).map((k) => g[k]).find((c) => c?.alive?.includes(clubId));
  if (intl) extras.push({ kind: 'internacional', label: `Conquistar a ${intl.name}` });
  return { league, leagueLabel: LEAGUE_LABEL[league], extras };
}

/**
 * Como o clube está em relação ao objetivo. No começo da temporada (sem jogos) vale só o objetivo; depois de 6 rodadas, a tabela:
 * perto do rebaixamento = sobrevivência; ainda no páreo do título/acesso/vaga = disputa; objetivo já inviável = volta ao normal.
 */
export function goalStatus(g: GameState, clubId: string): GoalStatus {
  const goals = clubGoals(g, clubId);
  const st = standing(g, clubId);
  const fight = goals.league === 'titulo' || goals.league === 'continental' || goals.league === 'acesso';
  const defend = goals.league === 'rebaixamento' || goals.league === 'permanecer';
  let mode: GoalMode = 'normal';
  if (!st || st.played < 6) mode = goals.league === 'rebaixamento' ? 'sobrevivencia' : fight ? 'disputa' : 'normal';
  else if (st.pos > st.n - st.relegN - 3 && (defend || st.pos > st.n - st.relegN)) mode = 'sobrevivencia';
  else if (fight && st.pos <= st.target + 2) mode = 'disputa';
  const label = mode === 'sobrevivencia' ? 'lutando contra o rebaixamento' : mode === 'disputa' ? (goals.league === 'acesso' ? 'na briga pelo acesso' : goals.league === 'titulo' ? 'na briga pelo título' : 'na briga por vaga') : 'temporada tranquila';
  return { mode, label, goals };
}
