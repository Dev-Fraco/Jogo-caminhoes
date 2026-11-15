import { describe, expect, it } from 'vitest';
import { CLUBS_DATA } from './clubs';
import { applyPack, buildPackSquad, normPos, packTemplate, validatePack } from './playerpack';
import { readZip } from './zip';

const first = () => Object.values(CLUBS_DATA).flat()[0];

describe('pacote de elencos', () => {
  it('modelo é válido (sem imagens, só avisos)', () => {
    const r = validatePack(packTemplate(1), ['x.png']);
    expect(r.ok).toBe(true);
  });
  it('rejeita lixo e ids desconhecidos', () => {
    expect(validatePack('nada').ok).toBe(false);
    expect(validatePack(JSON.stringify({ name: 'a', clubs: [{ id: 'nao-existe', players: [{ name: 'Zé', pos: 'ATT' }] }] })).ok).toBe(false);
  });
  it('aceita posições em português', () => {
    expect(normPos('zag')).toBe('DEF'); expect(normPos('Gol')).toBe('GK'); expect(normPos('xx')).toBeUndefined();
  });
  it('aplica e remove o pacote', () => {
    const c = first(); const orig = c.squad;
    const txt = JSON.stringify({ name: 'T', clubs: [{ id: c.id, players: [{ name: 'Fulano Teste', pos: 'ATT', overall: 80 }] }] });
    const r = validatePack(txt); if (!r.ok) throw new Error(r.error);
    applyPack(r.pack);
    expect(c.squad.some((p) => p.name === 'Fulano Teste' && p.strength === 80)).toBe(true);
    expect(c.squad.length).toBeGreaterThanOrEqual(orig.length - 5);
    expect(c.squad.filter((p) => p.pos === 'GK').length).toBeGreaterThanOrEqual(3);
    applyPack(null);
    expect(c.squad).toBe(orig);
  });
  it('elenco determinístico', () => {
    const c = first();
    expect(buildPackSquad(c, [{ name: 'A B', pos: 'MID' }])).toEqual(buildPackSquad(c, [{ name: 'A B', pos: 'MID' }]));
  });
});

describe('zip', () => {
  it('lê zip guardado (sem compressão)', async () => {
    const name = new TextEncoder().encode('a.txt'), data = new TextEncoder().encode('oi');
    const lh = new Uint8Array(30 + name.length + data.length); const v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, name.length, true);
    lh.set(name, 30); lh.set(data, 30 + name.length);
    const cd = new Uint8Array(46 + name.length); const c = new DataView(cd.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, 0, true); cd.set(name, 46);
    const end = new Uint8Array(22); const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(10, 1, true); e.setUint32(12, cd.length, true); e.setUint32(16, lh.length, true);
    const zip = new Uint8Array([...lh, ...cd, ...end]);
    const out = await readZip(zip);
    expect(out[0].name).toBe('a.txt'); expect(new TextDecoder().decode(out[0].data)).toBe('oi');
    await expect(readZip(new Uint8Array(10))).rejects.toThrow();
  });
});
