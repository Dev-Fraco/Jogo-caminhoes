import { startNextSeason, skipSeasons } from '../src/premium/season';
import { startNextSeason, skipSeasons } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { aiLoanOut, aiPromoteYouth, ensureAiYouth } from '../src/engine/aiyouth';
import { auditUniverse } from '../src/engine/aiaudit';
import { ensureAiState } from '../src/engine/aistate';
import { calOf, toDay } from '../src/engine/calendar';
import { aiRenewTick, applyContract, contractAlerts, renewalAnswer, renewOffer } from '../src/engine/contractwatch';
import { executeDeal, openDeal } from '../src/engine/deals';
import { locate } from '../src/engine/dealeval';
import { loanOwed, payMonthlySalaries, payrollOf } from '../src/engine/finance';
import { simulateToEnd } from '../src/engine/game';
import { endLoans, exerciseBuyOption, loanReport } from '../src/engine/loandeals';
import { aiRenewals } from '../src/engine/aicontracts';
import { devRateOf, ensurePotentials, growYoung, impliedPot, potentialOf, rollPotential, startStrength, tierOf } from '../src/engine/potential';
import { dealsTick } from '../src/engine/deals';
import { makeRng } from '../src/engine/rng';
import { dayTickForTest } from './helpers_daily';
import type { Deal, GameState, Player } from '../src/engine/types';
import { makeCareer } from './helpers';

const base = ensureAiState(makeCareer('flamengo', 14));
const at = (g: GameState, y: number, m: number, d: number): GameState => ({ ...g, cal: { ...calOf(g), day: toDay(y, m, d) } });
const open = at(base, 2026, 2, 10);
const ais = Object.keys(base.teams).filter((x) => x !== 'flamengo' && x !== 'palmeiras').sort();
const where = (g: GameState, pid: string) => Object.keys(g.teams).filter((id) => g.teams[id].players.some((p) => p.id === pid));
const approve = (g: GameState, id: string): GameState => ({ ...g, deals: g.deals!.map((d) => (d.id === id ? { ...d, state: 'aceita-jogador' as const, clubOk: true, playerOk: true } : d)) });
const reserveOf = (g: GameState, id: string) => [...g.teams[id].players].sort((a, b) => a.strength - b.strength)[3];
const pair = () => ({ seller: ais[10], buyer: ais[11], p: reserveOf(base, ais[10]) });
const rich = (g: GameState, ...ids: string[]): GameState => ({ ...g, budgets: { ...g.budgets, ...Object.fromEntries(ids.map((i) => [i, 200_000_000])) } });
const loanTerms = (over: object = {}) => ({ untilDay: toDay(2026, 12, 31), originWagePct: 0.3, fee: 100_000, ...over });
/** Empréstimo AI×AI concluído na hora. */
const lend = (g: GameState, pid: string, buyer: string, loan: object = loanTerms(), fee = 100_000) => {
  const o = openDeal(g, { kind: 'emprestimo', playerId: pid, buyerId: buyer, terms: { fee, loan: loanTerms(loan) as never }, reason: 'teste' });
  expect(o.error).toBeUndefined();
  const r = executeDeal(approve(o.state, o.deal!.id), o.deal!.id);
  expect(r.ok, r.reason).toBe(true);
  return r.state;
};
const sum = (g: GameState) => Object.values(g.budgets).reduce((a, b) => a + b, 0);

