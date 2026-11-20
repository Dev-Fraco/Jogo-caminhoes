import { calOf } from './calendar';
import { autoLineup, spotFit, spotOf } from './squad';
import { injuryDurationFactor } from './academy';
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

/**
 * Chance de lesão por TIME em CADA PARTIDA (sorteadas uma vez por partida, de forma independente):
 * leve 10% e grave 3%. Não há mais sorteio por minuto nem por falta: esses percentuais são exatamente o que o sorteio respeita.
 */
export const INJURY_CHANCE = { leve: 0.1, grave: 0.03 } as const;
/** Quantas lesões um time pode ter na mesma partida. */
export const MAX_INJURIES_PER_MATCH = 2;
/** Dias do calendário do jogo entre uma rodada e outra (38 rodadas em ~5 meses): converte dias de afastamento em rodadas. */
export const DAYS_PER_ROUND = 4;
/** Duração em dias de jogo: leve de 2 a 20 dias; grave de 31 a 180 dias (mais de 1 mês, até cerca de 6 meses). */
export const INJURY_DAYS = { leve: [2, 20], grave: [31, 180] } as const;
export const MONTH_DAYS = 30;

/** Sorteia as lesões de UM time numa partida: cada gravidade acontece (ou não) com a sua chance, em um minuto qualquer. */
export function rollMatchInjuries(rng: Rng): { severity: 'leve' | 'grave'; minute: number }[] {
  const out: { severity: 'leve' | 'grave'; minute: number }[] = [];
  for (const severity of ['grave', 'leve'] as const) if (rng() < INJURY_CHANCE[severity]) out.push({ severity, minute: 1 + Math.floor(rng() * 90) });
  return out;
}

/** "9 dias" ou "2 meses": o afastamento em dias/meses do jogo (a partir de rodadas ou de dias). */
export function spanLabel(days: number): string {
  if (days >= MONTH_DAYS) { const m = Math.max(1, Math.round(days / MONTH_DAYS)); return `${m} ${m === 1 ? 'mês' : 'meses'}`; }
  const d = Math.max(1, Math.round(days));
  return `${d} ${d === 1 ? 'dia' : 'dias'}`;
}

/** Sorteia o tipo e a duração (em dias e em rodadas) de uma lesão da gravidade dada. Veteranos demoram mais para se recuperar. */
export function rollInjury(rng: Rng, age: number, severity?: 'leve' | 'grave'): { kind: string; rounds: number; days: number; severity: Severity } {
  const sev: 'leve' | 'grave' = severity ?? (rng() < INJURY_CHANCE.leve / (INJURY_CHANCE.leve + INJURY_CHANCE.grave) ? 'leve' : 'grave');
  const [lo, hi] = INJURY_DAYS[sev];
  const factor = age >= 32 ? 1.3 : age <= 21 ? 0.85 : 1;
  const days = Math.max(sev === 'grave' ? 31 : 1, Math.round((lo + Math.floor(rng() * (hi - lo + 1))) * factor));
  const rounds = Math.max(1, Math.ceil(days / DAYS_PER_ROUND));
  const list = sev === 'leve' ? [...KINDS.leve, ...KINDS.media] : KINDS.grave; // os tipos que eram "médios" agora são lesões leves (de dias)
  return { severity: sev, days, rounds, kind: list[Math.floor(rng() * list.length)] };
}

type InjG = Pick<GameState, 'injuries' | 'season' | 'round' | 'cal'>;
/** Dias do calendário que faltam para o jogador voltar (0 = disponível). Cai 1 a cada dia que passa. Lesões antigas (só em rodadas) são convertidas. */
export function daysLeft(g: InjG, playerId: string): number {
  const i = g.injuries?.[playerId];
  if (!i) return 0;
  if (i.untilDay !== undefined) return Math.max(0, i.untilDay - calOf(g).day);
  if (i.season > g.season) return Math.max(0, i.untilRound - g.round + 100) * DAYS_PER_ROUND;
  return i.season === g.season ? Math.max(0, i.untilRound - g.round) * DAYS_PER_ROUND : 0;
}
/** Quanto falta para o jogador voltar, em dias ou meses do jogo (para mostrar na tela). */
export const remainingLabel = (g: InjG, playerId: string) => spanLabel(daysLeft(g, playerId));

