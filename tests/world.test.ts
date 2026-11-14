import { describe, expect, it } from 'vitest';
import { COUNTRY_ORDER, getDivision, getLeague, isPrincipal, WORLD_DATA } from '../src/data/world';
import { createNewGameState, NATIONALITIES, STEPS, validateWorld } from '../src/newgame/state';

describe('dados do mundo', () => {
  it('8 países na ordem pedida, cada um com liga e 2+ divisões', () => {
    expect(COUNTRY_ORDER.map((id) => WORLD_DATA[id].name)).toEqual(['Brasil', 'Argentina', 'Inglaterra', 'Espanha', 'Itália', 'Alemanha', 'França', 'Portugal']);
    for (const id of COUNTRY_ORDER) {
      const c = WORLD_DATA[id];
      expect(c.flag).toBeTruthy();
      expect(c.leagues.length).toBeGreaterThanOrEqual(1);
      for (const l of c.leagues) {
        expect(l.description).toBeTruthy();
        expect(l.divisions.length).toBeGreaterThanOrEqual(2);
        expect(new Set(l.divisions.map((d) => d.id)).size).toBe(l.divisions.length); // ids únicos
        expect(l.divisions.every((d) => d.teams > 0)).toBe(true);
        expect(isPrincipal(l, l.divisions[0])).toBe(true);
        expect(isPrincipal(l, l.divisions[1])).toBe(false);
      }
    }
  });
  it('Brasil: Campeonato Brasileiro com Séries A–D; Série A liga ao pacote de clubes existente', () => {
    const l = getLeague('BR', 'brasileirao')!;
    expect(l.divisions.map((d) => d.name)).toEqual(['Série A', 'Série B', 'Série C', 'Série D']);
    expect(getDivision('BR', 'brasileirao', 'serie-a')).toMatchObject({ teams: 20, packId: 'brasileirao-serie-a' });
  });
  it('ids de países batem com as nacionalidades da Etapa 1 (reuso)', () => {
    const ids = new Set(NATIONALITIES.map((n) => n.id));
    for (const id of COUNTRY_ORDER) expect(ids.has(id)).toBe(true);
  });
});

describe('Etapa 2 — validação', () => {
  const w = { countryId: 'BR', leagueId: 'brasileirao', divisionId: 'serie-b' };
  it('seleção completa é válida', () => expect(validateWorld(w)).toEqual({}));
  it('mostra só o erro do primeiro nível que falta', () => {
    expect(validateWorld({ countryId: '', leagueId: '', divisionId: '' })).toEqual({ country: 'Selecione um país.' });
    expect(validateWorld({ ...w, leagueId: '', divisionId: '' })).toEqual({ league: 'Selecione uma liga.' });
    expect(validateWorld({ ...w, divisionId: '' })).toEqual({ division: 'Selecione uma divisão.' });
  });
  it('rejeita combinações que não existem (liga de outro país)', () => {
    expect(validateWorld({ countryId: 'AR', leagueId: 'brasileirao', divisionId: 'serie-a' }).league).toBeTruthy();
    expect(validateWorld({ ...w, divisionId: 'primera' }).division).toBeTruthy();
  });
  it('etapas 1 e 2 implementadas; 3 e 4 seguem placeholders', () => {
    expect(STEPS.map((s) => s.implemented)).toEqual([true, true, true, false]);
    expect(createNewGameState().world).toEqual({ countryId: '', leagueId: '', divisionId: '' });
  });
});
