import { advanceDay } from '../src/engine/calendar';
import { processDays } from '../src/engine/daily';
import type { GameState } from '../src/engine/types';
import { calOf } from '../src/engine/calendar';

/** Processa o dia atual do calendário (como se o relógio tivesse acabado de chegar nele). */
export function dayTickForTest(g: GameState): GameState {
  const day = calOf(g).day;
  return processDays({ ...g, cal: { ...calOf(g), day: day - 1 } }, day - 1, day);
}
void advanceDay;