describe('MÓDULO 1 — Empréstimos', () => {
  it('Teste 1 — empréstimo simples: o jogador volta sozinho ao clube de origem, com o contrato original, uma única vez', () => {
    const { seller, buyer, p } = pair();
    const g0 = rich(open, buyer);
    const wage0 = locate(g0, p.id)!.player.contract!.wage;
    const s = lend(g0, p.id, buyer);
    expect(where(s, p.id)).toEqual([buyer]);
    expect(s.loanDeals![0]).toMatchObject({ originId: seller, hostId: buyer, fromDay: calOf(g0).day, untilDay: toDay(2026, 12, 31), startStrength: p.strength });
    expect(endLoans(at(s, 2026, 12, 31)).loanDeals![0].closed).toBeUndefined(); // ainda vale no último dia
    expect(where(endLoans(at(s, 2026, 12, 31)), p.id)).toEqual([buyer]);
    const back = endLoans(at(s, 2027, 1, 1));
    expect(where(back, p.id)).toEqual([seller]);
    expect(locate(back, p.id)!.player.contract!.wage).toBe(wage0);
    expect(back.loanDeals![0].closed).toBe(true);
    expect(back.aiLoans).toEqual([]);
    expect(back.loanLog![0]).toMatchObject({ playerId: p.id, originId: seller, hostId: buyer, outcome: 'devolvido' });
    expect(endLoans(back)).toBe(back);                                   // não reprocessa o que já terminou
    expect(auditUniverse(back)).toEqual([]);
  });
  it('Teste 2 — opção de compra: tem valor e prazo registrados, você a exerce e a compra vira definitiva', () => {
    const seller = ais[14], p = reserveOf(base, seller);
    const g0 = rich(open, 'flamengo');
    const bad = openDeal(g0, { kind: 'emprestimo', playerId: p.id, buyerId: 'flamengo', terms: { fee: 0, loan: loanTerms({ buyOption: 0 }) as never } });
    expect(bad.error).toMatch(/valor definido/);
    expect(openDeal(g0, { kind: 'emprestimo', playerId: p.id, buyerId: 'flamengo', terms: { fee: 0, loan: loanTerms({ untilDay: toDay(2026, 1, 1) }) as never } }).error).toMatch(/data de encerramento/);
    const s = lend(g0, p.id, 'flamengo', { buyOption: 2_000_000, originWagePct: 0 }, 0);
    expect(s.loansIn?.some((l) => l.playerId === p.id)).toBe(true);
    const r = exerciseBuyOption(s, p.id);
    expect(r.ok).toBe(true);
    expect(r.state.budgets.flamengo).toBe(s.budgets.flamengo - 2_000_000);
    expect(r.state.budgets[seller]).toBe(s.budgets[seller] + 2_000_000);
    expect(where(r.state, p.id)).toEqual(['flamengo']);
    expect(r.state.loansIn?.length ?? 0).toBe(0);
    expect(r.state.loanLog![0].outcome).toBe('comprado-opcao');
    expect(exerciseBuyOption(r.state, p.id).ok).toBe(false);            // não paga duas vezes
  });
  it('Teste 3 — obrigação de compra: ativada pelas partidas combinadas, a compra definitiva é processada uma única vez', () => {
    const { seller, buyer, p } = pair();
    const g0 = rich(open, buyer);
    const s0 = lend(g0, p.id, buyer, { buyObligation: 2_500_000, obligationGames: 3, originWagePct: 0 });
    const notYet = endLoans(at({ ...s0, loanDeals: s0.loanDeals!.map((l) => ({ ...l, apps: 2 })) }, 2027, 1, 1));
    expect(where(notYet, p.id)).toEqual([seller]);                       // condição não cumprida: volta
    const met = endLoans(at({ ...s0, loanDeals: s0.loanDeals!.map((l) => ({ ...l, apps: 3 })) }, 2027, 1, 1));
    expect(where(met, p.id)).toEqual([buyer]);                           // condição cumprida: compra obrigatória
    expect(met.loanLog![0].outcome).toBe('comprado-obrigacao');
    expect(met.budgets[seller]).toBe(s0.budgets[seller] + 2_500_000); expect(met.budgets[buyer]).toBe(s0.budgets[buyer] - 2_500_000);
    expect(locate(met, p.id)!.player.contract!.until).toBeGreaterThanOrEqual(2027);
    expect(endLoans(met)).toBe(met);
    expect(openDeal(g0, { kind: 'emprestimo', playerId: p.id, buyerId: buyer, terms: { fee: 0, loan: loanTerms({ buyObligation: 1_000_000 }) as never } }).error).toMatch(/obrigação/);
  });
  it('Teste 4 — divisão salarial: cada clube paga exatamente a sua parte, sem desconto duplo (30% / 70%)', () => {
    const { seller, buyer, p } = pair();
    const g0 = rich(open, buyer);
    const W = 240_000;
    const g1 = { ...g0, teams: { ...g0.teams, [seller]: { ...g0.teams[seller], players: g0.teams[seller].players.map((x) => (x.id === p.id ? { ...x, contract: { wage: W, until: 2029 } } : x)) } } };
    const s = lend(g1, p.id, buyer, { originWagePct: 0.3 });
    expect(payrollOf(s, seller)).toBe(payrollOf(g1, seller) - W + W * 0.3);   // origem fica com 30%
    expect(payrollOf(s, buyer)).toBe(payrollOf(g1, buyer) + W * 0.7);         // destino paga 70%
    expect(loanOwed(s, seller)).toBe(W * 0.3);
    // salário mensal de R$ 20.000: 6.000 da origem e 14.000 do destino
    const pay0 = payMonthlySalaries(g1), pay1 = payMonthlySalaries(s);
    const monthly = (gg: GameState, base2: GameState, id: string) => base2.budgets[id] - gg.budgets[id];
    expect(monthly(pay0, g1, seller) - monthly(pay1, s, seller)).toBe(W * 0.7 / 12);   // origem paga menos 70% do salário do jogador
    expect(monthly(pay1, s, buyer) - monthly(pay0, g1, buyer)).toBe(W * 0.7 / 12);     // destino paga 70%
    // soma dos dois clubes não muda: o salário total do jogador é pago uma única vez
    expect((monthly(pay1, s, seller) + monthly(pay1, s, buyer)) - (monthly(pay0, g1, seller) + monthly(pay0, g1, buyer))).toBe(0 + (s.budgets[seller] - g1.budgets[seller]) * 0 + 0);
  });
  it('Teste 5 — encerramento pelo calendário: avançar os dias até a data devolve o jogador e atualiza os dois elencos', () => {
    const { seller, buyer, p } = pair();
    const s = lend(rich(open, buyer), p.id, buyer, { untilDay: toDay(2026, 2, 20) });
    expect(s.teams[buyer].players.length).toBe(rich(open, buyer).teams[buyer].players.length + 1);
    let g = s;
    for (let d = 0; d < 14; d++) g = dayTickForTest({ ...g, cal: { ...calOf(g), day: calOf(g).day + 1 } });
    expect(where(g, p.id)).toEqual([seller]);
    expect(g.teams[buyer].players.some((x) => x.id === p.id)).toBe(false);
    expect(g.teams[seller].players.some((x) => x.id === p.id)).toBe(true);
    expect(g.loanLog?.length).toBe(1);
  });
  it('acompanhamento: jogos, evolução do overall e situação; empréstimo ativo não é interrompido nem vendido', () => {
    const { buyer, p } = pair();
    const s = lend(rich(open, buyer), p.id, buyer);
    const rep = loanReport({ ...s, loanDeals: s.loanDeals!.map((l) => ({ ...l, apps: 12 })) }, { ...s.loanDeals![0], apps: 12 });
    expect(rep).toMatchObject({ apps: 12, evolution: 0, positive: true, status: 'titular' });
    expect(openDeal(s, { kind: 'compra', playerId: p.id, buyerId: ais[20], terms: { fee: 1_000_000 } }).error).toMatch(/emprestado/);
    // 3 meses depois, sem a data chegar: continua emprestado
    expect(where(endLoans(at(s, 2026, 8, 1)), p.id)).toEqual([buyer]);
  });
  it('a IA cede jovens sem espaço com justificativa esportiva (e o jogador vai jogar)', () => {
    // cria um jovem de potencial alto atrás de vários na posição, num clube grande
    const origin = [...base.divisions[0].clubIds].filter((x) => x !== 'flamengo')[2];
    const t = base.teams[origin];
    const young: Player = { id: 'jov-c1', name: 'Jovem Talento', pos: 'ATT', age: 19, strength: 60, pot: 85, formedAt: origin, contract: { wage: 50_000, until: 2029 } };
    const strongAtt = Array.from({ length: 4 }, (_, i): Player => ({ id: `ata-c${i}`, name: `Atacante ${i}`, pos: 'ATT', age: 28, strength: 80 + i, contract: { wage: 100_000, until: 2029 } }));
    const g0 = { ...open, teams: { ...open.teams, [origin]: { ...t, players: [...t.players.filter((p) => p.pos !== 'ATT'), ...t.players.filter((p) => p.pos === 'ATT').slice(0, 2).map((p) => ({ ...p, strength: 70 })), ...strongAtt, young] } } };
    // clubes de divisões inferiores precisando de atacante
    let g = g0;
    for (const id of ais.slice(60, 100).filter((x) => x !== origin)) g = { ...g, teams: { ...g.teams, [id]: { ...g.teams[id], players: g.teams[id].players.filter((p, i, a) => p.pos !== 'ATT' || a.filter((x) => x.pos === 'ATT').indexOf(p) < 2) } } };
    let made: GameState | null = null;
    for (let seed = 1; seed <= 6 && !made; seed++) { const r = aiLoanOut(g, makeRng(seed), [origin]); if (r.loanDeals?.some((l) => l.playerId === young.id)) made = r; }
    expect(made).not.toBeNull();
    const ld = made!.loanDeals!.find((l) => l.playerId === young.id)!;
    expect(ld.reason).toMatch(/cedido: sem espaço/);
    expect(ld.reason).toMatch(/potencial 85/);
    expect(where(made!, young.id)).toEqual([ld.hostId]);
    expect(auditUniverse(made!).filter((x) => !x.startsWith('elenco inválido') && !x.startsWith('escalação'))).toEqual([]); // (os clubes sem atacantes são da montagem do teste)
  });
});

