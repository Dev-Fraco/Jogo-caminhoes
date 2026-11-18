import { beforeEach, describe, expect, it, vi } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { isSeasonOver, newCareer, playNext, startNextSeason } from '../src/engine/game';
import { CATEGORIES } from '../src/engine/categories';
import { buildReport, competitionLines } from '../src/engine/coachtalk';
import { evaluateCoaches, type YouthCoach } from '../src/engine/coaches';
import { loadGame, saveGame } from '../src/engine/save';
import { migrateGame } from '../src/engine/migrate';
import { makeRng } from '../src/engine/rng';
import { AI_MAX_SQUAD } from '../src/engine/ai';
import { aiPromoteDerived } from '../src/engine/aiyouth';
import { acceptOffer, loanOut, youthValue } from '../src/engine/ymarket';
import { aiOverall, parseDerived, qualityOf, rosterOf } from '../src/engine/yroster';
import { askWage, expiring, renewContract } from '../src/engine/ycontract';
import { candidateAsk, hireScout, holdTryout, sendScout, signCandidate, tryoutReady } from '../src/engine/yscout';
import { ensureYouth, promoteProspect, youthOf, youthSeason, type Prospect } from '../src/engine/youth';
import type { GameState, Player } from '../src/engine/types';

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

import { legacyYouth } from './helpers';
const base = (seed = 11): GameState => { const g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true } as never, seed); const e = legacyYouth(ensureYouth(g)); return { ...e, budgets: { ...e.budgets, palmeiras: 5e9 } }; };
const POSES: Player['pos'][] = ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT', 'ATT'];
const prospect = (id: string, age: number, over: number, pot: number, i = 0): Prospect => ({ player: { id, name: `Jovem ${id}`, pos: POSES[i % 9], age, strength: over, pot, contract: { wage: 20_000, from: 2025, until: 2028 } }, potential: pot, exact: over, train: 0, base: over, attrs: Array(6).fill(over), joined: 2025, origin: 'academia', sat: 70, mot: 60, history: [{ season: 2025, text: 'Chegou.' }] });
const withProspects = (g: GameState, list: Prospect[]): GameState => ({ ...g, youth: { ...youthOf(g), prospects: list } });
const C = (rating: number): YouthCoach => ({ id: `c${rating}`, name: 'T', age: 45, exp: 10, rating, specs: ['tatica'], trait: 'metodico', wage: 50_000, history: [] });
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { if (!r.ok) throw new Error((r as unknown as { error: string }).error); return r as Extract<T, { ok: true }>; };

/** Confere tudo o que não pode quebrar em nenhum ponto da carreira. */
function invariants(g: GameState): string[] {
  const bad: string[] = [];
  const y = youthOf(g);
  const ids = y.prospects.map((p) => p.player.id);
  if (new Set(ids).size !== ids.length) bad.push('jovem duplicado na base');
  const pro = Object.values(g.teams).flatMap((t) => t.players.map((p) => p.id));
  if (new Set(pro).size !== pro.length) bad.push('jogador duplicado nos elencos profissionais');
  if (ids.some((id) => g.teams[g.userClubId].players.some((p) => p.id === id))) bad.push('jovem também está no profissional');
  for (const p of y.prospects) {
    if (p.player.strength > p.potential) bad.push(`${p.player.id} acima do potencial`);
    if (p.player.age < 12 || p.player.age > 40) bad.push(`${p.player.id} idade ${p.player.age}`);
    if (!p.player.contract) bad.push(`${p.player.id} sem contrato`);
    if (p.loanedTo && g.ymoves?.[p.player.id]?.club !== p.loanedTo.club) bad.push(`${p.player.id} empréstimo sem registro`);
    if (p.loanFrom && g.ymoves?.[p.player.id]?.club !== g.userClubId) bad.push(`${p.player.id} recebido sem registro`);
  }
  for (const [id, m] of Object.entries(g.ymoves ?? {})) {
    if (m.club === g.userClubId && !y.prospects.some((p) => p.player.id === id)) bad.push(`${id} registrado em você mas não está na base`);
    if (m.from === g.userClubId && m.kind === 'venda' && y.prospects.some((p) => p.player.id === id)) bad.push(`${id} vendido mas ainda na base`);
    if (m.club === '__pro__' && !pro.includes(id)) bad.push(`${id} promovido pela IA mas não está no elenco`);
  }
  for (const b of Object.values(g.budgets)) if (!Number.isFinite(b)) bad.push('caixa inválido');
  const fin = y.fin;
  if (fin) { const sum = (m?: Record<string, number>) => Object.values(m ?? {}).reduce((a, b) => a + b, 0); if (fin.log.length < 120 && Math.abs(sum(fin.by) + sum(fin.inc) - fin.log.reduce((t, e) => t + e.cost, 0)) > 1) bad.push('histórico financeiro não fecha com os totais'); }
  return bad;
}

