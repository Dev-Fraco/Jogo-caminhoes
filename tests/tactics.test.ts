import { describe, expect, it } from 'vitest';
import { attackBias, simulateMatch, tacticQuality, withTactics, type Tactic } from '../src/engine/match';
import { makeRng } from '../src/engine/rng';
import { buildTeam, generateSquad } from '../src/engine/squad';
import type { TeamState } from '../src/engine/types';

const club = (id: string, strength: number) => ({ id, name: id, short: id.slice(0, 3).toUpperCase(), color: '#fff', strength });
const mk = (id: string, strength: number): TeamState => buildTeam({ ...club(id, strength), players: generateSquad(club(id, strength), 7) } as never, 7);
const home = mk('casa', 62), away = mk('fora', 62);
const run = (seed: number, tac?: Tactic[]) => withTactics('casa', tac, () => simulateMatch(home, away, makeRng(seed), {}, { home: 'Casa', away: 'Fora' }));
const tactic = (minute: number, formation: Tactic['formation']): Tactic => ({ minute, formation, lineup: buildTeam({ ...club('casa', 62), players: home.players } as never, 7).lineup });
const after = (events: ReturnType<typeof run>['events'], minute: number, side: 'home' | 'away') => events.filter((e) => e.type === 'goal' && e.minute > minute && e.side === side).length;
const at = (events: ReturnType<typeof run>['events'], minute: number): [number, number] => { let s: [number, number] = [0, 0]; for (const e of events) if (e.minute <= minute && e.score) s = e.score; return s; };

describe('mudanças táticas na partida', () => {
  it('sem mudança nada muda; com mudança, o que já aconteceu antes continua igual', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const a = run(seed), b = run(seed);
      expect(b.events).toEqual(a.events);
      const c = run(seed, [tactic(60, '3-5-2')]);
      const before = (x: typeof a) => x.events.filter((e) => e.minute <= 59 && e.type !== 'tactic');
      expect(before(c)).toEqual(before(a));
      expect(c.events.some((e) => e.type === 'tactic' && e.side === 'home')).toBe(true);
    }
  });
  it('a nota da mudança: perdendo, atacar é bom; ganhando, fechar é bom (e o contrário é ruim)', () => {
    expect(tacticQuality(-1, 60, attackBias('4-4-2'), attackBias('3-5-2'))).toBeGreaterThan(0.75);
    expect(tacticQuality(-1, 60, attackBias('4-4-2'), attackBias('5-3-2'))).toBeLessThan(-0.75);
    expect(tacticQuality(1, 60, attackBias('4-4-2'), attackBias('5-3-2'))).toBeGreaterThan(0.75);
    expect(tacticQuality(1, 60, attackBias('4-4-2'), attackBias('4-3-3'))).toBeLessThan(0);
    expect(tacticQuality(0, 60, attackBias('4-4-2'), attackBias('4-3-3'))).toBe(0);
  });
  it('perdendo aos 60 minutos: atacar rende mais saldo de gols que fechar o time', () => {
    let atk = 0, def = 0, n = 0;
    for (let seed = 1; seed <= 900; seed++) {
      const base = run(seed);
      const [h, a] = at(base.events, 60);
      if (h >= a) continue; // só jogos em que a casa perdia
      n++;
      const x = run(seed, [tactic(60, '3-5-2')]), y = run(seed, [tactic(60, '5-3-2')]);
      atk += after(x.events, 60, 'home') - after(x.events, 60, 'away');
      def += after(y.events, 60, 'home') - after(y.events, 60, 'away');
    }
    expect(n).toBeGreaterThan(100);
    expect(atk / n).toBeGreaterThan(def / n);
  });
  it('mexer toda hora desorganiza: a 2ª mudança em menos de 10 minutos avisa a confusão', () => {
    const r = run(3, [tactic(50, '4-3-3'), tactic(55, '3-5-2')]);
    const tac = r.events.filter((e) => e.type === 'tactic');
    expect(tac.length).toBe(2);
    expect(tac[1].text).toMatch(/pouco tempo|mexeu/);
  });
  it('no máximo 5 mudanças valem', () => {
    const list = [10, 20, 30, 40, 50, 60, 70].map((m) => tactic(m, m % 20 ? '4-3-3' : '4-4-2'));
    expect(run(2, list).events.filter((e) => e.type === 'tactic').length).toBe(5);
  });
});
