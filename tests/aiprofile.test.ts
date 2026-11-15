import { describe, expect, it } from 'vitest';
import { aiBalanceBooks, aiWindow } from '../src/engine/ai';
import { clubProfile, profileCtx, signingScore, titlePoints } from '../src/engine/aiprofile';
import { makeRng } from '../src/engine/rng';
import { rosterOk } from '../src/engine/roster';
import { divisionIndexOf } from '../src/engine/transfers';
import type { GameState } from '../src/engine/types';
import { makeCareer } from './helpers';

const g0 = makeCareer('flamengo', 4);
const ids = (g: GameState) => Object.keys(g.teams).filter((id) => id !== 'flamengo');
const withBudget = (g: GameState, id: string, v: number): GameState => ({ ...g, budgets: { ...g.budgets, [id]: v } });

describe('personalidade dos clubes', () => {
  it('há gigantes, médios e pequenos; a Série A tem os grandes e a Série D os pequenos', () => {
    const ctx = profileCtx(g0);
    const profs = Object.keys(g0.teams).map((id) => clubProfile(g0, id, ctx));
    for (const t of ['gigante', 'medio', 'pequeno'] as const) expect(profs.some((p) => p.tier === t), t).toBe(true);
    expect(clubProfile(g0, 'flamengo', ctx).tier).toBe('gigante');
    const d = g0.divisions[3].clubIds;
    expect(d.filter((id) => clubProfile(g0, id, ctx).tier === 'pequeno').length).toBeGreaterThan(d.length * 0.8);
  });
  it('é puro e determinístico, e tem todas as dimensões coerentes', () => {
    const a = clubProfile(g0, 'palmeiras'), b = clubProfile(g0, 'palmeiras');
    expect(a).toEqual(b);
    for (const v of [a.ambition, a.squadQuality, a.infrastructure, a.fanBase, a.spendShare, a.sellPressure, a.prefersYouth, a.prefersLoans, a.coachDemand]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    expect(a.needs).toHaveLength(4); expect(a.label).toMatch(/Gigante|Médio|Pequeno/);
    expect(a.needs[0].gap).toBeGreaterThanOrEqual(a.needs[3].gap);
  });
  it('comportamentos distintos: gigante exige mais do treinador e quer qualidade; pequeno poupa, prefere garotos e empréstimos e vende para fechar as contas', () => {
    const big = clubProfile(g0, 'flamengo'), small = clubProfile(g0, g0.divisions[3].clubIds[0]);
    expect(big.coachDemand).toBeGreaterThan(small.coachDemand);
    expect(big.minUpgrade).toBeGreaterThan(small.minUpgrade);
    expect(big.maxAge).toBeGreaterThan(small.maxAge);
    expect(small.prefersYouth).toBeGreaterThan(big.prefersYouth);
    expect(small.prefersLoans).toBeGreaterThan(big.prefersLoans);
    const broke = clubProfile(withBudget(g0, small.clubId, 1_000), small.clubId), rich = clubProfile(withBudget(g0, small.clubId, 1e9), small.clubId);
    expect(broke.financial).toBe('crise'); expect(rich.financial).toBe('rico');
    expect(broke.sellPressure).toBeGreaterThan(rich.sellPressure); expect(broke.spendShare).toBeLessThan(rich.spendShare);
  });
  it('pequenos podem crescer: acessos e títulos recentes elevam o porte e a ambição; ser rico não é garantia de nada (gasto por negócio tem teto)', () => {
    const id = g0.divisions[2].clubIds.find((x) => g0.clubs[x].reputation <= 2)!;
    const before = clubProfile(g0, id);
    const history = Array.from({ length: 3 }, (_, i) => ({ season: 2020 + i, divisions: [{ id: 'x', championId: 'ninguem', promoted: [id], relegated: [] }], cupChampionId: i < 2 ? id : undefined } as never));
    const grown = clubProfile({ ...g0, history: [...g0.history, ...history] }, id);
    expect(grown.size).toBeGreaterThan(before.size + 1);
    expect(grown.ambition).toBeGreaterThan(before.ambition);
    expect(before.tier).toBe('pequeno'); expect(grown.tier).toBe('medio');
    expect(titlePoints({ history: [{ divisions: [{ championId: id }] } as never] }, id)).toBe(1);
    expect(clubProfile(withBudget(g0, 'flamengo', 1e12), 'flamengo').spendShare).toBeLessThanOrEqual(0.65);
  });
  it('a pontuação do reforço: gigante só olha qualidade; pequeno prefere o barato e jovem', () => {
    const big = clubProfile(g0, 'flamengo'), small = clubProfile(g0, g0.divisions[3].clubIds[0]);
    expect(signingScore(big, 10, 50_000_000, 30)).toBeGreaterThan(signingScore(big, 6, 1_000_000, 30));
    expect(signingScore(small, 6, 100_000, 21)).toBeGreaterThan(signingScore(small, 8, 5_000_000, 31));
  });
});

describe('IA com personalidade nas transferências', () => {
  it('o clube só compra dentro do que a personalidade permite (idade, ganho mínimo e gasto por negócio)', () => {
    for (const buyer of [g0.divisions[0].clubIds[3], g0.divisions[1].clubIds[2], g0.divisions[3].clubIds[5]].filter((x) => x !== 'flamengo')) {
      const g = withBudget(g0, buyer, 30_000_000);
      const prof = clubProfile(g, buyer);
      const before = new Set(g.teams[buyer].players.map((p) => p.id));
      const s = aiWindow(g, makeRng(9), 3, [buyer]);
      const bought = s.teams[buyer].players.filter((p) => !before.has(p.id));
      for (const p of bought) expect(p.age, buyer).toBeLessThanOrEqual(prof.maxAge);
      const spent = g.budgets[buyer] - s.budgets[buyer];
      expect(spent, buyer).toBeLessThanOrEqual(30_000_000 * prof.spendShare * 3 + 1);
      expect(rosterOk(s.teams[buyer].players)).toBe(true);
    }
  });
  it('quem tem mais dinheiro tende a contratar jogadores melhores, mas o pequeno também contrata (custo-benefício) e fica com jogadores mais jovens', () => {
    let bigStr = 0, bigN = 0, smallAge = 0, smallN = 0, bigAge = 0, bigAgeN = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const big = g0.divisions[0].clubIds.find((x) => x !== 'flamengo')!, small = g0.divisions[3].clubIds[seed];
      for (const [id, budget] of [[big, 80_000_000], [small, 3_000_000]] as const) {
        const weak = { ...g0, teams: { ...g0.teams, [id]: { ...g0.teams[id], players: g0.teams[id].players.map((p) => ({ ...p, strength: 35 })) } } }; // elenco fraco: há o que reforçar
        const g = withBudget(weak, id, budget);
        const before = new Set(g.teams[id].players.map((p) => p.id));
        const s = aiWindow(g, makeRng(seed), 2, [id]);
        for (const p of s.teams[id].players.filter((q) => !before.has(q.id))) {
          if (id === big) { bigStr += p.strength; bigN++; bigAge += p.age; bigAgeN++; } else { smallAge += p.age; smallN++; }
        }
      }
    }
    expect(bigN).toBeGreaterThan(0); expect(smallN).toBeGreaterThan(0);
    expect(bigStr / bigN).toBeGreaterThan(55); // quem tem dinheiro compra qualidade
    expect(smallAge / smallN).toBeLessThanOrEqual(30); // o pequeno respeita o limite de idade do seu perfil
  });
  it('clube em crise vende para equilibrar as contas (jogador e dinheiro trocam de mãos, elencos seguem válidos)', () => {
    const id = g0.divisions[3].clubIds[0];
    const g = withBudget(g0, id, 1_000);
    const richBuyer = g0.divisions[3].clubIds[1];
    const g1 = withBudget(g, richBuyer, 500_000_000);
    const s = aiBalanceBooks(g1, makeRng(3));
    expect(s.teams[id].players.length).toBeLessThan(g1.teams[id].players.length);
    expect(s.budgets[id]).toBeGreaterThan(1_000);
    for (const [cid, t] of Object.entries(s.teams)) if (cid !== 'flamengo') expect(rosterOk(t.players), cid).toBe(true);
    // clube saudável não vende
    const calm = aiBalanceBooks(withBudget(g0, id, 50_000_000), makeRng(3));
    expect(calm.teams[id].players.length).toBe(g0.teams[id].players.length);
    expect(divisionIndexOf(s, id)).toBe(3);
  });

  it('jogador seu emprestado a outro clube nunca é vendido pelo clube que o recebeu', () => {
    const host = g0.divisions[1].clubIds[0], star = [...g0.teams[host].players].sort((a, b) => b.strength - a.strength)[0];
    const g = { ...g0, loans: [{ playerId: star.id, hostClubId: host, season: g0.season }] };
    for (let seed = 1; seed <= 15; seed++) {
      const s = aiBalanceBooks(withBudget(aiWindow(g, makeRng(seed), 8), host, 1_000), makeRng(seed));
      expect(s.teams[host].players.some((p) => p.id === star.id)).toBe(true);
    }
  });
});