/** Rodadas (aproximadas) que faltam para o jogador voltar (0 = disponível). */
export const roundsLeft = (g: InjG, playerId: string): number => Math.ceil(daysLeft(g, playerId) / DAYS_PER_ROUND);
export const isInjured = (g: InjG, playerId: string) => daysLeft(g, playerId) > 0;
/** Todos os jogadores indisponíveis agora (lesionados). */
export function injuredSet(g: InjG): Set<string> {
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

export interface InjuryHit { playerId: string; clubId: string; rounds: number; kind: string; /** afastamento em dias de jogo */ days?: number; severity?: Severity }

/** Registra lesões novas (acontecidas na rodada atual) e avisa o seu clube. A lesão conta a partir da próxima rodada. */
export function applyInjuries(g: GameState, hits: InjuryHit[], atRound: number = g.round): GameState {
  if (!hits.length) return g;
  const injuries = { ...(g.injuries ?? {}) };
  let s = g;
  for (const h0 of hits) {
    let h = h0;
    // Centro médico da base (Etapa 4): o seu clube se recupera mais rápido (leves: até −38%; graves: pouco, e nunca abaixo de 1 mês)
    if (h0.clubId === g.userClubId && !g.unemployed && g.youth) {
      const sev = h0.severity ?? ((h0.days ?? 0) >= 31 ? 'grave' : 'leve');
      const f = injuryDurationFactor(g.youth, sev);
      if (f < 1) {
        if (h0.days) { const days = Math.max(sev === 'grave' ? 31 : 1, Math.round(h0.days * f)); h = { ...h0, days, rounds: Math.max(1, Math.ceil(days / DAYS_PER_ROUND)) }; }
        else h = { ...h0, rounds: Math.max(1, Math.round(h0.rounds * f)) };
      }
    }
    const cur = injuries[h.playerId];
    const days = h.days ?? h.rounds * DAYS_PER_ROUND;
    if (cur && daysLeft(g, h.playerId) >= days) continue; // já está fora por mais tempo
    injuries[h.playerId] = { season: g.season, untilRound: atRound + 1 + h.rounds, untilDay: calOf(g).day + days, kind: h.kind, rounds: h.rounds, clubId: h.clubId, ...(h.days ? { days: h.days } : {}), ...(h.severity ? { severity: h.severity } : {}) };
    if (h.clubId === g.userClubId && !g.unemployed) {
      const p = g.teams[h.clubId]?.players.find((x) => x.id === h.playerId);
      if (p) s = news(s, `🤕 ${p.name} se lesionou (${h.kind}): fora por ${spanLabel(h.days ?? h.rounds * DAYS_PER_ROUND)}${h.severity === 'grave' ? ' (lesão grave)' : ''}.`, h.severity === 'grave' || h.rounds >= 8 ? 'bad' : 'info');
    }
  }
  return { ...s, injuries };
}

/** Limpa lesões vencidas e de jogadores que não estão mais em nenhum clube (o save não cresce). */
export function pruneInjuries(g: GameState): GameState {
  if (!g.injuries) return g;
  const alive = new Set<string>();
  for (const t of Object.values(g.teams)) for (const p of t.players) alive.add(p.id);
  const next = Object.fromEntries(Object.entries(g.injuries).filter(([id]) => alive.has(id) && isInjured(g, id)));
  return Object.keys(next).length === Object.keys(g.injuries).length ? g : { ...g, injuries: next };
}

/** Virada de temporada: o descanso cura as lesões curtas; as muito longas continuam na temporada nova com o que sobrou. */
export function rolloverInjuries(g: GameState, oldSeason: number, lastRound: number): GameState {
  if (!g.injuries) return g;
  const next: Record<string, Injury> = {};
  for (const [id, i] of Object.entries(g.injuries)) {
    if (i.untilDay !== undefined) { next[id] = { ...i, season: g.season }; continue; } // por dias: o calendário segue sozinho
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
export function hitsFromEvents(events: { side: 'home' | 'away' | 'none'; injury?: { playerId: string; rounds: number; kind: string; days?: number; severity?: Severity } }[], homeId: string, awayId: string): InjuryHit[] {
  return events.filter((e) => e.injury).map((e) => ({ playerId: e.injury!.playerId, clubId: e.side === 'home' ? homeId : awayId, rounds: e.injury!.rounds, kind: e.injury!.kind, ...(e.injury!.days ? { days: e.injury!.days } : {}), ...(e.injury!.severity ? { severity: e.injury!.severity } : {}) }));
}
