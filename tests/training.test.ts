import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { isSeasonOver, newCareer, playNext } from '../src/engine/game';
import { ATTRIBUTES } from '../src/engine/categories';
import { makeRng } from '../src/engine/rng';
import { loadGame, saveGame } from '../src/engine/save';
import { migrateGame } from '../src/engine/migrate';
import { ATTR_KIND, basePointsAt, dedicationOf, distributeAttrs, isStar, pointsPerYear, rollPotential, SPECIALTIES, STAR_POTENTIAL, trainTick, attrsOf, type Specialty } from '../src/engine/training';
import { ensureCategoryState, ensureYouth, youthOf, youthSeason, youthTick, type Prospect, type YouthState } from '../src/engine/youth';
import type { YouthCoach } from '../src/engine/coaches';
import type { GameState, Player } from '../src/engine/types';

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

const mk = (): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() } as never, 7);
const keep = (g: GameState): GameState => ({ ...g, morale: { ...g.morale, board: 60 } });
const C = (rating: number, extra: Partial<YouthCoach> = {}): YouthCoach => ({ id: `c${rating}`, name: `T${rating}`, age: 45, exp: 15, rating, specs: ['tatica'], trait: 'metodico', wage: 50000, history: [], ...extra });
const Y: YouthState = { level: 0, prospects: [], seq: 1, lastIntake: 2026, coachesInit: true, coaches: { sub13: C(5), sub15: C(5), sub17: C(5), sub21: C(5) } };
const pr = (id: string, age: number, over: number, pot: number, pos: Player['pos'] = 'MID', extra: Partial<Prospect> = {}): Prospect =>
  ({ player: { id, name: `J ${id}`, pos, age, strength: over }, potential: pot, exact: over, train: 0, attrs: Array(6).fill(over), ...extra });
/** Quantas rodadas até o overall subir; devolve o overall final depois de `ticks` passos de uma temporada de `season` rodadas. */
const run = (p: Prospect, y: YouthState, ticks: number, season = 38): Prospect => { let q = p; for (let i = 0; i < ticks; i++) q = trainTick(q, y, season); return q; };

describe('barra de treino', () => {
  it('enche aos poucos (0–100 %); ao completar dá exatamente +1 de overall e reinicia em 0', () => {
    let p = pr('a', 15, 30, 70);
    let ups = 0, prevTrain = 0;
    for (let i = 0; i < 120; i++) {
      const before = p.player.strength;
      p = trainTick(p, Y, 38);
      expect(p.train!).toBeGreaterThanOrEqual(0); expect(p.train!).toBeLessThan(100);
      expect(p.player.strength - before).toBeLessThanOrEqual(1); // nunca mais de +1 de uma vez
      if (p.player.strength === before + 1) { ups++; expect(p.train).toBe(0); expect(prevTrain).toBeGreaterThan(50); }
      else expect(p.train!).toBeGreaterThan(prevTrain); // gradual: sobe a cada rodada
      expect(p.exact).toBeCloseTo(p.player.strength + p.train! / 100, 6);
      prevTrain = p.train!;
    }
    expect(ups).toBeGreaterThan(5);
  });
  it('um único passo nunca muda o overall de quem está no começo da barra (sem saltos instantâneos)', () => {
    for (const age of [12, 14, 16, 18, 20]) { const q = trainTick(pr('b', age, 20, 80), Y, 38); expect(q.player.strength).toBe(20); expect(q.train!).toBeGreaterThan(0); expect(q.train!).toBeLessThan(30); }
  });
});

describe('limite de potencial', () => {
  it('nunca passa do potencial e, ao chegar nele, a barra para em 0', () => {
    let p = pr('c', 17, 66, 70);
    for (let i = 0; i < 38 * 12; i++) { p = trainTick(p, Y, 38); expect(p.player.strength).toBeLessThanOrEqual(70); expect(p.exact).toBeLessThanOrEqual(70); }
    expect(p.player.strength).toBe(70); expect(p.train).toBe(0);
    expect(trainTick(p, Y, 38)).toBe(p); // parado, sem mudar nada
  });
  it('perto do potencial a evolução desacelera', () => {
    const far = pointsPerYear(pr('d', 17, 40, 80), Y), near = pointsPerYear(pr('d', 17, 77, 80), Y);
    expect(near).toBeLessThan(far * 0.5);
    expect(pointsPerYear(pr('d', 17, 80, 80), Y)).toBe(0);
  });
  it('jovem acima do potencial (dados antigos) não perde nem ganha overall', () => {
    const p = pr('e', 17, 60, 55);
    const q = trainTick(p, Y, 38);
    expect(q.player.strength).toBe(60);
  });
});

