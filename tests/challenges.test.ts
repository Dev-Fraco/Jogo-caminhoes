import { describe, expect, it } from 'vitest';
import { getClubs } from '../src/data/clubs';
import { brazilPyramid } from '../src/data/pyramid';
import { newCareer } from '../src/engine/game';
import { BUDGET_FACTOR, CHALLENGES, CHALLENGE_DIFFICULTY, CHALLENGE_REPUTATION, challengeWorld, clubAllowed, createNewGameState, isWizardComplete, lockedWorld, validateCoach } from '../src/newgame/state';

const wiz = (challenge: 'easy' | 'normal' | 'hard' | 'legend' | 'create', divisionId: string, club: ReturnType<typeof getClubs>[number]) => ({
  ...createNewGameState(), coach: { name: 'Carlos', nationality: 'BR', reputation: CHALLENGE_REPUTATION[challenge], challenge },
  world: { countryId: 'BR', leagueId: 'brasileirao', divisionId }, club,
  setup: { difficulty: CHALLENGE_DIFFICULTY[challenge], mode: 'career' as const, saveName: 'Meu save', saveNameEdited: true },
});

describe('desafios (no lugar da reputação inicial)', () => {
  it('cinco opções: Fácil, Médio, Difícil, Lendário e Criar um clube', () => {
    expect(CHALLENGES.map((c) => c.label)).toEqual(['Fácil', 'Médio', 'Difícil', 'Lendário', 'Criar um clube']);
    expect(validateCoach({ name: 'Carlos', nationality: 'BR', reputation: '', challenge: '' }).challenge).toBeTruthy();
    expect(validateCoach({ name: 'Carlos', nationality: 'BR', reputation: 'pro', challenge: 'hard' })).toEqual({});
  });
  it('verba: Fácil inteira, Médio metade, Difícil ainda menor', () => {
    expect(BUDGET_FACTOR.easy).toBe(1);
    expect(BUDGET_FACTOR.normal).toBe(0.5);
    expect(BUDGET_FACTOR.hard).toBeLessThan(BUDGET_FACTOR.normal);
  });
  it('Difícil só deixa escolher Série B e C; Lendário só clubes de estadual; Criar só clube criado', () => {
    expect(challengeWorld('easy')).toBeNull();
    expect(challengeWorld('normal')).toBeNull();
    expect(challengeWorld('hard')!.divisions).toEqual(['serie-b', 'serie-c']);
    expect(lockedWorld('legend')).toEqual({ countryId: 'BR', leagueId: 'brasileirao', divisionId: 'br-estaduais' });
    expect(lockedWorld('create')!.divisionId).toBe('br-estaduais');
    const serieA = getClubs('serie-a')[0], serieB = getClubs('serie-b')[0], serieC = getClubs('serie-c')[0], est = getClubs('br-estaduais')[0];
    expect(clubAllowed('easy', 'serie-a', serieA)).toBe(true);
    expect(clubAllowed('normal', 'serie-d', getClubs('serie-d')[0])).toBe(true);
    expect(clubAllowed('hard', 'serie-b', serieB)).toBe(true);
    expect(clubAllowed('hard', 'serie-c', serieC)).toBe(true);
    expect(clubAllowed('hard', 'serie-a', serieA)).toBe(false);
    expect(clubAllowed('hard', 'serie-d', getClubs('serie-d')[0])).toBe(false);
    expect(clubAllowed('legend', 'br-estaduais', est)).toBe(true);
    expect(clubAllowed('legend', 'serie-b', serieB)).toBe(false);
    expect(clubAllowed('create', 'br-estaduais', { ...est, custom: true })).toBe(true);
    expect(clubAllowed('create', 'br-estaduais', est)).toBe(false);
    expect(clubAllowed('legend', 'br-estaduais', { ...est, custom: true })).toBe(false);
  });
  it('o assistente só termina com um clube que o desafio permite', () => {
    const serieA = getClubs('serie-a')[0], serieB = getClubs('serie-b')[0], est = getClubs('br-estaduais')[0];
    expect(isWizardComplete(wiz('easy', 'serie-a', serieA))).toBe(true);
    expect(isWizardComplete(wiz('hard', 'serie-b', serieB))).toBe(true);
    expect(isWizardComplete(wiz('hard', 'serie-a', serieA))).toBe(false);
    expect(isWizardComplete(wiz('legend', 'br-estaduais', est))).toBe(true);
    expect(isWizardComplete(wiz('legend', 'serie-b', serieB))).toBe(false);
  });
  it('a carreira nasce com a verba do clube cortada conforme o desafio', () => {
    const base = (f?: number) => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), budgetFactor: f }, 1).budgets.palmeiras;
    const full = base();
    expect(base(1)).toBe(full);
    expect(base(0.5)).toBe(Math.round((full * 0.5) / 10_000) * 10_000);
    expect(base(0.25)).toBeLessThan(base(0.5));
    // só o seu clube é cortado
    const g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), budgetFactor: 0.5 }, 1);
    const ref = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() }, 1);
    expect(g.budgets.flamengo).toBe(ref.budgets.flamengo);
  });
});
