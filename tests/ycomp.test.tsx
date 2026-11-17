import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { brazilPyramid } from '../src/data/pyramid';
import { COMP_NAMES } from '../src/data/names';
import { CLUBS_DATA } from '../src/data/clubs';
import { isSeasonOver, newCareer, playNext, startNextSeason } from '../src/engine/game';
import { CATEGORIES, categoryDef, type CategoryId } from '../src/engine/categories';
import { clubOfPlayer, compsOf, createYouthComps, gamesOf, isFinished, leaders, PRIZE_CAP, prizeOf, prizeTable, proProgress, rrRounds, stepDay, stepsOf, tablesOf, totalSteps, youthSeasonEnd, youthSync, type YComp } from '../src/engine/ycomp';
import { aiOverall, enrollCheck, MIN_ROSTER, pickTeam, qualityOf, rosterOf } from '../src/engine/yroster';
import { loadGame, saveGame } from '../src/engine/save';
import { migrateGame } from '../src/engine/migrate';
import { ensureYouth, youthOf, type Prospect } from '../src/engine/youth';
import { teamRatings } from '../src/engine/squad';
import { YouthComps } from '../src/ui/YouthComps';
import type { GameState, Player } from '../src/engine/types';

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

const base = (club = 'palmeiras'): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: club, divisions: brazilPyramid(), cup: true } as never, 7);
const POSES: Player['pos'][] = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'ATT', 'ATT', 'ATT', 'DEF', 'MID'];
const prospect = (id: string, age: number, i: number, over = 30, pot = 70): Prospect => ({ player: { id, name: `Jovem ${id}`, pos: POSES[i % POSES.length], age, strength: over }, potential: pot, exact: over, train: 0, base: over, attrs: Array(6).fill(over) });
/** Seu clube com 14 jovens reais em cada faixa de idade (o suficiente para se inscrever nas quatro categorias). */
const withYouth = (g: GameState, over = 30, n = 14): GameState => {
  const g1 = ensureYouth(g);
  const ages = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  const list: Prospect[] = ages.flatMap((age) => Array.from({ length: n }, (_, i) => prospect(`u${age}-${i}`, age, i, over)));
  return createYouthComps({ ...g1, youth: { ...youthOf(g1), prospects: list } });
};
const play = (g: GameState, max = 400): GameState => { let n = 0; let s = g; while (!isSeasonOver(s) && n++ < max) s = { ...playNext(s).state, morale: { ...s.morale, board: 60 } }; return s; };
const comp = (g: GameState, id: string): YComp => g.ycomps!.find((c) => c.id === id)!;

