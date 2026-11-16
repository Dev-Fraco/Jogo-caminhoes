import { afterEach, describe, expect, it } from 'vitest';
import { CLUBS_DATA } from '../src/data/clubs';
import { applyMods, parseMod } from '../src/data/mods';
import { applyPack, validatePack } from '../src/data/playerpack';

const A = CLUBS_DATA['serie-a'];
afterEach(() => { applyMods([]); applyPack(null); });

describe('nomes trocados por pacote/mod', () => {
  it('pacote só com nomes: siglas saem do nome e nunca se repetem na divisão', () => {
    const r = validatePack(JSON.stringify({ name: 'x', clubs: [{ id: A[0].id, name: 'Real Alfa' }, { id: A[1].id, name: 'Real Beta' }, { id: A[2].id, name: 'Real Gama' }] }));
    if (!r.ok) throw new Error(r.error);
    applyPack(r.pack);
    expect(A[0].name).toBe('Real Alfa');
    expect(new Set(A.map((c) => c.shortName)).size).toBe(A.length);
    expect(A.every((c) => /^[A-Z]{3}$/.test(c.shortName))).toBe(true);
  });
  it('desligar o pacote devolve nomes e siglas originais', () => {
    const before = A.map((c) => `${c.name}|${c.shortName}`);
    const r = validatePack(JSON.stringify({ name: 'x', clubs: [{ id: A[0].id, name: 'Real Alfa' }, { id: A[1].id, name: 'Real Beta' }] }));
    if (!r.ok) throw new Error(r.error);
    applyPack(r.pack); applyPack(null);
    expect(A.map((c) => `${c.name}|${c.shortName}`)).toEqual(before);
  });
  it('estádio com até 60 letras vale; com mais, não', () => {
    const mk = (s: string) => parseMod(JSON.stringify({ name: 'x', clubs: [{ id: A[0].id, stadium: s }] }));
    expect(mk('E'.repeat(55)).ok).toBe(true);
    expect(mk('E'.repeat(61)).ok).toBe(false);
  });
  it('mod com siglas repetidas também sai sem repetição', () => {
    const m = parseMod(JSON.stringify({ name: 'x', clubs: [{ id: A[0].id, name: 'Real Alfa', shortName: 'REA' }, { id: A[1].id, name: 'Real Beta', shortName: 'REA' }] }));
    if (!m.ok) throw new Error(m.error);
    applyMods([{ ...m.mod, enabled: true }]);
    expect(new Set(A.map((c) => c.shortName)).size).toBe(A.length);
  });
});
