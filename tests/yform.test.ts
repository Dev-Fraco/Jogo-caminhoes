import { describe, expect, it } from 'vitest';
import { applyLoanGain, idlePenalty, loanGainPerYear, MIN_PLAY_SHARE } from '../src/engine/yform';
import { homeCategory } from '../src/engine/categories';
import type { Prospect } from '../src/engine/youth';
import { makeCareer } from './helpers';

const pr = (id: string, age: number, over = 50, pot = 70): Prospect => ({ player: { id, name: id, pos: 'MID', age, strength: over }, potential: pot, exact: over, train: 40 } as unknown as Prospect);

describe('ritmo de jogo da base', () => {
  it('empréstimo: volta com overall bem mais alto (3 a 7 por temporada, menos antes dos 16), e o potencial acompanha', () => {
    for (let i = 0; i < 40; i++) { const g = loanGainPerYear(pr(`a${i}`, 18), 2026); expect(g).toBeGreaterThanOrEqual(3); expect(g).toBeLessThanOrEqual(7); }
    const young = loanGainPerYear(pr('x', 14), 2026); expect(young).toBeLessThan(7);
    const p = pr('b', 18, 60, 62);
    const r = applyLoanGain(p, 2026, 2);
    expect(r.gain).toBeGreaterThanOrEqual(6);
    expect(r.p.player.strength).toBe(60 + r.gain);
    expect(r.p.potential).toBeGreaterThanOrEqual(r.p.player.strength);
    expect(r.p.train).toBe(40); // a barra de treino não some
    expect(applyLoanGain(pr('c', 18, 98, 99), 2026, 3).p.player.strength).toBeLessThanOrEqual(99);
  });
  it('quem joga pouco na temporada perde overall; quem joga normal não', () => {
    const g0 = makeCareer('flamengo', 4);
    const cat = homeCategory(17)!;
    const star = pr('estrela', 17, 60), bench = pr('banco', 17, 60), mid = pr('meio', 17, 60);
    const st = { [star.player.id]: [0, 0, 30, 2700, 0, 0, 0, 2, 17], [bench.player.id]: [0, 0, 1, 20, 0, 0, 0, 2, 17], [mid.player.id]: [0, 0, 20, 1700, 0, 0, 0, 2, 17] };
    const g = { ...g0, ycomps: [{ id: 'c1', src: 'liga', cat, name: 'x', season: g0.season, clubs: [g0.userClubId], absent: [], plan: [], done: 0, m: [], st, nm: {} }], youth: { ...g0.youth!, prospects: [star, bench, mid] } } as unknown as typeof g0;
    const out = idlePenalty(g).youth!.prospects;
    expect(out.find((p) => p.player.id === 'estrela')!.player.strength).toBe(60);
    expect(out.find((p) => p.player.id === 'meio')!.player.strength).toBe(60);
    const b = out.find((p) => p.player.id === 'banco')!;
    expect(b.player.strength).toBeLessThan(60); expect(b.player.strength).toBeGreaterThanOrEqual(57);
    expect(b.potential).toBe(70);
    expect(1700 / 2700).toBeGreaterThan(MIN_PLAY_SHARE);
    // emprestado não é punido
    const loaned = { ...g, youth: { ...g.youth!, prospects: [star, { ...bench, loanedTo: { club: 'x', until: 2027, share: 0.5 } }] } };
    expect(idlePenalty(loaned as typeof g).youth!.prospects[1].player.strength).toBe(60);
  });
});