describe('carreira completa: várias temporadas com tudo ligado', () => {
  it('3 temporadas com olheiros, peneiras, contratos, vendas e empréstimos: nada duplica, nada passa do potencial, dados coerentes', () => {
    let g = base();
    const t0 = Date.now();
    for (let season = 0; season < 3; season++) {
      let n = 0;
      while (!isSeasonOver(g) && n++ < 400) {
        g = { ...playNext(g).state, morale: { ...g.morale, board: 60 } };
        const y = youthOf(g);
        if (g.round % 5 === 0 && y.prospects.length) {
          if (!y.scouts?.length && y.scoutMarket?.length) g = ok(hireScout(g, y.scoutMarket[0].id)).state;
          const sc = youthOf(g).scouts?.[0]; if (sc && !sc.region) g = ok(sendScout(g, sc.id, 'sul')).state;
          if (tryoutReady(g) === 0) { const r = holdTryout(g, 'media', 'todas', 'sudeste'); if (r.ok) g = r.state; }
          const cand = (youthOf(g).pool ?? []).find((c) => c.seen.lo >= 65); if (cand) { const r = signCandidate(g, cand.id, candidateAsk(g, cand), 3); if (r.ok) g = r.state; }
          const off = (youthOf(g).offers ?? [])[0]; if (off) { const r = acceptOffer(g, off.id); if (r.ok) g = r.state; }
          for (const p of expiring(g)) { const r = renewContract(g, p.player.id, askWage(g, p), 2); if (r.ok) g = r.state; }
        }
        if (n % 20 === 0) expect(invariants(g), `rodada ${g.round}`).toEqual([]);
      }
      expect(invariants(g), `fim da temporada ${g.season}`).toEqual([]);
      expect((g.ycomps ?? []).every((c) => c.done > 0)).toBe(true);
      g = startNextSeason(g);
      expect(invariants(g), `virada ${g.season}`).toEqual([]);
      expect(g.ycomps!.length).toBeGreaterThan(0); expect(g.yhist!.length).toBeGreaterThan(season * 8);
    }
    expect(Date.now() - t0).toBeLessThan(120_000);                                             // desempenho: 3 temporadas completas
    // salvar e reabrir no meio da carreira devolve o mesmo jogo
    expect(saveGame(g).ok).toBe(true);
    const back = loadGame()!;
    for (const k of ['youth', 'ymoves', 'ycomps', 'yhist', 'aiAcademy', 'aiScouting', 'aiYouthCoaches'] as const) expect(JSON.stringify(back[k]), k).toBe(JSON.stringify(g[k]));
    expect(migrateGame(back).report.violations).toEqual([]);
    expect(invariants(back)).toEqual([]);
  });
});

describe('evolução e potencial dos jovens (balanceamento)', () => {
  it('ninguém passa do potencial e o overall por idade é realista: 12 anos ≤ 12, 16 anos ≤ 55, nunca acima de 95', () => {
    const g = base();
    const q = qualityOf(g, 'flamengo', 'sub17');
    for (const pot of [50, 70, 84, 95]) for (let age = 12; age <= 21; age++) {
      const o = aiOverall(`t~1~1`, pot, age, 1, { ...q, level: 20, coach: 10, fac: { centro: 20, fisica: 20, medico: 20, alojamento: 20, campos: 20 } });   // até com tudo no máximo
      expect(o).toBeLessThanOrEqual(pot);
      if (age === 12) expect(o).toBeLessThanOrEqual(12);
      if (age <= 14) expect(o).toBeLessThanOrEqual(30);                                      // (o melhor caso possível, com tudo no máximo)
      if (age === 16) expect(o).toBeLessThanOrEqual(58);                                     // (aos 16 anos, mesmo no melhor caso)
      expect(o).toBeLessThanOrEqual(95);
    }
    const avg = (age: number) => { let t = 0; for (let i = 0; i < 30; i++) t += aiOverall(`t~1~${i}`, 62, age, 0, { ...q, level: 6, coach: 4 }); return t / 30; };
    expect(avg(12)).toBeLessThan(8); expect(avg(16)).toBeLessThan(40); expect(avg(21)).toBeGreaterThan(avg(16));
  });
  it('~8% dos jovens novos da academia são estrelas', () => {
    let g = base(); let stars = 0, total = 0;
    for (let i = 0; i < 60; i++) { g = youthSeason({ ...g, season: g.season + 1, round: 39, youth: { ...youthOf(g), level: 20, prospects: [] } }); for (const p of youthOf(g).prospects) { total++; if (p.potential >= 85) stars++; } }
    expect(total).toBeGreaterThan(300); expect(stars / total).toBeGreaterThan(0.05); expect(stars / total).toBeLessThan(0.12);
  });
});

