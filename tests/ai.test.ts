import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { serieDFlow } from '../src/engine/phases';
import { serieDQualifiers } from '../src/engine/estadual';
import { describe, expect, it } from 'vitest';
import { aiWindow, AI_MAX_SQUAD, developPlayer, PROMOTED_STRONG_CHANCE, SQUAD_TARGET } from '../src/engine/ai';
import { isSeasonOver, playRound, seasonMoves } from '../src/engine/game';
import { makeRng } from '../src/engine/rng';
import { rosterOk } from '../src/engine/roster';
import { MIN_SQUAD } from '../src/engine/transfers';
import type { GameState, Player } from '../src/engine/types';
import { makeCareer } from './helpers';

/** Joga a temporada inteira mantendo a diretoria satisfeita (sem demissão), para testar o resto. */
const playSeason = (g: GameState) => { while (!isSeasonOver(g)) { g = playRound(g).state; g = { ...g, morale: { ...g.morale, board: 60 } }; } return g; };
const mk = (strength: number, age: number): Player => ({ id: 'x', name: 'X', pos: 'MID', age, strength });
const total = (g: GameState) => Object.values(g.budgets).reduce((a, v) => a + v, 0);

describe('evolução dos jogadores', () => {
  it('jovens evoluem, veteranos caem; idade sempre +1; overall entre 25 e 97', () => {
    const rng = makeRng(1);
    const avg = (age: number, f: () => number) => { let s = 0; for (let i = 0; i < 2000; i++) s += f(); return s / 2000; };
    const delta = (age: number) => avg(age, () => developPlayer(mk(60, age - 1), rng).strength - 60);
    expect(delta(19)).toBeGreaterThan(1.5); expect(delta(23)).toBeGreaterThan(0.8);
    expect(Math.abs(delta(26))).toBeLessThan(0.4);
    expect(delta(30)).toBeLessThan(-0.4); expect(delta(34)).toBeLessThan(-1.5);
    expect(developPlayer(mk(60, 25), rng).age).toBe(26);
    expect(developPlayer(mk(97, 19), rng).strength).toBeLessThanOrEqual(97);
    expect(developPlayer(mk(25, 36), rng).strength).toBeGreaterThanOrEqual(25);
  });
});

describe('virada de temporada com a IA', () => {
  const end = playSeason(makeCareer('flamengo', 11));
  const next = startNextSeason(end);

  it('mantém o mundo consistente: 156 clubes (20, 20, 20 e 96), jogadores únicos, orçamentos válidos', () => {
    expect(next.divisions.map((d) => d.clubIds.length)).toEqual([20, 20, 20, 96]);
    expect(Object.keys(next.teams)).toHaveLength(156);
    const ids = Object.values(next.teams).flatMap((t) => t.players.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const [id, b] of Object.entries(next.budgets)) expect(b, id).toBeGreaterThanOrEqual(0);
  });
  it('elencos da IA ficam válidos: entre o mínimo e o máximo, 11 titulares', () => {
    for (const [id, t] of Object.entries(next.teams)) {
      if (id === 'flamengo') continue;
      expect(rosterOk(t.players), id).toBe(true);
      expect(t.players.length, id).toBeGreaterThanOrEqual(MIN_SQUAD);
      expect(t.players.length, id).toBeLessThanOrEqual(AI_MAX_SQUAD);
      expect(t.lineup, id).toHaveLength(11);
      for (const pid of t.lineup) expect(t.players.some((p) => p.id === pid), id).toBe(true);
    }
  });
  it('o seu clube envelhece e evolui, só perde veteranos aposentados (35+) e não ganha base automática', () => {
    const before = end.teams.flamengo.players, after = next.teams.flamengo.players;
    const ids = new Set(before.map((p) => p.id));
    after.forEach((p) => expect(ids.has(p.id)).toBe(true));
    for (const b of before) {
      const a = after.find((p) => p.id === b.id);
      if (a) expect(a.age).toBe(b.age + 1); else expect(b.age + 1).toBeGreaterThanOrEqual(35);
    }
    expect(after.length).toBeGreaterThanOrEqual(18);
    expect(next.teams.flamengo.lineup.every((id) => after.some((p) => p.id === id))).toBe(true);
  });
  it('a IA contrata, e as notícias registram os negócios e os investimentos dos promovidos', () => {
    expect(next.news.length).toBeGreaterThan(5);
    expect(next.news.some((n) => n.text.includes('anuncia') || n.text.includes('contrata'))).toBe(true);
    expect(next.news.filter((n) => n.text.includes('sobe')).length).toBeGreaterThanOrEqual(8);
    expect(next.news.length).toBeLessThanOrEqual(80);
    expect(next.history[0].promotion).toHaveLength(8 + serieDFlow(end.season, serieDQualifiers(end).length).promoted); // 4 que sobem da B e da C, mais os da D
  });
  it('é determinístico', () => {
    expect(JSON.stringify(startNextSeason(end).news)).toBe(JSON.stringify(next.news));
  });
});

