import { avgXI } from './aiprofile';
import { managed } from './lookup';
import { clamp, hashString, makeRng, type Rng } from './rng';
import { randomName } from './squad';
import { computeTable } from './table';
import type { AiCoach, GameState, NewsItem } from './types';

/* =====================================================================
   Treinadores dos clubes da IA. Cada clube tem um treinador com reputação, experiência e mérito (histórico de resultados).
   A diretoria avalia o trabalho (posição vs. objetivo da temporada, qualidade do elenco, fase recente e tempo de casa) e só
   demite em situação justificável; o substituto sai da fila de desempregados, compatível com o porte e o objetivo do clube.
   Há travas contra excesso de demissões e contra recontratar quem já passou (mal) pelo clube.
   ===================================================================== */

export const MIN_TENURE_ROUNDS = 8;       // ninguém é demitido nas primeiras rodadas de casa
export const FIRE_AT = 11;                // pressão mínima para demitir durante a temporada
export const FIRE_AT_END = 9;             // ... e no fim dela
export const POOL_MIN = 12;               // desempregados que sempre existem no mercado
const RETIRE_AGE = 68;
const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const absRound = (g: Pick<GameState, 'season' | 'totalRounds'>, season: number, round: number) => season * (g.totalRounds || 38) + round;

/** Clubes controlados pela IA que entram no sistema (têm elenco e divisão da pirâmide). */
const aiClubs = (g: GameState) => Object.keys(g.teams).filter((id) => !managed(g, id));
const divOf = (g: GameState, id: string) => g.divisions.find((d) => d.clubIds.includes(id) && d.format !== 'outside');

export const coachOf = (g: GameState, clubId: string): AiCoach | undefined => g.aiCoaches?.[g.clubCoach?.[clubId] ?? ''];
export const unemployedCoaches = (g: GameState) => Object.values(g.aiCoaches ?? {}).filter((c) => c.clubId === null);

function newCoach(g: GameState, rng: Rng, rep: number, clubId: string | null): AiCoach {
  const used = new Set(Object.values(g.aiCoaches ?? {}).map((c) => c.name));
  const age = 38 + Math.floor(rng() * 24);
  const r = clamp(Math.round(rep), 1, 5);
  return { id: `ac-${hashString(`${g.seed}:${used.size}:${rng()}`).toString(36)}`, name: randomName(rng, used), age, rep: r, merit: Math.round((r - 3) + (rng() - 0.5) * 2), exp: Math.max(0, Math.round((age - 36) / 3 + (rng() - 0.5) * 3)), clubId, since: { season: g.season, round: g.round }, past: [] };
}

/** Garante um treinador em cada clube da IA e uma fila de desempregados. Idempotente. */
export function ensureAiCoaches(g: GameState): GameState {
  const rng = makeRng(g.seed * 41 + g.season * 13 + g.round + 7);
  let coaches = { ...(g.aiCoaches ?? {}) };
  const club = { ...(g.clubCoach ?? {}) };
  let changed = !g.aiCoaches;
  const mk = (rep: number, clubId: string | null) => { const c = newCoach({ ...g, aiCoaches: coaches }, rng, rep, clubId); coaches[c.id] = c; changed = true; return c; };
  for (const id of aiClubs(g)) {
    const cur = coaches[club[id]];
    if (cur && cur.clubId === id) continue;
    const info = g.clubs[id];
    if (!info) continue;
    const rep = info.reputation + (rng() < 0.3 ? 1 : rng() < 0.4 ? -1 : 0);
    club[id] = mk(rep, id).id;
  }
  // o clube que o jogador comanda não tem treinador da IA: quem estava lá fica livre
  for (const c of Object.values(coaches)) if (c.clubId && managed(g, c.clubId)) { coaches[c.id] = { ...c, clubId: null, past: [...c.past, { clubId: c.clubId, fromSeason: c.since.season, toSeason: g.season, ended: 'substituído' }] }; delete club[c.clubId]; changed = true; }
  const free = Object.values(coaches).filter((c) => c.clubId === null).length;
  const need = Math.max(POOL_MIN, Math.round(aiClubs(g).length / 7));
  for (let i = free; i < need; i++) mk(1 + Math.floor(rng() * 4) + (rng() < 0.2 ? 1 : 0), null);
  return changed ? { ...g, aiCoaches: coaches, clubCoach: club } : g;
}

