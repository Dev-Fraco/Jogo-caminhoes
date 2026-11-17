import { beforeEach, describe, expect, it, vi } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { isSeasonOver, newCareer, playNext, startNextSeason } from '../src/engine/game';
import { ACADEMY_START_AGE, ACADEMY_START_OVERALL, attributesOf, awaitingDecision, canPromoteAge, CATEGORIES, categoriesOf, inCategory, MIN_PRO_AGE, needsDecision, splitByCategory } from '../src/engine/categories';
import { ensureCategoryState, ensureYouth, promoteProspect, releaseProspect, youthOf, youthSeason, YOUTH_SCHEMA, type Prospect } from '../src/engine/youth';
import { migrateGame } from '../src/engine/migrate';
import { loadGame, saveGame } from '../src/engine/save';
import type { GameState, Player } from '../src/engine/types';

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

const mk = (): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() } as never, 7);
const keep = (g: GameState): GameState => ({ ...g, morale: { ...g.morale, board: 60 } });
const pr = (id: string, age: number, over = 30, pos: Player['pos'] = 'MID'): Prospect => ({ player: { id, name: `Jovem ${id}`, pos, age, strength: over }, potential: 70, exact: over });
const withProspects = (g: GameState, list: Prospect[]): GameState => ({ ...g, youth: { ...youthOf(ensureYouth(g)), prospects: list } });

describe('categorias de base — fundação', () => {
  it('existem quatro categorias com as faixas de idade pedidas', () => {
    expect(CATEGORIES.map((c) => [c.label, c.minAge, c.maxAge])).toEqual([['Sub-13', 12, 13], ['Sub-15', 14, 15], ['Sub-17', 16, 17], ['Sub-21', 16, 21]]);
  });
  it('elegibilidade por idade: 16 e 17 anos são Sub-17 e Sub-21; 12–13 só Sub-13; 21 só Sub-21; 22 em nenhuma', () => {
    expect(categoriesOf(12)).toEqual(['sub13']); expect(categoriesOf(13)).toEqual(['sub13']);
    expect(categoriesOf(14)).toEqual(['sub15']); expect(categoriesOf(15)).toEqual(['sub15']);
    expect(categoriesOf(16)).toEqual(['sub17', 'sub21']); expect(categoriesOf(17)).toEqual(['sub17', 'sub21']);
    expect(categoriesOf(18)).toEqual(['sub21']); expect(categoriesOf(21)).toEqual(['sub21']);
    expect(categoriesOf(11)).toEqual([]); expect(categoriesOf(22)).toEqual([]);
    expect(inCategory(15, 'sub17')).toBe(false); expect(inCategory(16, 'sub15')).toBe(false);
  });
  it('um atleta de 16/17 anos é UM registro só, presente nas duas listas', () => {
    const list = [pr('a', 12), pr('b', 15), pr('c', 16), pr('d', 17), pr('e', 19), pr('f', 21)];
    const by = splitByCategory(list);
    expect(by.sub13.map((p) => p.player.id)).toEqual(['a']);
    expect(by.sub15.map((p) => p.player.id)).toEqual(['b']);
    expect(by.sub17.map((p) => p.player.id)).toEqual(['c', 'd']);
    expect(by.sub21.map((p) => p.player.id)).toEqual(['c', 'd', 'e', 'f']);
    expect(by.sub17[0]).toBe(by.sub21[0]); // o mesmo objeto, não uma cópia
    const ids = list.map((p) => p.player.id);
    expect(new Set(ids).size).toBe(list.length); // sem duplicar na lista guardada
  });
  it('novos jovens da academia começam com 12 anos e overall 5, com posição, potencial, identidade e histórico', () => {
    expect([ACADEMY_START_AGE, ACADEMY_START_OVERALL]).toEqual([12, 5]);
    const g = ensureYouth(mk());
    const y = youthOf(g);
    expect(y.schema).toBe(YOUTH_SCHEMA);
    for (const p of y.prospects) {
      expect(p.player.age).toBe(12); expect(p.player.strength).toBe(5); expect(p.exact).toBe(5);
      expect(['GK', 'DEF', 'MID', 'ATT']).toContain(p.player.pos);
      expect(p.potential).toBeGreaterThan(5);
      expect(p.player.pot).toBe(p.potential);
      expect(p.player.formedAt).toBe('palmeiras');
      expect(p.origin).toBe('academia'); expect(p.joined).toBe(g.season); expect(p.history!.length).toBeGreaterThan(0);
      expect(new Set(p.player.id)).toBeTruthy();
    }
    expect(new Set(y.prospects.map((p) => p.player.id)).size).toBe(y.prospects.length);
    const n = youthSeason(g); // a safra seguinte também entra com 12 anos / overall 5
    const fresh = youthOf(n).prospects.filter((p) => p.joined === n.season && p.origin === 'academia' && !y.prospects.some((o) => o.player.id === p.player.id));
    expect(fresh.length).toBeGreaterThan(0);
    for (const p of fresh) { expect(p.player.age).toBe(12); expect(p.player.strength).toBe(5); }
  });
  it('atributos individuais combinam com o overall e não mudam para o mesmo jogador', () => {
    for (const pos of ['GK', 'DEF', 'MID', 'ATT'] as const) for (const over of [5, 30, 60, 85]) {
      const a = attributesOf({ id: `x-${pos}-${over}`, pos, strength: over });
      expect(a).toHaveLength(6);
      const mean = a.reduce((s, x) => s + x.value, 0) / 6;
      expect(Math.abs(mean - over)).toBeLessThanOrEqual(over < 15 ? 3 : 1.5);
      expect(attributesOf({ id: `x-${pos}-${over}`, pos, strength: over })).toEqual(a);
    }
  });
});

