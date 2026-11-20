import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadScene3D, loadSeasonPack, premiumAllowed, seasonPackReady, setPremiumGate } from '../src/premium/loader';

afterEach(() => setPremiumGate(async () => true));

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

describe('fronteira do pacote Premium', () => {
  it('com o portão fechado, o pacote da 2ª temporada em diante e o 3D se recusam a carregar (e o jogo grátis segue sem eles)', async () => {
    setPremiumGate(async () => false);
    expect(await premiumAllowed()).toBe(false);
    await expect(loadSeasonPack()).rejects.toThrow('premium-required');
    await expect(loadScene3D()).rejects.toThrow('premium-required');
    expect(seasonPackReady()).toBe(false);
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
    // e o desenhista 3D só é carregado pelo carregador
    const pitch = readFileSync('src/ui/Pitch3D.tsx', 'utf8');
    expect(pitch).toContain('loadScene3D'); expect(pitch).not.toMatch(/import\('\.\/pitch3d\/three\/scene'\)/);
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).toContain('loadSeasonPack');
  });
});
