import { describe, expect, it } from 'vitest';
import { getClub } from '../src/data/clubs';
import { EXPECTATION_LABEL, formatBudget } from '../src/newgame/format';
import { applyWorld, createNewGameState, STEPS } from '../src/newgame/state';
import { badgeColors, contrastRatio, isVeryDark, mixWithWhite } from '../src/ui/badge';

describe('formatBudget', () => {
  it('formata em mi/bi/mil', () => {
    expect(formatBudget(120_000_000)).toBe('R$ 120 mi');
    expect(formatBudget(25_000_000)).toBe('R$ 25 mi');
    expect(formatBudget(22_500_000)).toBe('R$ 22,5 mi');
    expect(formatBudget(1_200_000_000)).toBe('R$ 1,2 bi');
    expect(formatBudget(800_000)).toBe('R$ 800 mil');
  });
  it('rótulos de expectativa', () => {
    expect(EXPECTATION_LABEL).toEqual({ title: 'Ganhar o título', top4: 'Top 4', mid: 'Meio de tabela', survive: 'Evitar rebaixamento' });
  });
});

describe('escudo reserva (cores do time)', () => {
  it('preto é "muito escuro"; azul do Cruzeiro, não', () => {
    expect(isVeryDark('#000000')).toBe(true);
    expect(isVeryDark('#0033A0')).toBe(false);
  });
  it('primária visível vira o fundo; a outra cor do time vai no texto/borda quando contrasta', () => {
    expect(badgeColors({ primaryColor: '#006437', secondaryColor: '#FFFFFF' })).toEqual({ bg: '#006437', fg: '#FFFFFF', ring: '#FFFFFF' });
    // Flamengo: preto sobre vermelho não passa de 4,5 → texto branco, borda padrão
    expect(badgeColors({ primaryColor: '#C52613', secondaryColor: '#111111' })).toMatchObject({ bg: '#C52613', fg: '#FFFFFF' });
  });
  it('primária quase preta: fundo na secundária, texto na primária', () => {
    expect(badgeColors({ primaryColor: '#000000', secondaryColor: '#FFFFFF' })).toMatchObject({ bg: '#FFFFFF', fg: '#000000' });
  });
  it('primária e secundária escuras: clareia a primária com 30% de branco', () => {
    expect(mixWithWhite('#000000', 0.3)).toBe('#4D4D4D');
    expect(badgeColors({ primaryColor: '#000000', secondaryColor: '#111111' })).toMatchObject({ bg: '#4D4D4D', fg: '#FFFFFF' });
  });
  it('fundo claro: texto escuro legível', () => {
    const c = badgeColors({ primaryColor: '#F2C200', secondaryColor: '#FFFFFF' });
    expect(contrastRatio(c.bg, c.fg)).toBeGreaterThanOrEqual(4.5);
    expect(c.fg).toBe('#07140C');
  });
  it('todo clube tem sigla legível no escudo reserva (contraste >= 3)', async () => {
    const { CLUBS_DATA } = await import('../src/data/clubs');
    for (const c of Object.values(CLUBS_DATA).flat()) {
      const k = badgeColors(c);
      expect(contrastRatio(k.bg, k.fg), c.id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Etapa 3 — estado', () => {
  const world = { countryId: 'BR', leagueId: 'brasileirao', divisionId: 'serie-a' };
  it('sem clube a etapa é inválida; com clube da divisão é válida e guarda o objeto completo', () => {
    const club = getClub('serie-a', 'flamengo')!;
    const s0 = { ...createNewGameState(), world };
    expect(STEPS[2].isValid(s0)).toBe(false);
    const s1 = { ...s0, club };
    expect(STEPS[2].isValid(s1)).toBe(true);
    expect(s1.club).toBe(club);
  });
  it('trocar de divisão limpa o clube; manter a mesma divisão preserva', () => {
    const club = getClub('serie-a', 'palmeiras')!;
    const s = { ...createNewGameState(), world, club };
    expect(applyWorld(s, { ...world }).club).toBe(club);
    expect(applyWorld(s, { ...world, divisionId: 'serie-b' }).club).toBeNull();
    expect(applyWorld(s, { countryId: 'AR', leagueId: '', divisionId: '' }).club).toBeNull();
  });
  it('clube de outra divisão não vale', () => {
    const s = { ...createNewGameState(), world: { ...world, divisionId: 'serie-b' }, club: getClub('serie-a', 'flamengo')! };
    expect(STEPS[2].isValid(s)).toBe(false);
  });
});
