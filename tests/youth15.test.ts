import { describe, expect, it } from 'vitest';
import { CATEGORIES, categoriesOf } from '../src/engine/categories';
import { enrollCheck, rosterOf, MIN_ROSTER } from '../src/engine/yroster';
import { migrateGame, SAVE_SCHEMA } from '../src/engine/migrate';
import { youthOf, SEED_PER_CATEGORY, MAX_PROSPECTS } from '../src/engine/youth';
import { compsOf } from '../src/engine/ycomp';
import { makeCareer } from './helpers';

describe('a base começa com 15 atletas em cada categoria', () => {
  it('carreira nova: Sub-13, Sub-15, Sub-17 e Sub-21 com 15 atletas cada (idades certas, goleiros, sem repetir) e já inscritas nas competições', () => {
    const g = makeCareer('palmeiras', 21); const y = youthOf(g);
    expect(g.youth).toBeTruthy(); expect(y.seeded).toBe(true);
    const bands: [string, number, number][] = [['sub13', 12, 13], ['sub15', 14, 15], ['sub17', 16, 17], ['sub21', 18, 21]];
    for (const [cat, lo, hi] of bands) {
      const mine = y.prospects.filter((p) => p.player.age >= lo && p.player.age <= hi);
      expect(mine.length, cat).toBeGreaterThanOrEqual(SEED_PER_CATEGORY);
      expect(mine.filter((p) => p.player.pos === 'GK').length, `${cat} goleiros`).toBeGreaterThanOrEqual(2);
      expect(mine.every((p) => p.player.contract && p.attrs && p.potential >= p.player.strength), cat).toBe(true);
    }
    expect(new Set(y.prospects.map((p) => p.player.id)).size).toBe(y.prospects.length);
    expect(new Set(y.prospects.map((p) => p.player.name)).size).toBe(y.prospects.length);
    for (const c of CATEGORIES) { const e = enrollCheck(g, c.id); expect(e.have, c.id).toBeGreaterThanOrEqual(SEED_PER_CATEGORY); expect(e.ok, c.id).toBe(true); expect(e.need).toBe(MIN_ROSTER); }
    expect(y.prospects.length).toBeLessThanOrEqual(MAX_PROSPECTS + 4);
    for (const c of CATEGORIES) expect(compsOf(g, c.id).length, `competições ${c.id}`).toBeGreaterThan(0);
  });

  it('mais velhos são mais fortes que os novatos da mesma base (quem passou anos na base evoluiu)', () => {
    const y = youthOf(makeCareer('palmeiras', 4)); const avg = (lo: number, hi: number) => { const l = y.prospects.filter((p) => p.player.age >= lo && p.player.age <= hi); return l.reduce((a, p) => a + p.player.strength, 0) / l.length; };
    expect(avg(18, 21)).toBeGreaterThan(avg(14, 15)); expect(avg(14, 15)).toBeGreaterThan(avg(12, 13));
  });

  it('todos os clubes da IA também têm pelo menos 15 atletas em cada categoria', () => {
    const g = makeCareer('palmeiras', 9); const ids = Object.keys(g.clubs).filter((i) => i !== g.userClubId).slice(0, 40);
    for (const id of ids) for (const c of CATEGORIES) expect(rosterOf(g, id, c.id, 0).length, `${id} ${c.id}`).toBeGreaterThanOrEqual(SEED_PER_CATEGORY);
  });

  it('save antigo (sem a base completa): completa só o que falta, não mexe em ninguém que já existia e não repete', () => {
    const g = makeCareer('palmeiras', 33); const full = youthOf(g);
    const few = full.prospects.filter((p) => p.player.age <= 13).slice(0, 5);                // save antigo: só 5 meninos de 12 e 13 anos
    const old = { ...g, schema: SAVE_SCHEMA - 1, youth: { ...full, prospects: few, seeded: undefined } };
    const { game, report } = migrateGame(old);
    expect(report.rejected).toBe(false);
    const after = youthOf(game);
    for (const p of few) expect(after.prospects.find((x) => x.player.id === p.player.id)).toEqual(p);        // os antigos ficaram idênticos
    for (const c of CATEGORIES) expect(rosterOf(game, game.userClubId, c.id, 0).length, c.id).toBeGreaterThanOrEqual(SEED_PER_CATEGORY);
    const again = migrateGame(game); expect(youthOf(again.game).prospects.length).toBe(after.prospects.length);
    void categoriesOf;
  });
});