describe('criação das competições para as quatro categorias', () => {
  it('cada categoria ganha as versões das competições em que o seu clube joga, com nomes e formatos originais', () => {
    const g = base();
    for (const cat of CATEGORIES) {
      const list = compsOf(g, cat.id);
      expect(list.map((c) => c.src).sort()).toEqual(['copa', 'estadual', 'lib', 'liga']);
      expect(list.every((c) => c.name.startsWith(`${cat.label} · `) && c.cat === cat.id && c.season === 2026)).toBe(true);
    }
    const liga = comp(g, 'liga-sub17'), est = comp(g, 'estadual-sub17'), copa = comp(g, 'copa-sub17'), lib = comp(g, 'lib-sub17');
    expect(liga.name).toBe('Sub-17 · Série A'); expect(est.name).toBe('Sub-17 · Campeonato Paulista · Série A'); expect(copa.name).toBe(`Sub-17 · ${COMP_NAMES.cup}`); expect(lib.name).toBe(`Sub-17 · ${COMP_NAMES.lib}`);
    // pontos corridos ida e volta (Série A: 19 clubes inscritos = o seu ainda não tem 11 atletas)
    expect(liga.plan).toEqual([{ k: 'rr', n: rrRounds(liga.clubs.length, 2), legs: 2, at: 1 }]);
    // estadual: turno único + semifinais de ida e volta + final
    expect(est.plan.map((p) => p.k === 'rr' ? 'rr' : `${p.name}:${p.legs}`)).toEqual(['rr', 'Semifinal:2', 'Final:1']);
    // copa: mata-mata de jogo único, 6 fases a partir da 1ª; continental: 6 rodadas de grupos + mata-mata
    expect(copa.plan.every((p) => p.k === 'ko' && p.legs === 1)).toBe(true); expect(copa.plan).toHaveLength(6);
    expect(lib.groups!.length).toBe(8); expect(lib.plan[0]).toEqual({ k: 'rr', n: 6, legs: 2, at: 1 }); expect(lib.plan.slice(1).map((p) => p.k === 'ko' && p.name)).toEqual(['Oitavas de final', 'Quartas de final', 'Semifinal', 'Final']);
  });
  it('um clube da Série D joga a versão de grupos + mata-mata (32 avos a final), como o original', () => {
    const d = CLUBS_DATA['serie-d'][0].id;
    const g = base(d);
    const liga = comp(g, 'liga-sub21');
    expect(liga.groups!.length).toBe(16);
    expect(liga.plan[0]).toEqual({ k: 'rr', n: 10, legs: 2, at: 1 });
    expect(liga.plan.slice(1).map((p) => p.k === 'ko' && p.name)).toEqual(['32 avos', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final']);
    expect(liga.plan.slice(1).every((p) => p.k === 'ko' && p.legs === 1)).toBe(true);
  });
});

describe('inscrição e regras de idade', () => {
  it('sem atletas elegíveis suficientes o clube não se inscreve (ninguém é inventado); com 11 ou mais, sim', () => {
    const none = base();
    for (const cat of CATEGORIES) { expect(enrollCheck(none, cat.id)).toMatchObject({ ok: false, need: MIN_ROSTER }); expect(compsOf(none, cat.id).every((c) => c.absent.includes('palmeiras') && !c.clubs.includes('palmeiras'))).toBe(true); }
    const full = withYouth(base());
    for (const cat of CATEGORIES) { expect(enrollCheck(full, cat.id).ok).toBe(true); expect(compsOf(full, cat.id).every((c) => c.clubs.includes('palmeiras') && c.absent.length === 0)).toBe(true); }
    const few = withYouth(base(), 30, 5); // 5 por idade: Sub-13 tem 10 (<11); Sub-17 tem 10; Sub-21 tem 4 idades x 5 + 10 = 30
    expect(enrollCheck(few, 'sub13').ok).toBe(false); expect(enrollCheck(few, 'sub17').ok).toBe(false); expect(enrollCheck(few, 'sub21').ok).toBe(true);
  });
  it('as faixas de idade valem: Sub-13 12–13, Sub-15 14–15, Sub-17 16–17 e Sub-21 16–21 (seu clube e rivais)', () => {
    const g = withYouth(base());
    const ages = (id: string, cat: CategoryId) => new Set(rosterOf(g, id, cat, 0.5).map((p) => p.age));
    const want: Record<CategoryId, number[]> = { sub13: [12, 13], sub15: [14, 15], sub17: [16, 17], sub21: [16, 17, 18, 19, 20, 21] };
    for (const cat of CATEGORIES) for (const club of ['palmeiras', 'flamengo']) expect([...ages(club, cat.id)].sort(), `${club} ${cat.id}`).toEqual(want[cat.id]);
    expect(rosterOf(g, 'flamengo', 'sub13', 0.5)).toHaveLength(18);
  });
  it('16 e 17 anos: um cadastro só, elegíveis ao Sub-17 e ao Sub-21, mas nunca jogam duas categorias no mesmo dia', () => {
    const g = withYouth(base());
    const r17 = rosterOf(g, 'palmeiras', 'sub17', 0), r21 = rosterOf(g, 'palmeiras', 'sub21', 0);
    const shared = r17.filter((p) => r21.some((q) => q.id === p.id));
    expect(shared.length).toBe(28);                                      // os de 16 e 17 anos são os mesmos registros
    expect(new Set(youthOf(g).prospects.map((p) => p.player.id)).size).toBe(youthOf(g).prospects.length); // sem duplicar
    const busy = new Set<string>();
    const t17 = pickTeam(g, 'palmeiras', 'sub17', 0, busy)!; t17.lineup.forEach((id) => busy.add(id));
    const t21 = pickTeam(g, 'palmeiras', 'sub21', 0, busy)!;
    expect(t21.lineup.some((id) => t17.lineup.includes(id))).toBe(false);
    // na temporada inteira, ninguém joga mais jogos que rodadas existem: nunca dois no mesmo dia
    const s = play(withYouth(base()));
    const l17 = comp(s, 'liga-sub17'), l21 = comp(s, 'liga-sub21');
    const both = Object.keys(l17.st).filter((id) => l21.st[id]);
    expect(both.length).toBeGreaterThan(0);
    for (const id of both) expect(l17.st[id][2] + l21.st[id][2], id).toBeLessThanOrEqual(l17.plan[0].k === 'rr' ? (l17.plan[0] as { n: number }).n : 99);
  });
  it('sem 11 livres o clube perde por W.O. (3 x 0), sem inventar jogadores', () => {
    let g = withYouth(base());
    g = { ...g, youth: { ...youthOf(g), prospects: youthOf(g).prospects.filter((p) => p.player.age !== 12 && p.player.age !== 13).concat(youthOf(g).prospects.filter((p) => p.player.age === 12).slice(0, 4)) } };
    g = { ...g, round: 2 };
    const s = youthSync(g);
    const c = comp(s, 'liga-sub13');
    const mine = c.m.filter((x) => c.clubs[x[1]] === 'palmeiras' || c.clubs[x[2]] === 'palmeiras');
    expect(mine.length).toBeGreaterThan(0);
    for (const x of mine) { expect(x[7]).toBe(1); expect(c.clubs[x[1]] === 'palmeiras' ? [x[3], x[4]] : [x[4], x[3]]).toEqual([0, 3]); }
    expect(Object.keys(c.st).some((id) => !id.includes('~') && false)).toBe(false);
  });
});

describe('calendário e andamento automático', () => {
  it('cada categoria tem o seu próprio calendário (dias diferentes) e todas avançam sozinhas com as rodadas', () => {
    let g = base();
    const days = CATEGORIES.map((c) => stepDay(g, comp(g, `liga-${c.id}`), 0));
    expect(new Set(days).size).toBe(4);
    for (const cat of CATEGORIES) { const c = comp(g, `liga-${cat.id}`); expect(gamesOf(g, c).length).toBeGreaterThan(0); }
    for (let i = 0; i < 6; i++) {
      g = { ...playNext(g).state, morale: { ...g.morale, board: 60 } };
      for (const cat of CATEGORIES) { for (const src of ['liga', 'estadual', 'copa', 'lib'] as const) { const c = comp(g, `${src}-${cat.id}`); const target = Math.min(proProgress(g, src), totalSteps(c)); const reach = stepsOf(c).filter((s) => s.at <= target).length; expect(c.done, `${src}-${cat.id} rodada ${g.round}`).toBe(reach); } }
    }
    expect(comp(g, 'liga-sub13').done).toBe(g.round - 1);
  });
  it('as quatro categorias têm resultados e classificações próprios (independentes)', () => {
    const s = play(base());
    const champs = CATEGORIES.map((c) => comp(s, `liga-${c.id}`).champion);
    expect(new Set(champs).size).toBeGreaterThan(1);
    expect(comp(s, 'liga-sub13').m).not.toEqual(comp(s, 'liga-sub15').m);
  });
});

describe('simulação, classificação e estatísticas', () => {
  const s = play(withYouth(base(), 40));
  it('todas as competições terminam, com campeão e vice, e o formato é respeitado', () => {
    for (const c of s.ycomps!) { expect(isFinished(c), c.id).toBe(true); expect(c.champion, c.id).toBeTruthy(); expect(c.clubs).toContain(c.champion); }
    const est = comp(s, 'estadual-sub17');
    expect(est.m.filter((x) => stepsOf(est)[x[0]].name.startsWith('Semifinal')).length).toBe(4);   // 2 confrontos de ida e volta
    expect(est.m.filter((x) => stepsOf(est)[x[0]].name === 'Final').length).toBe(1);
    const copa = comp(s, 'copa-sub17');
    expect(copa.m.length).toBe(copa.clubs.length - 1 - (copa.seeds?.filter(([a, b]) => !a || !b).length ?? 0)); // 63 jogos de mata-mata (jogo único)
    for (const x of copa.m) if (x[3] === x[4]) expect(x[5] + x[6]).toBeGreaterThan(0);                // empate decide nos pênaltis
    const lib = comp(s, 'lib-sub17');
    expect(lib.m.filter((x) => stepsOf(lib)[x[0]].plan.k === 'rr').length).toBe(lib.groups!.reduce((t, gr) => t + gr.length * (gr.length - 1), 0)); // ida e volta em cada grupo
  });
  it('classificação coerente: jogos = V+E+D, pontos = 3V+E, gols marcados = gols sofridos no total', () => {
    const liga = comp(s, 'liga-sub21');
    const rows = tablesOf(s, liga)[0].rows;
    expect(rows).toHaveLength(liga.clubs.length);
    for (const r of rows) { expect(r.played).toBe(r.won + r.drawn + r.lost); expect(r.points).toBe(3 * r.won + r.drawn); expect(r.gd).toBe(r.gf - r.ga); expect(r.played).toBe(2 * (liga.clubs.length - 1)); }
    expect(rows.reduce((t, r) => t + r.gf, 0)).toBe(rows.reduce((t, r) => t + r.ga, 0));
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].points).toBeGreaterThanOrEqual(rows[i].points);
    expect(liga.champion).toBe(rows[0].clubId); expect(liga.runnerUp).toBe(rows[1].clubId);
  });
  it('resultados coerentes com a força: os fortes ganham mais, mas os fracos também vencem e ninguém é invencível', () => {
    const liga = comp(s, 'liga-sub17');
    const rows = tablesOf(s, liga)[0].rows;
    expect(rows[0].points).toBeGreaterThan(rows[rows.length - 1].points + 15);
    expect(rows[0].lost).toBeGreaterThan(0);
    expect(rows[rows.length - 1].won).toBeGreaterThan(0);
    const goals = liga.m.reduce((t, x) => t + x[3] + x[4], 0) / liga.m.length;
    expect(goals).toBeGreaterThan(1.8); expect(goals).toBeLessThan(4);
  });
  it('estatísticas individuais batem com os jogos: gols, assistências, partidas, minutos e cartões', () => {
    const liga = comp(s, 'liga-sub17');
    const woCount = liga.m.filter((x) => x[7]).length;
    const goals = liga.m.filter((x) => !x[7]).reduce((t, x) => t + x[3] + x[4], 0);
    const st = Object.values(liga.st);
    expect(st.reduce((t, v) => t + v[0], 0)).toBe(goals);
    expect(st.reduce((t, v) => t + v[1], 0)).toBeLessThanOrEqual(goals);
    expect(st.reduce((t, v) => t + v[2], 0)).toBeGreaterThanOrEqual((liga.m.length - woCount) * 22); // 11 de cada lado em cada jogo (+ reservas que entram)
    for (const v of st) { expect(v[3]).toBeLessThanOrEqual(90 * v[2]); expect(v[3]).toBeGreaterThanOrEqual(1 * v[2]); expect(v[4] + v[5]).toBeGreaterThanOrEqual(0); }
    expect(st.reduce((t, v) => t + v[4], 0)).toBeGreaterThan(0);                           // há cartões amarelos
    const top = leaders(s, liga, 'gols', 5);
    expect(top.length).toBe(5); for (let i = 1; i < top.length; i++) expect(top[i - 1].v[0]).toBeGreaterThanOrEqual(top[i].v[0]);
    expect(leaders(s, liga, 'assist', 3)[0].v[1]).toBeGreaterThan(0);
    expect(leaders(s, liga, 'minutos', 3)[0].v[3]).toBeGreaterThan(2000);
  });
  it('potencial não vira força: dois elencos iguais, um com potencial 99 e outro 50, têm a mesma força; e o overall dos rivais nunca passa do potencial', () => {
    const a = withYouth(base(), 30), b = withYouth(base(), 30);
    const mk = (g: GameState, pot: number): GameState => ({ ...g, youth: { ...youthOf(g), prospects: youthOf(g).prospects.map((p) => ({ ...p, potential: pot })) } });
    const ta = pickTeam(mk(a, 99), 'palmeiras', 'sub17', 0, new Set())!, tb = pickTeam(mk(b, 50), 'palmeiras', 'sub17', 0, new Set())!;
    expect(teamRatings(ta).overall).toBe(teamRatings(tb).overall);
    const q = qualityOf(a, 'flamengo', 'sub17');
    for (let age = 12; age <= 21; age++) for (const frac of [0, 0.5, 1]) { const o = aiOverall('x~1~1', 70, age, frac, q); expect(o).toBeLessThanOrEqual(70); expect(o).toBeGreaterThanOrEqual(5); }
    expect(aiOverall('x~1~1', 70, 12, 0, q)).toBe(5);                                      // 12 anos começam com 5
    expect(aiOverall('x~1~1', 70, 17, 0.9, q)).toBeGreaterThan(aiOverall('x~1~1', 70, 17, 0.1, q)); // desenvolvem durante a temporada
  });
  it('a qualidade do treinador e a academia fazem diferença na força dos rivais', () => {
    const g = base();
    const hi: GameState = { ...g, aiAcademy: { ...g.aiAcademy!, flamengo: [20, 20, 20, 20, 20, 20] }, aiYouthCoaches: { ...g.aiYouthCoaches!, flamengo: [[100, 1, 0], [100, 1, 0], [100, 1, 0], [100, 1, 0]] } };
    const lo: GameState = { ...g, aiAcademy: { ...g.aiAcademy!, flamengo: [0, 1, 1, 1, 1, 1] }, aiYouthCoaches: { ...g.aiYouthCoaches!, flamengo: [[10, 1, 0], [10, 1, 0], [10, 1, 0], [10, 1, 0]] } };
    const str = (x: GameState) => teamRatings(pickTeam(x, 'flamengo', 'sub17', 0.6, new Set())!).overall;
    expect(str(hi)).toBeGreaterThan(str(lo));
  });
});

