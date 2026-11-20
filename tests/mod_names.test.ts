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

describe('pacote de elencos com posição em "_posicao" e escudos por arquivo', () => {
  const mk = (badge?: string) => JSON.stringify({ name: 'x', clubs: [{ id: A[0].id, name: 'Real Alfa', ...(badge ? { badge } : {}), players: [
    { name: 'Goleiro Um', age: 30, overall: 80, _posicao: 'Goleiro' }, { name: 'Zagueiro Um', age: 25, overall: 70, _posicao: 'Defensor' },
    { name: 'Meia Um', age: 22, overall: 65, _posicao: 'Meia' }, { name: 'Ata Um', age: 28, overall: 75, _posicao: 'Atacante' }] }] });
  it('usa _posicao para montar o elenco por posição', () => {
    const r = validatePack(mk());
    if (!r.ok) throw new Error(r.error);
    applyPack(r.pack);
    const sq = A[0].squad;
    expect(sq.find((p) => p.name === 'Goleiro Um')?.pos).toBe('GK');
    expect(sq.find((p) => p.name === 'Zagueiro Um')?.pos).toBe('DEF');
    expect(sq.find((p) => p.name === 'Ata Um')?.pos).toBe('ATT');
    expect(sq.find((p) => p.name === 'Ata Um')?.strength).toBe(75);
  });
  it('avisa quando o JSON cita escudos que não vieram junto; com a imagem, conta o escudo', () => {
    const sem = validatePack(mk('flarj.png'), []);
    if (!sem.ok) throw new Error(sem.error);
    expect(sem.report.missingBadges).toBe(1); expect(sem.report.badges).toBe(0);
    const com = validatePack(mk('flarj.png'), ['escudos/FLARJ.png']);
    if (!com.ok) throw new Error(com.error);
    expect(com.report.badges).toBe(1); expect(com.report.missingBadges).toBeUndefined();
  });
});

describe('uniformes por mod', () => {
  const id = A[0].id;
  it('aceita kit válido, aplica e desliga devolve o original', () => {
    const r = parseMod(JSON.stringify({ name: 'u', clubs: [{ id, kit: { pattern: 'stripes', base: '#112233', accent: '#ffffff', number: '#000000' } }] }));
    if (!r.ok) throw new Error(r.error);
    expect(A[0].kit).toBeUndefined();
    applyMods([r.mod]);
    expect(A[0].kit?.pattern).toBe('stripes');
    applyMods([]);
    expect(A[0].kit).toBeUndefined();
  });
  it('rejeita desenho, cor e imagem inválidos', () => {
    const bad = (kit: unknown) => parseMod(JSON.stringify({ name: 'u', clubs: [{ id, kit }] })).ok;
    expect(bad({ pattern: 'xadrez', base: '#112233' })).toBe(false);
    expect(bad({ pattern: 'solid', base: 'azul' })).toBe(false);
    expect(bad({ pattern: 'solid' })).toBe(false);
    expect(bad({ pattern: 'solid', base: '#112233', image: 'http://x/y.png' })).toBe(false);
    expect(bad({ pattern: 'solid', base: '#112233', image: 'data:image/png;base64,iVBORw0KGgo=' })).toBe(true);
  });
});
