import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { rentHome } from '../src/engine/assets';
import { payPix, registerBank } from '../src/engine/bank';
import { calOf } from '../src/engine/calendar';
import { advanceOneDay, advanceToMatchDays } from '../src/engine/daily';
import { newCareer } from '../src/engine/game';
import { hasHome, homeBlocked, housingSteps } from '../src/engine/housing';
import { DEFAULT_PHONE } from '../src/engine/phone';
import type { GameState } from '../src/engine/types';

const fresh = (): GameState => ({ ...newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'unknown' }, difficulty: 'legend', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() }, 6), homeRequired: true, phone: { ...DEFAULT_PHONE, noPhone: true }, coachMoney: 30_000 });

describe('moradia obrigatória em carreira nova', () => {
  it('sem casa: bloqueado, o dia não avança', () => {
    const g = fresh();
    expect(hasHome(g)).toBe(false);
    expect(homeBlocked(g)).toBe(true);
    expect(calOf(advanceOneDay(g)).day).toBe(calOf(g).day);
    expect(calOf(advanceToMatchDays(g)).day).toBe(calOf(g).day);
  });
  it('mostra o passo a passo e marca o que já foi feito', () => {
    const steps = housingSteps(fresh());
    expect(steps.map((s) => s.id)).toEqual(['phone', 'chip', 'apps', 'bank', 'home']);
    expect(steps.every((s) => !s.done)).toBe(true);
  });
  it('depois de alugar uma casa o jogo libera', () => {
    let g = fresh();
    const rb = registerBank({ ...g, phone: { ...DEFAULT_PHONE, installed: ['banco', 'corretor'] } }, 'A B', 'segredo1', 'segredo1'); if (!rb.ok) throw new Error();
    g = { ...rb.state, homeRequired: true, coachMoney: 30_000 };
    const r = rentHome(g, 'r-kitnet'); if (!r.ok) throw new Error(r.error);
    const p = payPix(r.state, r.charge.key, 'segredo1'); if (!p.ok) throw new Error(p.error);
    expect(hasHome(p.state)).toBe(true);
    expect(homeBlocked(p.state)).toBe(false);
    expect(calOf(advanceToMatchDays(p.state)).day).toBeGreaterThan(calOf(p.state).day);
    expect(housingSteps(p.state).find((s) => s.id === 'home')!.done).toBe(true);
  });
  it('saves antigos (sem a exigência) não são bloqueados', () => {
    const g = { ...fresh(), homeRequired: undefined };
    expect(homeBlocked(g)).toBe(false);
  });
});
