import { brazilPyramid } from '../src/data/pyramid';
import { newCareer } from '../src/engine/game';
import { youthOf } from '../src/engine/youth';
import { youthStartSeason } from '../src/engine/ycomp';
import type { GameState } from '../src/engine/types';

/** Carreira de teste no Campeonato Brasileiro (Série A–D). */
export const makeCareer = (userClubId = 'palmeiras', seed = 123, season = 2026) =>
  newCareer({
    saveName: 'Teste', coach: { name: 'Carlos Almeida', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career',
    season, userClubId, divisions: brazilPyramid(),
  }, seed);

/** Estado "de antes da base completa" (só a primeira safra da academia, sem os 15 de cada categoria): para os testes de sistemas que partem de uma base pequena. */
export const legacyYouth = (g: GameState): GameState => {
  const y = youthOf(g); if (!g.youth) return g;
  return youthStartSeason({ ...g, youth: { ...y, prospects: y.prospects.filter((p) => p.origin === 'academia'), seeded: true } });
};
