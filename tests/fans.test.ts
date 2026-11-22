import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { newCareer } from '../src/engine/game';
import { fanBase, fanRanking, formatFans } from '../src/engine/fans';
import type { GameState } from '../src/engine/types';

const mk = (club: string): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: club, divisions: brazilPyramid() }, 3);

describe('torcida do clube', () => {
  it('clube grande tem muito mais torcedores que o pequeno; a divisão encolhe a torcida só um pouco', () => {
    const g = mk('palmeiras');
    const big = fanBase(g, 'palmeiras'), small = fanBase(g, 'csa');
    expect(big).toBeGreaterThan(small * 10);
    expect(big).toBeGreaterThan(1_000_000);
  });
  it('humor da torcida e títulos mexem no número; o ranking põe o seu clube na posição certa', () => {
    const g = mk('sport');
    const calm = fanBase({ ...g, morale: { ...g.morale, fans: 100 } }), angry = fanBase({ ...g, morale: { ...g.morale, fans: 0 } });
    expect(calm).toBeGreaterThan(angry);
    const champ = { ...g, history: Array.from({ length: 10 }, (_, i) => ({ season: 2020 + i, divisions: [{ id: 'serie-a', championId: 'sport', promoted: [], relegated: [] }] })) as unknown as GameState['history'] };
    expect(fanBase(champ)).toBeGreaterThan(fanBase(g));
    expect(fanBase(champ)).toBeLessThanOrEqual(fanBase(g) * 1.5 + 100); // limite de +50%
    const r = fanRanking(g, 5);
    expect(r.top).toHaveLength(5);
    expect(r.top[0].fans).toBeGreaterThanOrEqual(r.top[4].fans);
    expect(r.position).toBeGreaterThanOrEqual(1);
    expect(r.position).toBeLessThanOrEqual(r.total);
  });
  it('formata o número em português', () => {
    expect(formatFans(850)).toBe('850');
    expect(formatFans(250_000)).toBe('250 mil');
    expect(formatFans(1_200_000)).toBe('1,2 milhão');
    expect(formatFans(3_400_000)).toBe('3,4 milhões');
  });
});
