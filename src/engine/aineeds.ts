import type { ClubProfile } from './aiprofile';
import { avgXI } from './aiprofile';
import { autoLineup } from './squad';
import { MIN_BY_POS } from './transfers';
import type { GameState, Player, Position } from './types';

/* =====================================================================
   Necessidades do elenco (IA): o clube olha o próprio elenco posição por posição e decide ONDE precisa de reforço, e por quê.
   Motivos: falta de gente, titular fraco, veterano na posição, aposentadoria à vista, lesão longa e substituto de quem saiu.
   Não existe "contratar só porque tem dinheiro": sem necessidade real, o clube não vai ao mercado.
   ===================================================================== */

export type NeedReason = 'falta-gente' | 'reposicao' | 'titular-fraco' | 'veterano' | 'aposentadoria' | 'lesao';
export interface Need {
  pos: Position; priority: number; reasons: NeedReason[];
  /** Quantos jogadores faltam para a posição ficar no mínimo confortável. */
  missing: number;
  /** Força mínima do reforço (depende do motivo) e idade máxima do candidato. */
  minStrength: number; maxAge: number;
  /** O reforço entra para ser titular (melhorar) ou só para dar profundidade. */
  forStarter: boolean;
}

/** Quantidade ideal por posição (o mínimo do jogo + 1 de folga). */
const COMFORT: Record<Position, number> = { GK: MIN_BY_POS.GK + 1, DEF: MIN_BY_POS.DEF + 1, MID: MIN_BY_POS.MID + 1, ATT: MIN_BY_POS.ATT + 1 };
const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'ATT'];
/** Rodadas de lesão a partir das quais o jogador conta como "fora por muito tempo". */
export const LONG_INJURY_ROUNDS = 6;
/** Idade em que o jogador já é tratado como a caminho da aposentadoria. */
export const RETIRING_AGE = 35;
export const AGING_AGE = 32;
/** Prioridade mínima para o clube ir ao mercado por uma posição. */
export const NEED_THRESHOLD = 15;

/** Lesionado por longo tempo? (o jogo ainda não gera lesões; se existirem em `g.injuries`, a IA já as respeita) */
export function longInjured(g: Pick<GameState, 'injuries' | 'season' | 'round'>, playerId: string): boolean {
  const i = g.injuries?.[playerId];
  return !!i && (i.season > g.season || (i.season === g.season && i.untilRound - g.round >= LONG_INJURY_ROUNDS));
}

/** Analisa o elenco e devolve as necessidades por posição, da mais urgente para a menos. */
export function squadNeeds(g: GameState, clubId: string, prof: ClubProfile, opts: { upgrade?: boolean; divisionLevel?: number } = {}): Need[] {
  const team = g.teams[clubId];
  if (!team) return [];
  const level = avgXI(team);
  const xi = new Set(autoLineup(team.players, team.formation));
  const out: Need[] = [];
  for (const pos of POSITIONS) {
    const all = team.players.filter((p) => p.pos === pos);
    const reasons: NeedReason[] = [];
    let priority = 0;
    // quem realmente vai estar disponível (sem lesionados de longa data nem aposentados a caminho)
    const usable = all.filter((p) => !longInjured(g, p.id) && p.age < RETIRING_AGE + 1);
    const missing = Math.max(0, COMFORT[pos] - usable.length);
    if (usable.length < MIN_BY_POS[pos]) { priority += 120; reasons.push('falta-gente'); }
    else if (missing > 0) { priority += 20 * missing; reasons.push('reposicao'); }
    const starters = all.filter((p) => xi.has(p.id));
    const weak = starters.length ? Math.min(...starters.map((p) => p.strength)) : 30;
    const gapWeak = level - weak;
    if (gapWeak >= prof.minUpgrade) { priority += Math.min(40, gapWeak * 3); reasons.push('titular-fraco'); }
    // diretoria investiu para reforçar (promovido com investimento forte): qualquer titular abaixo do nível da nova divisão vira alvo
    else if (opts.upgrade && opts.divisionLevel !== undefined && weak < opts.divisionLevel - 1) { priority += 20 + Math.min(20, (opts.divisionLevel - weak) * 2); reasons.push('titular-fraco'); }
    const aging = starters.filter((p) => p.age >= AGING_AGE);
    if (aging.length) { priority += 12 * aging.length + 3 * (Math.max(...aging.map((p) => p.age)) - AGING_AGE); reasons.push('veterano'); }
    if (starters.some((p) => p.age >= RETIRING_AGE)) { priority += 25; reasons.push('aposentadoria'); }
    if (starters.some((p) => longInjured(g, p.id))) { priority += 60; reasons.push('lesao'); }
    // posição com gente de sobra: nunca contrata mais (ex.: 3 goleiros e falta lateral → vai de defensor)
    if (all.length > COMFORT[pos] + 2 && !reasons.includes('falta-gente') && !reasons.includes('lesao')) priority = 0;
    if (priority < NEED_THRESHOLD) continue;
    const forStarter = reasons.some((r) => r !== 'reposicao' && r !== 'falta-gente');
    const onlyDepth = !forStarter;
    out.push({
      pos, priority, reasons, missing,
      minStrength: onlyDepth ? Math.max(30, Math.round(level - 14)) : Math.round(weak + (opts.upgrade ? Math.min(prof.minUpgrade, 2) : prof.minUpgrade)),
      maxAge: reasons.includes('veterano') || reasons.includes('aposentadoria') ? Math.min(prof.maxAge, 29) : prof.maxAge,
      forStarter,
    });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

/** Jogadores do elenco que o clube já conta como "saindo" (aposentadoria à vista ou lesão longa). */
export const fadingPlayers = (g: GameState, clubId: string): Player[] => (g.teams[clubId]?.players ?? []).filter((p) => p.age >= RETIRING_AGE || longInjured(g, p.id));