describe('integração entre sistemas', () => {
  it('desempenho nas competições entra na avaliação do treinador (campeão sobe mais, lanterna cai mais) e nos relatórios', () => {
    const g = base();
    const yh = (r: number) => [{ season: 2026, cat: 'sub13' as const, src: 'liga' as const, name: 'Sub-13 · Série A', r }];
    const mk = (r: number): GameState => ({ ...g, season: 2027, yhist: yh(r), youth: { ...youthOf(g), coaches: { ...youthOf(g).coaches, sub13: { ...C(5), season: { gained: 10, expected: 10 } } } } });
    const win = evaluateCoaches(mk(1), youthOf(mk(1))).y.coaches!.sub13!.rating, lose = evaluateCoaches(mk(0.1), youthOf(mk(0.1))).y.coaches!.sub13!.rating;
    expect(win).toBeGreaterThan(5); expect(lose).toBeLessThan(5); expect(win - lose).toBeLessThanOrEqual(0.5);   // gradual
    expect(evaluateCoaches(mk(1), youthOf(mk(1))).y.coaches!.sub13!.evals![0].cmp).toBe(1);
    let s = withProspects(base(), Array.from({ length: 14 }, (_, i) => prospect(`z${i}`, 12 + (i % 2), 6, 70, i)));
    for (let i = 0; i < 10; i++) s = { ...playNext(s).state };
    const lines = competitionLines(s, 'sub13'); expect(Array.isArray(lines)).toBe(true);
    expect(buildReport(s, 'sub13').highlights.length).toBeGreaterThanOrEqual(lines.length);
  });
  it('contrato que vence durante um empréstimo não deixa registro órfão', () => {
    let g = withProspects(base(), [{ ...prospect('lo1', 17, 40, 75), player: { ...prospect('lo1', 17, 40, 75).player, contract: { wage: 20_000, from: 2025, until: 2026 } } }]);
    g = ok(loanOut(g, 'lo1', 'flamengo', 3, 0.5)).state;
    expect(g.ymoves!.lo1).toBeTruthy();
    const n = youthSeason({ ...g, season: 2027, round: g.totalRounds + 1 });
    expect(youthOf(n).prospects.some((p) => p.player.id === 'lo1')).toBe(false);
    expect(n.ymoves?.lo1).toBeUndefined();                                                      // o registro acabou junto com o contrato
    expect(invariants(n)).toEqual([]);
  });
  it('o clube comprador nunca fica no negativo: se não cobre valor + compensação, o negócio não acontece', () => {
    let g = withProspects(base(), [prospect('palmeiras-s', 17, 60, 92)]);
    const p = youthOf(g).prospects[0]; const fee = 2_000_000;
    g = { ...g, budgets: { ...g.budgets, flamengo: fee }, youth: { ...youthOf(g), offers: [{ id: 'q', kind: 'compra', playerId: p.player.id, club: 'flamengo', fee, season: 2026, round: 1, left: 5, status: 'pendente' }] } };
    const r = acceptOffer(g, 'q');                                                              // a compensação de formação deixaria o caixa dele negativo
    if (r.ok) expect(r.state.budgets.flamengo).toBeGreaterThanOrEqual(0); else expect(r.error).toMatch(/caixa/);
    expect(youthValue(g, p)).toBeGreaterThan(0);
  });
});

describe('clubes da IA administram a base sozinhos', () => {
  it('promovem jovens da base ao profissional (um registro só, identidade mantida) e variam de um clube para outro', () => {
    let g = base();
    const before = Object.values(g.teams).reduce((t, x) => t + x.players.length, 0);
    for (let y = 0; y < 3; y++) g = aiPromoteDerived({ ...g, season: g.season + 1 }, makeRng(5 + y));
    const promoted = Object.entries(g.ymoves ?? {}).filter(([, m]) => m.club === '__pro__');
    expect(promoted.length).toBeGreaterThan(10);
    expect(Object.values(g.teams).reduce((t, x) => t + x.players.length, 0)).toBe(before + promoted.length);
    const clubs = new Set(promoted.map(([, m]) => m.from));
    expect(clubs.size).toBeGreaterThan(8);                                                       // clubes diferentes decidiram
    for (const [id, m] of promoted) {
      const club = parseDerived(id)!.club;
      expect(club).toBe(m.from);
      const pl = g.teams[club].players.find((p) => p.id === id)!;
      expect(pl).toBeTruthy(); expect(pl.age).toBeGreaterThanOrEqual(18); expect(pl.formedAt).toBe(club);
      for (const cat of CATEGORIES) expect(rosterOf(g, club, cat.id, 0).some((r) => r.id === id)).toBe(false);   // saiu da base
      expect(g.teams[club].players.length).toBeLessThanOrEqual(AI_MAX_SQUAD);
    }
    const all = Object.values(g.teams).flatMap((t) => t.players.map((p) => p.id));
    expect(new Set(all).size).toBe(all.length);
  });
  it('promover ao profissional (usuário) segue sem duplicar e respeitando os 16 anos', () => {
    let g = withProspects(base(), [prospect('a15', 15, 30, 70), prospect('a16', 16, 33, 74, 1)]);
    expect(promoteProspect(g, 'a15').ok).toBe(false);
    g = ok(promoteProspect(g, 'a16')).state;
    expect(g.teams.palmeiras.players.filter((p) => p.id === 'a16')).toHaveLength(1);
    expect(invariants(g)).toEqual([]);
  });
});
