import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { advanceDay, advanceToMatch, calOf, daysToMatch, formatDay, formatDayLong, fromDay, isMatchDay, matchDayOf, nextMatchDay, seasonStart, toDay } from '../src/engine/calendar';
import { coachSalary } from '../src/engine/finance';
import { isSeasonOver, newCareer, playNext, startNextSeason } from '../src/engine/game';
import type { GameState } from '../src/engine/types';

const mk = (seed = 5): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, seed);
const keep = (g: GameState): GameState => ({ ...g, morale: { ...g.morale, board: 60 } });

describe('calendário', () => {
  it('datas reais: dia, mês, ano e dia da semana', () => {
    expect(formatDay(toDay(2026, 3, 7))).toBe('07/03/2026');
    expect(fromDay(toDay(2026, 3, 7)).wd).toBe(6); // 07/03/2026 é sábado
    expect(formatDayLong(toDay(2026, 3, 7))).toBe('sábado, 7 de março de 2026');
    expect(fromDay(seasonStart(2026)).wd).toBe(1); // começa numa segunda
    expect(fromDay(seasonStart(2026)).m).toBe(1);
  });
  it('duas partidas por semana: uma ter/qua/qui e uma sáb/dom, sorteadas', () => {
    const start = seasonStart(2026);
    const mids = new Set<number>(), ends = new Set<number>();
    for (let w = 0; w < 60; w++) {
      const a = fromDay(matchDayOf(7, 2026, start, w * 2)), b = fromDay(matchDayOf(7, 2026, start, w * 2 + 1));
      expect([2, 3, 4]).toContain(a.wd);
      expect([6, 0]).toContain(b.wd);
      mids.add(a.wd); ends.add(b.wd);
    }
    expect(mids.size).toBe(3); // terça, quarta e quinta aparecem
    expect(ends.size).toBe(2); // sábado e domingo aparecem
    // as datas sempre crescem
    let last = 0;
    for (let k = 0; k < 120; k++) { const d = matchDayOf(7, 2026, start, k); expect(d).toBeGreaterThan(last); last = d; }
    // as semanas não se repetem: dois jogos por semana
    expect(Math.floor((matchDayOf(7, 2026, start, 3) - start) / 7)).toBe(1);
  });
  it('só pode jogar no dia do jogo; avançar um dia vai até lá e para', () => {
    let g = mk();
    expect(isMatchDay(g)).toBe(false);
    const target = nextMatchDay(g);
    expect(daysToMatch(g)).toBe(target - calOf(g).day);
    let n = 0;
    while (!isMatchDay(g)) { g = advanceDay(g); n++; }
    expect(calOf(g).day).toBe(target);
    expect(advanceDay(g)).toBe(g); // no dia do jogo não avança
    expect(n).toBeGreaterThan(0);
    expect(advanceToMatch(mk()).cal!.day).toBe(target);
  });
  it('jogar um evento leva o relógio para o dia dele e agenda o próximo', () => {
    let g = advanceToMatch(mk());
    const d0 = calOf(g).day;
    g = keep(playNext(g).state);
    expect(calOf(g).day).toBe(d0);
    expect(calOf(g).slot).toBe(1);
    expect(nextMatchDay(g)).toBeGreaterThan(d0);
    expect(isMatchDay(g)).toBe(false);
  });
  it('simulações (sem passar pelo botão) mantêm as datas coerentes', () => {
    let g = mk(), prev = 0;
    for (let i = 0; i < 30; i++) { g = keep(playNext(g).state); expect(calOf(g).day).toBeGreaterThan(prev); prev = calOf(g).day; }
  });
  it('temporada inteira cabe no ano e a seguinte volta a janeiro', () => {
    let g = mk(), guard = 0;
    while (!isSeasonOver(g) && guard++ < 300) g = keep(playNext(g).state);
    const end = fromDay(calOf(g).day);
    expect(end.y).toBe(2026);
    expect(end.m).toBeLessThanOrEqual(12);
    const n = startNextSeason(g);
    const s = fromDay(calOf(n).start);
    expect(s.y).toBe(2027);
    expect(s.m).toBe(1);
    expect(calOf(n).slot).toBe(0);
    expect(calOf(n).day).toBeGreaterThan(calOf(g).day);
  });
  it('salário do treinador caiu pela metade', () => {
    const g = mk();
    expect(coachSalary(g)).toBeLessThan(2_500_000);
    expect(coachSalary(g)).toBeGreaterThanOrEqual(30_000);
  });
});