describe('MÓDULO 2 — Base e jovens', () => {
  it('Teste 6 — desenvolvimento: evolução gradual limitada pelo potencial, com estagnados e raros craques', () => {
    // um garoto de 16 anos, overall 55, potencial 90 (talento excepcional)
    let p: Player = { id: 'star-1', name: 'Craque', pos: 'MID', age: 16, strength: 55, pot: 90 };
    const rng = makeRng(5);
    const path: number[] = [p.strength];
    for (let i = 0; i < 9; i++) { p = growYoung(p, rng, 20, 0.7); path.push(p.strength); }
    expect(Math.max(...path)).toBeLessThanOrEqual(90);
    for (let i = 1; i < path.length; i++) { expect(path[i]).toBeGreaterThanOrEqual(path[i - 1]); expect(path[i] - path[i - 1]).toBeLessThan(12); } // gradual
    expect(path[1]).toBeLessThan(70);                                      // não explode em um ano
    expect(path[7]).toBeGreaterThanOrEqual(80);                            // mas chega a craque com os anos
    // distribuição de ritmos: alguns estagnam, a maioria evolui no esperado
    const rates = Array.from({ length: 2000 }, (_, i) => devRateOf(`p${i}`));
    const slow = rates.filter((r) => r < 0.6).length / rates.length;
    expect(slow).toBeGreaterThan(0.05); expect(slow).toBeLessThan(0.2);
    // estagnado: termina bem abaixo do potencial
    const stuckId = Array.from({ length: 500 }, (_, i) => `s${i}`).find((id) => devRateOf(id) < 0.45)!;
    let q: Player = { id: stuckId, name: 'Estagnado', pos: 'DEF', age: 17, strength: 50, pot: 85 };
    for (let i = 0; i < 8; i++) q = growYoung(q, rng, 20, 0.5);
    expect(q.strength).toBeLessThan(80);
    // quem joga evolui mais que quem não joga
    const a = growYoung({ id: 'x1', name: 'a', pos: 'ATT', age: 19, strength: 60, pot: 85 }, makeRng(1), 30, 0.5), b = growYoung({ id: 'x1', name: 'a', pos: 'ATT', age: 19, strength: 60, pot: 85 }, makeRng(1), 0, 0.5);
    expect(a.strength).toBeGreaterThanOrEqual(b.strength);
  });
  it('níveis de talento: excepcionais são raríssimos, grandes promessas raras, a maioria comum; clubes pequenos também revelam', () => {
    const rng = makeRng(9);
    const count = (infra: number) => { const c = { comum: 0, interessante: 0, grande: 0, excepcional: 0 }; for (let i = 0; i < 20000; i++) c[rollPotential(rng, infra, 60).tier]++; return c; };
    const big = count(1), small = count(0.2);
    expect(big.excepcional / 20000).toBeLessThan(0.01); expect(big.excepcional).toBeGreaterThan(0);
    expect(small.excepcional + small.grande).toBeGreaterThan(0);          // pequenos também revelam
    expect(big.grande).toBeGreaterThan(small.grande);                      // estrutura ajuda
    expect(big.comum / 20000).toBeGreaterThan(0.5);
    expect(tierOf(90)).toBe('excepcional'); expect(startStrength(95, 16, makeRng(1))).toBeLessThanOrEqual(70);
    for (let i = 0; i < 500; i++) { const { pot } = rollPotential(rng, 0.5, 60); expect(pot).toBeLessThanOrEqual(95); }
  });
  it('Teste 7 — promoção: o promovido entra no elenco profissional com potencial, formador e contrato; nem todos sobem', () => {
    const club = ais[0];
    let g = ensureAiYouth(base, makeRng(1));
    g = { ...g, teams: { ...g.teams, [club]: { ...g.teams[club], players: (() => { let k = 0; return g.teams[club].players.filter((p) => p.pos !== 'ATT' || k++ < 2); })() } } };
    g = { ...g, aiYouth: { ...g.aiYouth!, [club]: [{ id: 'pr-c7', name: 'Base Sete', pos: 'ATT', age: 18, strength: 58, pot: 80, spot: 'CA', formedAt: club, formedSeason: 2026, nat: 'BR' }, { id: 'pr-c8', name: 'Base Oito', pos: 'GK', age: 17, strength: 40, pot: 60, formedAt: club, formedSeason: 2026 }] } };
    const out = aiPromoteYouth(g, makeRng(1));
    const got = out.teams[club].players.find((p) => p.id === 'pr-c7')!;
    expect(got).toMatchObject({ pot: 80, formedAt: club, formedSeason: 2026, nat: 'BR' });
    expect(got.contract).toBeTruthy();
    expect(out.aiYouth![club].some((p) => p.id === 'pr-c8')).toBe(true);   // o outro continua na base
    expect(auditUniverse(out)).toEqual([]);
  });
  it('Teste 8 — formação: o clube formador permanece depois de vendas e empréstimos', () => {
    const { seller, buyer, p } = pair();
    const formed: Player = { ...p, formedAt: 'club-formador', formedSeason: 2024, pot: 80 };
    let g = { ...rich(open, buyer, ais[20]), teams: { ...open.teams, [seller]: { ...open.teams[seller], players: open.teams[seller].players.map((x) => (x.id === p.id ? formed : x)) } } } as GameState;
    const o = openDeal(g, { kind: 'compra', playerId: p.id, buyerId: buyer, terms: { fee: 1_000_000 } });
    g = executeDeal(approve(o.state, o.deal!.id), o.deal!.id).state;
    expect(locate(g, p.id)!.player.formedAt).toBe('club-formador');
    g = lend(g, p.id, ais[20]);
    expect(locate(g, p.id)!.player).toMatchObject({ formedAt: 'club-formador', formedSeason: 2024, pot: 80 });
    g = endLoans(at(g, 2027, 1, 1));
    expect(locate(g, p.id)!.player.formedAt).toBe('club-formador');
  });
  it('promessa valiosa vale mais e nem sempre é vendida (clube quer desenvolver)', async () => {
    const { marketValue, stance } = await import('../src/engine/aisales');
    const club = ais[40];
    const t = base.teams[club];
    const young: Player = { id: 'jov-v', name: 'Jovem V', pos: 'MID', age: 18, strength: 55, pot: 90, contract: { wage: 20_000, until: 2029 } };
    const same: Player = { ...young, id: 'jov-w', pot: 55 };
    const g = { ...open, teams: { ...open.teams, [club]: { ...t, players: [...t.players, young, same] } } };
    expect(marketValue(g, club, young)).toBeGreaterThan(marketValue(g, club, same) * 1.3);
    let refused = 0;
    for (let i = 0; i < 40; i++) { const gi = { ...g, season: 2026 + i, teams: { ...g.teams, [club]: { ...t, players: [...t.players, { ...young, id: `jov-${i}` }] } } }; if (!stance(gi, club, { ...young, id: `jov-${i}` }, ais[0]).willing) refused++; }
    expect(refused).toBeGreaterThan(5); expect(refused).toBeLessThan(40);   // às vezes recusa, às vezes vende
  });
});