describe('progressão por idade', () => {
  it('crianças evoluem devagar: ganho anual cresce de 12 a 17 anos e cai depois', () => {
    const gain = (age: number) => run(pr('f', age, 10, 95), Y, 38).exact - 10;
    const g = [12, 13, 14, 15, 16, 17].map(gain);
    for (let i = 1; i < g.length; i++) expect(g[i]).toBeGreaterThan(g[i - 1]);
    expect(g[0]).toBeLessThan(4);                      // 12 anos: poucos pontos por ano, mesmo com potencial altíssimo
    expect(gain(21)).toBeLessThan(gain(17));
    expect(basePointsAt(12)).toBeLessThan(basePointsAt(16));
  });
  it('um jovem de 12 anos, com todos os fatores bons, ainda ganha menos de 7 de overall em uma temporada (mesmo com tudo no máximo)', () => {
    const best: YouthState = { ...Y, level: 20, fac: { centro: 20, fisica: 20, medico: 20, alojamento: 20, campos: 20 }, coaches: { ...Y.coaches!, sub13: C(10, { trait: 'paciente', specs: ['tecnica'] }) } };
    const ids = Array.from({ length: 60 }, (_, i) => `kid${i}`).sort((a, b) => dedicationOf(b) - dedicationOf(a));
    expect(run(pr(ids[0], 12, 5, 97, 'MID', { focus: 'tecnico' }), best, 38).exact - 5).toBeLessThan(7);
  });
});

describe('fatores de velocidade', () => {
  const base = pr('g1', 16, 30, 75);
  it('academia melhor, treinador melhor, potencial maior e mais dedicação aceleram', () => {
    const b = pointsPerYear(base, Y);
    expect(pointsPerYear(base, { ...Y, level: 12 })).toBeGreaterThan(b);
    expect(pointsPerYear(base, { ...Y, coaches: { ...Y.coaches!, sub17: C(9) } })).toBeGreaterThan(b);
    expect(pointsPerYear({ ...base, potential: 95 }, Y)).toBeGreaterThan(b);
    const lo = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8'].sort((a, c) => dedicationOf(a) - dedicationOf(c));
    expect(pointsPerYear(pr(lo[7], 16, 30, 75), Y)).toBeGreaterThan(pointsPerYear(pr(lo[0], 16, 30, 75), Y));
  });
  it('dedicação é um traço estável de cada jogador, entre 0,7 e 1,3', () => {
    for (let i = 0; i < 200; i++) { const d = dedicationOf(`p${i}`); expect(d).toBeGreaterThanOrEqual(0.7); expect(d).toBeLessThanOrEqual(1.3); expect(dedicationOf(`p${i}`)).toBe(d); }
  });
});

