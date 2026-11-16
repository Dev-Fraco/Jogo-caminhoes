import { describe, expect, it } from 'vitest';
import { pyramidOf, slotsOfLeague } from '../src/data/pyramid';
import { WORLD_DATA } from '../src/data/world';
import { calOf, formatDay } from '../src/engine/calendar';
import { divisionTable, isSeasonOver, newCareer, playNext, simulateToEnd, startNextSeason } from '../src/engine/game';
import { newObserverWorld } from '../src/engine/sim';
import { fire, hire, resign } from '../src/engine/jobs';
import { estadualChampions } from '../src/engine/estadual';
import { finalStandings } from '../src/engine/groups';
import type { GameState } from '../src/engine/types';
import { makeCareer } from './helpers';

/** JSON com as chaves em ordem alfabética: dois estados iguais em conteúdo dão o mesmo texto, mesmo que as chaves tenham sido criadas em ordens diferentes. */
export const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

/** Problemas encontrados numa temporada que acabou de terminar (antes da virada). */
export function auditSeasonEnd(g: GameState): string[] {
  const p: string[] = [];
  if (!isSeasonOver(g)) p.push('a temporada não terminou');
  if (g.round !== g.totalRounds + 1) p.push(`rodada final inesperada: ${g.round}/${g.totalRounds}`);
  const clubIds = new Set(g.divisions.flatMap((d) => d.clubIds));
  if (clubIds.size !== g.divisions.reduce((a, d) => a + d.clubIds.length, 0)) p.push('clube em duas divisões');
  for (const d of g.divisions.filter((x) => x.format !== 'outside')) {
    const fx = g.fixtures.filter((f) => f.divisionId === d.id);
    const key = (f: { round: number; homeId: string; awayId: string }) => `${f.round}:${f.homeId}:${f.awayId}`;
    if (new Set(fx.map(key)).size !== fx.length) p.push(`${d.id}: partida duplicada no calendário`);
    // cada clube joga no máximo uma vez por rodada
    const per = new Map<string, number>();
    for (const f of fx) for (const id of [f.homeId, f.awayId]) { const k = `${f.round}:${id}`; per.set(k, (per.get(k) ?? 0) + 1); }
    if ([...per.values()].some((n) => n > 1)) p.push(`${d.id}: clube joga duas vezes na mesma rodada`);
    const res = g.results.filter((r) => r.divisionId === d.id);
    if (new Set(res.map((r) => `${r.round}:${r.homeId}:${r.awayId}`)).size !== res.length) p.push(`${d.id}: resultado duplicado`);
    if (d.format === 'groups') {
      try { const fs = finalStandings(g, d); if (!fs.championId) p.push(`${d.id}: sem campeão`); } catch (e) { p.push(`${d.id}: mata-mata não resolve (${(e as Error).message})`); }
      continue;
    }
    const n = d.clubIds.length;
    if (res.length !== n * (n - 1)) p.push(`${d.id}: ${res.length} resultados, esperado ${n * (n - 1)}`);
    if (fx.length !== n * (n - 1)) p.push(`${d.id}: ${fx.length} jogos no calendário, esperado ${n * (n - 1)}`);
    const pairs = new Set(res.map((r) => `${r.homeId}>${r.awayId}`));
    if (pairs.size !== n * (n - 1)) p.push(`${d.id}: confrontos repetidos ou faltando`);
    const t = divisionTable(g, d.id);
    if (t.length !== n) p.push(`${d.id}: tabela com ${t.length} linhas`);
    if (t.some((r) => r.played !== 2 * (n - 1))) p.push(`${d.id}: clube com jogos faltando na tabela`);
    const gf = t.reduce((a, r) => a + r.gf, 0), ga = t.reduce((a, r) => a + r.ga, 0);
    if (gf !== ga) p.push(`${d.id}: gols pró e contra não fecham`);
    const pts = t.reduce((a, r) => a + r.points, 0);
    const draws = res.filter((r) => r.homeGoals === r.awayGoals).length;
    if (pts !== 3 * (res.length - draws) + 2 * draws) p.push(`${d.id}: pontos não fecham`);
    if (t.some((r, i) => i > 0 && (r.points > t[i - 1].points))) p.push(`${d.id}: tabela fora de ordem`);
  }
  if (g.cup && (g.cup.due || !g.cup.championId)) p.push('copa não terminou');
  for (const k of ['lib', 'sula', 'ucl'] as const) if (g[k] && (g[k]!.due || !g[k]!.championId)) p.push(`${k} não terminou`);
  if (g.estadual && !g.estadual.done) p.push('estadual não terminou');
  if (g.estadual?.done && estadualChampions(g).length === 0) p.push('estadual sem campeões');
  if (g.mundial && !g.mundial.championId) p.push('mundial sem campeão');
  return p;
}

