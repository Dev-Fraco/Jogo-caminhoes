import { brazilPyramid } from '../src/data/pyramid';
import { newCareer } from '../src/engine/game';

/** Carreira de teste no Campeonato Brasileiro (Série A–D). */
export const makeCareer = (userClubId = 'palmeiras', seed = 123, season = 2026) =>
  newCareer({
    saveName: 'Teste', coach: { name: 'Carlos Almeida', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career',
    season, userClubId, divisions: brazilPyramid(),
  }, seed);
