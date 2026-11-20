import { CLUBS_DATA } from '../data/clubs';
import { COUNTRY_ORDER, WORLD_DATA } from '../data/world';
import { clubPlayers } from './market';
import { hashString, makeRng } from './rng';
import { buildFixtures } from './schedule';
import type { Fixture, GameState, WorldState } from './types';

/* =====================================================================
   Ligas do mundo: todas as divisões que existem no jogo (fora da SUA pirâmide) são simuladas junto com o seu campeonato.
   - Os clubes e elencos são os dos dados do jogo (os mesmos do mercado); a força de cada clube é a média dos 11 melhores, calculada no começo da
     temporada (com as compras e vendas que você fez).
   - A cada rodada que você joga, cada liga joga a parte proporcional das suas rodadas: todas terminam junto com a sua temporada.
   - Os jogos usam um modelo rápido de gols (Poisson) calibrado como o motor: ~2,7 gols por jogo e vantagem de casa.
   - Só guardamos resultados em lista compacta; a tabela sai deles. No fim da temporada: campeão, acessos e rebaixamentos entre as divisões do mesmo país.
   ===================================================================== */

const SKIP_FORMAT = new Set(['groups', 'estadual']);
export const REGION: Record<string, 'america' | 'europa'> = { BR: 'america', AR: 'america', BO: 'america', CL: 'america', CO: 'america', EC: 'america', PY: 'america', PE: 'america', UY: 'america', VE: 'america', EN: 'europa', ES: 'europa', IT: 'europa', DE: 'europa', FR: 'europa', PT: 'europa' };

export interface WorldDiv { id: string; name: string; alias?: string; countryId: string; countryName: string; flag: string; leagueName: string; tier: number }
/** Divisões simuláveis do mundo, na ordem dos países. As da sua pirâmide ficam de fora (o jogo principal cuida delas). */
export function worldDivisions(g: Pick<GameState, 'divisions'>): WorldDiv[] {
  const mine = new Set(g.divisions.map((d) => d.id)), out: WorldDiv[] = [];
  for (const cid of COUNTRY_ORDER) {
    const c = WORLD_DATA[cid];
    for (const l of c.leagues) l.divisions.forEach((d, tier) => {
      if (mine.has(d.id) || (d.format && SKIP_FORMAT.has(d.format)) || !(CLUBS_DATA[d.id]?.length)) return;
      out.push({ id: d.id, name: d.name, alias: d.alias, countryId: cid, countryName: c.name, flag: c.flag, leagueName: l.name, tier });
    });
  }
  return out;
}

const clubStrength = (g: GameState, id: string): number => {
  const ps = [...clubPlayers(g, id)].sort((a, b) => b.strength - a.strength).slice(0, 11);
  return ps.length ? ps.reduce((a, p) => a + p.strength, 0) / ps.length : 50;
};
const roundsOf = (n: number) => 2 * (n % 2 ? n : n - 1);

/** Cria as ligas do mundo no começo da temporada atual (idempotente). */
export function ensureWorld(g: GameState): GameState {
  if (g.world && g.world.season === g.season) return g;
  if (g.world) return rollWorld(g);
  const members: WorldState['members'] = {}, str: WorldState['str'] = {}, res: WorldState['res'] = {}, played: WorldState['played'] = {};
  for (const d of worldDivisions(g)) { members[d.id] = (CLUBS_DATA[d.id] ?? []).map((c) => c.id); res[d.id] = []; played[d.id] = 0; }
  const w: WorldState = { season: g.season, members, str, res, played, champs: [] };
  const s = { ...g, world: w };
  for (const ids of Object.values(members)) for (const id of ids) str[id] = Math.round(clubStrength(s, id) * 10) / 10;
  return s;
}

/* ----------------------------- jogos ----------------------------- */

const FIX = new Map<string, { fixtures: Fixture[]; totalRounds: number }>();
const fixturesFor = (div: string, ids: string[]) => {
  const key = `${div}|${ids.join(',')}`; let f = FIX.get(key);
  if (!f) { if (FIX.size > 80) FIX.clear(); f = buildFixtures(ids, div); FIX.set(key, f); }
  return f;
};
const poisson = (lambda: number, r: () => number): number => { const L = Math.exp(-lambda); let k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 12); return k - 1; };

/** Resultado de um jogo: a força de cada clube e a vantagem de casa decidem a média de gols de cada lado. */
export function simulateWorldMatch(strHome: number, strAway: number, seed: string): [number, number] {
  const r = makeRng(hashString(seed));
  const d = (strHome - strAway) / 12;
  return [poisson(1.5 * Math.exp(0.55 * d + 0.1), r), poisson(1.2 * Math.exp(-0.55 * d), r)];
}

