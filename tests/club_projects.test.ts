import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { newCareer } from '../src/engine/game';
import { fire, hire, resign } from '../src/engine/jobs';
import { stadiumOf, upgradeStadium } from '../src/engine/stadium';
import { youthOf } from '../src/engine/youth';
import { facLevel, MAX_ACADEMY_LEVEL } from '../src/engine/academy';
import type { GameState } from '../src/engine/types';

const mk = (club: string): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: club, divisions: brazilPyramid() }, 3);
const maxed = (g: GameState): GameState => {
  const y = youthOf(g);
  let s: GameState = { ...g, youth: { ...y, level: MAX_ACADEMY_LEVEL, fac: { centro: 20, fisica: 20, medico: 20, alojamento: 20, campos: 20 } } };
  for (let i = 0; i < 6; i++) s = upgradeStadium({ ...s, budgets: { ...s.budgets, [s.userClubId]: 1e12 } }, 'comfort');
  return s;
};

describe('o que você construiu em cada clube fica guardado', () => {
  it('academia, instalações e estádio voltam como você deixou ao voltar ao clube (contratado por outro clube)', () => {
    let g = maxed(mk('sport'));
    expect(youthOf(g).level).toBe(20);
    const comfort = stadiumOf(g).comfort, cap = stadiumOf(g).capacity;
    g = hire(g, 'palmeiras');                                   // vai para outro clube
    expect(g.userClubId).toBe('palmeiras');
    expect(stadiumOf(g).comfort).toBe(0);                       // o estádio do outro clube NÃO leva as obras do Sport
    expect(stadiumOf(g).capacity).not.toBe(cap);
    g = hire(g, 'sport');                                        // e volta
    expect(youthOf(g).level).toBe(20);
    expect(facLevel(youthOf(g), 'alojamento')).toBe(20);
    expect(stadiumOf(g).comfort).toBe(comfort);
    expect(stadiumOf(g).capacity).toBe(cap);
  });
  it('demitido ou pedindo demissão: ao voltar para o mesmo clube, tudo continua igual', () => {
    for (const leave of [(x: GameState) => fire(x, 'teste'), resign]) {
      let g = maxed(mk('sport'));
      g = leave(g);
      expect(g.unemployed).toBe(true);
      g = hire(g, 'sport');
      expect(youthOf(g).level).toBe(20);
      expect(stadiumOf(g).comfort).toBeGreaterThan(0);
    }
  });
  it('clube novo: começa com a academia que o clube já tem (gigante não começa do zero); clube que você deixou passa a usar os mesmos níveis', () => {
    let g = mk('csa');
    const lvlSmall = youthOf(g).level;
    g = hire(g, 'palmeiras');
    const lvlBig = youthOf(g).level;                            // nível inicial herdado do clube
    expect(lvlBig).toBeGreaterThan(lvlSmall);
    expect(lvlBig).toBeGreaterThan(8);
    let h = maxed(mk('csa'));
    h = hire(h, 'sport');
    expect(h.aiAcademy?.csa?.[0]).toBe(20);                      // a IA do clube que você deixou herda a academia
  });
});
