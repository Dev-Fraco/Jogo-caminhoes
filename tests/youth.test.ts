import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { isSeasonOver, newCareer, playNext, startNextSeason } from '../src/engine/game';
import { academyCost, ensureYouth, MAX_LEVEL, MAX_PROSPECTS, promoteProspect, releaseProspect, stars, upgradeAcademy, youthOf, youthSeason, youthTick, RELEASE_AGE } from '../src/engine/youth';
import { MAX_SQUAD } from '../src/engine/transfers';
import type { GameState } from '../src/engine/types';

const mk = (): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, 12);
const keep = (g: GameState): GameState => ({ ...g, morale: { ...g.morale, board: 60 } });

describe('categorias de base', () => {
  it('a primeira safra traz jovens de 15 a 17 anos, fracos agora e com potencial', () => {
    const g = ensureYouth(mk());
    const y = youthOf(g);
    expect(y.prospects.length).toBe(4);
    for (const p of y.prospects) {
      expect(p.player.age).toBeGreaterThanOrEqual(15); expect(p.player.age).toBeLessThanOrEqual(17);
      expect(p.player.strength).toBeLessThan(45);
      expect(p.potential).toBeGreaterThanOrEqual(p.player.strength + 12);
      expect(stars(p.potential)).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(y.prospects.map((p) => p.player.id)).size).toBe(y.prospects.length);
    expect(ensureYouth(g)).toBe(g); // só cria uma vez
  });
  it('os jovens evoluem a cada rodada, sem passar do potencial', () => {
    let g = ensureYouth(mk());
    const before = youthOf(g).prospects.map((p) => p.exact);
    for (let i = 0; i < 20; i++) g = youthTick(g);
    youthOf(g).prospects.forEach((p, i) => { expect(p.exact).toBeGreaterThan(before[i]); expect(p.exact).toBeLessThanOrEqual(p.potential); expect(p.player.strength).toBe(Math.round(p.exact)); });
  });
  it('promover leva o jovem ao elenco com contrato; elenco cheio impede', () => {
    let g = ensureYouth(mk());
    const id = youthOf(g).prospects[0].player.id;
    const r = promoteProspect(g, id);
    if (!r.ok) throw new Error(r.error);
    const t = r.state.teams.palmeiras;
    const p = t.players.find((x) => x.id === id)!;
    expect(p.contract?.wage).toBeGreaterThan(10_000);
    expect(p.contract!.until).toBe(g.season + 3);
    expect(youthOf(r.state).prospects.some((x) => x.player.id === id)).toBe(false);
    expect(promoteProspect(r.state, id).ok).toBe(false);
    const full = { ...g, teams: { ...g.teams, palmeiras: { ...g.teams.palmeiras, players: Array.from({ length: MAX_SQUAD }, (_, i) => ({ ...g.teams.palmeiras.players[0], id: `f${i}` })) } } };
    expect(promoteProspect(full, id)).toMatchObject({ ok: false });
  });
  it('dispensar tira da base', () => {
    const g = ensureYouth(mk());
    const id = youthOf(g).prospects[1].player.id;
    expect(youthOf(releaseProspect(g, id)).prospects.length).toBe(3);
    expect(releaseProspect(g, 'x')).toBe(g);
  });
  it('academia: melhorar custa caixa, aumenta a safra e tem limite', () => {
    let g = ensureYouth(mk());
    const cash = g.budgets.palmeiras, cost = academyCost(g);
    const r = upgradeAcademy(g); if (!r.ok) throw new Error(r.error);
    g = r.state;
    expect(g.budgets.palmeiras).toBe(cash - cost);
    expect(youthOf(g).level).toBe(1);
    expect(academyCost(g)).toBeGreaterThan(cost);
    expect(upgradeAcademy({ ...g, budgets: { ...g.budgets, palmeiras: 0 } })).toMatchObject({ ok: false });
    let m = { ...g, budgets: { ...g.budgets, palmeiras: 1e12 } };
    for (let i = 0; i < 8; i++) { const x = upgradeAcademy(m); if (x.ok) m = x.state; }
    expect(youthOf(m).level).toBe(MAX_LEVEL);
    expect(upgradeAcademy(m)).toMatchObject({ ok: false });
    const next = youthSeason(m);
    expect(youthOf(next).prospects.length).toBeGreaterThan(4);
    expect(youthOf(next).prospects.length).toBeLessThanOrEqual(MAX_PROSPECTS);
  });
  it('virada de temporada: envelhecem, crescem, os de 20 anos saem e chega safra nova', () => {
    let g = ensureYouth(mk());
    g = { ...g, youth: { ...youthOf(g), prospects: youthOf(g).prospects.map((p, i) => (i === 0 ? { ...p, player: { ...p.player, age: RELEASE_AGE - 1 } } : p)) } };
    const oldIds = youthOf(g).prospects.map((p) => p.player.id);
    const n = youthSeason(g);
    const ids = youthOf(n).prospects.map((p) => p.player.id);
    expect(ids).not.toContain(oldIds[0]); // o de 19 virou 20 e saiu
    expect(ids).toEqual(expect.arrayContaining(oldIds.slice(1)));
    expect(youthOf(n).prospects.length).toBeGreaterThan(oldIds.length - 1);
    expect(n.news[0].text).toMatch(/Nova safra/);
    expect(youthOf(n).prospects.find((p) => p.player.id === oldIds[1])!.player.age).toBe(g.youth!.prospects[1].player.age + 1);
  });
  it('na temporada de verdade: a base nasce na 1ª rodada, cresce e renova no ano seguinte', () => {
    let g = mk();
    while (g.estadual?.due) g = keep(playNext(g).state);
    g = keep(playNext(g).state);
    expect(youthOf(g).prospects.length).toBeGreaterThan(0);
    let guard = 0;
    while (!isSeasonOver(g) && guard++ < 200) g = keep(playNext(g).state);
    const n = startNextSeason(g);
    expect(youthOf(n).lastIntake).toBe(n.season);
    expect(youthOf(n).prospects.length).toBeGreaterThanOrEqual(4);
    expect(n.news.some((x) => /Nova safra/.test(x.text))).toBe(true);
  });
});