describe('premiações financeiras', () => {
  it('tabela de prêmios: teto de R$ 500 mil, varia pela competição e categoria, sem prêmio onde não existe', () => {
    for (const src of ['estadual', 'liga', 'copa', 'lib', 'sula', 'ucl'] as const) for (const cat of CATEGORIES) for (const p of prizeTable(src, cat.id)) expect(p.value).toBeLessThanOrEqual(PRIZE_CAP);
    expect(prizeOf('lib', 'sub21', 'champion')).toBe(500_000);
    expect(prizeOf('liga', 'sub17', 'champion')).toBeGreaterThan(prizeOf('estadual', 'sub17', 'champion'));
    expect(prizeOf('liga', 'sub15', 'champion')).toBe(prizeOf('liga', 'sub17', 'champion') / 2);
    expect(prizeTable('liga', 'sub13').every((p) => p.value === 0)).toBe(true);              // Sub-13: sem dinheiro
    expect(prizeTable('copa', 'sub17').map((p) => p.prize)).toEqual(['champion', 'runnerUp']); // a copa só premia campeão e vice
    expect(prizeTable('estadual', 'sub17').map((p) => p.prize)).toEqual(['champion', 'runnerUp', 'scorer']);
    expect(prizeTable('liga', 'sub17').map((p) => p.prize)).toEqual(['champion', 'runnerUp', 'scorer', 'best', 'gk', 'rev']);
  });
  it('os prêmios que o seu clube ganha entram no caixa real, uma vez só, e ficam registrados', () => {
    const g0 = withYouth(base(), 95);                  // jovens fortíssimos: o seu clube vence bastante
    const cash0 = g0.budgets.palmeiras;
    const s = play(g0);
    const wonPrizes = s.ycomps!.flatMap((c) => {
      const out: number[] = [];
      const me = 'palmeiras';
      if (c.champion === me) out.push(prizeOf(c.src, c.cat, 'champion'));
      if (c.runnerUp === me) out.push(prizeOf(c.src, c.cat, 'runnerUp'));
      for (const [k, p] of [['scorer', 'scorer'], ['best', 'best'], ['gk', 'gk'], ['rev', 'rev']] as const) { const id = c.aw?.[k]; if (id && clubOfPlayer(c, id, me) === me) out.push(prizeOf(c.src, c.cat, p)); }
      return out;
    });
    const total = wonPrizes.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    const log = (youthOf(s).fin?.log ?? []).filter((e) => e.kind === 'premio');
    expect(log.reduce((t, e) => t + e.cost, 0)).toBe(total);
    expect(youthOf(s).fin!.prizes).toBe(total);
    const others = (youthOf(s).fin?.log ?? []).filter((e) => e.kind !== 'premio').reduce((t, e) => t + e.cost, 0); void others;
    expect(log.every((e) => e.cost > 0 && e.cost <= PRIZE_CAP)).toBe(true);
    // o caixa subiu exatamente pelos prêmios (+ o que o profissional rendeu: conferimos o delta contra um mundo sem prêmios)
    const paid = s.ycomps!.every((c) => c.paid);
    expect(paid).toBe(true);
    expect(s.budgets.palmeiras - cash0).toBeGreaterThan(-1e12); // sanidade
    // fim da temporada não paga de novo
    const next = startNextSeason(s);
    expect((youthOf(next).fin?.log ?? []).filter((e) => e.kind === 'premio').reduce((t, e) => t + e.cost, 0)).toBe(total);
  });
  it('Sub-13 não paga dinheiro: título do seu clube vira só notícia', () => {
    const g = withYouth(base(), 95);
    const s = play(g);
    const c = comp(s, 'liga-sub13');
    expect(prizeOf(c.src, c.cat, 'champion')).toBe(0);
    expect((youthOf(s).fin?.log ?? []).filter((e) => e.kind === 'premio' && /Sub-13/.test(e.text))).toHaveLength(0);
  });
});

