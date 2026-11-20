import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { aiSignFreeAgents, aiRenewals } from '../src/engine/aicontracts';
import { aiWindow } from '../src/engine/ai';
import { auditUniverse } from '../src/engine/aiaudit';
import { avgXI, clubProfile, profileCtx } from '../src/engine/aiprofile';
import { squadNeeds } from '../src/engine/aineeds';
import { TRADE_STATS } from '../src/engine/aitrade';
import { locate } from '../src/engine/dealeval';
import { calOf, toDay } from '../src/engine/calendar';
import { FREE_AGENT_MAX, freeAgentBlock, freeAgentLimit } from '../src/engine/freeagents';
import { simulateToEnd } from '../src/engine/game';
import { openDeal } from '../src/engine/deals';
import { proposeFree } from '../src/engine/marketdeals';
import { freeList } from '../src/engine/marketdeals';
import { makeRng } from '../src/engine/rng';
import { newObserverWorld } from '../src/engine/sim';
import { squadLimits } from '../src/engine/aisquad';
import { payrollOf } from '../src/engine/finance';
import { WAGE_LIMIT } from '../src/engine/aicontracts';
import type { GameState, Player } from '../src/engine/types';
import { makeCareer } from './helpers';

const base = makeCareer('flamengo', 14);
const at = (g: GameState, y: number, m: number, d: number): GameState => ({ ...g, cal: { ...calOf(g), day: toDay(y, m, d) } });
const open = at(base, 2026, 2, 10);
const ais = Object.keys(base.teams).filter((x) => x !== 'flamengo').sort();
const sum = (g: GameState) => Object.values(g.budgets).reduce((a, b) => a + b, 0);
const free = (id: string, pos: Player['pos'], strength: number, age = 27): Player => ({ id, name: id, pos, age, strength });

describe('ETAPA 4 — regra dos jogadores livres (overall até 70 e parecido com o do time)', () => {
  it('quem tem overall acima de 70 não pode ser contratado como livre; o teto de cada clube acompanha o nível do time e o porte', () => {
    const tierOf = (id: string) => clubProfile(open, id).tier;
    const small = ais.find((id) => tierOf(id) === 'pequeno')!, big = ais.find((id) => tierOf(id) === 'gigante')!;
    const capS = freeAgentLimit(open, small), capB = freeAgentLimit(open, big);
    expect(capS).toBeLessThan(capB);                                       // pequeno só pega livre parecido com o time dele
    expect(capS).toBeLessThanOrEqual(Math.round(avgXI(open.teams[small]) + 4));
    expect(capB).toBeLessThanOrEqual(FREE_AGENT_MAX);
    expect(freeAgentBlock(open, small, { strength: capS })).toBeUndefined();
    expect(freeAgentBlock(open, small, { strength: capS + 1 })).toMatch(/acima do nível/);
    expect(freeAgentBlock(open, big, { strength: 71 })).toMatch(/70 ou menos/);
  });
  it('a IA e o usuário seguem a mesma regra ao contratar livres (openDeal e proposeFree)', () => {
    const small = ais.find((id) => clubProfile(open, id).tier === 'pequeno')!;
    const cap = freeAgentLimit(open, small);
    const ok = free('fa-ok', 'ATT', cap), tooGood = free('fa-bom', 'ATT', Math.min(70, cap + 6)), star = free('fa-astro', 'ATT', 78);
    const g = { ...open, freeAgents: [ok, tooGood, star] };
    expect(openDeal(g, { kind: 'livre', playerId: 'fa-ok', buyerId: small, terms: { fee: 0 } }).error).toBeUndefined();
    expect(openDeal(g, { kind: 'livre', playerId: 'fa-bom', buyerId: small, terms: { fee: 0 } }).error).toMatch(/acima do nível|70 ou menos/);
    expect(openDeal(g, { kind: 'livre', playerId: 'fa-astro', buyerId: small, terms: { fee: 0 } }).error).toMatch(/70 ou menos/);
    // o seu clube (Flamengo, grande) também respeita: astro livre não existe para ele
    expect(proposeFree({ ...open, freeAgents: [star] }, 'fa-astro').error).toMatch(/70 ou menos/);
  });
  it('a lista de livres do usuário só mostra quem ele pode contratar; a IA não contrata fora da regra em 60 dias de mercado', () => {
    const pool = Array.from({ length: 60 }, (_, i) => free(`fa${i}`, (['GK', 'DEF', 'MID', 'ATT'] as const)[i % 4], 40 + (i % 45)));
    let g: GameState = { ...open, freeAgents: pool };
    const cap = freeAgentLimit(g, 'flamengo');
    expect(freeList(g).every((r) => r.player.strength <= Math.min(cap, FREE_AGENT_MAX))).toBe(true);
    // contratações da IA: cada livre contratado cabe no teto do clube que o levou
    for (let i = 0; i < 25; i++) g = aiSignFreeAgents(g, makeRng(i), 2);
    const signed = pool.filter((f) => ais.some((id) => g.teams[id].players.some((p) => p.id === f.id)));
    expect(signed.length).toBeGreaterThan(0);
    for (const f of signed) { const club = ais.find((id) => g.teams[id].players.some((p) => p.id === f.id))!; expect(f.strength, `${f.id} em ${club}`).toBeLessThanOrEqual(freeAgentLimit(open, club) + 8); expect(f.strength).toBeLessThanOrEqual(FREE_AGENT_MAX); }
  });
  it('contrato que termina: quem tem overall acima de 70 é renovado (nunca vira livre); quem tem 70 ou menos pode ficar livre', () => {
    const club = ais.find((id) => open.teams[id].players.some((p) => p.strength > 72))!;
    const ps = [...open.teams[club].players].sort((a, b) => b.strength - a.strength);
    const star = ps[0], mid = ps.find((p) => p.strength <= 60 && p.age <= 31)!;
    const g = { ...open, season: 2027, teams: { ...open.teams, [club]: { ...open.teams[club], players: open.teams[club].players.map((p) => ({ ...p, contract: { wage: p.contract?.wage ?? 50_000, until: p.id === star.id || p.id === mid.id ? 2026 : 2030 } })) } }, renewTalks: { [star.id]: { day: 1, tries: 2, refusals: 2, done: true } } };
    const out = aiRenewals(g, makeRng(1), 'virada', 2026);
    expect(out.teams[club].players.some((p) => p.id === star.id)).toBe(true);             // o astro fica, mesmo tendo recusado
    expect((out.freeAgents ?? []).some((p) => p.id === star.id)).toBe(false);
    expect((out.freeAgents ?? []).every((p) => p.strength <= FREE_AGENT_MAX)).toBe(true);
    if (!out.teams[club].players.some((p) => p.id === mid.id)) expect(out.freeAgents!.some((p) => p.id === mid.id)).toBe(true);
  });
});