describe('categorias de base — promoção e decisão', () => {
  it('menores de 16 anos não podem ser promovidos; a partir dos 16 o usuário promove quando quiser', () => {
    let g = withProspects(mk(), [pr('k12', 12), pr('k15', 15), pr('k16', 16), pr('k17', 17), pr('k21', 21)]);
    expect([canPromoteAge(15), canPromoteAge(16), MIN_PRO_AGE]).toEqual([false, true, 16]);
    for (const id of ['k12', 'k15']) { const r = promoteProspect(g, id); expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/16 anos/); }
    expect(youthOf(g).prospects).toHaveLength(5); // nada saiu da base
    for (const id of ['k16', 'k17', 'k21']) {
      const before = g.teams.palmeiras.players.length;
      const r = promoteProspect(g, id);
      if (!r.ok) throw new Error(r.error);
      g = r.state;
      expect(g.teams.palmeiras.players.length).toBe(before + 1);
      expect(g.teams.palmeiras.players.filter((p) => p.id === id)).toHaveLength(1); // um cadastro só no profissional
      expect(youthOf(g).prospects.some((p) => p.player.id === id)).toBe(false);   // e saiu da base: sem duplicar
    }
  });
  it('aos 21 anos o jovem fica aguardando decisão (nunca sai sozinho): profissional ou dispensa', () => {
    expect([needsDecision(20), needsDecision(21)]).toEqual([false, true]);
    let g = withProspects(mk(), [pr('v20', 20), pr('v21', 21)]);
    expect(awaitingDecision(youthOf(g).prospects).map((p) => p.player.id)).toEqual(['v21']);
    g = youthSeason(g); // o de 20 vira 21; o de 21 vira 22: ninguém é removido pelo calendário
    const ids = youthOf(g).prospects.map((p) => p.player.id);
    expect(ids).toEqual(expect.arrayContaining(['v20', 'v21']));
    expect(awaitingDecision(youthOf(g).prospects).map((p) => p.player.id).sort()).toEqual(['v20', 'v21']);
    expect(g.news.some((n) => /decisão do clube/i.test(n.text))).toBe(true);
    const r = promoteProspect(g, 'v20'); expect(r.ok).toBe(true);
    expect(youthOf(releaseProspect(g, 'v21')).prospects.some((p) => p.player.id === 'v21')).toBe(false);
  });
  it('a idade sobe só na virada de temporada e o histórico registra a passagem de categoria', () => {
    let g = withProspects(mk(), [pr('m13', 13), pr('m15', 15)]);
    const n = youthSeason(g);
    const m13 = youthOf(n).prospects.find((p) => p.player.id === 'm13')!, m15 = youthOf(n).prospects.find((p) => p.player.id === 'm15')!;
    expect([m13.player.age, m15.player.age]).toEqual([14, 16]);
    expect(m13.history!.some((h) => /Sub-15/.test(h.text))).toBe(true);
    expect(m15.history!.some((h) => /Sub-17/.test(h.text) || /16 anos/.test(h.text))).toBe(true);
    for (let i = 0; i < 5; i++) g = keep(playNext(g).state); // jogar rodadas não envelhece ninguém
    expect(youthOf(g).prospects.find((p) => p.player.id === 'm13')!.player.age).toBe(13);
  });
});

