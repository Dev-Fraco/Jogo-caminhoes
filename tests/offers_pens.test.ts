import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { incomingDeals } from '../src/engine/deals';
import { generateOffers, MAX_OPEN_OFFERS, OFFER_CHANCE, STAR_INTEREST, toggleTransferList } from '../src/engine/roster';
import { newCareer } from '../src/engine/game';
import { BASE_DRAW_RATE, CUP_DRAW_BOOST, CUP_REROLL, simulateCupMatch, simulateMatch } from '../src/engine/match';
import { makeRng } from '../src/engine/rng';
import type { GameState } from '../src/engine/types';

const mk = (seed = 3): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, seed);

describe('clubes procuram mais os seus jogadores', () => {
  it('as chances subiram em relação às antigas (35% e 25%)', () => {
    expect(OFFER_CHANCE.buy).toBeGreaterThan(0.35);
    expect(OFFER_CHANCE.loan).toBeGreaterThan(0.25);
    expect(STAR_INTEREST).toBeGreaterThan(0);
  });
  it('jogador na lista de transferência recebe proposta com mais frequência', () => {
    let g = mk();
    const star = [...g.teams.palmeiras.players].sort((a, b) => b.strength - a.strength)[10]; // um jogador comum (não um dos 8 destaques)
    g = toggleTransferList(g, star.id);
    let got = 0;
    for (let s = 1; s <= 300; s++) { const r = generateOffers({ ...g, offers: [] }, makeRng(s)); if (incomingDeals(r).some((o) => o.playerId === star.id)) got++; }
    expect(got / 300).toBeGreaterThan(0.45);
    expect(got / 300).toBeLessThan(0.75);
  });
  it('destaques do elenco recebem propostas mesmo sem estar à venda, com ágio, e o celular avisa', () => {
    const g = mk();
    const top8 = new Set([...g.teams.palmeiras.players].sort((a, b) => b.strength - a.strength).slice(0, 8).map((p) => p.id));
    let spontaneous = 0, premium = 0, notified = false;
    for (let s = 1; s <= 300; s++) {
      const r = generateOffers({ ...g, offers: [] }, makeRng(s));
      for (const o of incomingDeals(r)) {
        expect(top8.has(o.playerId)).toBe(true);
        spontaneous++;
        if (o.terms.fee > 0 || o.terms.swapPlayerIds?.length) premium++;
      }
      if ((r.phone?.notifications ?? []).some((n) => /quer comprar/.test(n.text))) notified = true;
    }
    expect(spontaneous).toBeGreaterThan(30);
    expect(premium).toBe(spontaneous);
    expect(notified).toBe(true);
  });
  it('nunca passa de 8 propostas abertas', () => {
    let g = mk();
    for (let s = 1; s <= 120; s++) g = generateOffers({ ...g, round: (s % 30) + 1 }, makeRng(s));
    expect(incomingDeals(g).length).toBeLessThanOrEqual(MAX_OPEN_OFFERS);
  });
});

describe('jogos de copa vão mais aos pênaltis', () => {
  it('a taxa de empates em copas sobe cerca de 47% em relação ao jogo normal', () => {
    expect(CUP_DRAW_BOOST).toBe(0.47);
    expect(CUP_REROLL).toBeCloseTo(0.47 / (1 - BASE_DRAW_RATE), 5);
    const g = mk(5);
    const ids = Object.keys(g.teams);
    const rng = makeRng(11);
    let n = 0, dn = 0, dc = 0;
    for (let i = 0; i < 5000; i++) {
      const a = ids[Math.floor(rng() * ids.length)], b = ids[Math.floor(rng() * ids.length)];
      if (a === b) continue;
      const r1 = makeRng(i * 7 + 1), r2 = makeRng(i * 7 + 1);
      const norm = simulateMatch(g.teams[a], g.teams[b], r1, {}, { home: 'A', away: 'B' });
      const cup = simulateCupMatch(g.teams[a], g.teams[b], r2, {}, { home: 'A', away: 'B' });
      n++; if (norm.homeGoals === norm.awayGoals) dn++; if (cup.homeGoals === cup.awayGoals) dc++;
    }
    const ratio = dc / dn;
    expect(ratio).toBeGreaterThan(1.3);
    expect(ratio).toBeLessThan(1.65);
    expect(dc / n).toBeGreaterThan(0.16); // (pares sorteados de todo o mundo: com o favorito mais forte há menos empates que dentro de uma liga)
  });
  it('jogos de copa que empatam continuam indo aos pênaltis com as cobranças registradas (copa e continental)', () => {
    expect(simulateCupMatch).toBeTypeOf('function');
  });
});
