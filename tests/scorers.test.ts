import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { newCareer, simulateToEnd } from '../src/engine/game';
import { competitionName, currentScorers, scorerCompetitions } from '../src/engine/scorers';
import type { GameState } from '../src/engine/types';

const career = (seed = 5): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, seed);
const sumOf = (g: GameState, comp: string) => Object.values(g.scorers ?? {}).filter((s) => s[2] === comp).reduce((a, s) => a + s[3], 0);

describe('Artilharia de todas as competições', () => {
  it('divisões, estaduais, copa, continentais e Mundial têm artilharia; os gols somados batem com os gols das partidas', () => {
    const e = simulateToEnd(career());
    const comps = scorerCompetitions(e).map((c) => c.id);
    for (const d of e.divisions.filter((x) => x.format !== 'outside')) expect(comps, d.id).toContain(d.id);
    expect(comps).toContain('copa');
    expect(comps.filter((c) => c.startsWith('est:')).length).toBeGreaterThanOrEqual(10);
    for (const k of ['lib', 'sula', 'ucl'] as const) expect(comps, k).toContain(e[k]!.id);
    expect(comps).toContain('mundial');
    // divisões e estaduais: soma exata
    for (const d of e.divisions.filter((x) => x.format !== 'outside')) expect(sumOf(e, d.id), d.id).toBe(e.results.filter((r) => r.divisionId === d.id).reduce((a, r) => a + r.homeGoals + r.awayGoals, 0));
    for (const c of e.estadual!.comps) c.divisions.forEach((d, i) => expect(sumOf(e, `est:${c.uf}:${i}`), `${c.uf}:${i}`).toBe(d.matches.reduce((a, m) => a + m[3] + m[4], 0)));
    // copa: os gols dos jogos (sem pênaltis) viram artilharia
    const cupGoals = e.cup!.rounds.flatMap((r) => r.ties).reduce((a, t) => a + (t.homeGoals ?? 0) + (t.awayGoals ?? 0), 0);
    expect(sumOf(e, 'copa')).toBe(cupGoals);
    // nomes legíveis
    for (const c of scorerCompetitions(e)) { expect(c.name.length).toBeGreaterThan(2); expect(c.name).not.toMatch(/^est:/); }
    expect(competitionName(e, 'copa')).toBe(e.cup!.name);
    expect(currentScorers(e, e.divisions[0].id, 5).length).toBe(5);
    const top = currentScorers(e, e.divisions[0].id, 5); expect(top.every((r, i) => i === 0 || r[2] <= top[i - 1][2])).toBe(true);
  }, 300_000);
  it('na virada o top 10 de cada competição vai para o histórico e a artilharia nova recomeça do zero', () => {
    const e = simulateToEnd(career(8)); const g = startNextSeason(e);
    const last = g.history[g.history.length - 1];
    const ids = (last.topScorers ?? []).map((t) => t.divisionId);
    expect(ids).toContain('copa'); expect(ids.filter((x) => x.startsWith('est:')).length).toBeGreaterThan(5);
    for (const t of last.topScorers!) { expect(t.rows.length).toBeLessThanOrEqual(10); expect(t.rows.every((r, i) => i === 0 || r[2] <= t.rows[i - 1][2])).toBe(true); }
    expect(Object.keys(g.scorers ?? {}).length).toBe(0);
    // os nomes continuam resolvendo depois da virada (campeonatos do ano que passou)
    expect(competitionName(g, e.divisions[0].id)).toBe(e.divisions[0].name);
  }, 300_000);
  it('é determinística: a mesma carreira gera a mesma artilharia', () => {
    const a = simulateToEnd(career(11)), b = simulateToEnd(career(11));
    expect(JSON.stringify(a.scorers)).toBe(JSON.stringify(b.scorers));
  }, 300_000);
});

describe('Artilharia — save da versão anterior', () => {
  it('artilheiros no formato antigo (objetos) são convertidos sem perder nada e a conversão é idempotente', async () => {
    const { compactScorers } = await import('../src/engine/scorers');
    const g = { ...career(), scorers: { 'a@serie-a': { name: 'Fulano', clubId: 'palmeiras', divisionId: 'serie-a', g: 7 } } } as unknown as GameState;
    const c = compactScorers(g);
    expect(c.scorers).toEqual({ 'a@serie-a': ['Fulano', 'palmeiras', 'serie-a', 7] });
    expect(compactScorers(c)).toBe(c);
    expect(currentScorers(c, 'serie-a')).toEqual([['Fulano', 'palmeiras', 7]]);
  });
});
