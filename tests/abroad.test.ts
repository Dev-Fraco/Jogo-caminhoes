import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { acceptAnyOffer } from '../src/engine/abroad';
import { registerBank } from '../src/engine/bank';
import { isSeasonOver, newCareer, playNext, userDivision } from '../src/engine/game';
import { coachLevel, fire, foreignClubs, generateJobOffers, offerClub } from '../src/engine/jobs';
import { makeRng } from '../src/engine/rng';
import type { GameState } from '../src/engine/types';

const mk = (): GameState => {
  let g = newCareer({ saveName: 'carreira', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, 8);
  const r = registerBank(g, 'A B', 'segredo1', 'segredo1'); if (r.ok) g = r.state;
  return { ...g, coachPoints: 60, coachMoney: 123_456, titles: [{ season: 2025, clubId: 'palmeiras', clubName: 'Palmeiras', competition: 'Brasileirão', kind: 'liga' }] };
};
const fired = (g: GameState) => fire(g, 'resultados ruins');

describe('treinador demitido recebe propostas do mundo inteiro', () => {
  it('há clubes de outros países elegíveis para o nível do treinador', () => {
    const f0 = fired(mk());
    const list = foreignClubs(f0);
    expect(list.length).toBeGreaterThan(20);
    expect(new Set(list.map((f) => f.countryId)).size).toBeGreaterThan(3);
    expect(list.every((f) => f.countryId !== 'BR')).toBe(true); // a liga atual não conta como "de fora"
    expect(list.every((f) => f.club.reputation <= coachLevel(f0))).toBe(true);
  });
  it('demitido: algumas propostas vêm de fora; empregado: só do próprio país', () => {
    let abroad = 0, domestic = 0;
    for (let s = 1; s <= 40; s++) {
      const g = generateJobOffers({ ...fired(mk()), jobOffers: [] }, makeRng(s), 3);
      for (const o of g.jobOffers ?? []) o.foreign ? abroad++ : domestic++;
    }
    expect(abroad).toBeGreaterThan(10);
    expect(domestic).toBeGreaterThan(10);
    for (let s = 1; s <= 30; s++) {
      const g = generateJobOffers({ ...mk(), jobOffers: [] }, makeRng(s), 3);
      expect((g.jobOffers ?? []).some((o) => o.foreign)).toBe(false);
    }
  });
  it('proposta de fora mostra o clube e o país e avisa no celular', () => {
    let g: GameState | undefined;
    for (let s = 1; s < 60 && !g; s++) { const t = generateJobOffers({ ...fired(mk()), jobOffers: [] }, makeRng(s), 4); if (t.jobOffers?.some((o) => o.foreign)) g = t; }
    const o = g!.jobOffers!.find((x) => x.foreign)!;
    expect(offerClub(g!, o).name).toBeTruthy();
    expect(g!.news.some((n) => n.text.includes(o.foreign!.countryName))).toBe(true);
  });
  it('aceitar um clube de fora leva a carreira para a liga dele e mantém o que é do treinador', () => {
    let g: GameState | undefined;
    for (let s = 1; s < 80 && !g; s++) { const t = generateJobOffers({ ...fired(mk()), jobOffers: [] }, makeRng(s), 4); if (t.jobOffers?.some((o) => o.foreign)) g = t; }
    const o = g!.jobOffers!.find((x) => x.foreign)!;
    const r = acceptAnyOffer(g!, o.clubId);
    if (!r.ok) throw new Error(r.error);
    const n = r.state;
    expect(n.unemployed).toBeFalsy();
    expect(n.userClubId).toBe(o.clubId);
    expect(n.clubs[o.clubId].name).toBe(o.foreign!.club.name);
    expect(n.clubs.palmeiras).toBeUndefined(); // outro mundo
    expect(userDivision(n).clubIds).toContain(o.clubId);
    expect(n.coachPoints).toBe(g!.coachPoints);
    expect(n.coachMoney).toBe(g!.coachMoney); // inclui a indenização da demissão
    expect(n.titles).toHaveLength(1);
    expect(n.bank?.passHash).toBeTruthy();
    expect(n.jobOffers ?? []).toEqual([]);
    const spells = n.jobs ?? [];
    expect(spells[spells.length - 1].clubId).toBe(o.clubId);
    expect(spells.length).toBeGreaterThanOrEqual(2);
    // o jogo roda na liga nova
    let m = n, guard = 0;
    while (!isSeasonOver(m) && guard++ < 200) m = { ...playNext(m).state, morale: { ...m.morale, board: 60 } };
    expect(isSeasonOver(m)).toBe(true);
  });
  it('proposta inexistente ou vencida não vale', () => {
    expect(acceptAnyOffer(fired(mk()), 'nao-existe').ok).toBe(false);
  });
});