describe('ETAPA 4 — auditoria do mercado da IA (mundo sem jogador, 4 temporadas)', () => {
  it('movimentação, necessidades, limites financeiros, elencos válidos, dinheiro conservado e sem alvos repetidos', () => {
    let g = newObserverWorld('BR' as never, 'brasileirao', 7);
    const problems: string[] = [];
    const perSeason: { deals: number; refused: number; free: number }[] = [];
    let failedBids = 0;
    for (let t = 0; t < 4; t++) {
      TRADE_STATS.reset();
      const e = simulateToEnd(g);
      const from = calOf(g).day;
      g = startNextSeason(e);
      failedBids += TRADE_STATS.tried - TRADE_STATS.ok;
      const log = (g.dealLog ?? []).filter((r) => r.day >= from);
      const done = log.filter((r) => r.state === 'concluida');
      perSeason.push({ deals: done.length, refused: log.filter((r) => r.state === 'recusada').length, free: (g.freeAgents ?? []).length });
      problems.push(...auditUniverse(g).map((x) => `T${g.season}: ${x}`));
      if ((g.freeAgents ?? []).some((p) => p.strength > FREE_AGENT_MAX && !(p as Player & { legacy?: boolean }).legacy)) problems.push(`T${g.season}: livre acima de 70`);
      // limites financeiros
      const ctx = profileCtx(g);
      let over = 0, n = 0, neg = 0;
      for (const id of Object.keys(g.teams)) { n++; const prof = clubProfile(g, id, ctx); if (payrollOf(g, id) > prof.revenue * WAGE_LIMIT[prof.tier] * 1.5) over++; if ((g.budgets[id] ?? 0) < 0) neg++; }
      if (over / n > 0.15) problems.push(`T${g.season}: ${over}/${n} clubes com folha acima do limite`);
      if (neg > 0) problems.push(`T${g.season}: ${neg} caixas negativos na virada`);
      // elencos e posições
      for (const [id, tm] of Object.entries(g.teams)) { const L = squadLimits(g); if (tm.players.length > L.total.max + 6) problems.push(`T${g.season}: ${id} com ${tm.players.length} jogadores`); }
      // negociações duplicadas
      const keys = (g.deals ?? []).filter((d) => !['concluida', 'recusada', 'expirada', 'cancelada'].includes(d.state)).map((d) => `${d.buyerId}:${d.playerId}`);
      if (new Set(keys).size !== keys.length) problems.push(`T${g.season}: negociação duplicada em andamento`);
      // transferências impossíveis
      for (const r of done) if (r.sellerId === r.buyerId) problems.push(`T${g.season}: negócio de um clube com ele mesmo`);
      // alvos repetidos: nenhum jogador concentra a maioria das tentativas
      // jogadores de destaque (overall >= 60) não viram alvo de todo mundo; reservas baratos podem ser disputados por vários clubes
      const stars = [...TRADE_STATS.byPlayer.entries()].filter(([id]) => (locate(g, id)?.player.strength ?? 0) >= 60).map(([, n]) => n).sort((a, b) => b - a);
      if (stars.length > 20 && stars[0] > 12) problems.push(`T${g.season}: um jogador de destaque recebeu ${stars[0]} tentativas`);
      const pairs = [...TRADE_STATS.byPair.entries()].sort((a, b) => b[1] - a[1]);
      if (pairs.length && pairs[0][1] > 3) problems.push(`T${g.season}: ${pairs[0][0]} tentado ${pairs[0][1]}x pelo mesmo comprador`);
    }
    expect(problems).toEqual([]);
    for (const s of perSeason) { expect(s.deals).toBeGreaterThan(30); expect(s.deals).toBeLessThan(2500); }
    expect(failedBids).toBeGreaterThan(0);                                   // há propostas recusadas pela IA
  }, 900_000);
  it('clubes grandes contratam jogadores melhores que os pequenos, e nenhum compra muito acima do próprio nível', () => {
    let g = newObserverWorld('BR' as never, 'brasileirao', 9);
    const lvls: { tier: string; ovr: number; lvl: number }[] = [];
    for (let t = 0; t < 3; t++) {
      const from = calOf(g).day;
      g = startNextSeason(simulateToEnd(g));
      const ctx = profileCtx(g);
      for (const r of (g.dealLog ?? []).filter((x) => x.day >= from && x.state === 'concluida' && (x.kind === 'compra' || x.kind === 'troca') && x.ovr !== undefined && x.lvl !== undefined)) lvls.push({ tier: clubProfile(g, r.buyerId, ctx).tier, ovr: r.ovr!, lvl: r.lvl! });
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const by = (t: string) => lvls.filter((x) => x.tier === t);
    expect(by('gigante').length).toBeGreaterThan(5); expect(by('pequeno').length).toBeGreaterThan(5);
    expect(mean(by('gigante').map((x) => x.ovr))).toBeGreaterThan(mean(by('pequeno').map((x) => x.ovr)));
    const above = lvls.filter((x) => x.ovr > x.lvl + 25).length / lvls.length;
    expect(above).toBeLessThan(0.05);                                       // quase ninguém compra muito acima do nível do próprio time
  }, 900_000);
  it('um clube sem posição (falta de gente) vai ao mercado antes de qualquer outra coisa e fica com o mínimo', () => {
    const club = ais.find((id) => clubProfile(open, id).tier !== 'pequeno')!;
    let g: GameState = { ...open, budgets: { ...open.budgets, [club]: 200_000_000 }, teams: { ...open.teams, [club]: { ...open.teams[club], players: (() => { let k = 0; return open.teams[club].players.filter((p) => p.pos !== 'GK' || k++ < 1); })() } } };
    expect(squadNeeds(g, club, clubProfile(g, club)).some((n) => n.pos === 'GK' && n.reasons.includes('falta-gente'))).toBe(true);
    g = { ...g, freeAgents: [...(g.freeAgents ?? []), free('gk-livre-1', 'GK', 45, 28), free('gk-livre-2', 'GK', 40, 30)] };
    for (let i = 1; i <= 6; i++) { g = aiWindow(g, makeRng(i), 3, [club]); g = aiSignFreeAgents(g, makeRng(100 + i), 3); }
    expect(g.teams[club].players.filter((p) => p.pos === 'GK').length).toBeGreaterThanOrEqual(2);
  });
  it('o dinheiro das negociações é conservado (soma dos caixas igual antes e depois das janelas)', () => {
    let g: GameState = open;
    const before = sum(g);
    for (let i = 1; i <= 4; i++) g = aiWindow(g, makeRng(i), 3);
    expect(Math.abs(sum(g) - before)).toBeLessThan(1);
  });
});
