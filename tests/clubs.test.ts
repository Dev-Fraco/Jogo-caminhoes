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

// contraste WCAG contra o fundo escuro do jogo (#07140C)
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b = '#07140C') => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe('cores dos clubes', () => {
  it('clubes de cor quase preta têm secondaryColor legível em fundo escuro', () => {
    const dark = serieA.filter((c) => contrast(c.primaryColor) < 1.5);
    expect(dark.map((c) => c.id).sort()).toEqual(['atletico-mg', 'botafogo', 'corinthians', 'vasco']);
    for (const c of dark) {
      expect(c.secondaryColor, c.id).toMatch(/^#[0-9A-F]{6}$/i);
      expect(contrast(c.secondaryColor!), c.id).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('secondaryColor, quando existe, é um hex válido', () => {
    for (const c of serieA) if (c.secondaryColor) expect(c.secondaryColor).toMatch(/^#[0-9A-F]{6}$/i);
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

describe('ordem alfabética', () => {
  it('Série A em ordem alfabética (pt-BR) sem alterar a lista original', async () => {
    const { sortByName } = await import('../src/data/clubs');
    const original = serieA.map((c) => c.name);
    expect(sortByName(serieA).map((c) => c.name)).toEqual([
      'Athletico-PR', 'Atlético-GO', 'Atlético-MG', 'Bahia', 'Botafogo', 'Corinthians', 'Criciúma', 'Cruzeiro', 'Cuiabá', 'Flamengo',
      'Fluminense', 'Fortaleza', 'Grêmio', 'Internacional', 'Juventude', 'Palmeiras', 'Red Bull Bragantino', 'São Paulo', 'Vasco da Gama', 'Vitória',
    ]);
    expect(serieA.map((c) => c.name)).toEqual(original);
  });
});
