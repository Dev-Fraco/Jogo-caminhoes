import { describe, expect, it } from 'vitest';
import { STANCES, STANCE_LIST, simulateMatch, withTactics } from '../src/engine/match';
import { makeRng } from '../src/engine/rng';
import type { Stance } from '../src/engine/types';
import { makeCareer } from './helpers';

const g = makeCareer('flamengo', 4);
const A = g.teams.flamengo;
const B = { ...g.teams[Object.keys(g.teams).find((k) => k !== 'flamengo')!], };
const N = 3000;
function run(sa: Stance, sb: Stance) {
  let ptsA = 0, gf = 0, ga = 0, yel = [0, 0];
  for (let i = 0; i < N; i++) {
    // mesmo time contra ele mesmo (elencos iguais) para medir só o efeito da postura; lados alternados tiram a vantagem de casa
    const home = i % 2 === 0;
    const a = { ...A, stance: sa }, b = { ...A, clubId: 'espelho', stance: sb };
    const r = home ? simulateMatch(a, b, makeRng(i + 1)) : simulateMatch(b, a, makeRng(i + 1));
    const ag = home ? r.homeGoals : r.awayGoals, bg = home ? r.awayGoals : r.homeGoals;
    gf += ag; ga += bg; ptsA += ag > bg ? 3 : ag === bg ? 1 : 0;
    yel[0] += r.events.filter((e) => e.type === 'yellow' && e.side === (home ? 'home' : 'away')).length;
    yel[1] += r.events.filter((e) => e.type === 'yellow' && e.side === (home ? 'away' : 'home')).length;
  }
  return { ppg: ptsA / N, gf: gf / N, ga: ga / N, yel: yel.map((y) => y / N) };
}
describe('postura do time', () => {
  it('equilibrado x equilibrado = partida de sempre (sem postura = equilibrado)', () => {
    const a = simulateMatch(A, { ...A, clubId: 'x' }, makeRng(5)), b = simulateMatch({ ...A, stance: 'equilibrado' }, { ...A, clubId: 'x', stance: 'equilibrado' }, makeRng(5));
    expect(b.events.map((e) => e.text)).toEqual(a.events.map((e) => e.text));
  });
  it('cada postura muda o jogo do jeito descrito e nenhuma domina as outras', () => {
    const out: Record<string, ReturnType<typeof run>> = {};
    for (const s of STANCE_LIST) out[s] = run(s, 'equilibrado');
    console.log(JSON.stringify(out));
    expect(out.agressivo.gf).toBeGreaterThan(out.equilibrado.gf);
    expect(out.agressivo.ga).toBeGreaterThan(out.equilibrado.ga);
    expect(out.agressivo.yel[0]).toBeGreaterThan(out.agressivo.yel[1]);
    expect(out.contra.ga).toBeLessThan(out.equilibrado.ga);
    expect(out.cauteloso.ga).toBeLessThan(out.agressivo.ga);
    expect(out.cauteloso.gf).toBeLessThan(out.agressivo.gf);
    for (const s of STANCE_LIST) { expect(out[s].ppg).toBeGreaterThan(1.1); expect(out[s].ppg).toBeLessThan(1.75); } // 1,0 = empate técnico (equilibrado x equilibrado)
  }, 120_000);
  it('trocar a postura no meio do jogo vale do minuto seguinte em diante e aparece na narração', () => {
    const r = withTactics('flamengo', [{ minute: 60, formation: A.formation, lineup: A.lineup, stance: 'agressivo' }], () => simulateMatch(A, { ...A, clubId: 'x' }, makeRng(9)));
    const ev = r.events.find((e) => e.type === 'tactic');
    expect(ev?.minute).toBe(60); expect(ev?.text).toContain('Agressivo');
  });
});

describe('postura no jogo (estado)', () => {
  it('setStance guarda a postura do seu time e ela entra na partida jogada', async () => {
    const { setStance, playNext } = await import('../src/engine/game');
    const g1 = setStance(g, 'agressivo');
    expect(g1.teams[g1.userClubId].stance).toBe('agressivo');
    expect(g.teams[g.userClubId].stance).toBeUndefined();
    expect(playNext(g1).state.round).toBeGreaterThan(g1.round - 1);
  });
});