describe('MÓDULO 3 — Contratos', () => {
  const club = ais[3];
  const lastYear = (g: GameState, n = 14): GameState => { const ps = [...g.teams[club].players].sort((a, b) => b.strength - a.strength).slice(0, n).map((p) => p.id); return { ...g, teams: { ...g.teams, [club]: { ...g.teams[club], players: g.teams[club].players.map((p) => (ps.includes(p.id) ? { ...p, contract: { wage: p.contract!.wage, until: g.season } } : p)) } } }; };
  it('Teste 9 — renovação: a IA renova com antecedência quem vale a pena, dentro da folha, e não repete a conversa', () => {
    const g0 = lastYear(open);
    const before = payrollOf(g0, club);
    const targets = new Set(g0.teams[club].players.filter((p) => p.contract!.until === g0.season).map((p) => p.id));
    const s = aiRenewTick(g0, [club]);
    const renewed = s.teams[club].players.filter((p) => targets.has(p.id) && p.contract!.until > g0.season);
    expect(renewed.length).toBeGreaterThan(0);
    expect(renewed.length).toBeLessThan(14);                                  // nem todos
    for (const p of renewed) expect(p.contract!.from).toBe(g0.season);
    expect(s.contractLog!.some((e) => e.kind !== 'recusou')).toBe(true);
    expect(payrollOf(s, club)).toBeLessThan(before * 1.6);                    // sem salários absurdos
    const again = aiRenewTick(s, [club]);
    expect(again.teams[club]).toBe(s.teams[club]);                            // não renova de novo
    expect(contractAlerts(g0, club).length).toBeGreaterThan(0);
  });
  it('Teste 10 — recusa: jogador insatisfeito recusa; salário baixo gera pedido de aumento; quem recusa e é importante vai à lista de venda', () => {
    const star = [...open.teams[club].players].sort((a, b) => b.strength - a.strength)[0];
    const g1 = { ...open, mood: { [star.id]: { since: calOf(open).day, reason: 'teste', level: 3 as const, want: 'sair' as const } } };
    expect(renewalAnswer(g1, club, star, { wage: 9_999_999, years: 3 }).action).toBe('recusar');
    const calm = renewalAnswer(open, club, star, { wage: 1, years: 3 });
    expect(['pedir-aumento', 'recusar']).toContain(calm.action);
    // a conversa da IA: o astro quer sair e recusa → vira lista de venda e fica registrado
    const g2 = aiRenewTick(lastYear(g1), [club]);
    expect(g2.contractLog!.some((e) => e.playerId === star.id && e.kind === 'recusou')).toBe(true);
    expect(g2.listed?.[star.id]?.clubId).toBe(club);
    expect(g2.teams[club].players.find((p) => p.id === star.id)!.contract!.until).toBe(open.season); // não renovou
  });
  it('você negocia a renovação: o jogador pede mais, aceita e o contrato substitui o antigo (sem dois salários)', () => {
    const p = [...open.teams.flamengo.players].sort((a, b) => b.strength - a.strength)[8];
    const g0 = { ...open, teams: { ...open.teams, flamengo: { ...open.teams.flamengo, players: open.teams.flamengo.players.map((x) => (x.id === p.id ? { ...x, contract: { wage: 60_000, until: open.season } } : x)) } } };
    const low = renewOffer(g0, p.id, 1_000, 3);
    expect(low.ok).toBe(false);
    const ask = low.counter?.wage;
    if (ask) {
      const hi = renewOffer(g0, p.id, ask, low.counter?.years ?? 3);
      if (hi.ok) {
        const np = hi.state.teams.flamengo.players.find((x) => x.id === p.id)!;
        expect(np.contract!.wage).toBe(ask);
        expect(hi.state.teams.flamengo.players.filter((x) => x.id === p.id).length).toBe(1);
        expect(payrollOf(hi.state, 'flamengo')).toBe(payrollOf(g0, 'flamengo') - 60_000 + ask);
        expect(hi.state.contractLog![0]).toMatchObject({ playerId: p.id, wageFrom: 60_000, wageTo: ask });
      }
    }
    expect(renewOffer(g0, p.id, -5, 3).ok).toBe(false);
  });
  it('Teste 11 — fim de contrato: o jogador sai, vira livre com o último clube, o salário deixa de ser pago e o histórico registra', () => {
    const g0 = lastYear({ ...open, season: 2026 });
    const star = [...g0.teams[club].players].sort((a, b) => b.strength - a.strength)[0];
    // marca como quem recusou renovar para sair de graça
    const g1 = { ...g0, renewTalks: { [star.id]: { day: calOf(g0).day, tries: 2, refusals: 2, done: true } } };
    const payBefore = payrollOf(g1, club);
    const out = aiRenewals({ ...g1, season: 2027 }, makeRng(3), 'virada', 2026);
    expect(out.teams[club].players.some((p) => p.id === star.id)).toBe(false);
    const free = out.freeAgents!.find((p) => p.id === star.id)!;
    expect(free).toMatchObject({ lastClubId: club });
    expect(free.contract).toBeUndefined();
    expect(out.contractLog!.some((e) => e.playerId === star.id && e.kind === 'fim')).toBe(true);
    expect(payrollOf(out, club)).toBeLessThan(payBefore);
    expect(auditUniverse(out)).toEqual([]);
  });
  it('Teste 12 — finanças: renovar não duplica salário e a soma do dinheiro do universo é preservada nos empréstimos', () => {
    const p = [...open.teams[club].players].sort((a, b) => b.strength - a.strength)[5];
    const w0 = p.contract!.wage;
    const s = applyContract(open, club, p.id, w0 + 50_000, 3);
    expect(payrollOf(s, club)).toBe(payrollOf(open, club) + 50_000);
    expect(s.teams[club].players.filter((x) => x.id === p.id).length).toBe(1);
    const { buyer, p: q } = pair();
    const g0 = rich(open, buyer);
    expect(sum(lend(g0, q.id, buyer, loanTerms(), 150_000))).toBe(sum(g0));     // a taxa muda de mãos, não some
  });
});