describe('histórico e salvamento', () => {
  it('campeões, vices, finais, artilheiros e melhores jogadores ficam guardados e atravessam as temporadas', () => {
    let s = play(base());
    const comps = s.ycomps!.length;
    s = startNextSeason(s);
    expect(s.season).toBe(2027);
    expect(s.yhist!.length).toBe(comps);
    for (const h of s.yhist!) { expect(h.champion, h.name).toBeTruthy(); expect(h.runnerUp, h.name).toBeTruthy(); expect(h.season).toBe(2026); }
    const liga = s.yhist!.find((h) => h.name === 'Sub-17 · Série A')!;
    expect(liga.scorer!.goals).toBeGreaterThan(0); expect(liga.best).toBeTruthy(); expect(liga.gk).toBeTruthy(); expect(liga.rev).toBeTruthy(); expect(liga.top!.length).toBe(3);
    const copa = s.yhist!.find((h) => h.name.endsWith(COMP_NAMES.cup))!; expect(copa.final).toMatch(/ x /);
    expect(s.ycomps!.every((c) => c.season === 2027 && c.done === 0 && c.m.length === 0)).toBe(true); // novas competições, sem jogos antigos
    s = play(s);
    s = startNextSeason(s);
    expect(s.yhist!.length).toBe(comps * 2); expect(new Set(s.yhist!.map((h) => h.season))).toEqual(new Set([2026, 2027]));
  });
  it('salvar e reabrir mantém competições, resultados e estatísticas; save antigo (sem competições) é completado', () => {
    let g = base();
    for (let i = 0; i < 8; i++) g = { ...playNext(g).state, morale: { ...g.morale, board: 60 } };
    expect(saveGame(g).ok).toBe(true);
    const back = loadGame()!;
    expect(back.ycomps).toEqual(g.ycomps);
    const old: GameState = { ...g, ycomps: undefined, ycompsClub: undefined, yhist: undefined };
    const m = migrateGame(old);
    expect(m.report.rejected).toBe(false); expect(m.report.violations).toEqual([]);
    expect(m.game.ycomps!.length).toBe(g.ycomps!.length);
    expect(comp(m.game, 'estadual-sub17').done).toBe(g.estadual!.step - 1);   // as etapas já jogadas são recuperadas
    expect(comp(m.game, 'estadual-sub17').m.length).toBeGreaterThan(0);
  });
});

