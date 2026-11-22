import { afterEach, describe, expect, it } from 'vitest';
import { applyMods, parseMod } from '../src/data/mods';
import { MAX_TROPHY, parseTrophies, setTrophies, trophyOf } from '../src/data/trophies';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
afterEach(() => { applyMods([]); setTrophies({}); });

describe('troféus das competições (mods)', () => {
  it('valida chaves, formato da imagem e tamanho', () => {
    expect(parseTrophies({ cup: PNG, lib: PNG })).toMatchObject({ ok: true });
    expect(parseTrophies({ naoexiste: PNG })).toMatchObject({ ok: false });
    expect(parseTrophies({ cup: 'http://x/y.png' })).toMatchObject({ ok: false });
    expect(parseTrophies({ cup: `data:image/png;base64,${'A'.repeat(MAX_TROPHY)}` })).toMatchObject({ ok: false });
    expect(parseTrophies([PNG])).toMatchObject({ ok: false });
  });
  it('um mod só com troféus é válido; vale enquanto o mod está ligado e volta ao padrão quando desliga', () => {
    const r = parseMod(JSON.stringify({ name: 'Troféus', trophies: { cup: PNG } }));
    if (!r.ok) throw new Error(r.error);
    expect(r.mod.trophies).toEqual({ cup: PNG });
    applyMods([r.mod]);
    expect(trophyOf('cup')).toBe(PNG);
    expect(trophyOf('lib')).toBeUndefined();
    applyMods([{ ...r.mod, enabled: false }]);
    expect(trophyOf('cup')).toBeUndefined();
  });
  it('troféu inválido recusa o mod inteiro, com mensagem clara', () => {
    const r = parseMod(JSON.stringify({ name: 'X', clubs: [{ id: 'palmeiras', name: 'Meu Time' }], trophies: { cup: 'lixo' } }));
    expect(r.ok).toBe(false);
  });
});