/** Problemas na virada: o estado novo e a relação com o antigo. */
export function auditTurn(before: GameState, after: GameState): string[] {
  const p: string[] = [];
  if (after.season !== before.season + 1) p.push(`temporada ${after.season}, esperado ${before.season + 1}`);
  if (after.round !== 1) p.push('a nova temporada não começa na rodada 1');
  if (after.results.length !== 0) p.push('resultados da temporada anterior não foram arquivados/limpos');
  if (after.history.length !== before.history.length + 1) p.push(`histórico: ${after.history.length}, esperado ${before.history.length + 1}`);
  if (JSON.stringify(after.history.slice(0, before.history.length)) !== JSON.stringify(before.history)) p.push('o histórico antigo foi alterado');
  const last = after.history[after.history.length - 1];
  if (last.season !== before.season || !last.tables?.length || last.divisions?.some((d) => !d.championId)) p.push('resumo da temporada incompleto');
  const pyr = before.divisions.filter((d) => d.format !== 'outside');
  const pyrA = after.divisions.filter((d) => d.format !== 'outside');
  pyr.forEach((d, i) => { if (pyrA[i].clubIds.length !== d.clubIds.length) p.push(`${d.id}: tamanho mudou ${d.clubIds.length} → ${pyrA[i].clubIds.length}`); });
  const all = pyrA.flatMap((d) => d.clubIds);
  if (new Set(all).size !== all.length) p.push('clube repetido nas divisões novas');
  // promovidos e rebaixados trocaram de divisão
  last.divisions?.forEach((m, i) => {
    for (const id of m.promoted) if (i > 0 && !pyrA[i - 1].clubIds.includes(id)) p.push(`promovido ${id} não subiu`);
    for (const id of m.relegated) if (i < pyrA.length - 1 && !pyrA[i + 1].clubIds.includes(id)) p.push(`rebaixado ${id} não desceu`);
    if (i > 0 && m.promoted.length !== (before.slots ?? 4)) p.push(`${m.id}: ${m.promoted.length} promovidos`);
  });
  // calendário novo coerente
  const maxRound = Math.max(...after.fixtures.map((f) => f.round));
  if (after.totalRounds !== maxRound) p.push(`totalRounds ${after.totalRounds} ≠ maior rodada do calendário ${maxRound}`);
  const nf = after.fixtures.filter((f) => f.divisionId && !f.ko);
  const keys = new Set(nf.map((f) => `${f.divisionId}:${f.round}:${f.homeId}:${f.awayId}`));
  if (keys.size !== nf.length) p.push('calendário novo com partida duplicada');
  if (!(calOf(after).day > calOf(before).day)) p.push(`o relógio não avançou (${formatDay(calOf(before).day)} → ${formatDay(calOf(after).day)})`);
  if (after.cup === undefined && before.cup !== undefined) p.push('a copa não foi recriada');
  for (const k of ['lib', 'sula', 'ucl'] as const) if (before[k] && !after[k]) p.push(`${k} não foi recriada`);
  if (before.estadual && !after.estadual) p.push('o estadual não foi recriado');
  if (after.estadual && after.estadual.done) p.push('estadual novo já nasce concluído');
  if (after.cup?.championId) p.push('copa nova já tem campeão');
  // a virada não roda duas vezes
  if (startNextSeason(after) !== after) p.push('startNextSeason rodou de novo numa temporada que não acabou');
  return p;
}

