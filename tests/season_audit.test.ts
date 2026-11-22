import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { serieDFlow } from '../src/engine/phases';
import { serieDQualifiers } from '../src/engine/estadual';
import { describe, expect, it } from 'vitest';
import { pyramidOf, slotsOfLeague } from '../src/data/pyramid';
import { WORLD_DATA } from '../src/data/world';
import { calOf, formatDay } from '../src/engine/calendar';
import { divisionTable, isSeasonOver, newCareer, playNext, simulateToEnd } from '../src/engine/game';
import { newObserverWorld } from '../src/engine/sim';
import { fire, hire, resign } from '../src/engine/jobs';
import { estadualChampions } from '../src/engine/estadual';
import { finalStandings } from '../src/engine/groups';
import type { GameState } from '../src/engine/types';
import { makeCareer } from './helpers';
import { auditCompetitions, auditSeasonEnd } from './audit_lib';

/** JSON com as chaves em ordem alfabética: dois estados iguais em conteúdo dão o mesmo texto, mesmo que as chaves tenham sido criadas em ordens diferentes. */
export const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));


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
  pyr.forEach((d, i) => { if (d.id !== 'serie-c' && pyrA[i].clubIds.length !== d.clubIds.length) p.push(`${d.id}: tamanho mudou ${d.clubIds.length} → ${pyrA[i].clubIds.length}`); });
  const all = pyrA.flatMap((d) => d.clubIds);
  if (new Set(all).size !== all.length) p.push('clube repetido nas divisões novas');
  // promovidos e rebaixados trocaram de divisão
  last.divisions?.forEach((m, i) => {
    for (const id of m.promoted) if (i > 0 && !pyrA[i - 1].clubIds.includes(id)) p.push(`promovido ${id} não subiu`);
    for (const id of m.relegated) if (i < pyrA.length - 1 && !pyrA[i + 1].clubIds.includes(id)) p.push(`rebaixado ${id} não desceu`);
    const wantUp = m.id === 'serie-d' ? serieDFlow(before.season, serieDQualifiers(before).length).promoted : (before.slots ?? 4);
    if (i > 0 && m.promoted.length !== wantUp) p.push(`${m.id}: ${m.promoted.length} promovidos, esperado ${wantUp}`);
  });
  // calendário novo coerente
  const maxRound = Math.max(...after.fixtures.map((f) => f.round));
  const extra = after.divisions.some((d) => d.id === 'serie-b') ? 2 : 0; // playoffs de acesso da Série B (ida e volta)
  if (after.totalRounds !== maxRound + extra) p.push(`totalRounds ${after.totalRounds} ≠ maior rodada do calendário ${maxRound}`);
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
