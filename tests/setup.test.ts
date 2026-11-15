import { describe, expect, it } from 'vitest';
import { getClub } from '../src/data/clubs';
import {
  createNewGameState, DIFFICULTIES, GAME_MODES, isWizardComplete, SAVE_NAME_MAX, STEPS, START_SEASON, suggestSaveName, syncSaveName, validateSetup,
  type NewGameState,
} from '../src/newgame/state';

const full = (): NewGameState => ({
  ...createNewGameState(),
  coach: { name: 'Carlos Almeida', nationality: 'BR', reputation: 'pro', challenge: 'easy' },
  world: { countryId: 'BR', leagueId: 'brasileirao', divisionId: 'serie-a' },
  club: getClub('serie-a', 'palmeiras')!,
});

describe('Etapa 4 — opções', () => {
  it('4 dificuldades e 1 modo (os modos Premium foram removidos)', () => {
    expect(DIFFICULTIES.map((d) => d.label)).toEqual(['Fácil', 'Normal', 'Difícil', 'Lendário']);
    expect(GAME_MODES.map((m) => m.id)).toEqual(['career']);
    expect(GAME_MODES.some((m) => m.locked)).toBe(false);
    expect(DIFFICULTIES.every((d) => d.description.length > 10)).toBe(true);
  });
  it('estado inicial: Normal + Carreira Normal, nome do save vazio', () => {
    expect(createNewGameState().setup).toEqual({ difficulty: 'normal', mode: 'career', saveName: '', saveNameEdited: false });
  });
});

describe('nome do save', () => {
  it('sugestão "Treinador - Clube - 2026"', () => {
    expect(START_SEASON).toBe(2026);
    expect(suggestSaveName('  Carlos Almeida ', 'Palmeiras')).toBe('Carlos Almeida - Palmeiras - 2026');
  });
  it('sugestão nunca passa do limite (corta o nome do treinador)', () => {
    const s = suggestSaveName('x'.repeat(40), 'Red Bull Bragantino');
    expect(s.length).toBeLessThanOrEqual(SAVE_NAME_MAX);
    expect(s.endsWith(' - Red Bull Bragantino - 2026')).toBe(true);
  });
  it('sincroniza com treinador/clube enquanto não foi editado; respeita a edição do jogador', () => {
    const a = syncSaveName(full());
    expect(a.setup.saveName).toBe('Carlos Almeida - Palmeiras - 2026');
    expect(syncSaveName(a)).toBe(a); // sem mudança, mesma referência
    const b = syncSaveName({ ...a, club: getClub('serie-a', 'flamengo')! });
    expect(b.setup.saveName).toBe('Carlos Almeida - Flamengo - 2026');
    const edited = { ...b, setup: { ...b.setup, saveName: 'Meu save', saveNameEdited: true } };
    expect(syncSaveName({ ...edited, club: getClub('serie-a', 'santos')! }).setup.saveName).toBe('Meu save');
  });
});

describe('validação da Etapa 4 e do assistente', () => {
  const ok = { difficulty: 'hard' as const, mode: 'career' as const, saveName: 'Meu save', saveNameEdited: true };
  it('configuração válida', () => expect(validateSetup(ok)).toEqual({}));
  it('modos bloqueados não valem', () => {
    expect(validateSetup({ ...ok, mode: 'infinite-money' }).mode).toBeTruthy(); // modo que não existe mais
    expect(validateSetup({ ...ok, mode: 'challenge' }).mode).toBeTruthy();
  });
  it('nome do save: obrigatório, 2–60', () => {
    expect(validateSetup({ ...ok, saveName: '   ' }).saveName).toBeTruthy();
    expect(validateSetup({ ...ok, saveName: 'A' }).saveName).toBeTruthy();
    expect(validateSetup({ ...ok, saveName: 'x'.repeat(61) }).saveName).toBeTruthy();
    expect(validateSetup({ ...ok, saveName: 'x'.repeat(60) }).saveName).toBeUndefined();
  });
  it('Iniciar Jogo só com tudo preenchido', () => {
    expect(isWizardComplete(createNewGameState())).toBe(false);
    expect(isWizardComplete(syncSaveName(full()))).toBe(true);
    expect(isWizardComplete(full())).toBe(false); // sem nome do save ainda
    expect(isWizardComplete({ ...syncSaveName(full()), club: null })).toBe(false);
    expect(isWizardComplete({ ...syncSaveName(full()), world: { countryId: 'BR', leagueId: 'brasileirao', divisionId: '' } })).toBe(false);
  });
  it('as 4 etapas estão implementadas', () => expect(STEPS.every((s) => s.implemented)).toBe(true));
});
