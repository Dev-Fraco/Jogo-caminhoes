import { describe, expect, it } from 'vitest';
import { CLUBS_DATA, getClub, getClubs, type BoardExpectation } from '../src/data/clubs';
import { COUNTRY_ORDER, getDivision, WORLD_DATA } from '../src/data/world';

const serieA = CLUBS_DATA['serie-a'];

describe('CLUBS_DATA — Série A', () => {
  it('tem exatamente os 20 clubes pedidos', () => {
    expect(serieA.map((c) => c.name).sort()).toEqual(
      ['Flamengo', 'Palmeiras', 'Corinthians', 'São Paulo', 'Fluminense', 'Botafogo', 'Vasco da Gama', 'Grêmio', 'Internacional', 'Cruzeiro', 'Atlético-MG', 'Athletico-PR', 'Bahia', 'Fortaleza', 'Vitória', 'Juventude', 'Red Bull Bragantino', 'Criciúma', 'Cuiabá', 'Atlético-GO'].sort(),
    );
    expect(serieA).toHaveLength(20);
  });
  it('mesmo número de times que a divisão na Etapa 2', () => {
    expect(serieA.length).toBe(getDivision('BR', 'brasileirao', 'serie-a')!.teams);
  });
  it('campos obrigatórios válidos e ids únicos', () => {
    expect(new Set(serieA.map((c) => c.id)).size).toBe(20);
    expect(new Set(serieA.map((c) => c.shortName)).size).toBe(20);
    for (const c of serieA) {
      expect(c.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(c.shortName).toMatch(/^[A-Z]{3}$/);
      expect(c.badge).toBe(`assets/badges/${c.id}.png`);
      expect(c.primaryColor).toMatch(/^#[0-9A-F]{6}$/i);
      expect(c.stadium && c.city).toBeTruthy();
      expect(c.budget).toBeGreaterThanOrEqual(20_000_000);
      expect(c.budget).toBeLessThanOrEqual(150_000_000);
      expect(['title', 'top4', 'mid', 'survive']).toContain(c.boardExpectation);
      expect([1, 2, 3, 4, 5]).toContain(c.reputation);
    }
  });
  it('exemplo do Flamengo bate com a especificação', () => {
    expect(getClub('serie-a', 'flamengo')).toEqual({
      id: 'flamengo', name: 'Flamengo', shortName: 'FLA', badge: 'assets/badges/flamengo.png', primaryColor: '#C52613',
      stadium: 'Maracanã', city: 'Rio de Janeiro', budget: 150_000_000, boardExpectation: 'title', reputation: 5,
    });
  });
  it('expectativa é coerente com a reputação (média cai de title para survive)', () => {
    const avg = (e: BoardExpectation) => { const xs = serieA.filter((c) => c.boardExpectation === e); return xs.reduce((s, c) => s + c.reputation, 0) / xs.length; };
    const order: BoardExpectation[] = ['title', 'top4', 'mid', 'survive'];
    for (let i = 0; i < order.length - 1; i++) expect(avg(order[i])).toBeGreaterThan(avg(order[i + 1]));
    expect(order.every((e) => serieA.some((c) => c.boardExpectation === e))).toBe(true);
  });
});

describe('CLUBS_DATA — estrutura', () => {
  it('Séries B, C e D existem e estão vazias', () => {
    for (const k of ['serie-b', 'serie-c', 'serie-d']) expect(CLUBS_DATA[k]).toEqual([]);
    expect(getClubs('ar-primera')).toEqual([]); // divisão sem dados não quebra
  });
  it('toda chave é um divisionId existente na Etapa 2', () => {
    const all = new Set(COUNTRY_ORDER.flatMap((id) => WORLD_DATA[id].leagues.flatMap((l) => l.divisions.map((d) => d.id))));
    for (const k of Object.keys(CLUBS_DATA)) expect(all.has(k)).toBe(true);
  });
  it('divisionId é único no mundo todo (senão CLUBS_DATA misturaria países)', () => {
    const ids = COUNTRY_ORDER.flatMap((id) => WORLD_DATA[id].leagues.flatMap((l) => l.divisions.map((d) => d.id)));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