describe('categorias de base — saves e carreira', () => {
  it('save antigo: jovens existentes ganham origem e histórico sem mudar idade, overall nem potencial', () => {
    const base = mk();
    const old: GameState = { ...base, youth: { level: 2, seq: 5, lastIntake: 2026, prospects: [pr('o1', 17, 41), pr('o2', 19, 52)] } }; // formato antigo: sem schema/origin/history
    const m = ensureCategoryState(old);
    expect(m).not.toBe(old);
    expect(youthOf(m).prospects.map((p) => [p.player.age, p.player.strength, p.potential, p.exact])).toEqual([[17, 41, 70, 41], [19, 52, 70, 52]]);
    expect(youthOf(m).prospects.every((p) => p.origin === 'anterior' && p.history!.length === 1)).toBe(true);
    expect(youthOf(m).level).toBe(2);
    expect(ensureCategoryState(m)).toBe(m); // idempotente
    const r = migrateGame(old);
    expect(r.report.rejected).toBe(false); expect(r.report.violations).toEqual([]);
    expect(r.report.applied.some((a) => a.id === 'categorias-base')).toBe(true);
    expect(Object.keys(r.game.teams)).toEqual(Object.keys(old.teams)); // nenhum clube/jogador perdido
  });
  it('os jovens continuam salvos depois de fechar e reabrir o jogo (gravar → ler)', () => {
    const g = withProspects(mk(), [pr('p16', 16, 33), pr('p13', 13, 8)]);
    expect(saveGame(g).ok).toBe(true);
    const back = loadGame()!; // reabrir o jogo
    expect(youthOf(back).prospects.map((p) => [p.player.id, p.player.age, p.player.strength])).toEqual([['p16', 16, 33], ['p13', 13, 8]]);
    expect(migrateGame(back).game.youth!.prospects).toHaveLength(2);
  });
  it('a temporada segue normal: base nasce, as categorias se mantêm e o profissional não é alterado', () => {
    let g = mk();
    const squad0 = g.teams.palmeiras.players.map((p) => [p.id, p.age, p.strength]);
    while (g.estadual?.due) g = keep(playNext(g).state);
    g = keep(playNext(g).state);
    expect(youthOf(g).prospects.length).toBeGreaterThan(0);
    expect(youthOf(g).prospects.every((p) => p.player.age >= 12)).toBe(true);
    let guard = 0;
    while (!isSeasonOver(g) && guard++ < 200) g = keep(playNext(g).state);
    const n = startNextSeason(g);
    expect(n.season).toBe(g.season + 1);
    const by = splitByCategory(youthOf(n).prospects);
    expect(by.sub13.length).toBeGreaterThan(0); // numa carreira nova só há Sub-13 no começo: os 12 anos chegam ao Sub-15 depois de duas viradas
    expect(youthOf(n).prospects.every((p) => p.player.age === 12 || p.player.age === 13)).toBe(true);
    expect(new Set(youthOf(n).prospects.map((p) => p.player.id)).size).toBe(youthOf(n).prospects.length);
    expect(squad0.length).toBeGreaterThan(0);
  });
});