/** Posição e metas do clube. null para clubes que não disputam pontos corridos agora (Série D em grupos). */
function standing(g: GameState, clubId: string) {
  const d = divOf(g, clubId);
  if (!d || d.format === 'groups' || d.clubIds.length < 8) return null;
  const rows = computeTable(d.clubIds.map((id) => ({ id, name: g.clubs[id].name })), g.results.filter((r) => r.divisionId === d.id));
  const n = rows.length;
  const pos = rows.findIndex((r) => r.clubId === clubId) + 1;
  const played = rows[pos - 1]?.played ?? 0;
  const relegN = Math.max(2, Math.round(n * 0.2));
  const qual = [...d.clubIds].sort((a, b) => avgXI(g.teams[b]) - avgXI(g.teams[a])).indexOf(clubId) + 1; // posição "esperada" pela qualidade do elenco
  const exp = g.clubs[clubId].boardExpectation;
  const target = exp === 'title' ? 2 : exp === 'top4' ? 4 : exp === 'mid' ? Math.ceil(n / 2) : n - relegN;
  // últimos 5 jogos
  const mine = g.results.filter((r) => r.divisionId === d.id && (r.homeId === clubId || r.awayId === clubId)).sort((a, b) => b.round - a.round).slice(0, 5);
  const pts = mine.reduce((t, r) => { const gf = r.homeId === clubId ? r.homeGoals : r.awayGoals, ga = r.homeId === clubId ? r.awayGoals : r.homeGoals; return t + (gf > ga ? 3 : gf === ga ? 1 : 0); }, 0);
  const form = mine.length ? pts / (mine.length * 3) : 0.5;
  return { n, pos, played, relegN, qual, exp, target, form, games: mine.length, table: rows };
}

export interface Pressure { score: number; why: string[] }

/**
 * Pressão sobre o treinador (quanto maior, mais perto da demissão). Soma: ficar abaixo da meta, render menos que o elenco permite,
 * fase ruim e zona de rebaixamento. Abate: pouco tempo de casa, reputação/mérito do treinador e brigar dentro da meta (ex.: acesso).
 */
export function coachPressure(g: GameState, clubId: string, final = false): Pressure {
  const c = coachOf(g, clubId), st = standing(g, clubId);
  if (!c || !st) return { score: 0, why: [] };
  const why: string[] = [];
  let score = 0;
  const short = Math.max(0, st.pos - st.target);
  score += Math.min(short, 10) * 1.1; if (short >= 4) why.push('longe da meta da diretoria');
  const under = Math.max(0, st.pos - st.qual);
  score += Math.min(under, 10) * 0.9; if (under >= 5) why.push('rendendo abaixo do elenco');
  const inZone = st.pos > st.n - st.relegN, near = st.pos > st.n - st.relegN - 3;
  if (inZone) { score += 3; why.push('na zona de rebaixamento'); } else if (near) score += 1.5;
  if (st.games >= 4 && st.form < 0.34) { score += (0.34 - st.form) * 18; why.push('sequência de maus resultados'); }
  // proteções
  const tenure = absRound(g, g.season, g.round) - absRound(g, c.since.season, c.since.round);
  if (!final && tenure < MIN_TENURE_ROUNDS) score -= 12;
  else if (tenure < 16) score -= 3;
  score -= (c.rep - 2) * 0.8 + Math.max(0, c.merit) * 0.5;
  if (st.pos <= st.target) score = Math.min(score, 3); // brigando dentro da meta (acesso, título): a diretoria segura o treinador
  if (!final && st.played < 6) score = Math.min(score, 3);
  if (final && st.pos > st.n - st.relegN && st.exp !== 'survive') { score += 5; why.push('rebaixamento'); }
  return { score, why };
}

