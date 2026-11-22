import { describe, expect, it } from 'vitest';
import { computeTable } from '../src/engine/table';
import type { MatchResult } from '../src/engine/types';

const r = (home: string, away: string, hg: number, ag: number): MatchResult => ({ divisionId: 'x', round: 1, homeId: home, awayId: away, homeGoals: hg, awayGoals: ag, events: [] });

describe('desempate: confronto direto', () => {
  it('empatados em pontos, vitórias, saldo e gols marcados: vale o confronto direto (antes da ordem alfabética)', () => {
    const clubs = [{ id: 'a', name: 'Zeta' }, { id: 'b', name: 'Alfa' }, { id: 'c', name: 'Mid' }];
    const t = computeTable(clubs, [r('a', 'b', 2, 1), r('a', 'c', 0, 1), r('b', 'c', 1, 0)]);
    const a = t.find((x) => x.clubId === 'a')!, b = t.find((x) => x.clubId === 'b')!;
    expect([a.points, a.won, a.gd, a.gf]).toEqual([b.points, b.won, b.gd, b.gf]); // empate técnico
    expect(t.findIndex((x) => x.clubId === 'a')).toBeLessThan(t.findIndex((x) => x.clubId === 'b')); // Zeta venceu o Alfa
  });
  it('sem confronto decisivo, segue a ordem alfabética', () => {
    const clubs = [{ id: 'a', name: 'Zeta' }, { id: 'b', name: 'Alfa' }];
    const t = computeTable(clubs, [r('a', 'b', 1, 1), r('b', 'a', 2, 2)]);
    expect(t.map((x) => x.clubId)).toEqual(['b', 'a']);
  });
});