describe('atributos e especialidades', () => {
  it('existem as quatro especialidades e todas as posições têm ao menos um atributo de cada', () => {
    expect(SPECIALTIES.map((s) => s.id)).toEqual(['fisico', 'tecnico', 'tatico', 'fundamentos']);
    for (const pos of ['GK', 'DEF', 'MID', 'ATT'] as const) {
      expect(ATTR_KIND[pos]).toHaveLength(ATTRIBUTES[pos].length);
      for (const s of SPECIALTIES) expect(ATTR_KIND[pos].includes(s.id), `${pos} ${s.id}`).toBe(true);
    }
  });
  it('cada +1 de overall distribui exatamente 6 pontos; a média dos atributos acompanha o overall', () => {
    for (const focus of [undefined, ...SPECIALTIES.map((s) => s.id)] as (Specialty | undefined)[]) {
      let p = pr('h', 15, 20, 80, 'DEF', { focus, attrs: undefined });
      p = { ...p, attrs: attrsOf(p) };
      const sum0 = p.attrs!.reduce((a, b) => a + b, 0);
      const ovr0 = p.player.strength;
      p = run(p, Y, 38 * 3);
      const ups = p.player.strength - ovr0;
      expect(ups).toBeGreaterThan(5);
      expect(p.attrs!.reduce((a, b) => a + b, 0) - sum0).toBe(6 * ups);
      const mean = p.attrs!.reduce((a, b) => a + b, 0) / 6;
      expect(Math.abs(mean - p.player.strength)).toBeLessThan(1.5);
    }
  });
  it('a especialidade escolhida recebe mais pontos que as outras', () => {
    for (const pos of ['GK', 'DEF', 'MID', 'ATT'] as const) for (const s of SPECIALTIES) {
      const a = distributeAttrs([30, 30, 30, 30, 30, 30], pos, s.id);
      const gainOf = (i: number) => a[i] - 30;
      const kinds = ATTR_KIND[pos];
      const inK = kinds.map((k, i) => (k === s.id ? gainOf(i) : null)).filter((x): x is number => x !== null);
      const out = kinds.map((k, i) => (k !== s.id ? gainOf(i) : null)).filter((x): x is number => x !== null);
      expect(Math.min(...inK)).toBeGreaterThanOrEqual(Math.max(...out));
      expect(Math.max(...inK)).toBeGreaterThan(Math.max(...out));
    }
    expect(distributeAttrs([30, 30, 30, 30, 30, 30], 'MID', undefined)).toEqual([31, 31, 31, 31, 31, 31]);
  });
  it('especialidade física rende menos em crianças que em jovens de 16+', () => {
    const f = (age: number) => pointsPerYear(pr('i', age, 20, 90, 'MID', { focus: 'fisico' }), Y) / pointsPerYear(pr('i', age, 20, 90), Y);
    expect(f(12)).toBeLessThan(1); expect(f(17)).toBeGreaterThan(1);
  });
});

describe('estrelas e potencial', () => {
  it('~8% dos jovens novos são estrelas (potencial 85+); os demais ficam abaixo', () => {
    const rng = makeRng(2026);
    const N = 20000; let stars = 0, minPot = 999, maxNon = 0;
    for (let i = 0; i < N; i++) { const pot = rollPotential(rng, i % 6); minPot = Math.min(minPot, pot); if (pot >= STAR_POTENTIAL) stars++; else maxNon = Math.max(maxNon, pot); expect(pot).toBeLessThanOrEqual(97); }
    expect(stars / N).toBeGreaterThan(0.07); expect(stars / N).toBeLessThan(0.09);
    expect(maxNon).toBeLessThan(STAR_POTENTIAL); expect(minPot).toBeGreaterThan(17);
    expect(isStar({ potential: 85 })).toBe(true); expect(isStar({ potential: 84 })).toBe(false);
  });
  it('todo jovem novo tem potencial individual acima do overall inicial e igual ao pot do jogador', () => {
    let g = ensureYouth(mk());
    for (let i = 0; i < 4; i++) g = youthSeason(g);
    for (const p of youthOf(g).prospects) { expect(p.potential).toBeGreaterThan(p.player.strength); expect(p.player.pot).toBe(p.potential); expect(p.attrs).toHaveLength(6); expect(p.train).toBeGreaterThanOrEqual(0); }
  });
});