/** Joga as rodadas que faltam para cada liga, conforme quantas rodadas você já completou (toda liga termina quando o seu campeonato termina). */
export function worldTick(g0: GameState): GameState {
  let g = ensureWorld(g0);
  const w = g.world!;
  if (!worldDivisions(g).length) return g;
  const done = Math.min(Math.max(0, g.round - 1), g.totalRounds);
  const res = { ...w.res }, played = { ...w.played };
  let changed = false;
  for (const [div, ids] of Object.entries(w.members)) {
    const { fixtures, totalRounds } = fixturesFor(div, ids);
    const target = Math.floor((done * totalRounds) / Math.max(1, g.totalRounds));
    let from = played[div] ?? 0;
    if (from >= target) continue;
    const list = [...(res[div] ?? [])];
    const idx = new Map(ids.map((id, i) => [id, i]));
    for (let rd = from + 1; rd <= target; rd++) for (const f of fixtures) {
      if (f.round !== rd) continue;
      const [hg, ag] = simulateWorldMatch(w.str[f.homeId] ?? 55, w.str[f.awayId] ?? 55, `${g.seed}:${g.season}:${div}:${rd}:${f.homeId}`);
      list.push(rd, idx.get(f.homeId)!, idx.get(f.awayId)!, hg, ag);
    }
    res[div] = list; played[div] = target; changed = true;
  }
  return changed ? { ...g, world: { ...w, res, played } } : g;
}

/* ----------------------------- consultas ----------------------------- */

export interface WRow { clubId: string; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; gd: number; points: number }
export function worldTable(g: GameState, div: string): WRow[] {
  const w = g.world; if (!w) return [];
  const ids = w.members[div] ?? [], rows = new Map<string, WRow>(ids.map((id) => [id, { clubId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }]));
  const r = w.res[div] ?? [];
  for (let i = 0; i < r.length; i += 5) {
    const h = rows.get(ids[r[i + 1]])!, a = rows.get(ids[r[i + 2]])!, hg = r[i + 3], ag = r[i + 4];
    h.played++; a.played++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
    if (hg > ag) { h.won++; a.lost++; h.points += 3; } else if (hg < ag) { a.won++; h.lost++; a.points += 3; } else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  const out = [...rows.values()]; for (const x of out) x.gd = x.gf - x.ga;
  return out.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.clubId.localeCompare(b.clubId));
}
export interface WGame { round: number; homeId: string; awayId: string; homeGoals: number; awayGoals: number }
/** Jogos de uma rodada da liga. */
export function worldRound(g: GameState, div: string, round: number): WGame[] {
  const w = g.world; if (!w) return [];
  const ids = w.members[div] ?? [], r = w.res[div] ?? [], out: WGame[] = [];
  for (let i = 0; i < r.length; i += 5) if (r[i] === round) out.push({ round, homeId: ids[r[i + 1]], awayId: ids[r[i + 2]], homeGoals: r[i + 3], awayGoals: r[i + 4] });
  return out;
}
export const worldTotalRounds = (g: GameState, div: string) => roundsOf((g.world?.members[div] ?? []).length);

/* ----------------------------- virada de temporada ----------------------------- */

const SWAP = (cid: string, tier: number) => (cid === 'EN' && tier < 2 ? 3 : 2);

/** Fecha a temporada das ligas do mundo (joga o que faltar), registra os campeões, faz acessos/rebaixamentos e recalcula a força dos clubes para a temporada nova. */
function rollWorld(g: GameState): GameState {
  let s = g; 
  while (s.world && s.world.season < s.season) {
    const w0 = s.world; const full = worldTick({ ...s, season: w0.season, round: s.totalRounds + 1 }); // termina a temporada que ficou para trás
    const w = full.world!;
    const champs = [...w.champs];
    const members: WorldState['members'] = { ...w.members };
    const divs = worldDivisions(s);
    for (const d of divs) { const t = worldTable({ ...s, world: w }, d.id); if (t[0]) champs.push({ season: w.season, div: d.id, club: t[0].clubId }); }
    const tables = new Map<string, WRow[]>(); for (const d of divs) tables.set(d.id, worldTable({ ...s, world: w }, d.id));
    const byCountry = new Map<string, WorldDiv[]>(); for (const d of divs) { const l = byCountry.get(d.countryId + d.leagueName) ?? []; l.push(d); byCountry.set(d.countryId + d.leagueName, l); }
    for (const list of byCountry.values()) {
      const tiers = list.sort((a, b) => a.tier - b.tier);
      for (let i = 0; i + 1 < tiers.length; i++) {
        if (tiers[i + 1].tier !== tiers[i].tier + 1) continue;
        const up = tiers[i], down = tiers[i + 1], k = SWAP(up.countryId, up.tier);
        const tu = tables.get(up.id)!, td = tables.get(down.id)!; // classificações originais (os índices dos resultados seguem a lista de clubes de antes das trocas)
        if (tu.length <= k || td.length <= k) continue;
        const relegated = tu.slice(-k).map((r) => r.clubId), promoted = td.slice(0, k).map((r) => r.clubId);
        members[up.id] = [...members[up.id].filter((id) => !relegated.includes(id)), ...promoted];
        members[down.id] = [...members[down.id].filter((id) => !promoted.includes(id)), ...relegated];
      }
    }
    const str: WorldState['str'] = {}, res: WorldState['res'] = {}, played: WorldState['played'] = {};
    const nw: WorldState = { season: w.season + 1, members, str, res, played, champs: champs.slice(-60) };
    for (const [div, ids] of Object.entries(members)) { res[div] = []; played[div] = 0; for (const id of ids) str[id] = Math.round(clubStrength({ ...s, world: nw }, id) * 10) / 10; }
    s = { ...s, world: nw };
  }
  return s;
}

/** Virada de temporada (chamada com a temporada nova já valendo). */
export const worldStartSeason = (g: GameState): GameState => (g.world ? worldTick(ensureWorld(g)) : ensureWorld(g));
