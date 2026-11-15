import { autoLineup, spotFit, spotOf } from './squad';
import type { Rng } from './rng';
import type { GameState, Injury, NewsItem, Player, TeamState } from './types';

/* =====================================================================
   Sistema de lesões. Acontecem durante as partidas (match.ts) e deixam o jogador fora por algumas rodadas.
   Lesionado não joga: a escalação automática o pula, o seu time troca o titular lesionado por um reserva da mesma função,
   a IA considera lesões longas ao contratar e o jogador volta sozinho quando passa o prazo. Lesão muito longa atravessa a virada de temporada.
   ===================================================================== */

export type Severity = 'leve' | 'media' | 'grave';
const KINDS: Record<Severity, string[]> = {
  leve: ['entorse no tornozelo', 'dores musculares', 'contusão na coxa', 'pancada no joelho', 'desconforto na panturrilha'],
  media: ['lesão muscular na coxa', 'estiramento na panturrilha', 'lesão no tornozelo', 'entorse no joelho'],
  grave: ['ruptura de ligamento do joelho', 'fratura no pé', 'lesão no menisco', 'ruptura muscular grave'],
};
/** Quanto do descanso da pausa entre temporadas conta para a recuperação (rodadas). */
export const OFFSEASON_RECOVERY = 8;
/** Chance de um jogador se lesionar por minuto em campo (por time) e quando é vítima de falta. */
export const INJURY_PER_MINUTE = 0.0012;
export const FOUL_INJURY = 0.03;

/** Sorteia gravidade, tipo e duração (rodadas fora). Veteranos demoram mais para se recuperar. */
export function rollInjury(rng: Rng, age: number): { kind: string; rounds: number; severity: Severity } {
  const r = rng();
  const severity: Severity = r < 0.6 ? 'leve' : r < 0.9 ? 'media' : 'grave';
  const base = severity === 'leve' ? 1 + Math.floor(rng() * 3) : severity === 'media' ? 4 + Math.floor(rng() * 5) : 9 + Math.floor(rng() * 12);
  const rounds = Math.max(1, Math.round(base * (age >= 32 ? 1.3 : age <= 21 ? 0.85 : 1)));
  const list = KINDS[severity];
  return { severity, rounds, kind: list[Math.floor(rng() * list.length)] };
}

/** Rodadas que faltam para o jogador voltar (0 = disponível). */
export function roundsLeft(g: Pick<GameState, 'injuries' | 'season' | 'round'>, playerId: string): number {
  const i = g.injuries?.[playerId];
  if (!i) return 0;
  if (i.season > g.season) return Math.max(0, i.untilRound - g.round + 100); // (não ocorre: a virada converte para a temporada nova)
  return i.season === g.season ? Math.max(0, i.untilRound - g.round) : 0;
}
export const isInjured = (g: Pick<GameState, 'injuries' | 'season' | 'round'>, playerId: string) => roundsLeft(g, playerId) > 0;
/** Todos os jogadores indisponíveis agora (lesionados). */
export function injuredSet(g: Pick<GameState, 'injuries' | 'season' | 'round'>): Set<string> {
  const out = new Set<string>();
  for (const id of Object.keys(g.injuries ?? {})) if (isInjured(g, id)) out.add(id);
  return out;
}

/** Escalação de um time sem os lesionados. */
export const lineupWithout = (team: TeamState, injured: Set<string>): string[] => (injured.size ? autoLineup(team.players, team.formation, injured) : autoLineup(team.players, team.formation));

/**
 * Seu time: troca cada titular lesionado pelo melhor reserva da mesma linha (de preferência da mesma função) e mantém o resto da escalação.
 * Devolve o time ajustado e quem entrou no lugar de quem.
 */
export function replaceInjuredStarters(team: TeamState, injured: Set<string>): { team: TeamState; swaps: { out: Player; in: Player }[] } {
  const byId = new Map(team.players.map((p) => [p.id, p]));
  const lineup = [...team.lineup];
  const swaps: { out: Player; in: Player }[] = [];
  for (let i = 0; i < lineup.length; i++) {
    const p = byId.get(lineup[i]);
    if (!p || !injured.has(p.id)) continue;
    const bench = team.players.filter((q) => q.pos === p.pos && !lineup.includes(q.id) && !injured.has(q.id)).sort((a, b) => b.strength * spotFit(spotOf(b), spotOf(p)) - a.strength * spotFit(spotOf(a), spotOf(p)));
    if (bench[0]) { swaps.push({ out: p, in: bench[0] }); lineup[i] = bench[0].id; }
  }
  return { team: swaps.length ? { ...team, lineup } : team, swaps };
}

