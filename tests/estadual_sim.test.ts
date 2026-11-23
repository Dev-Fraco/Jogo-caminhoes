import { describe, expect, it } from 'vitest';
import { advanceToMatchDays } from '../src/engine/daily';
import { isMatchDay } from '../src/engine/calendar';
import { playNext } from '../src/engine/game';
import { userPlaysNextSlot } from '../src/engine/advance';
import { newCareer } from '../src/engine/game';
import { brazilPyramid } from '../src/data/pyramid';

const makeCareer = (club: string, seed: number) => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: club, divisions: brazilPyramid(), cup: true }, seed);

describe('simulação do estadual (mesmo laço da tela)', () => {
  it('avança até a última rodada do estadual, jogando as partidas do usuário no caminho', () => {
    let s = makeCareer('palmeiras', 5);
    expect(!!s.estadual && !s.estadual.done && s.estadual.step <= 1).toBe(true);
    let mine = 0;
    for (let i = 0; i < 600 && !s.estadual!.done; i++) {
      const m = userPlaysNextSlot(s);
      const s1 = advanceToMatchDays(s);
      expect(isMatchDay(s1)).toBe(true);
      const r = playNext(s1);
      if (m && r.results.some((x) => x.homeId === s1.userClubId || x.awayId === s1.userClubId)) mine++;
      s = r.state;
    }
    expect(s.estadual!.done).toBe(true);
    expect(mine).toBeGreaterThan(5);
  }, 120_000);
});
