import { describe, expect, it } from 'vitest';
import { retireCasino } from '../src/engine/save';
import { STORE_APPS } from '../src/engine/phone';
import { makeCareer } from './helpers';
import type { GameState } from '../src/engine/types';

describe('Cassino removido do celular', () => {
  it('não existe mais na loja de aplicativos', () => {
    expect(STORE_APPS.map((a) => a.id)).not.toContain('cassino');
  });
  it('save antigo: o saldo do Cassino volta para o dinheiro do treinador, o app sai do celular e o histórico some', () => {
    const base = makeCareer();
    const old = { ...base, coachMoney: 1_000, casino: { balance: 70_000, bets: [{ id: 'x' }], deposited: 1, wagered: 2, won: 3 }, phone: { ...(base.phone ?? { settings: {}, notifications: [] }), installed: ['banco', 'cassino'] } } as unknown as GameState;
    const g = retireCasino(old);
    expect(g.coachMoney).toBe(71_000);
    expect((g as unknown as { casino?: unknown }).casino).toBeUndefined();
    expect(g.phone?.installed).toEqual(['banco']);
  });
  it('save sem Cassino: devolve o mesmo objeto', () => {
    const g = makeCareer();
    expect(retireCasino(g)).toBe(g);
  });
});