describe('Salvamento, várias temporadas e compatibilidade', () => {
  it('Teste 13 — salvar e reabrir com empréstimos e contratos em andamento mantém tudo igual', () => {
    const { buyer, p } = pair();
    let a = lend(rich(open, buyer), p.id, buyer, loanTerms({ buyOption: 3_000_000 }));
    a = aiRenewTick(a, [ais[3]]);
    let b: GameState = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 25; i++) { a = dayTickForTest({ ...a, cal: { ...calOf(a), day: calOf(a).day + 20 } }); b = dayTickForTest({ ...b, cal: { ...calOf(b), day: calOf(b).day + 20 } }); if (i % 4 === 0) b = JSON.parse(JSON.stringify(b)); }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(where(a, p.id).length).toBe(1);
  });
  it('Teste 14 — várias temporadas: sem empréstimos presos, contratos duplicados ou jovens parados; histórias aparecem', () => {
    let g = makeCareer('flamengo', 91);
    const youngStart = Object.values(g.teams).flatMap((t) => t.players).filter((p) => p.age <= 20);
    const startAvg = youngStart.reduce((a, p) => a + p.strength, 0) / youngStart.length;
    const ids0 = new Set(youngStart.map((p) => p.id));
    for (let i = 0; i < 3; i++) {
      g = startNextSeason(simulateToEnd(g));
      expect(auditUniverse(g), `temporada ${g.season}`).toEqual([]);
      for (const l of g.loanDeals ?? []) if (!l.closed) expect(l.untilDay).toBeGreaterThan(calOf(g).day - 5); // nada preso depois da data
    }
    const grown = Object.values(g.teams).flatMap((t) => t.players).filter((p) => ids0.has(p.id));
    const growth = grown.reduce((a, p) => a + p.strength, 0) / grown.length - startAvg;
    expect(growth).toBeGreaterThan(0);                                        // os jovens evoluem
    expect(growth).toBeLessThan(25);                                          // mas gradualmente
    expect((g.loanLog ?? []).length).toBeGreaterThan(0);
    expect((g.contractLog ?? []).length).toBeGreaterThan(0);
    const ids = Object.values(g.teams).flatMap((t) => t.players.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(g.apps ?? {}).length).toBeLessThan(ids.length + 1);
  }, 400_000);
  it('Teste 15 — compatibilidade: carreira antiga (sem potencial, partidas, histórico) abre, ganha potencial sem mudar overall e continua', () => {
    const fresh = makeCareer('flamengo', 33);
    const old: GameState = JSON.parse(JSON.stringify(fresh));
    for (const k of ['apps', 'loanLog', 'contractLog', 'renewTalks', 'loanDeals', 'aiYouth']) delete (old as unknown as Record<string, unknown>)[k];
    for (const t of Object.values(old.teams)) for (const p of t.players) { delete p.pot; delete p.formedAt; }
    const opened = ensureAiState(old);
    const young = Object.values(opened.teams).flatMap((t) => t.players).filter((p) => p.age <= 25);
    expect(young.every((p) => p.pot !== undefined && p.pot >= p.strength && p.pot <= 95)).toBe(true);
    for (const [id, t] of Object.entries(old.teams)) expect(opened.teams[id].players.map((p) => p.strength)).toEqual(t.players.map((p) => p.strength)); // overall intacto
    expect(opened.budgets).toEqual(old.budgets);
    expect(ensureAiState(opened)).toBe(opened);
    expect(ensurePotentials(opened)).toBe(opened);
    expect(impliedPot({ id: 'z', age: 30, strength: 70 })).toBe(70);
    expect(potentialOf({ id: 'z', name: 'z', pos: 'ATT', age: 30, strength: 70 })).toBe(70);
    const done = startNextSeason(simulateToEnd(opened));
    expect(auditUniverse(done)).toEqual([]);
  }, 200_000);
});
void dealsTick; void skipSeasons;
type _D = Deal;