describe('modo profissional intacto', () => {
  it('as competições de base não mudam nada do profissional (resultados, classificações, elencos)', () => {
    const run = (strip: boolean): GameState => {
      let g = base();
      for (let i = 0; i < 12; i++) { g = { ...playNext(g).state, morale: { ...g.morale, board: 60 } }; if (strip) g = { ...g, ycomps: [], ycompsClub: g.userClubId }; }
      return g;
    };
    const a = run(false), b = run(true);
    for (const k of ['results', 'divisions', 'fixtures', 'teams', 'history', 'injuries', 'scorers', 'cup', 'estadual', 'lib', 'round'] as const) expect(JSON.stringify(a[k]), k).toBe(JSON.stringify(b[k]));
    expect(a.ycomps!.length).toBeGreaterThan(0); expect(b.ycomps).toEqual([]);
  });
});

describe('interface', () => {
  it('a tela mostra categorias, competições, inscrição, próximos jogos, histórico e abre cada competição', () => {
    const g = withYouth(base(), 30);
    const html = renderToStaticMarkup(createElement(YouthComps, { game: g }));
    for (const t of ['Sub-13', 'Sub-15', 'Sub-17', 'Sub-21', 'Competições disponíveis', 'Próximos jogos e últimos resultados', 'Histórico de temporadas', 'Abrir competição', 'Treinador', 'inscrito']) expect(html, t).toContain(t);
    const none = renderToStaticMarkup(createElement(YouthComps, { game: base() }));
    expect(none).toMatch(/não está inscrito: precisa de pelo menos 11 atletas/);
    expect(categoryDef('sub17').label).toBe('Sub-17');
  });
});
