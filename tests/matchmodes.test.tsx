import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { playNext } from '../src/engine/game';
import { consistent, matchStats } from '../src/engine/matchstats';
import { clubOf } from '../src/engine/lookup';
import { MATCH_SECONDS, MS_PER_MINUTE, scoreAt } from '../src/ui/LiveMatch';
import { MatchChoice } from '../src/ui/MatchChoice';
import { MatchSim } from '../src/ui/MatchSim';
import { makeCareer } from './helpers';

afterEach(() => vi.unstubAllGlobals());
const userMatch = (seed: number) => { const g = makeCareer('palmeiras', seed); const r = playNext(g); return { g, r: r.results.find((x) => x.homeId === g.userClubId || x.awayId === g.userClubId)! }; };

describe('simular x assistir: mesma partida', () => {
  it('o placar do resultado, o da lista de lances e o da linha do tempo ao vivo são idênticos (várias partidas)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { r } = userMatch(seed);
      expect(r.events.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(consistent(r), `seed ${seed}`).toBe(true);
      expect(scoreAt(r.events, 90)).toEqual([r.homeGoals, r.awayGoals]);       // o que a partida assistida mostra
      const st = matchStats(r.events);
      expect([st.home.goals, st.away.goals]).toEqual([r.homeGoals, r.awayGoals]); // o que a simulação mostra
      expect(st.home.onTarget).toBeGreaterThanOrEqual(st.home.goals);
    }
  });
  it('a partida assistida não tem velocidades: 3 s por minuto de jogo (cerca de 5 minutos reais com os lances) e só dá para pular até o fim', () => {
    expect(MS_PER_MINUTE).toBe(3000); expect(MATCH_SECONDS).toBe(270);
    const html = renderToStaticMarkup(createElement(MatchChoice, { home: clubOf(userMatch(3).g, userMatch(3).r.homeId), away: clubOf(userMatch(3).g, userMatch(3).r.awayId), divisionName: 'x', stadium: 'y', onChoose: () => {} }));
    expect(html).toContain('cerca de 5 minutos'); expect(html).not.toMatch(/1x a 4x/);
  });
});

describe('telas', () => {
  it('a escolha oferece as duas opções', () => {
    const { g, r } = userMatch(3);
    const html = renderToStaticMarkup(createElement(MatchChoice, { home: clubOf(g, r.homeId), away: clubOf(g, r.awayId), divisionName: 'Série A', stadium: 'Estádio', onChoose: () => {} }));
    expect(html).toContain('Assistir partida'); expect(html).toContain('Simular partida inteira');
  });
  it('a simulação (sem animação) já mostra o placar final do resultado e as estatísticas', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    const { g, r } = userMatch(5);
    const html = renderToStaticMarkup(createElement(MatchSim, { home: clubOf(g, r.homeId), away: clubOf(g, r.awayId), result: r, userSide: r.homeId === g.userClubId ? 'home' : 'away', onFinish: () => {} }));
    expect(html).toContain('Fim de jogo!'); expect(html).toContain(`${r.homeGoals} x ${r.awayGoals}`); expect(html).toContain('Estatísticas da partida'); expect(html).toContain('Finalizações');
  });
});
