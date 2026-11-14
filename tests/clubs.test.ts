import { describe, expect, it } from 'vitest';
import { CLUBS_DATA, getClub, getClubs, sortByName, type BoardExpectation, type ClubData } from '../src/data/clubs';
import { COUNTRY_ORDER, getDivision, WORLD_DATA } from '../src/data/world';
import { squadOverall, startingEleven } from '../src/newgame/squadInfo';

const DIVS = ['serie-a', 'serie-b', 'serie-c', 'serie-d'] as const;
const all = DIVS.flatMap((d) => CLUBS_DATA[d]);
const names = (d: string) => CLUBS_DATA[d].map((c) => c.name).sort((a, b) => a.localeCompare(b, 'pt-BR'));

describe('CLUBS_DATA — listas de 2026', () => {
  it('Série A: os 20 clubes pedidos', () => {
    expect(names('serie-a')).toEqual(['Flamengo', 'Palmeiras', 'Cruzeiro', 'Mirassol', 'Fluminense', 'Bahia', 'Botafogo', 'São Paulo', 'Red Bull Bragantino', 'Corinthians', 'Grêmio', 'Vasco da Gama', 'Atlético-MG', 'Santos', 'Athletico-PR', 'Coritiba', 'Internacional', 'Chapecoense', 'Vitória', 'Remo'].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });
  it('Série B: os 20 clubes pedidos', () => {
    expect(names('serie-b')).toEqual(['América-MG', 'Athletic', 'Atlético-GO', 'Avaí', 'Botafogo-SP', 'Ceará', 'CRB', 'Criciúma', 'Cuiabá', 'Fortaleza', 'Goiás', 'Juventude', 'Londrina', 'Náutico', 'Novorizontino', 'Operário-PR', 'Ponte Preta', 'São Bernardo', 'Sport', 'Vila Nova'].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });
  it('Série C: os 20 clubes pedidos', () => {
    expect(names('serie-c')).toEqual(['Amazonas', 'Anápolis', 'Barra', 'Botafogo-PB', 'Brusque', 'Caxias', 'Confiança', 'Ferroviária', 'Figueirense', 'Floresta', 'Guarani', 'Inter de Limeira', 'Itabaiana', 'Ituano', 'Maranhão', 'Maringá', 'Paysandu', 'Santa Cruz', 'Volta Redonda', 'Ypiranga'].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });
  it('Série D: seleção representativa (parcial) — não passa do total da divisão', () => {
    expect(CLUBS_DATA['serie-d']).toHaveLength(20);
    expect(CLUBS_DATA['serie-d'].length).toBeLessThan(getDivision('BR', 'brasileirao', 'serie-d')!.teams);
  });
  it('A–C batem com o número de times da Etapa 2', () => {
    for (const d of ['serie-a', 'serie-b', 'serie-c']) expect(CLUBS_DATA[d].length).toBe(getDivision('BR', 'brasileirao', d)!.teams);
  });
});

describe('CLUBS_DATA — campos', () => {
  it('todos os campos válidos; ids únicos no mundo; siglas únicas por divisão', () => {
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const d of DIVS) expect(new Set(CLUBS_DATA[d].map((c) => c.shortName)).size).toBe(CLUBS_DATA[d].length);
    for (const c of all) {
      expect(c.id, c.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(c.shortName, c.id).toMatch(/^[A-Z]{3}$/);
      expect(c.badge).toBe(`assets/badges/${c.id}.png`);
      expect(c.primaryColor, c.id).toMatch(/^#[0-9A-F]{6}$/i);
      expect(c.secondaryColor, c.id).toMatch(/^#[0-9A-F]{6}$/i);
      expect(c.secondaryColor.toUpperCase(), c.id).not.toBe(c.primaryColor.toUpperCase());
      expect(c.stadium && c.city).toBeTruthy();
      expect(['title', 'top4', 'mid', 'survive']).toContain(c.boardExpectation);
      expect([1, 2, 3, 4, 5]).toContain(c.reputation);
    }
  });
  it('orçamento dentro da faixa de cada divisão', () => {
    const range: Record<string, [number, number]> = { 'serie-a': [20e6, 150e6], 'serie-b': [5e6, 40e6], 'serie-c': [2e6, 15e6], 'serie-d': [0.5e6, 6e6] };
    for (const d of DIVS) for (const c of CLUBS_DATA[d]) { expect(c.budget, c.id).toBeGreaterThanOrEqual(range[d][0]); expect(c.budget, c.id).toBeLessThanOrEqual(range[d][1]); }
  });
  it('exemplo do Flamengo', () => {
    expect(getClub('serie-a', 'flamengo')).toMatchObject({
      id: 'flamengo', name: 'Flamengo', shortName: 'FLA', primaryColor: '#C52613', secondaryColor: '#111111',
      stadium: 'Maracanã', city: 'Rio de Janeiro', budget: 150_000_000, boardExpectation: 'title', reputation: 5,
    });
  });
  it('meta da diretoria é coerente com a reputação nas Séries A, B e C', () => {
    const order: BoardExpectation[] = ['title', 'top4', 'mid', 'survive'];
    for (const d of ['serie-a', 'serie-b', 'serie-c']) {
      const avg = (e: BoardExpectation) => { const xs = CLUBS_DATA[d].filter((c) => c.boardExpectation === e); return xs.reduce((s, c) => s + c.reputation, 0) / xs.length; };
      for (let i = 0; i < 3; i++) expect(avg(order[i]), `${d} ${order[i]}`).toBeGreaterThan(avg(order[i + 1]));
    }
  });
});

describe('elencos', () => {
  const POS = { GK: 3, DEF: 8, MID: 8, ATT: 5 };
  it('todo clube tem 24 jogadores com a composição esperada e dados válidos', () => {
    for (const c of all) {
      expect(c.squad, c.id).toHaveLength(24);
      for (const [pos, n] of Object.entries(POS)) expect(c.squad.filter((p) => p.pos === pos), `${c.id} ${pos}`).toHaveLength(n);
      expect(new Set(c.squad.map((p) => p.name)).size, c.id).toBe(24); // nomes não repetem dentro do clube
      for (const p of c.squad) {
        expect(p.name.trim().split(' ').length).toBeGreaterThanOrEqual(2);
        expect(p.age).toBeGreaterThanOrEqual(17); expect(p.age).toBeLessThanOrEqual(36);
        expect(p.strength).toBeGreaterThanOrEqual(25); expect(p.strength).toBeLessThanOrEqual(97);
        expect(p.id.startsWith(c.id + '-')).toBe(true);
      }
    }
    expect(new Set(all.flatMap((c) => c.squad.map((p) => p.id))).size).toBe(all.length * 24); // ids únicos no jogo todo
  });
  it('11 titulares montáveis em 4-4-2', () => {
    for (const c of all) expect(startingEleven(c.squad), c.id).toHaveLength(11);
  });
  it('overall acompanha a reputação e o nível da divisão', () => {
    const avgOvr = (cs: ClubData[]) => cs.reduce((s, c) => s + squadOverall(c.squad), 0) / cs.length;
    const byRep = (r: number) => CLUBS_DATA['serie-a'].filter((c) => c.reputation === r);
    expect(avgOvr(byRep(5))).toBeGreaterThan(avgOvr(byRep(4)));
    expect(avgOvr(byRep(4))).toBeGreaterThan(avgOvr(byRep(3)));
    expect(avgOvr(byRep(3))).toBeGreaterThan(avgOvr(byRep(2)));
    const d = DIVS.map((k) => avgOvr(CLUBS_DATA[k]));
    expect(d[0]).toBeGreaterThan(d[1]); expect(d[1]).toBeGreaterThan(d[2]); expect(d[2]).toBeGreaterThan(d[3]);
  });
  it('é determinístico (mesmo clube, mesmo elenco)', async () => {
    const { generateSquad } = await import('../src/engine/squad');
    const f = getClub('serie-a', 'flamengo')!;
    expect(generateSquad({ id: f.id, name: f.name, short: f.shortName, color: f.primaryColor, strength: 82 }, 2026)).toEqual(f.squad);
  });
});

describe('CLUBS_DATA — estrutura', () => {
  it('as quatro divisões brasileiras existem e divisão sem dados não quebra', () => {
    for (const d of DIVS) expect(CLUBS_DATA[d].length).toBeGreaterThan(0);
    expect(getClubs('bundesliga')).toEqual([]);
  });
  it('toda chave é um divisionId existente na Etapa 2', () => {
    const ids = new Set(COUNTRY_ORDER.flatMap((id) => WORLD_DATA[id].leagues.flatMap((l) => l.divisions.map((d) => d.id))));
    for (const k of Object.keys(CLUBS_DATA)) expect(ids.has(k)).toBe(true);
  });
  it('divisionId é único no mundo todo', () => {
    const ids = COUNTRY_ORDER.flatMap((id) => WORLD_DATA[id].leagues.flatMap((l) => l.divisions.map((d) => d.id)));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('ordem alfabética (pt-BR) sem alterar a lista original', () => {
    const a = CLUBS_DATA['serie-a'];
    const before = a.map((c) => c.id);
    const sorted = sortByName(a).map((c) => c.name);
    expect(sorted.slice(0, 5)).toEqual(['Athletico-PR', 'Atlético-MG', 'Bahia', 'Botafogo', 'Chapecoense']);
    expect(a.map((c) => c.id)).toEqual(before);
  });
});
