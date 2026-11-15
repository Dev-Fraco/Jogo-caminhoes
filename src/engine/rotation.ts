import { goalStatus } from './aigoals';
import { standing } from './aicoaches';
import { managed } from './lookup';
import { autoLineup } from './squad';
import type { GameState, TeamState } from './types';

/* =====================================================================
   Rodízio de atletas dos clubes da IA. Cada jogador de linha acumula "carga" a cada jogo seguido como titular (mais ainda se o clube
   disputa copa/competição continental ao mesmo tempo) e descansa quando fica de fora. O técnico da IA poupa titulares cansados quando o
   jogo vale menos (classificação, risco de rebaixamento, chance de título, reta final, rival direto) e há reserva à altura.
   Só vale para clubes da IA: o seu time é escalado por você. Não há penalidade de força em campo por cansaço: o rodízio muda quem joga
   (e quem fica exposto a lesão), de forma igual para todos os clubes da IA.
   ===================================================================== */

export const REST_BASE = 5.5;        // carga a partir da qual se pensa em poupar (soma 2,5 × importância do jogo)
export const MAX_RESTED = 3;         // no máximo 3 poupados por jogo
export const MAX_DROP = 7;           // a troca só vale se o time perder até 7 pontos de força somados
export const LOAD_PLAY = 1;          // carga por jogo como titular
export const LOAD_CONGESTED = 1.5;   // ... quando o clube também está em copa/competição continental
export const LOAD_REST = 1.2;        // recuperação por jogo fora do time

/** Clube ainda vivo em copa ou competição continental (calendário apertado). */
export function congested(g: GameState, clubId: string): boolean {
  return !!(g.cup?.alive?.includes(clubId) && !g.cup.championId) || (['lib', 'sula', 'ucl'] as const).some((k) => !!g[k]?.alive?.includes(clubId) && !g[k]!.championId);
}

/** Importância do jogo para o clube (1 = normal): sobe com a luta contra o rebaixamento, a briga por título/acesso, a reta final e o rival direto. */
export function matchImportance(g: GameState, clubId: string, oppId?: string): number {
  let imp = 1;
  const mode = goalStatus(g, clubId).mode;
  if (mode === 'sobrevivencia') imp = 1.5; else if (mode === 'disputa') imp = 1.3;
  if (g.round >= g.totalRounds - 4) imp *= 1.25;      // reta final
  else if (g.round <= 5) imp *= 0.9;                   // começo de temporada
  if (mode === 'normal' && congested(g, clubId)) imp *= 0.8; // jogo menos decisivo e calendário cheio
  if (oppId) { const a = standing(g, clubId), b = standing(g, oppId); if (a && b && Math.abs(a.pos - b.pos) <= 3) imp *= 1.1; }
  return imp;
}

/** Escalação da IA: o melhor time disponível, poupando titulares muito carregados quando o jogo permite. */
export function aiLineup(g: GameState, team: TeamState, injured: Set<string>, importance = 1): string[] {
  const base = autoLineup(team.players, team.formation, injured);
  const load = g.load;
  if (!load) return base;
  const strength = new Map(team.players.map((p) => [p.id, p.strength]));
  const sum = (ids: string[]) => ids.reduce((t, id) => t + (strength.get(id) ?? 0), 0);
  const pos = new Map(team.players.map((p) => [p.id, p.pos]));
  const thr = REST_BASE + 2.5 * importance;
  const tired = base.filter((id) => (load[id] ?? 0) >= (pos.get(id) === 'GK' ? thr + 4 : thr)).sort((a, b) => (load[b] ?? 0) - (load[a] ?? 0));
  if (!tired.length) return base;
  let cur = base, rested = 0;
  const out = new Set(injured);
  for (const id of tired) {
    if (rested >= MAX_RESTED) break;
    const trial = new Set(out); trial.add(id);
    const lineup = autoLineup(team.players, team.formation, trial);
    if (sum(cur) - sum(lineup) > MAX_DROP) continue; // sem reserva à altura: o titular joga
    cur = lineup; out.add(id); rested++;
  }
  return cur;
}

/** Atualiza a carga depois de uma rodada de liga: titulares acumulam, quem ficou de fora se recupera. Só clubes da IA. */
export function updateLoad(g: GameState, lineups: Map<string, string[]>): Record<string, number> | undefined {
  const next: Record<string, number> = { ...(g.load ?? {}) };
  for (const [clubId, lineup] of lineups) {
    if (managed(g, clubId)) continue;
    const t = g.teams[clubId];
    if (!t) continue;
    const inc = congested(g, clubId) ? LOAD_CONGESTED : LOAD_PLAY;
    const xi = new Set(lineup);
    for (const p of t.players) {
      const cur = next[p.id] ?? 0;
      const v = xi.has(p.id) ? cur + inc : Math.max(0, cur - LOAD_REST);
      if (v > 0) next[p.id] = Math.round(v * 10) / 10; else delete next[p.id];
    }
  }
  return next;
}