const news = (g: GameState, text: string, tone: NewsItem['tone']): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });

export interface InjuryHit { playerId: string; clubId: string; rounds: number; kind: string }

/** Registra lesões novas (acontecidas na rodada atual) e avisa o seu clube. A lesão conta a partir da próxima rodada. */
export function applyInjuries(g: GameState, hits: InjuryHit[], atRound: number = g.round): GameState {
  if (!hits.length) return g;
  const injuries = { ...(g.injuries ?? {}) };
  let s = g;
  for (const h of hits) {
    const cur = injuries[h.playerId];
    if (cur && roundsLeft(g, h.playerId) >= h.rounds) continue; // já está fora por mais tempo
    injuries[h.playerId] = { season: g.season, untilRound: atRound + 1 + h.rounds, kind: h.kind, rounds: h.rounds, clubId: h.clubId };
    if (h.clubId === g.userClubId && !g.unemployed) {
      const p = g.teams[h.clubId]?.players.find((x) => x.id === h.playerId);
      if (p) s = news(s, `🤕 ${p.name} se lesionou (${h.kind}): fora por ${h.rounds} ${h.rounds === 1 ? 'rodada' : 'rodadas'}.`, h.rounds >= 8 ? 'bad' : 'info');
    }
  }
  return { ...s, injuries };
}

/** Limpa lesões vencidas e de jogadores que não estão mais em nenhum clube (o save não cresce). */
export function pruneInjuries(g: GameState): GameState {
  if (!g.injuries) return g;
  const alive = new Set<string>();
  for (const t of Object.values(g.teams)) for (const p of t.players) alive.add(p.id);
  const next = Object.fromEntries(Object.entries(g.injuries).filter(([id, i]) => alive.has(id) && (i.season > g.season || (i.season === g.season && i.untilRound > g.round))));
  return Object.keys(next).length === Object.keys(g.injuries).length ? g : { ...g, injuries: next };
}

/** Virada de temporada: o descanso cura as lesões curtas; as muito longas continuam na temporada nova com o que sobrou. */
export function rolloverInjuries(g: GameState, oldSeason: number, lastRound: number): GameState {
  if (!g.injuries) return g;
  const next: Record<string, Injury> = {};
  for (const [id, i] of Object.entries(g.injuries)) {
    if (i.season !== oldSeason) { if (i.season >= g.season) next[id] = i; continue; }
    const left = i.untilRound - (lastRound + 1) - OFFSEASON_RECOVERY; // rodadas que faltavam depois do fim da temporada, menos o descanso
    if (left > 0) next[id] = { ...i, season: g.season, untilRound: 1 + left }; // g.season já é a temporada nova
  }
  return { ...g, injuries: Object.keys(next).length ? next : undefined };
}

/** Quantos jogadores de um time estão lesionados. */
export const injuredCount = (g: GameState, clubId: string) => (g.teams[clubId]?.players ?? []).filter((p) => isInjured(g, p.id)).length;

/** Seu time antes de jogar: troca titulares lesionados por reservas da mesma função e avisa (com `quiet`, só ajusta). */
export function healUserLineup(g: GameState, quiet = false): GameState {
  if (g.unemployed || g.observer) return g;
  const inj = injuredSet(g);
  if (!inj.size) return g;
  const team = g.teams[g.userClubId];
  const r = replaceInjuredStarters(team, inj);
  if (!r.swaps.length) return g;
  let s: GameState = { ...g, teams: { ...g.teams, [g.userClubId]: r.team } };
  if (!quiet) for (const w of r.swaps) s = news(s, `🩹 ${w.out.name} está lesionado: ${w.in.name} entra no time.`, 'info');
  return s;
}

/** Lesões que aconteceram nos jogos do seu clube (eventos da narração), para registrar no estado. */
export function hitsFromEvents(events: { side: 'home' | 'away' | 'none'; injury?: { playerId: string; rounds: number; kind: string } }[], homeId: string, awayId: string): InjuryHit[] {
  return events.filter((e) => e.injury).map((e) => ({ playerId: e.injury!.playerId, clubId: e.side === 'home' ? homeId : awayId, rounds: e.injury!.rounds, kind: e.injury!.kind }));
}
