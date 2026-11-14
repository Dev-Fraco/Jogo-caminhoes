import { describe, expect, it } from 'vitest';
import { createNewGameState, NATIONALITIES, REPUTATIONS, STEPS, validateCoach } from '../src/newgame/state';

const ok = { name: 'Carlos Almeida', nationality: 'BR', reputation: 'pro' as const };

describe('Novo Jogo — etapa 1', () => {
  it('perfil válido não tem erros', () => expect(validateCoach(ok)).toEqual({}));
  it('estado inicial está vazio e inválido', () => {
    const e = validateCoach(createNewGameState().coach);
    expect(Object.keys(e).sort()).toEqual(['name', 'nationality', 'reputation']);
  });
  it('valida tamanho do nome (2–40) ignorando espaços nas pontas', () => {
    expect(validateCoach({ ...ok, name: 'A' }).name).toBeTruthy();
    expect(validateCoach({ ...ok, name: '   ' }).name).toBeTruthy();
    expect(validateCoach({ ...ok, name: ' Jo ' }).name).toBeUndefined();
    expect(validateCoach({ ...ok, name: 'x'.repeat(40) }).name).toBeUndefined();
    expect(validateCoach({ ...ok, name: 'x'.repeat(41) }).name).toBeTruthy();
  });
  it('nacionalidade e reputação precisam ser opções existentes', () => {
    expect(validateCoach({ ...ok, nationality: 'XX' }).nationality).toBeTruthy();
    expect(validateCoach({ ...ok, reputation: '' }).reputation).toBeTruthy();
  });
  it('listas pedidas existem', () => {
    expect(NATIONALITIES.map((n) => n.label)).toEqual(expect.arrayContaining(['Brasil', 'Argentina', 'Portugal', 'Espanha', 'Inglaterra', 'Itália', 'Alemanha', 'França', 'Uruguai', 'Chile', 'Colômbia', 'México', 'Japão', 'EUA']));
    expect(REPUTATIONS.map((r) => r.label)).toEqual(['Desconhecido', 'Amador', 'Semi-profissional', 'Profissional', 'Lenda']);
  });
  it('4 etapas; só a primeira implementada', () => {
    expect(STEPS.map((s) => s.title)).toEqual(['Perfil do Treinador', 'Mundo', 'Escolha do Clube', 'Confirmação']);
    expect(STEPS.map((s) => s.implemented)).toEqual([true, true, true, false]);
  });
});
