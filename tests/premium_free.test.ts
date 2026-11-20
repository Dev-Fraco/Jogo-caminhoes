import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { brazilPyramid } from '../src/data/pyramid';
import { isSeasonOver, newCareer, playNext } from '../src/engine/game';
import { installExtras } from '../src/premium/extras';
import { extrasOpen, FREE_SEASONS, freeLimited, inTrial, isPremium, limitedAt, seasonsPlayed, setActiveGame, setFreePreview } from '../src/premium/entitlement';
import { loadExtras } from '../src/premium/loader';
import { loadSeasonPack } from '../src/premium/loader';
import { resetHooks } from '../src/engine/hooks';
import { Table } from '../src/ui/Table';
import { PremiumPreview } from '../src/premium/ui/PremiumPreview';
import type { GameState } from '../src/engine/types';
import type { ClubData } from '../src/data/clubs';
import { generateSquad } from '../src/engine/squad';
const custom = (): ClubData => ({ id: 'meu-real-esperanca', name: 'Real Esperança', shortName: 'RES', badge: 'x', primaryColor: '#1e6bff', secondaryColor: '#ffffff', stadium: 'Estádio da Esperança', city: 'Fortaleza', budget: 900_000, boardExpectation: 'mid', reputation: 1, uf: 'CE', custom: true, squad: generateSquad({ id: 'meu-real-esperanca', name: 'Real Esperança', short: 'RES', color: '#1e6bff', strength: 48 }, 2026) });

afterEach(() => { setFreePreview(false); setActiveGame(null); installExtras(); });
const career = (club = 'csa', seed = 11): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: club, divisions: brazilPyramid(), cup: true }, seed);
const finish = (g: GameState) => { let n = 0; while (!isSeasonOver(g) && n++ < 900) g = playNext(g).state; return g; };

describe('regras do grátis e do Premium', () => {
  it('a carreira registra a 1ª temporada; a temporada grátis é a primeira e depois o jogo grátis fica limitado', () => {
    const g = career();
    expect(g.freeStart).toBe(2026); expect(FREE_SEASONS).toBe(1);
    expect(seasonsPlayed(g)).toBe(0); expect(inTrial(g)).toBe(true);
    expect(inTrial({ ...g, season: 2027 })).toBe(false);
    expect(isPremium()).toBe(true);                       // (enquanto não há cobrança todos são Premium)
    expect(freeLimited({ ...g, season: 2027 })).toBe(false);
    setFreePreview(true);
    expect(isPremium()).toBe(false);
    expect(freeLimited(g)).toBe(false);                   // na 1ª temporada tudo liberado
    expect(freeLimited({ ...g, season: 2027 })).toBe(true);
    expect(limitedAt(g, 2026)).toBe(false); expect(limitedAt(g, 2027)).toBe(true);
  });
  it('o portão dos extras: aberto no Premium e na temporada grátis; fechado depois dela no grátis', async () => {
    setFreePreview(true);
    setActiveGame(career());
    expect(extrasOpen()).toBe(true); await expect(loadExtras()).resolves.toBeUndefined();
    setActiveGame({ season: 2027, freeStart: 2026 });
    expect(extrasOpen()).toBe(false); await expect(loadExtras()).rejects.toThrow('premium-required');
    setFreePreview(false); expect(extrasOpen()).toBe(true);
  });
});

describe('virada de temporada no grátis', () => {
  it('Premium: a 2ª temporada mantém copa, estadual, continentais, mundo e copas especiais', async () => {
    const pack = await loadSeasonPack();
    const g2 = pack.startNextSeason(finish(career()));
    expect(g2.season).toBe(2027);
    expect(g2.cup).toBeTruthy(); expect(g2.estadual).toBeTruthy(); expect(g2.lib).toBeTruthy(); expect(g2.ucl).toBeTruthy(); expect(g2.regionais).toBeTruthy();
  }, 300_000);
  it('Grátis: depois da 1ª temporada ficam só as divisões do clube; as outras competições somem, o save é mantido e o jogo continua por várias temporadas', async () => {
    setFreePreview(true);
    const pack = await loadSeasonPack();
    let g = finish(career());
    expect(g.cup).toBeTruthy(); expect(g.lib?.championId).toBeTruthy(); expect(g.regionais).toBeTruthy();   // a 1ª temporada foi completa
    const history = g.history.length, titles = (g.titles ?? []).length;
    g = pack.startNextSeason(g);
    expect(g.season).toBe(2027);
    for (const k of ['cup', 'estadual', 'lib', 'sula', 'ucl', 'mundial', 'superMundial', 'regionais', 'foreign'] as const) expect(g[k], k).toBeUndefined();
    expect(g.divisions.length).toBe(4); expect(g.history.length).toBe(history + 1); expect((g.titles ?? []).length).toBeGreaterThanOrEqual(titles);
    resetHooks(); // (sem o pacote dos extras, como no app grátis)
    g = finish(g);
    expect(isSeasonOver(g)).toBe(true);
    g = pack.startNextSeason(g);
    expect(g.season).toBe(2028); expect(g.cup).toBeUndefined();
  }, 600_000);
  it('Grátis, clube que só joga o estadual: o estadual continua (é a liga dele)', async () => {
    setFreePreview(true);
    const pack = await loadSeasonPack();
    const g0 = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: custom().id, divisions: brazilPyramid(), cup: true, outside: custom() }, 5);
    const g = pack.startNextSeason(finish(g0));
    expect(g.estadual).toBeTruthy(); expect(g.cup).toBeUndefined();
  }, 300_000);
});

describe('telas do grátis', () => {
  it('a prévia das outras ligas e copas explica o que o Premium libera', () => {
    const html = renderToStaticMarkup(createElement(PremiumPreview, { feature: 'leagues' }));
    expect(html).toContain('🔒'); expect(html).toContain('Outras ligas e copas'); expect(html).toContain('Premium');
  });
  it('na Tabela do jogo grátis (depois da 1ª temporada) a divisão do clube aparece normalmente', () => {
    setFreePreview(true);
    const g = { ...career(), season: 2027 };
    const html = renderToStaticMarkup(createElement(Table, { game: g }));
    expect(html).toContain('Classificação'.length ? 'class="tb"' : ''); // a tabela da divisão do clube aparece
  });
});