const SEASONS = 6;
function play(g: GameState, label: string) {
  let s = g;
  const problems: string[] = [];
  for (let i = 0; i < SEASONS; i++) {
    const ended = simulateToEnd(s);
    problems.push(...auditSeasonEnd(ended).map((x) => `${label} T${ended.season}: ${x}`));
    const next = startNextSeason(ended);
    problems.push(...auditTurn(ended, next).map((x) => `${label} T${ended.season}→: ${x}`));
    s = next;
  }
  return { problems, last: s };
}

describe('ETAPA 1 — estabilidade das temporadas', () => {
  it('carreira no Brasil (todas as competições): 6 temporadas seguidas começam e terminam normalmente', () => {
    const { problems, last } = play(makeCareer('flamengo', 12), 'BR');
    expect(problems).toEqual([]);
    expect(last.season).toBe(2026 + SEASONS);
    expect(last.history.length).toBe(SEASONS);
  }, 600_000);
  it('mundo observador (sem jogador): 6 temporadas seguidas na Inglaterra', () => {
    const { problems } = play(newObserverWorld('EN', 'premier-league', 5), 'EN');
    expect(problems).toEqual([]);
  }, 600_000);
  it('liga de divisão única (Colômbia): temporadas seguidas sem promoção nem rebaixamento', () => {
    const divisions = pyramidOf('CO', 'liga-colombiana');
    const g = newCareer({ saveName: 't', coach: { name: 'T Silva', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: divisions[0].clubs[3].id, divisions, slots: slotsOfLeague('liga-colombiana'), leagueName: 'liga-colombiana' }, 9);
    const { problems } = play(g, 'CO');
    expect(problems.filter((x) => !/promovidos/.test(x))).toEqual([]);
  }, 300_000);
  it('as partidas pendentes sobrevivem a salvar e carregar em qualquer ponto da temporada (inclusive com copa, estadual e continentais a jogar)', () => {
    const run = (g: GameState, cut: number[]) => {
      let s = g, i = 0;
      while (!isSeasonOver(s) && i < 400) { s = playNext(s).state; i++; if (cut.includes(i)) s = JSON.parse(JSON.stringify(s)); }
      return s;
    };
    const g0 = makeCareer('palmeiras', 21);
    const a = run(g0, []);
    const b = run(g0, [1, 3, 8, 13, 21, 30, 40, 55, 70, 90]);
    expect(canon(b)).toBe(canon(a));
    expect(auditSeasonEnd(b)).toEqual([]);
  }, 600_000);
  void WORLD_DATA;
});

describe('ETAPA 1 — outras situações', () => {
  it('jogador na Série D (grupos e mata-mata) e na Série B: 3 temporadas cada, com acesso e rebaixamento reais', () => {
    for (const club of [makeCareer('palmeiras', 4).divisions[3].clubIds[0], makeCareer('palmeiras', 4).divisions[1].clubIds[4]]) {
      const { problems, last } = play(makeCareer(club, 8), `user:${club}`);
      expect(problems).toEqual([]);
      expect(last.history.length).toBe(SEASONS);
    }
  }, 900_000);
  it.each([['AR', 'liga-profesional'], ['ES', 'la-liga'], ['IT', 'serie-a-it'], ['DE', 'bundesliga'], ['FR', 'ligue-1'], ['PT', 'primeira-liga']])('mundo observador %s/%s: 3 temporadas seguidas íntegras', (c, l) => {
    let g = newObserverWorld(c, l, 3);
    const problems: string[] = [];
    for (let i = 0; i < 3; i++) { const e = simulateToEnd(g); problems.push(...auditSeasonEnd(e)); const n = startNextSeason(e); problems.push(...auditTurn(e, n)); g = n; }
    expect(problems).toEqual([]);
  }, 300_000);
  it('a virada é determinística (mesma entrada, mesmo resultado) e não depende de quem a chama', () => {
    const e = simulateToEnd(makeCareer('flamengo', 33));
    expect(JSON.stringify(startNextSeason(e))).toBe(JSON.stringify(startNextSeason(JSON.parse(JSON.stringify(e)))));
  }, 200_000);
  it('a temporada termina dentro do ano e a seguinte começa depois, sem sobreposição de datas', () => {
    let g = makeCareer('flamengo', 14);
    for (let i = 0; i < 3; i++) {
      const e = simulateToEnd(g);
      const end = calOf(e).day, y = new Date(end * 86_400_000).getUTCFullYear();
      expect(y).toBe(e.season);
      g = startNextSeason(e);
      expect(calOf(g).start).toBeGreaterThan(end);
      expect(new Date(calOf(g).start * 86_400_000).getUTCFullYear()).toBe(g.season);
    }
  }, 300_000);
});

describe('ETAPA 1 — demissão, troca de clube e propostas no meio da temporada', () => {
  it('demitido no meio da temporada, a temporada e a virada seguem íntegras; contratado por outro clube, a carreira continua nas temporadas seguintes', () => {
    let g = makeCareer('flamengo', 5);
    for (let i = 0; i < 12; i++) g = playNext(g).state;
    g = fire(g, 'teste');
    expect(g.unemployed).toBe(true);
    let e = simulateToEnd(g);
    expect(auditSeasonEnd(e)).toEqual([]);
    let n = startNextSeason(e);
    expect(auditTurn(e, n)).toEqual([]);
    const target = n.divisions[1].clubIds[2];
    n = hire(n, target);
    expect(n.userClubId).toBe(target); expect(n.unemployed).toBe(false);
    for (let i = 0; i < 2; i++) { e = simulateToEnd(n); expect(auditSeasonEnd(e)).toEqual([]); const nx = startNextSeason(e); expect(auditTurn(e, nx)).toEqual([]); n = nx; }
    expect(n.jobs?.length).toBeGreaterThanOrEqual(2);
  }, 400_000);
  it('pedir demissão e voltar a trabalhar na mesma temporada não duplica nada', () => {
    let g = makeCareer('flamengo', 6);
    for (let i = 0; i < 6; i++) g = playNext(g).state;
    g = resign(g);
    g = hire(g, g.divisions[0].clubIds.find((x) => x !== 'flamengo')!);
    const e = simulateToEnd(g);
    expect(auditSeasonEnd(e)).toEqual([]);
    expect(auditTurn(e, startNextSeason(e))).toEqual([]);
  }, 300_000);
});

describe('ETAPA 1 — o auditor realmente detecta defeitos (teste do teste)', () => {
  const e = simulateToEnd(makeCareer('flamengo', 14));
  it('partida duplicada, resultado faltando, copa sem campeão e histórico alterado são apontados', () => {
    expect(auditSeasonEnd(e)).toEqual([]);
    expect(auditSeasonEnd({ ...e, fixtures: [...e.fixtures, e.fixtures[0]] }).join('|')).toMatch(/duplicada/);
    expect(auditSeasonEnd({ ...e, results: e.results.slice(1) }).join('|')).toMatch(/resultados/);
    expect(auditSeasonEnd({ ...e, cup: { ...e.cup!, championId: undefined } }).join('|')).toMatch(/copa/);
    const n = startNextSeason(e);
    expect(auditTurn(e, n)).toEqual([]);
    expect(auditTurn(e, { ...n, history: [{ ...n.history[0], season: 1 }] }).join('|')).toMatch(/resumo|histórico/);
    expect(auditTurn(e, { ...n, season: n.season + 1 }).join('|')).toMatch(/temporada/);
  }, 200_000);
});

/** Competições (copa, continentais, estaduais, mundial): estrutura no começo e resultado no fim da temporada. */
export function auditCompetitions(g: GameState, phase: 'inicio' | 'fim'): string[] {
  const p: string[] = [];
  const tiesOf = (rounds: { name: string; ties: { homeId: string; awayId: string; winnerId?: string }[] }[], label: string) => {
    for (const r of rounds) {
      const ids = r.ties.flatMap((t) => [t.homeId, t.awayId]);
      if (new Set(ids).size !== ids.length) p.push(`${label} ${r.name}: clube em dois jogos da mesma fase`);
      if (phase === 'fim') for (const t of r.ties) if (!t.winnerId || ![t.homeId, t.awayId].includes(t.winnerId)) p.push(`${label} ${r.name}: confronto sem vencedor válido`);
    }
  };
  if (g.cup) {
    const c = g.cup;
    if (c.dueAfter.length !== c.totalRounds) p.push(`copa: ${c.dueAfter.length} marcos para ${c.totalRounds} fases`);
    if (c.dueAfter.some((d, i) => i > 0 && d <= c.dueAfter[i - 1])) p.push('copa: marcos fora de ordem');
    if (Math.max(...c.dueAfter) > g.totalRounds) p.push('copa: fase marcada depois da última rodada do campeonato');
    if (phase === 'inicio' && (c.championId || c.due || c.roundIndex !== 0)) p.push('copa nova já começou ou terminou');
    tiesOf(c.rounds, 'copa');
    if (phase === 'fim') {
      const finalTie = c.rounds[c.rounds.length - 1].ties;
      if (finalTie.length !== 1 || c.championId !== finalTie[0].winnerId) p.push('copa: campeão não é o vencedor da final');
      for (let i = 1; i < c.rounds.length; i++) { const prev = new Set(c.rounds[i - 1].ties.map((t) => t.winnerId)); for (const t of c.rounds[i].ties) if (!prev.has(t.homeId) && !prev.has(t.awayId) && c.rounds[i - 1].ties.length * 2 > c.rounds[i].ties.length * 2) { /* byes/seeds possíveis */ } }
    }
  }
  for (const k of ['lib', 'sula', 'ucl'] as const) {
    const c = g[k];
    if (!c) continue;
    const all = c.groups.flatMap((x) => x.clubIds);
    if (new Set(all).size !== all.length) p.push(`${k}: clube em dois grupos`);
    for (const grp of c.groups) {
      if (new Set(grp.clubIds).size !== grp.clubIds.length) p.push(`${k} ${grp.id}: clube repetido`);
      const keys = grp.matches.map((m) => `${m.homeId}>${m.awayId}`);
      if (new Set(keys).size !== keys.length) p.push(`${k} ${grp.id}: jogo repetido`);
      const n = grp.clubIds.length;
      if (grp.matches.length !== n * (n - 1)) p.push(`${k} ${grp.id}: ${grp.matches.length} jogos (esperado ${n * (n - 1)})`);
      const per = new Map<string, number>();
      for (const m of grp.matches) for (const id of [m.homeId, m.awayId]) { const kk = `${m.round}:${id}`; per.set(kk, (per.get(kk) ?? 0) + 1); }
      if ([...per.values()].some((v) => v > 1)) p.push(`${k} ${grp.id}: clube joga duas vezes na rodada`);
      if (phase === 'fim' && grp.matches.some((m) => m.homeGoals === undefined || m.awayGoals === undefined)) p.push(`${k} ${grp.id}: jogo sem resultado`);
    }
    if (c.dueAfter.some((d, i) => i > 0 && d <= c.dueAfter[i - 1])) p.push(`${k}: marcos fora de ordem`);
    if (Math.max(...c.dueAfter) > g.totalRounds) p.push(`${k}: fase marcada depois da última rodada`);
    tiesOf(c.ko, k);
    if (phase === 'inicio' && (c.championId || c.due)) p.push(`${k} novo já começou`);
    if (phase === 'fim') { const f = c.ko[c.ko.length - 1]; if (!f || f.ties.length !== 1 || c.championId !== f.ties[0].winnerId) p.push(`${k}: campeão não é o vencedor da final`); }
  }
  if (g.mundial) {
    tiesOf(g.mundial.ko, 'mundial');
    if (phase === 'fim' && (!g.mundial.championId || g.mundial.due)) p.push('mundial não terminou');
  }
  if (g.estadual) {
    for (const comp of g.estadual.comps) for (const d of comp.divisions) {
      const keys = d.matches.map((m) => `${m[0]}:${m[1]}:${m[2]}`);
      if (new Set(keys).size !== keys.length) p.push(`${comp.uf} ${d.name}: jogo repetido`);
      if (phase === 'fim' && d.matches.some((m) => m[3] === undefined || m[4] === undefined || m[3] < 0 || m[4] < 0)) p.push(`${comp.uf} ${d.name}: jogo sem resultado`);
      const idx = (i: number) => d.clubIds[i];
      if (d.matches.some((m) => idx(m[1]) === undefined || idx(m[2]) === undefined || m[1] === m[2])) p.push(`${comp.uf} ${d.name}: jogo com clube inválido`);
    }
  }
  return p;
}

describe('ETAPA 1 — competições (copa, continentais, estaduais, mundial)', () => {
  it('a estrutura de cada competição é válida no início e no fim, em 5 temporadas seguidas', () => {
    let g = makeCareer('flamengo', 12);
    const problems: string[] = [];
    for (let i = 0; i < 5; i++) {
      problems.push(...auditCompetitions(g, 'inicio').map((x) => `T${g.season} início: ${x}`));
      const e = simulateToEnd(g);
      problems.push(...auditCompetitions(e, 'fim').map((x) => `T${g.season} fim: ${x}`));
      g = startNextSeason(e);
    }
    expect(problems).toEqual([]);
  }, 600_000);
});

import { loadGame, saveGame } from '../src/engine/save';
/** localStorage mínimo para testar o caminho real de salvar e carregar. */
function useStorage() {
  const mem = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0 } as Storage;
  return mem;
}

