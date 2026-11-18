import { describe, expect, it } from 'vitest';
import { playNext } from '../src/engine/game';
import { simulateMatch, withTactics } from '../src/engine/match';
import { makeRng } from '../src/engine/rng';
import { buildPlays, checkPlays, onField, playerMap } from '../src/engine/plays';
import { teamOf } from '../src/engine/lookup';
import { matchStats } from '../src/engine/matchstats';
import { makeCareer } from './helpers';

const names = { home: 'A', away: 'B' };

describe('sequência de lances (base do campo 3D, da simulação e do VAR)', () => {
  it('em 120 partidas: gols, autores, ordem e escalações em campo conferem com o que o motor registrou', () => {
    const g = makeCareer('palmeiras', 11);
    const ids = Object.keys(g.clubs);
    let goals = 0, plays = 0, headers = 0;
    for (let n = 0; n < 120; n++) {
      const h = teamOf(g, ids[(n * 7) % ids.length]), a = teamOf(g, ids[(n * 7 + 3) % ids.length]);
      if (h.clubId === a.clubId) continue;
      const out = simulateMatch(h, a, makeRng(1000 + n), {}, names);
      const pm = playerMap(h, a);
      const seq = buildPlays(out.events, pm, `m${n}`);
      expect(checkPlays(seq, out.events, out.homeGoals, out.awayGoals), `partida ${n}`).toEqual([]);
      goals += out.homeGoals + out.awayGoals; plays += seq.length; headers += seq.filter((p) => p.type === 'header').length;
      // determinística: a mesma lista de lances dá sempre a mesma sequência
      expect(buildPlays(out.events, pm, `m${n}`)).toEqual(seq);
      // os lances registrados trazem quem fez (para o 3D mostrar o jogador certo)
      for (const e of out.events) if (['goal', 'save', 'miss', 'foul', 'yellow', 'red', 'corner'].includes(e.type)) expect(e.pid, `${e.type} sem jogador`).toBeTruthy();
      expect(matchStats(out.events).home.goals).toBe(out.homeGoals);
    }
    expect(goals).toBeGreaterThan(100); expect(plays).toBeGreaterThan(1000); expect(headers).toBeGreaterThan(0);
  });

  it('substituições e mudanças táticas atualizam quem está em campo', () => {
    const g = makeCareer('palmeiras', 4);
    const ids = Object.keys(g.clubs); const h = teamOf(g, g.userClubId), a = teamOf(g, ids.find((i) => i !== g.userClubId)!);
    const bench = h.players.filter((p) => !h.lineup.includes(p.id) && p.pos !== 'GK').sort((x, y) => y.strength - x.strength)[0];
    const swapOut = h.lineup.find((id) => h.players.find((p) => p.id === id)!.pos === 'MID')!;
    const lineup = h.lineup.map((id) => (id === swapOut ? bench.id : id));
    const out = withTactics(h.clubId, [{ minute: 30, formation: h.formation, lineup }], () => simulateMatch(h, a, makeRng(77), {}, names));
    const ix = out.events.findIndex((e) => e.type === 'tactic');
    expect(ix).toBeGreaterThan(0);
    const before = onField(out.events, ix), after = onField(out.events, ix + 1);
    expect(before.home).toContain(swapOut); expect(after.home).not.toContain(swapOut); expect(after.home).toContain(bench.id);
    expect(checkPlays(buildPlays(out.events, playerMap(h, a), 'x'), out.events, out.homeGoals, out.awayGoals)).toEqual([]);
  });

  it('o jogo real: a partida do seu clube gera lances com a escalação do início e a sequência confere', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const g = makeCareer('palmeiras', seed); const r = playNext(g).results.find((x) => x.homeId === g.userClubId || x.awayId === g.userClubId)!;
      const k = r.events.find((e) => e.type === 'kickoff')!.lineups!;
      expect(k.home).toHaveLength(11); expect(k.away).toHaveLength(11);
      const seq = buildPlays(r.events, playerMap(teamOf(g, r.homeId), teamOf(g, r.awayId)), `${r.round}-${r.homeId}`);
      expect(checkPlays(seq, r.events, r.homeGoals, r.awayGoals)).toEqual([]);
    }
  });
});