/** Clubes que o treinador já deixou (ou onde foi demitido) há pouco: não são recontratados. */
const wasThereRecently = (g: GameState, c: AiCoach, clubId: string) => c.past.some((p) => p.clubId === clubId && g.season - p.toSeason <= 3);
/** Passagens curtas demais seguidas: evita o treinador que roda de clube em clube. */
const churn = (g: GameState, c: AiCoach) => c.past.filter((p) => g.season - p.toSeason <= 2).length;

/** Escolhe o treinador desempregado mais compatível com o clube (reputação do clube e objetivo). Cria um novo se ninguém serve. */
function pickCoach(g: GameState, clubId: string, rng: Rng): { g: GameState; coach: AiCoach } {
  const info = g.clubs[clubId];
  const target = clamp(info.reputation + (info.boardExpectation === 'title' ? 0.5 : info.boardExpectation === 'survive' ? -0.5 : 0), 1, 5);
  const pool = unemployedCoaches(g).filter((c) => !wasThereRecently(g, c, clubId) && churn(g, c) < 3 && Math.abs(c.rep - target) <= 1.6);
  if (pool.length) {
    const scored = pool.map((c) => ({ c, s: -Math.abs(c.rep - target) * 2 + c.merit * 0.25 + c.exp * 0.05 - churn(g, c) * 0.8 + rng() * 1.2 }));
    return { g, coach: scored.sort((a, b) => b.s - a.s)[0].c };
  }
  const c = newCoach(g, rng, target, null);
  return { g: { ...g, aiCoaches: { ...(g.aiCoaches ?? {}), [c.id]: c } }, coach: c };
}

function assign(g: GameState, clubId: string, coachId: string): GameState {
  const c = g.aiCoaches![coachId];
  return { ...g, aiCoaches: { ...g.aiCoaches!, [coachId]: { ...c, clubId, since: { season: g.season, round: g.round } } }, clubCoach: { ...(g.clubCoach ?? {}), [clubId]: coachId } };
}
function release(g: GameState, clubId: string, ended: 'demitido' | 'saiu' | 'substituído'): GameState {
  const c = coachOf(g, clubId);
  if (!c) return g;
  const club = { ...(g.clubCoach ?? {}) }; delete club[clubId];
  return { ...g, clubCoach: club, aiCoaches: { ...g.aiCoaches!, [c.id]: { ...c, clubId: null, merit: ended === 'demitido' ? c.merit - 1 : c.merit, past: [...c.past, { clubId, fromSeason: c.since.season, toSeason: g.season, ended }].slice(-8) } } };
}

/** Demite o treinador do clube e contrata outro da fila de desempregados. */
export function replaceCoach(g: GameState, clubId: string, rng: Rng, ended: 'demitido' | 'saiu' = 'demitido', reason = ''): GameState {
  let s = ensureAiCoaches(g);
  const old = coachOf(s, clubId);
  s = release(s, clubId, ended);
  const pick = pickCoach(s, clubId, rng);
  s = assign(pick.g, clubId, pick.coach.id);
  const name = s.clubs[clubId].name;
  const text = old
    ? ended === 'demitido' ? `🪓 ${name} demite ${old.name}${reason ? ` (${reason})` : ''} e anuncia ${pick.coach.name}.` : `🔄 ${name} perde ${old.name} e anuncia ${pick.coach.name}.`
    : `🧢 ${name} anuncia ${pick.coach.name} como treinador.`;
  return news(s, text);
}

/** Quantas trocas por avaliação, no máximo (evita onda de demissões). */
export const maxFirings = (g: GameState, final: boolean) => Math.max(1, Math.ceil(aiClubs(g).length * (final ? 0.1 : 0.03)));

/** Avaliação no meio da temporada: a diretoria demite só em situação justificável, no máximo algumas por avaliação. */
export function aiCoachTick(g: GameState, rng: Rng): GameState {
  let s = ensureAiCoaches(g);
  const cands = aiClubs(s).map((id) => ({ id, p: coachPressure(s, id) })).filter((x) => x.p.score >= FIRE_AT).sort((a, b) => b.p.score - a.p.score);
  let fired = 0;
  const cap = maxFirings(s, false);
  for (const x of cands) {
    if (fired >= cap) break;
    const c = coachOf(s, x.id);
    if (!c) continue;
    s = replaceCoach(s, x.id, rng, 'demitido', x.p.why.slice(0, 2).join(' e '));
    fired++;
  }
  return s;
}