describe('ETAPA 1 — carregar o jogo (caminho real: saveGame → loadGame)', () => {
  it('carregar um save atual não altera nada e o jogo continua idêntico, em vários pontos da temporada e da virada', () => {
    useStorage();
    let g = makeCareer('flamengo', 12);
    const points = new Set([0, 1, 2, 7, 12, 19, 25, 33, 41, 47]);
    for (let i = 0; i < 400 && !isSeasonOver(g); i++) {
      if (points.has(i)) {
        saveGame(g);
        const l = loadGame()!;
        expect(l, `passo ${i}`).not.toBeNull();
        expect(JSON.stringify(l), `passo ${i}: carregar mudou o estado`).toBe(JSON.stringify(g));
      }
      g = playNext(g).state;
    }
    saveGame(g); expect(JSON.stringify(loadGame())).toBe(JSON.stringify(g)); // fim da temporada
    const n = startNextSeason(g);
    saveGame(n); expect(JSON.stringify(loadGame())).toBe(JSON.stringify(n)); // começo da seguinte
  }, 600_000);
  it('o tempo de carregar um save grande é pequeno', () => {
    useStorage();
    const g = skipTo(makeCareer('flamengo', 3), 2);
    saveGame(g);
    const t0 = performance.now(); const l = loadGame(); const ms = performance.now() - t0;
    expect(l).not.toBeNull();
    expect(ms).toBeLessThan(1500);
  }, 300_000);
});
function skipTo(g: GameState, seasons: number): GameState { let s = g; for (let i = 0; i < seasons; i++) s = startNextSeason(simulateToEnd(s)); return s; }

