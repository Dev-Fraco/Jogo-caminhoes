import { COMP_NAMES } from '../data/names';
import { makeRng, hashString } from './rng';
import { teamOf } from './lookup';
import type { GameState, MatchEvent, Player, SeasonSummary } from './types';

/* =====================================================================
   Artilharia de todas as competições (nacionais, estaduais, copa, continentais e Mundial), para todos os clubes.
   Cada competição tem um id: o da divisão (ex.: serie-a), est:<UF>:<divisão>, copa, lib, sula, ucl, mundial.
   ===================================================================== */

export interface GoalEntry { clubId: string; name: string; comp: string }
let PENDING: GoalEntry[] = [];
/** Anota os gols de uma partida simulada em detalhe (vindos dos lances). */
export function logGoals(events: MatchEvent[], homeId: string, awayId: string, comp: string) {
  for (const e of events) if (e.type === 'goal' && !e.annulled && e.player && e.side !== 'none') PENDING.push({ clubId: e.side === 'home' ? homeId : awayId, name: e.player, comp });
}
/** Partidas com placar rápido (sem lances): distribui os gols entre os jogadores do clube, sem mexer no sorteio da partida. */
export function spreadGoals(g: GameState, clubId: string, goals: number, comp: string, seedKey: string) {
  if (goals <= 0) return;
  let team;
  try { team = teamOf(g, clubId); } catch { return; }
  const ps = team?.players ?? [];
  if (!ps.length) return;
  const rng = makeRng(hashString(`${g.seed}:${g.season}:${seedKey}:${clubId}`));
  const w = (p: Player) => (p.pos === 'ATT' ? 6 : p.pos === 'MID' ? 3 : p.pos === 'DEF' ? 1 : 0.05) * (p.strength / 60);
  const total = ps.reduce((a, p) => a + w(p), 0);
  for (let i = 0; i < goals; i++) {
    let r = rng() * total, pick = ps[ps.length - 1];
    for (const p of ps) { r -= w(p); if (r <= 0) { pick = p; break; } }
    PENDING.push({ clubId, name: pick.name, comp });
  }
}
/** Esvazia o que foi anotado (chamar no começo de cada rodada simulada para não herdar sobras). */
export const clearGoals = () => { PENDING = []; };
export function drainGoals(): GoalEntry[] { const l = PENDING; PENDING = []; return l; }

/** Soma gols na artilharia da temporada (uma linha por jogador e competição). */
export function addScorers(g: GameState, log: GoalEntry[]): GameState['scorers'] {
  if (!log.length) return g.scorers;
  const sc = { ...(g.scorers ?? {}) };
  for (const e of log) {
    const p = g.teams[e.clubId]?.players.find((x) => x.name === e.name);
    const id = `${p?.id ?? `${e.clubId}:${e.name}`}@${e.comp}`;
    const cur = sc[id];
    sc[id] = [e.name, e.clubId, e.comp, (cur?.[3] ?? 0) + 1];
  }
  return sc;
}

/** Saves da versão anterior guardavam cada artilheiro como objeto: converte para o formato compacto (idempotente). */
export function compactScorers(g: GameState): GameState {
  const sc = g.scorers;
  if (!sc || Object.values(sc).every((v) => Array.isArray(v))) return g;
  const out: NonNullable<GameState['scorers']> = {};
  for (const [k, v] of Object.entries(sc)) {
    const o = v as unknown;
    if (Array.isArray(o)) out[k] = o as [string, string, string, number];
    else { const x = o as { name: string; clubId: string; divisionId: string; g: number }; out[k] = [x.name, x.clubId, x.divisionId, x.g]; }
  }
  return { ...g, scorers: out };
}

/** Os 10 maiores artilheiros de cada competição. */
export function topScorersOf(g: GameState): NonNullable<SeasonSummary['topScorers']> {
  const by = new Map<string, [string, string, number][]>();
  for (const [name, clubId, comp, goals] of Object.values(g.scorers ?? {})) { const l = by.get(comp) ?? []; l.push([name, clubId, goals]); by.set(comp, l); }
  return [...by.entries()].map(([divisionId, rows]) => ({ divisionId, rows: rows.sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0])).slice(0, 10) }));
}

/** Nome da competição a partir do id usado na artilharia. */
export function competitionName(g: GameState, id: string): string {
  const d = g.divisions.find((x) => x.id === id);
  if (d) return d.name;
  if (id === 'copa') return g.cup?.name ?? 'Copa';
  for (const k of ['lib', 'sula', 'ucl'] as const) if (g[k]?.id === id || id === k) return g[k]?.name ?? id;
  if (id === 'mundial') return g.mundial?.name ?? COMP_NAMES.mundial;
  if (id.startsWith('est:')) {
    const [, uf, di] = id.split(':');
    const c = g.estadual?.comps.find((x) => x.uf === uf);
    return c ? (Number(di) > 0 ? `${c.name} (Série B)` : c.name) : `Estadual ${uf}`;
  }
  return id;
}

/** Lista de competições com artilharia na temporada (para o seletor da tela). */
export function scorerCompetitions(g: GameState): { id: string; name: string }[] {
  const ids = new Set<string>();
  for (const s of Object.values(g.scorers ?? {})) ids.add(s[2]);
  for (const h of g.history) for (const t of h.topScorers ?? []) ids.add(t.divisionId);
  const order = (id: string) => { const i = g.divisions.findIndex((d) => d.id === id); return i >= 0 ? i : id.startsWith('est:') ? 10 : id === 'copa' ? 20 : 30; };
  return [...ids].sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map((id) => ({ id, name: competitionName(g, id) }));
}

/** Artilheiros da temporada atual de uma competição (até `n`). */
export function currentScorers(g: GameState, comp: string, n = 20): [string, string, number][] {
  return Object.values(g.scorers ?? {}).filter((s) => s[2] === comp).sort((a, b) => b[3] - a[3] || a[0].localeCompare(b[0])).slice(0, n).map((s) => [s[0], s[1], s[3]]);
}