/**
 * Fim da temporada (chamado com a temporada que acabou em `done`, e o estado da nova em `next`): atualiza mérito de todos,
 * demite quem fracassou, e alguns treinadores de sucesso aceitam clubes maiores (o clube de origem contrata outro).
 */
export function aiCoachSeasonEnd(done: GameState, next: GameState, rng: Rng): GameState {
  let s = ensureAiCoaches(next);
  // mérito conforme o resultado final
  const finals = new Map<string, ReturnType<typeof standing>>();
  for (const id of aiClubs(done)) finals.set(id, standing({ ...done, aiCoaches: s.aiCoaches, clubCoach: s.clubCoach }, id));
  const coaches = { ...s.aiCoaches! };
  for (const [id, st] of finals) {
    const c = coachOf(s, id);
    if (!c || !st) continue;
    const d = st.pos === 1 ? 3 : st.pos <= st.target ? 1 : st.pos > st.n - st.relegN ? -3 : st.pos > st.target + 4 ? -1 : 0;
    coaches[c.id] = { ...coaches[c.id], merit: clamp(c.merit + d, -6, 12), exp: c.exp + 1, age: c.age + 1 };
  }
  for (const c of Object.values(coaches)) if (c.clubId === null) coaches[c.id] = { ...c, age: c.age + 1 };
  s = { ...s, aiCoaches: coaches };
  // demissões do fim de temporada (com a pressão calculada sobre a tabela final)
  const view = { ...done, aiCoaches: s.aiCoaches, clubCoach: s.clubCoach };
  const cands = aiClubs(done).map((id) => ({ id, p: coachPressure(view, id, true) })).filter((x) => x.p.score >= FIRE_AT_END).sort((a, b) => b.p.score - a.p.score);
  const cap = maxFirings(s, true);
  let fired = 0;
  for (const x of cands) { if (fired >= cap) break; s = replaceCoach(s, x.id, rng, 'demitido', x.p.why.slice(0, 2).join(' e ')); fired++; }
  // aposentadorias
  for (const c of Object.values(s.aiCoaches!)) {
    if (c.age < RETIRE_AGE) continue;
    if (c.clubId) s = replaceCoach(s, c.clubId, rng, 'saiu');
    const rest = { ...s.aiCoaches! }; delete rest[c.id]; s = { ...s, aiCoaches: rest };
  }
  // treinadores de sucesso são contratados por clubes maiores (no máximo 3 por temporada)
  let poached = 0;
  const order = aiClubs(s).sort((a, b) => s.clubs[b].reputation - s.clubs[a].reputation);
  for (const big of order) {
    if (poached >= 3) break;
    const mine = coachOf(s, big);
    if (!mine) continue;
    const cand = Object.values(s.aiCoaches!).filter((c) => c.clubId && c.clubId !== big && !managed(s, c.clubId) && s.clubs[c.clubId].reputation < s.clubs[big].reputation && c.rep >= s.clubs[big].reputation - 1 && c.merit >= mine.merit + 3 && s.season - c.since.season >= 1 && !wasThereRecently(s, c, big) && churn(s, c) < 3).sort((a, b) => b.merit - a.merit)[0];
    if (!cand || rng() > 0.4) continue;
    const from = cand.clubId!;
    s = release(s, big, 'substituído');
    s = release(s, from, 'saiu');
    s = assign(s, big, cand.id);
    s = news(s, `🤝 ${s.clubs[big].name} anuncia ${cand.name}, que deixa o ${s.clubs[from].name}.`);
    const hire = pickCoach(s, from, rng);
    s = assign(hire.g, from, hire.coach.id);
    s = news(s, `🧢 ${s.clubs[from].name} anuncia ${hire.coach.name} para o lugar de ${cand.name}.`);
    poached++;
  }
  return ensureAiCoaches(s);
}

/** O jogador assume um clube: o treinador da IA que estava lá fica livre. */
export function coachLeaves(g: GameState, clubId: string): GameState {
  if (!g.clubCoach?.[clubId]) return g;
  return release(g, clubId, 'substituído');
}
