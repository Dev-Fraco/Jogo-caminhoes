import { homeCategory } from './categories';
import { hashString } from './rng';
import type { GameState } from './types';
import type { Prospect } from './youth';

/* =====================================================================
   Ritmo de jogo dos jovens da base:
   - Emprestado e jogando: volta MUITO melhor (de +3 a +7 de overall por temporada fora; menos antes dos 16 anos);
   - Jogou pouco na temporada (menos de 25% dos minutos de quem mais joga na categoria): perde overall.
   ===================================================================== */

/** Muda o overall do jovem (a barra de treino é preservada). */
export function withOverall(p: Prospect, ovr: number, potential?: number): Prospect {
  const strength = Math.max(1, Math.min(99, Math.round(ovr)));
  return { ...p, potential: Math.max(potential ?? p.potential, strength), exact: strength + (p.train ?? 0) / 100, player: { ...p.player, strength } };
}

/** Quanto o jovem ganha de overall por temporada emprestado (3 a 7; 60% antes dos 16 anos). */
export function loanGainPerYear(p: Prospect, season: number): number {
  const base = 3 + (hashString(`emp:${p.player.id}:${season}`) % 5); // 3..7
  return Math.max(2, Math.round(base * (p.player.age < 16 ? 0.6 : 1)));
}

/** Aplica o ganho do empréstimo: `years` temporadas (pode ser fração se voltou antes do prazo). O potencial sobe junto quando o jovem passa dele. */
export function applyLoanGain(p: Prospect, season: number, years: number): { p: Prospect; gain: number } {
  const gain = Math.max(1, Math.round(loanGainPerYear(p, season) * Math.min(3, Math.max(0.25, years))));
  const next = withOverall(p, Math.min(99, p.player.strength + gain));
  return { p: next, gain: next.player.strength - p.player.strength };
}

/** Fração mínima de minutos para não perder ritmo. */
export const MIN_PLAY_SHARE = 0.25;

/** Fim da temporada (antes de as competições da base serem limpas): quem jogou pouco perde overall (1 a 3). */
export function idlePenalty(g: GameState): GameState {
  const y = g.youth;
  if (!y || !g.ycomps?.length || g.unemployed || g.observer) return g;
  const hit: string[] = [];
  const prospects = y.prospects.map((p) => {
    if (p.loanedTo || p.loanFrom || p.player.age < 13) return p;
    const cat = homeCategory(p.player.age);
    const comps = g.ycomps!.filter((c) => c.cat === cat && c.clubs.includes(g.userClubId));
    if (!comps.length) return p;
    let mine = 0, top = 0;
    for (const c of comps) {
      mine += c.st[p.player.id]?.[3] ?? 0;
      for (const q of y.prospects) if (!q.loanedTo && homeCategory(q.player.age) === cat) top = Math.max(top, c.st[q.player.id]?.[3] ?? 0); // quem mais joga no seu clube nessa categoria
    }
    if (top < 90 * 4) return p; // pouquíssimos jogos disputados: não dá para medir
    const share = mine / top;
    if (share >= MIN_PLAY_SHARE) return p;
    const loss = share < 0.05 ? 3 : share < 0.12 ? 2 : 1;
    const n = withOverall({ ...p, history: [...(p.history ?? []), { season: g.season, text: `Jogou pouco (${Math.round(share * 100)}% dos minutos): perdeu ${loss} de overall por falta de ritmo.` }] }, Math.max(20, p.player.strength - loss));
    hit.push(`${p.player.name} (−${p.player.strength - n.player.strength})`);
    return { ...n, potential: p.potential };
  });
  if (!hit.length) return g;
  return { ...g, youth: { ...y, prospects }, news: [{ season: g.season, round: g.round, text: `📉 Jogaram pouco na base e perderam overall: ${hit.slice(0, 6).join(', ')}${hit.length > 6 ? ` e mais ${hit.length - 6}` : ''}.`, tone: 'bad' as const }, ...g.news].slice(0, 80) };
}