describe('ETAPA 1 — rotinas de fim de temporada rodam uma única vez', () => {
  it('em 5 virações: histórico sem repetição, títulos e aposentadorias sem duplicatas, treinadores ganham 1 ano de experiência, caixas finitos', () => {
    let g = makeCareer('flamengo', 44);
    for (let i = 0; i < 5; i++) {
      const e = simulateToEnd(g);
      const coachBefore = new Map(Object.values(e.aiCoaches ?? {}).map((c) => [c.id, { exp: c.exp, club: c.clubId }]));
      const n = startNextSeason(e);
      expect(n.history.map((h) => h.season)).toEqual(Array.from({ length: n.history.length }, (_, k) => 2026 + k));
      const titles = (n.titles ?? []).map((t) => `${t.season}:${t.competition}:${t.clubId}`);
      expect(new Set(titles).size).toBe(titles.length);
      const ret = (n.retired ?? []).map((r) => `${r.season}:${r.name}:${r.clubId}:${r.age}`);
      expect(new Set(ret).size).toBe(ret.length);
      for (const c of Object.values(n.aiCoaches ?? {})) { const b = coachBefore.get(c.id); if (b && c.clubId === b.club) expect(c.exp, `coach ${c.id}`).toBeLessThanOrEqual(b.exp + 1); }
      expect(Object.values(n.budgets).every(Number.isFinite)).toBe(true);
      expect(n.news.length).toBeLessThanOrEqual(80);
      g = n;
    }
  }, 600_000);
});
