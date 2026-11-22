import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { brazilPyramid } from '../src/data/pyramid';
import { isSeasonOver, newCareer, playNext } from '../src/engine/game';
import { hooks, resetHooks } from '../src/engine/hooks';
import { installExtras } from '../src/premium/extras';
import { loadExtras, loadSeasonPack, premiumAllowed, seasonPackReady, setPremiumGate } from '../src/premium/loader';

afterEach(() => { setPremiumGate(async () => true); installExtras(); });

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

describe('fronteira do pacote Premium', () => {
  it('com o portão fechado, o pacote dos extras se recusa a carregar; a virada de temporada (o jogo grátis continua só com a liga do clube) segue livre', async () => {
    setPremiumGate(async () => false);
    expect(await premiumAllowed()).toBe(false);
    await expect(loadExtras()).rejects.toThrow('premium-required');
    const pack = await loadSeasonPack();
    expect(typeof pack.startNextSeason).toBe('function');
  });
  it('com o portão aberto, o pacote carrega e traz a virada de temporada', async () => {
    const pack = await loadSeasonPack();
    expect(typeof pack.startNextSeason).toBe('function'); expect(typeof pack.skipSeasons).toBe('function');
    expect(seasonPackReady()).toBe(true);
  });
  it('o código do jogo grátis nunca importa o pacote Premium diretamente (só pelo carregador), para ele ficar fora do app grátis', () => {
    const offenders: string[] = [];
    for (const f of walk('src').filter((x) => /\.(ts|tsx)$/.test(x) && !x.startsWith(join('src', 'premium')))) {
      const txt = readFileSync(f, 'utf8');
      if (/from '[./]*\/premium\/season'|import\('[./]*\/premium\/season'\)/.test(txt)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).toContain('loadSeasonPack');
  });

  it('o pacote dos extras também respeita o portão', async () => {
    resetHooks(); setPremiumGate(async () => false);
    await expect(loadExtras()).rejects.toThrow('premium-required');
    expect(hooks.installed).toBe(false);
  });
});

describe('jogo grátis (sem o pacote dos extras)', () => {
  const career = (club = 'csa') => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: club, divisions: brazilPyramid(), cup: true }, 11);
  it('não existem ligas do mundo, copas especiais nem Super Mundial, e a temporada termina normalmente', () => {
    resetHooks();
    let g = career();
    expect(g.world).toBeUndefined(); expect(g.regionais).toBeUndefined();
    let guard = 0;
    while (!isSeasonOver(g) && guard++ < 800) g = playNext(g).state;
    expect(isSeasonOver(g)).toBe(true);
    expect(g.regionais).toBeUndefined(); expect(g.superMundial).toBeUndefined(); expect(g.world).toBeUndefined();
    expect(g.lib?.championId).toBeTruthy(); // o resto do jogo (copas continentais, Mundial) segue normal
  }, 300_000);
  it('um save com copa especial em andamento não trava sem o pacote: as copas somem e a temporada segue', () => {
    let g = career(); let guard = 0;
    while (!isSeasonOver(g) && guard++ < 800) g = playNext(g).state; // (com o pacote) temporada completa
    g = { ...g, regionais: { nordeste: { ...g.regionais!.nordeste!, due: true, championId: undefined } } }; // como um save de quem tinha o Premium e perdeu o acesso
    resetHooks();
    expect(isSeasonOver(g)).toBe(false);
    const n = playNext(g).state;
    expect(n.regionais).toBeUndefined();
    expect(isSeasonOver(n)).toBe(true);
  }, 300_000);
  it('com o pacote, tudo volta: mundo, copas regionais e Super Mundial', () => {
    installExtras();
    const g = career();
    expect(g.world).toBeTruthy(); expect(Object.keys(g.regionais ?? {}).length).toBe(3); // Nordeste, Verde e Sul-Sudeste
  });
});