describe('janela de transferências da IA', () => {
  it('não mexe no seu elenco; o dinheiro só muda de mãos', () => {
    const g = makeCareer('flamengo', 4);
    const s = aiWindow(g, makeRng(9), 3);
    expect(s.teams.flamengo).toBe(g.teams.flamengo);
    expect(s.budgets.flamengo).toBe(g.budgets.flamengo);
    expect(total(s)).toBe(total(g));
    const count = (x: GameState) => Object.values(x.teams).reduce((a, t) => a + t.players.length, 0);
    expect(count(s)).toBeLessThanOrEqual(count(g)); // só troca de clube (e dispensas por elenco cheio)
  });
  it('clube rico e fraco contrata para melhorar o time titular', () => {
    let g = makeCareer('flamengo', 4);
    g = { ...g, budgets: { ...g.budgets, remo: 100_000_000 } }; // clube fraco da Série A, com muito dinheiro
    const avgXI = (s: GameState) => [...s.teams.remo.players].sort((a, b) => b.strength - a.strength).slice(0, 11).reduce((x, p) => x + p.strength, 0) / 11;
    const s = aiWindow(g, makeRng(2), 4, ['remo']);
    expect(avgXI(s)).toBeGreaterThan(avgXI(g));
    expect(s.budgets.remo).toBeLessThan(100_000_000);
    expect(s.teams.remo.players.length).toBeLessThanOrEqual(AI_MAX_SQUAD);
  });
  it('sem dinheiro, não contrata', () => {
    let g = makeCareer('flamengo', 4);
    g = { ...g, budgets: { ...g.budgets, abc: 0 } };
    expect(aiWindow(g, makeRng(2), 4, ['abc']).teams.abc).toBe(g.teams.abc);
  });
  it('janela do meio da temporada acontece depois da rodada 19, sem quebrar nada', () => {
    let g = makeCareer('flamengo', 6);
    for (let i = 0; i < 19; i++) g = playRound(g).state;
    expect(g.round).toBe(20);
    for (const t of Object.values(g.teams)) expect(t.lineup).toHaveLength(11);
  });
  it('a meta de elenco da base é 24', () => expect(SQUAD_TARGET).toBe(24));
});

describe('acesso: a IA decide se o promovido se mantém (probabilidade)', () => {
  // 2 carreiras × 8 temporadas: mede quantos promovidos caem no ano seguinte
  const run = (seed: number) => {
    let g = makeCareer('flamengo', seed);
    const out = { strong: [0, 0], weak: [0, 0], all: [0, 0], rolls: 0, strongRolls: 0 };
    let prev: { id: string; level: number; strong: boolean }[] = [];
    for (let season = 0; season < 8; season++) {
      g = playSeason(g);
      const moves = seasonMoves(g);
      for (const p of prev) {
        const down = moves[p.level].relegated.includes(p.id);
        const b = p.strong ? out.strong : out.weak;
        b[0]++; out.all[0]++; if (down) { b[1]++; out.all[1]++; }
      }
      const now = moves.flatMap((m, i) => m.promoted.map((id) => ({ id, level: i - 1 })));
      g = startNextSeason(g);
      const rolls = new Map(g.history.at(-1)!.promotion!.map((r) => [r.clubId, r.strong]));
      out.rolls += rolls.size; out.strongRolls += [...rolls.values()].filter(Boolean).length;
      prev = now.map((p) => ({ ...p, strong: rolls.get(p.id)! }));
    }
    return out;
  };
  const a = run(1), b = run(2);
  const sum = (k: 'strong' | 'weak' | 'all') => [a[k][0] + b[k][0], a[k][1] + b[k][1]];

  it(`~${PROMOTED_STRONG_CHANCE * 100}% dos promovidos recebem investimento forte`, () => {
    const rate = (a.strongRolls + b.strongRolls) / (a.rolls + b.rolls);
    expect(rate).toBeGreaterThan(0.5); expect(rate).toBeLessThan(0.8);
  });
  it('promovido nem sempre cai: no ano seguinte cai uma parte (entre 20% e 60%), e ninguém é imune', () => {
    const [n, down] = sum('all');
    expect(n).toBeGreaterThan(100);
    expect(down / n).toBeGreaterThan(0.2); expect(down / n).toBeLessThan(0.6);
    expect(down).toBeGreaterThan(0); expect(down).toBeLessThan(n);
  });
  it('investimento forte protege: quem recebe cai bem menos do que quem não recebe', () => {
    const [sn, sd] = sum('strong'), [wn, wd] = sum('weak');
    expect(sn).toBeGreaterThan(30); expect(wn).toBeGreaterThan(20);
    expect(sd / sn).toBeLessThan(wd / wn);
  });
}, 120_000);
