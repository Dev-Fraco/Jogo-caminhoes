import { skipSeasons } from '../src/premium/season';
import { skipSeasons } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { aiCoachSeasonEnd, aiCoachTick, coachOf, coachPressure, ensureAiCoaches, FIRE_AT, maxFirings, replaceCoach, unemployedCoaches } from '../src/engine/aicoaches';

import { fire, hire } from '../src/engine/jobs';
import { makeRng } from '../src/engine/rng';
import type { GameState, MatchResult } from '../src/engine/types';
import { makeCareer } from './helpers';

const g0 = ensureAiCoaches(makeCareer('flamengo', 4));
const div = g0.divisions[0];
const aiIds = div.clubIds.filter((x) => x !== 'flamengo');
/** Resultados fabricados: o clube `id` perde/ganha tudo, os outros empatam entre si. */
const fakeResults = (g: GameState, losers: Record<string, number>, rounds: number): MatchResult[] => {
  const out: MatchResult[] = [];
  const ids = g.divisions[0].clubIds;
  for (let r = 1; r <= rounds; r++) for (let i = 0; i + 1 < ids.length; i += 2) {
    const a = ids[(i + r) % ids.length], b = ids[(i + 1 + r) % ids.length];
    const la = losers[a] ?? 0, lb = losers[b] ?? 0; // >0: perde sempre; <0: ganha sempre
    const ga = la > 0 || lb < 0 ? 0 : lb > 0 || la < 0 ? 2 : 1, gb = lb > 0 || la < 0 ? 0 : la > 0 || lb < 0 ? 2 : 1;
    out.push({ divisionId: g.divisions[0].id, round: r, homeId: a, awayId: b, homeGoals: ga, awayGoals: gb });
  }
  return out;
};

describe('treinadores da IA', () => {
  it('todo clube da IA tem treinador, ninguém comanda dois clubes e o do jogador não tem treinador da IA', () => {
    const g = g0;
    for (const id of aiIds) expect(coachOf(g, id)?.clubId).toBe(id);
    expect(coachOf(g, 'flamengo')).toBeUndefined();
    const used = Object.values(g.aiCoaches!).filter((c) => c.clubId).map((c) => c.clubId);
    expect(new Set(used).size).toBe(used.length);
    expect(unemployedCoaches(g).length).toBeGreaterThanOrEqual(10);
  });

  it('treinador novo (poucas rodadas de casa) não é demitido, mesmo com resultados péssimos', () => {
    const id = aiIds[3];
    const g = { ...g0, round: 6, results: fakeResults(g0, { [id]: 1 }, 5) };
    expect(coachPressure(g, id).score).toBeLessThan(FIRE_AT);
  });

  it('clube com elenco superior, mal na tabela e em má fase acumula pressão e pode trocar de treinador', () => {
    // pega o clube de elenco mais forte e o faz perder tudo por muitas rodadas
    const id = [...aiIds].sort((a, b) => g0.teams[b].players.length - g0.teams[a].players.length)[0];
    let g: GameState = { ...g0, round: 20, results: fakeResults(g0, { [id]: 1 }, 19) };
    g = { ...g, aiCoaches: { ...g.aiCoaches!, [coachOf(g, id)!.id]: { ...coachOf(g, id)!, since: { season: g.season - 1, round: 1 }, merit: 0, rep: 2 } } };
    const p = coachPressure(g, id);
    expect(p.score).toBeGreaterThan(FIRE_AT);
    const before = coachOf(g, id)!.id;
    const out = aiCoachTick(g, makeRng(1));
    expect(coachOf(out, id)!.id).not.toBe(before);
    expect(out.aiCoaches![before].clubId).toBeNull();
  });

  it('clube dentro da meta (ex.: lutando pelo acesso) NÃO demite por duas derrotas', () => {
    const id = aiIds[0];
    // o clube vence quase tudo e perde as 2 últimas
    const base = fakeResults(g0, { [id]: -1 }, 18).filter((r) => r.round <= 18);
    const lastTwo: MatchResult[] = [19, 20].map((r) => ({ divisionId: div.id, round: r, homeId: id, awayId: aiIds[1], homeGoals: 0, awayGoals: 2 }));
    const g = { ...g0, round: 21, results: [...base, ...lastTwo] };
    expect(coachPressure(g, id).score).toBeLessThan(FIRE_AT);
  });

  it('a troca de treinador respeita limites: no máximo algumas por avaliação', () => {
    let g: GameState = { ...g0, round: 24 };
    const losers = Object.fromEntries(aiIds.slice(0, 30).map((id) => [id, 1]));
    g = { ...g, results: fakeResults(g0, losers, 23) };
    const coaches = { ...g.aiCoaches! };
    for (const id of aiIds) { const c = coachOf(g, id)!; coaches[c.id] = { ...c, since: { season: g.season - 1, round: 1 }, merit: -2 }; }
    g = { ...g, aiCoaches: coaches };
    const before = new Map(aiIds.map((id) => [id, coachOf(g, id)!.id]));
    const out = aiCoachTick(g, makeRng(2));
    const changed = aiIds.filter((id) => coachOf(out, id)!.id !== before.get(id)).length;
    expect(changed).toBeLessThanOrEqual(maxFirings(g, false));
  });

  it('substituto não é quem já passou pelo clube há pouco (sem recontratar o mesmo treinador)', () => {
    const id = aiIds[2];
    let g = g0;
    const first = coachOf(g, id)!;
    g = replaceCoach(g, id, makeRng(3), 'demitido', 'teste');
    const second = coachOf(g, id)!;
    expect(second.id).not.toBe(first.id);
    for (let i = 0; i < 6; i++) { g = replaceCoach(g, id, makeRng(10 + i), 'demitido'); expect(coachOf(g, id)!.id).not.toBe(first.id); }
    expect(Object.values(g.aiCoaches!).filter((c) => c.clubId === id).length).toBe(1);
  });

  it('quando o jogador é demitido, o clube dele passa a ter treinador da IA; ao contratar, o treinador de lá sai', () => {
    let g = fire(g0, 'teste');
    expect(coachOf(g, 'flamengo')?.clubId).toBe('flamengo');
    const target = aiIds[4];
    const old = coachOf(g, target)!;
    g = hire(g, target);
    expect(coachOf(g, target)).toBeUndefined();
    expect(g.aiCoaches![old.id].clubId).toBeNull();
    expect(coachOf(g, 'flamengo')).toBeTruthy(); // o clube que ele deixou segue com treinador
  });

  it('várias temporadas: estado coerente, poucas demissões por temporada, sempre 1 treinador por clube da IA', () => {
    const g = skipSeasons(makeCareer('flamengo', 11), 3);
    const ai = Object.keys(g.teams).filter((id) => id !== g.userClubId);
    const holders = new Map<string, number>();
    for (const id of ai) {
      const c = coachOf(g, id);
      expect(c).toBeTruthy();
      expect(c!.clubId).toBe(id);
      holders.set(c!.id, (holders.get(c!.id) ?? 0) + 1);
    }
    expect([...holders.values()].every((n) => n === 1)).toBe(true);
    const sacks = Object.values(g.aiCoaches!).flatMap((c) => c.past.filter((p) => p.ended === 'demitido'));
    expect(sacks.length).toBeLessThan(ai.length * 0.5 * 3); // nada de dança das cadeiras
    expect(unemployedCoaches(g).length).toBeGreaterThanOrEqual(8);
  }, 120_000);
});