describe('evolução automática na temporada', () => {
  it('o treino roda sozinho a cada rodada (sem abrir a tela da base) e nunca passa do potencial', () => {
    let g = mk();
    while (g.estadual?.due) g = keep(playNext(g).state);
    g = keep(playNext(g).state); // 1ª rodada: a base nasce
    const ids = youthOf(g).prospects.map((p) => p.player.id);
    expect(ids.length).toBeGreaterThan(0);
    const exact0 = youthOf(g).prospects.map((p) => p.exact);
    for (let i = 0; i < 10; i++) g = keep(playNext(g).state);
    const after = youthOf(g).prospects.filter((p) => ids.includes(p.player.id));
    expect(after.length).toBe(ids.length); // ninguém sumiu, ninguém foi criado para preencher
    after.forEach((p, i) => { expect(p.exact).toBeGreaterThan(exact0[i]); expect(p.exact).toBeLessThanOrEqual(p.potential); expect(p.player.strength).toBeLessThanOrEqual(p.potential); });
  });
  it('uma temporada inteira: jovem de 12 anos ganha só alguns pontos; a virada não dá salto de overall', () => {
    let g = mk();
    let guard = 0;
    while (g.estadual?.due) g = keep(playNext(g).state);
    while (!isSeasonOver(g) && guard++ < 200) g = keep(playNext(g).state);
    const before = youthOf(g).prospects.filter((p) => p.player.age === 12);
    expect(before.length).toBeGreaterThan(0);
    for (const p of before) { expect(p.player.strength).toBeGreaterThanOrEqual(5); expect(p.player.strength).toBeLessThanOrEqual(11); }
    const sumBefore = Object.fromEntries(before.map((p) => [p.player.id, p.player.strength]));
    const n = startNextSeason(g);
    for (const p of youthOf(n).prospects) if (p.player.id in sumBefore) { expect(p.player.age).toBe(13); expect(p.player.strength).toBe(sumBefore[p.player.id]); } // virada: só a idade muda
  });
  it('as categorias da Etapa 1 continuam: nenhum jogador é criado ou duplicado pelo treino', () => {
    let g = ensureYouth(mk());
    const ids = youthOf(g).prospects.map((p) => p.player.id);
    for (let i = 0; i < 100; i++) g = youthTick(g);
    expect(youthOf(g).prospects.map((p) => p.player.id)).toEqual(ids);
  });
});

describe('persistência e saves antigos', () => {
  it('barra, atributos, especialidade e treinadores sobrevivem a salvar e reabrir', () => {
    let g = ensureYouth(mk());
    const id = youthOf(g).prospects[0].player.id;
    for (let i = 0; i < 60; i++) g = youthTick(g);
    expect(saveGame(g).ok).toBe(true);
    const back = loadGame()!;
    const a = youthOf(g).prospects.find((p) => p.player.id === id)!, b = youthOf(back).prospects.find((p) => p.player.id === id)!;
    expect(b.train).toBeCloseTo(a.train!, 9); expect(b.attrs).toEqual(a.attrs); expect(b.focus).toBe(a.focus); expect(a.focus).toBeDefined(); // o foco é do treinador, e fica salvo expect(b.player.strength).toBe(a.player.strength);
    expect(youthOf(back).coaches).toEqual(youthOf(g).coaches);
    expect(migrateGame(back).game.youth!.prospects.find((p) => p.player.id === id)).toMatchObject({ player: { strength: a.player.strength } });
  });
  it('save da Etapa 1 (sem barra/atributos/treinadores): completa sem mudar idade, overall nem potencial; idempotente', () => {
    const base = mk();
    const old: GameState = { ...base, youth: { level: 1, seq: 4, lastIntake: 2026, schema: 1, prospects: [
      { player: { id: 'o1', name: 'Velho Um', pos: 'ATT', age: 17, strength: 41 }, potential: 77, exact: 41.4, origin: 'academia', history: [] },
      { player: { id: 'o2', name: 'Velho Dois', pos: 'GK', age: 13, strength: 9 }, potential: 62, exact: 8.6, origin: 'academia', history: [] },
    ] } };
    const m = ensureCategoryState(old);
    const ps = youthOf(m).prospects;
    expect(ps.map((p) => [p.player.age, p.player.strength, p.potential])).toEqual([[17, 41, 77], [13, 9, 62]]);
    expect(ps[0].train).toBe(40); expect(ps[1].train).toBe(0); // 41,4 → 40 %; 8,6 já era 9 arredondado → barra zerada
    expect(ps.every((p) => p.attrs!.length === 6)).toBe(true);
    expect(Object.keys(youthOf(m).coaches!)).toHaveLength(4);
    expect(ensureCategoryState(m)).toBe(m);
    const r = migrateGame(old);
    expect(r.report.rejected).toBe(false); expect(r.report.violations).toEqual([]);
    const next = youthTick(m); // e o treino já funciona em cima dele
    expect(youthOf(next).prospects[0].exact).toBeGreaterThan(youthOf(m).prospects[0].exact);
  });
});
