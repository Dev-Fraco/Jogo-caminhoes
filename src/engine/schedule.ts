import type { Fixture } from './types';

/** Pontos corridos, ida e volta (método do círculo). 20 clubes => 38 rodadas. */
export function buildFixtures(clubIds: string[], divisionId = ''): { fixtures: Fixture[]; totalRounds: number } {
  const ids = [...clubIds];
  if (ids.length % 2) ids.push('__bye__');
  const n = ids.length;
  const half = n - 1;
  const first: Fixture[] = [];
  const arr = [...ids];
  for (let r = 0; r < half; r++) {
    for (let i = 0; i < n / 2; i++) {
      let home = arr[i], away = arr[n - 1 - i];
      if (home === '__bye__' || away === '__bye__') continue;
      // alterna mando para equilibrar casa/fora
      if ((r + i) % 2 === 1) [home, away] = [away, home];
      first.push({ divisionId, round: r + 1, homeId: home, awayId: away });
    }
    arr.splice(1, 0, arr.pop()!); // gira todos menos o primeiro
  }
  const second = first.map((f) => ({ divisionId, round: f.round + half, homeId: f.awayId, awayId: f.homeId }));
  return { fixtures: [...first, ...second], totalRounds: half * 2 };
}
