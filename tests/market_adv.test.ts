import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { aiWindow } from '../src/engine/ai';
import { stance } from '../src/engine/aisales';
import { agentOf, listedPlayers, marketTick } from '../src/engine/aimarket';
import { aiTrade } from '../src/engine/aitrade';
import { auditUniverse } from '../src/engine/aiaudit';
import { clubProfile } from '../src/engine/aiprofile';
import { squadNeeds } from '../src/engine/aineeds';
import { ensureAiState } from '../src/engine/aistate';
import { calOf, toDay } from '../src/engine/calendar';
import { askOf, locate, playerDecision } from '../src/engine/dealeval';
import { makeInstallments } from '../src/engine/dealpay';
import { settleDebts } from '../src/engine/dealpay';
import { dealsTick, executeDeal, incomingDeals, openDeal, outgoingDeals, userAccept, userCounter } from '../src/engine/deals';
import { payrollOf, loanOwed } from '../src/engine/finance';
import { skipSeasons, startNextSeason, simulateToEnd } from '../src/engine/game';
import { exerciseBuyOption, finishLoans, settleLoanPurchases } from '../src/engine/loandeals';
import { freeList, proposeBuy, proposeFree, proposeLoan } from '../src/engine/marketdeals';
import { returnLoans } from '../src/engine/roster';
import { windowInfo, windowTick, windowsOfYear } from '../src/engine/windows';
import type { Deal, GameState, Player } from '../src/engine/types';
import { makeCareer } from './helpers';

const base = ensureAiState(makeCareer('flamengo', 14));
const at = (g: GameState, y: number, m: number, d: number): GameState => ({ ...g, cal: { ...calOf(g), day: toDay(y, m, d) } });
const open = at(base, 2026, 2, 10);
const closedDay = at(base, 2026, 5, 20);
const ais = Object.keys(base.teams).filter((x) => x !== 'flamengo' && x !== 'palmeiras').sort(); // todos os clubes da IA (de várias divisões)
const sum = (g: GameState) => Object.values(g.budgets).reduce((a, b) => a + b, 0);
const where = (g: GameState, pid: string) => Object.keys(g.teams).filter((id) => g.teams[id].players.some((p) => p.id === pid));
const approve = (g: GameState, id: string): GameState => ({ ...g, deals: g.deals!.map((d) => (d.id === id ? { ...d, state: 'aceita-jogador' as const, clubOk: true, playerOk: true } : d)) });
/** Passa dias (processando respostas, prazos e parcelas). */
const days = (g: GameState, n: number): GameState => { let s = g; for (let i = 0; i < n; i++) s = settleDebts(dealsTick(windowTick({ ...s, cal: { ...calOf(s), day: calOf(s).day + 1 } }))); return s; };
/** Um reserva que o clube topa vender (a posição tem reposição). */
const reserveOf = (g: GameState, clubId: string) => { const sorted = [...g.teams[clubId].players].sort((a, b) => a.strength - b.strength); return sorted.find((p) => stance(g, clubId, p, 'flamengo').willing) ?? sorted[3]; };
const wantsOut = (g: GameState, p: Player): GameState => ({ ...g, mood: { ...(g.mood ?? {}), [p.id]: { since: calOf(g).day, reason: 'teste', level: 3, want: 'sair' } } });

describe('Janelas de transferência', () => {
  it('cada região tem as suas datas e a situação vem só da data do calendário', () => {
    const br = windowsOfYear('BR', 2026), en = windowsOfYear('EN', 2026);
    expect(br[0].opens).toBe(toDay(2026, 1, 2)); expect(br[0].closes).toBe(toDay(2026, 4, 5));
    expect(en[0].closes).toBe(toDay(2026, 1, 31)); expect(en[1].opens).toBe(toDay(2026, 7, 1));
    expect(windowInfo(open).open).toBe(true);
    expect(windowInfo(closedDay).open).toBe(false);
    expect(windowInfo(closedDay).next?.opens).toBe(toDay(2026, 7, 1));
    expect(windowInfo(at(base, 2026, 7, 15)).open).toBe(true);
    expect(windowInfo(open).daysLeft).toBe(toDay(2026, 4, 5) - toDay(2026, 2, 10));
  });
  it('abertura, aviso de fechamento e encerramento notificam uma única vez e entram no histórico; reabrir o save não repete', () => {
    let g = windowTick(at(base, 2026, 3, 28)); // 1ª chamada só registra a situação
    const n0 = g.news.length;
    for (let d = 29; d <= 31; d++) g = windowTick(at(g, 2026, 3, d));
    for (let d = 1; d <= 6; d++) g = windowTick(at(g, 2026, 4, d));
    const texts = g.news.slice(0, g.news.length - n0).map((n) => n.text);
    expect(texts.filter((t) => /fecha em/.test(t)).length).toBe(1);
    expect(texts.filter((t) => /fechou/.test(t)).length).toBe(1);
    expect(g.windowLog?.some((e) => e.event === 'fechada')).toBe(true);
    const again = windowTick(JSON.parse(JSON.stringify(g)));
    expect(again.news.length).toBe(g.news.length);
  });
  it('janela fechada bloqueia transferências comuns, empréstimos e a IA, mas jogador livre pode ser contratado', () => {
    const p = reserveOf(base, ais[3]);
    const r = proposeBuy(closedDay, p.id, { fee: 5_000_000 });
    expect(r.error).toMatch(/Mercado fechado/);
    expect(proposeLoan(closedDay, p.id, { fee: 50_000 }).error).toMatch(/Mercado fechado/);
    const moved = aiWindow(closedDay, makeRng(3), 3);
    expect(Object.values(moved.aiMoves ?? {}).filter((m) => m.season === moved.season).length).toBe(0);
    const free: Player = { id: 'fa1', name: 'Livre Um', pos: 'DEF', age: 27, strength: 60 };
    const g = { ...wantsOut(closedDay, free), freeAgents: [free] };
    const f = proposeFree(g, 'fa1');
    expect(f.error).toBeUndefined();
  });
});

describe('Propostas, contrapropostas e conclusão', () => {
  it('Teste 1 — contratação comum: proposta registrada, respondida em dias, concluída com dinheiro e jogador corretos', () => {
    const seller = ais[4];
    const p = reserveOf(base, seller);
    let g = wantsOut(open, p);
    const value = askOf(g, { id: 'x', kind: 'compra', playerId: p.id, sellerId: seller, buyerId: 'flamengo', terms: { fee: 0 }, state: 'enviada', createdDay: 0, deadlineDay: 9e9, round: 0, history: [] } as Deal).ask;
    const r = proposeBuy(g, p.id, { fee: value * 3 });
    expect(r.deal?.state).toBe('enviada');
    expect(outgoingDeals(r.state).length).toBe(1);
    expect(r.state.teams.flamengo.players.some((x) => x.id === p.id)).toBe(false); // ainda não: falta a resposta
    const b0 = r.state.budgets.flamengo, s0 = r.state.budgets[seller];
    g = days(r.state, 4);
    expect(where(g, p.id)).toEqual(['flamengo']);
    expect(g.budgets.flamengo).toBe(b0 - value * 3); expect(g.budgets[seller]).toBe(s0 + value * 3);
    expect(g.transfers.at(-1)).toMatchObject({ kind: 'buy', playerId: p.id, toClubId: 'flamengo', fromClubId: seller });
    expect(g.dealLog?.[0]).toMatchObject({ playerId: p.id, state: 'concluida' });
    expect(auditUniverse(g)).toEqual([]);
  });
  it('Teste 2 — contraproposta: oferta baixa recebe contraproposta, o fluxo passa por etapas sem duplicar e o histórico registra tudo', () => {
    const seller = ais[6];
    const p = reserveOf(base, seller);
    const g0 = wantsOut(open, p);
    const ask = askOf(g0, { id: 'x', kind: 'compra', playerId: p.id, sellerId: seller, buyerId: 'flamengo', terms: { fee: 0 }, state: 'enviada', createdDay: 0, deadlineDay: 9e9, round: 0, history: [] } as Deal).ask;
    let g = proposeBuy(g0, p.id, { fee: ask * 0.5 }).state;
    expect(proposeBuy(g, p.id, { fee: ask }).error).toMatch(/já existe/i); // sem proposta duplicada
    g = days(g, 3);
    const d = outgoingDeals(g)[0];
    expect(d.state).toBe('contraproposta');
    expect(d.terms.fee).toBeGreaterThan(ask * 0.5);
    expect(d.history.map((h) => h.action)).toEqual(['proposta', 'contraproposta']);
    expect(d.round).toBe(1);
    // você contrapropõe no meio do caminho; a resposta vem no dia seguinte
    const c = userCounter(g, d.id, { fee: Math.round((d.terms.fee + ask * 0.5) / 2) });
    expect(c.error).toBeUndefined();
    expect(outgoingDeals(c.state)[0].state).toBe('aguardando');
    g = days(c.state, 2);
    const after = outgoingDeals(g)[0] ?? g.dealLog?.[0];
    expect(after).toBeTruthy();
    // aceitando a contraproposta fecha o negócio
    const g2 = outgoingDeals(g).length ? userAccept(g, outgoingDeals(g)[0].id) : g;
    expect(auditUniverse(g2)).toEqual([]);
  });
  it('a proposta expira sozinha quando o prazo passa sem resposta, e as negociações não ficam presas', () => {
    const seller = ais[7];
    const p = reserveOf(base, seller);
    let g = proposeBuy(open, p.id, { fee: 1_000_000_000 }).state; // valor absurdo: o clube aceita e o jogador decide... usamos prazo curto
    g = { ...g, deals: g.deals?.map((d) => ({ ...d, answerDay: 9_999_999, deadlineDay: calOf(g).day + 2 })) };
    g = days(g, 4);
    expect((g.deals ?? []).length).toBe(0);
    expect(g.dealLog?.[0].state).toBe('expirada');
  });
  it('fechar a janela cancela as propostas pendentes (menos as de jogador livre)', () => {
    const seller = ais[8];
    const p = reserveOf(base, seller);
    let g = proposeBuy(at(base, 2026, 4, 4), p.id, { fee: 1_000 }).state;
    expect(g.deals?.length).toBe(1);
    g = { ...g, deals: g.deals!.map((d) => ({ ...d, answerDay: d.answerDay! + 20, deadlineDay: d.deadlineDay + 20 })) }; // ainda sem resposta quando a janela fechar
    g = days(g, 2);
    expect(g.deals?.length ?? 0).toBe(0);
    expect(g.dealLog?.[0].state).toBe('expirada');
  });
});

describe('Pagamento, troca, empréstimo e cláusulas', () => {
  /** Negociação AI×AI aprovada na hora (para testar só o dinheiro e os elencos). */
  const direct = (g: GameState, pid: string, buyerId: string, terms: Deal['terms'], kind: Deal['kind'] = 'compra') => {
    const o = openDeal(g, { kind, playerId: pid, buyerId, terms });
    expect(o.error).toBeUndefined();
    return executeDeal(approve(o.state, o.deal!.id), o.deal!.id);
  };
  const pair = () => { const seller = ais[10], buyer = ais[11]; return { seller, buyer, p: reserveOf(base, seller) }; };

  it('Teste 3 — pagamento parcelado em 3 parcelas: entrada agora, dívidas com vencimento, soma igual ao valor, sem cobrança dupla', () => {
    const { seller, buyer, p } = pair();
    const g0 = { ...open, budgets: { ...open.budgets, [buyer]: 100_000_000 } };
    const day = calOf(g0).day;
    const inst = makeInstallments(10_000_000, 3, day, 0.4, 60)!;
    expect(inst.reduce((a, i) => a + i.amount, 0)).toBe(10_000_000);
    const r = direct(g0, p.id, buyer, { fee: 10_000_000, installments: inst });
    expect(r.ok).toBe(true);
    const s = r.state;
    expect(s.budgets[buyer]).toBe(g0.budgets[buyer] - inst[0].amount);
    expect(s.budgets[seller]).toBe(g0.budgets[seller] + inst[0].amount);
    expect(s.debts?.length).toBe(2);
    expect(s.debts!.map((d) => d.due)).toEqual([day + 60, day + 120]);
    expect(s.debts!.reduce((a, d) => a + d.amount, 0)).toBe(10_000_000 - inst[0].amount);
    const s2 = days(s, 61);
    expect(s2.budgets[buyer]).toBe(g0.budgets[buyer] - inst[0].amount - inst[1].amount);
    const s3 = days(s2, 61);
    expect(s3.budgets[buyer]).toBe(g0.budgets[buyer] - 10_000_000);
    expect(s3.budgets[seller]).toBe(g0.budgets[seller] + 10_000_000);
    expect(s3.debts!.every((d) => d.paidDay !== undefined)).toBe(true);
    expect(days(s3, 30).budgets[buyer]).toBe(s3.budgets[buyer]); // nada é debitado de novo
    expect(sum(s3)).toBe(sum(g0));
  });
  it('parcelas que não somam o valor negociado são recusadas', () => {
    const { buyer, p } = pair();
    const bad = openDeal(open, { kind: 'compra', playerId: p.id, buyerId: buyer, terms: { fee: 1_000_000, installments: [{ due: calOf(open).day, amount: 400_000 }, { due: calOf(open).day + 30, amount: 500_000 }] } });
    expect(bad.error).toMatch(/parcelas/);
  });
  it('Teste 4 — troca direta e troca com dinheiro: os dois elencos mudam e ninguém fica em dois clubes', () => {
    const { seller, buyer, p } = pair();
    const swap = [...base.teams[buyer].players].sort((a, b) => a.strength - b.strength)[3];
    const g0 = { ...open, budgets: { ...open.budgets, [buyer]: 50_000_000 } };
    const r = direct(g0, p.id, buyer, { fee: 0, swapPlayerIds: [swap.id] }, 'troca');
    expect(r.ok).toBe(true);
    expect(where(r.state, p.id)).toEqual([buyer]); expect(where(r.state, swap.id)).toEqual([seller]);
    expect(r.state.budgets[buyer]).toBe(g0.budgets[buyer]); // troca direta: sem dinheiro
    const r2 = direct(g0, p.id, buyer, { fee: 2_000_000, swapPlayerIds: [swap.id] }, 'troca');
    expect(r2.state.budgets[buyer]).toBe(g0.budgets[buyer] - 2_000_000); expect(r2.state.budgets[seller]).toBe(g0.budgets[seller] + 2_000_000);
    expect(auditUniverse(r2.state)).toEqual([]);
    // um jogador não entra em duas trocas aprovadas
    const o1 = openDeal(g0, { kind: 'troca', playerId: p.id, buyerId: buyer, terms: { fee: 0, swapPlayerIds: [swap.id] } });
    const approved = approve(o1.state, o1.deal!.id);
    const other = [...base.teams[ais[12]].players].sort((a, b) => a.strength - b.strength)[3];
    expect(openDeal(approved, { kind: 'troca', playerId: other.id, buyerId: buyer, terms: { fee: 0, swapPlayerIds: [swap.id] } }).error).toMatch(/comprometido/);
  });
  it('Teste 5 — empréstimo: condições registradas, salário dividido, opção e obrigação de compra, devolução com contrato de origem', () => {
    const { seller, buyer, p } = pair();
    const g0 = { ...open, budgets: { ...open.budgets, [buyer]: 100_000_000 } };
    const wageBefore = locate(g0, p.id)!.player.contract!.wage;
    const loan = { untilDay: toDay(2026, 12, 31), originWagePct: 0.5, fee: 100_000, buyOption: 3_000_000 };
    const r = direct(g0, p.id, buyer, { fee: 100_000, loan }, 'emprestimo');
    expect(r.ok).toBe(true);
    const s = r.state;
    const ld = s.loanDeals![0];
    expect(ld).toMatchObject({ playerId: p.id, originId: seller, hostId: buyer, originWagePct: 0.5, buyOption: 3_000_000, fullWage: wageBefore, });
    expect(locate(s, p.id)!.player.contract!.wage).toBe(Math.round(wageBefore * 0.5)); // o clube que recebe paga metade
    expect(loanOwed(s, seller)).toBe(wageBefore * 0.5);                                 // e o dono paga a outra metade
    expect(payrollOf(s, seller)).toBeGreaterThanOrEqual(loanOwed(s, seller));
    expect(s.aiLoans?.some((l) => l.playerId === p.id)).toBe(true);
    // jogador emprestado não pode ser vendido nem negociado de novo
    expect(openDeal(s, { kind: 'compra', playerId: p.id, buyerId: ais[13], terms: { fee: 1_000_000 } }).error).toMatch(/emprestado/);
    // fim da temporada sem compra: volta ao dono com o contrato original
    const back = finishLoans(returnLoansAi(s));
    expect(where(back, p.id)).toEqual([seller]);
    expect(locate(back, p.id)!.player.contract!.wage).toBe(wageBefore);
    expect(back.loanDeals?.some((l) => !l.closed)).toBe(false);
    // obrigação de compra cumprida pelas partidas: compra permanente
    const ob = direct(g0, p.id, buyer, { fee: 100_000, loan: { ...loan, buyOption: undefined, buyObligation: 2_500_000, obligationGames: 3 } }, 'emprestimo').state;
    const played = { ...ob, loanDeals: ob.loanDeals!.map((l) => ({ ...l, apps: 3 })) };
    const bought = settleLoanPurchases(played);
    expect(where(bought, p.id)).toEqual([buyer]);
    expect(bought.aiLoans?.length).toBe(0);
    expect(bought.budgets[seller]).toBe(played.budgets[seller] + 2_500_000);
    expect(locate(bought, p.id)!.player.contract!.until).toBeGreaterThanOrEqual(bought.season);
  });
  it('você exerce a opção de compra de um emprestado (e só com a janela aberta)', () => {
    const seller = ais[14];
    const p = reserveOf(base, seller);
    const g0 = wantsOut({ ...open, budgets: { ...open.budgets, flamengo: 80_000_000 } }, p);
    let g = proposeLoan(g0, p.id, { fee: 50_000, originWagePct: 0, buyOption: 2_000_000 }).state;
    g = days(g, 4);
    expect(where(g, p.id)).toEqual(['flamengo']);
    expect(g.loansIn?.some((l) => l.playerId === p.id)).toBe(true);
    expect(exerciseBuyOption(at(g, 2026, 5, 20), p.id).ok).toBe(false);
    const r = exerciseBuyOption(g, p.id);
    expect(r.ok).toBe(true);
    expect(r.state.budgets.flamengo).toBe(g.budgets.flamengo - 2_000_000);
    expect(r.state.loansIn?.some((l) => l.playerId === p.id)).toBe(false);
    expect(auditUniverse(r.state)).toEqual([]);
  });
  it('Teste 6 — cláusula de revenda: o clube antigo recebe o percentual combinado uma única vez, sobre a base definida', () => {
    const [A, B, C] = [ais[15], ais[16], ais[17]];
    const p = reserveOf(base, A);
    const rich = { ...open, budgets: { ...open.budgets, [B]: 100_000_000, [C]: 100_000_000 } };
    const t1 = direct(rich, p.id, B, { fee: 5_000_000, clauses: [{ type: 'revenda', pct: 0.15, base: 'valor' }] });
    expect(t1.ok).toBe(true);
    expect(t1.state.clauses?.[0]).toMatchObject({ type: 'revenda', beneficiaryId: A, payerId: B, pct: 0.15 });
    const a0 = t1.state.budgets[A], b0 = t1.state.budgets[B];
    const t2 = direct(t1.state, p.id, C, { fee: 10_000_000 });
    expect(t2.ok).toBe(true);
    expect(t2.state.budgets[A]).toBe(a0 + 1_500_000);                // 15% de 10 mi
    expect(t2.state.budgets[B]).toBe(b0 + 10_000_000 - 1_500_000);   // o vendedor paga a cláusula do que recebe
    expect(t2.state.clauses?.[0].paid).toBe(true);
    // venda seguinte: não cobra de novo
    const t3 = direct(t2.state, p.id, ais[18], { fee: 20_000_000 });
    expect(t3.state.budgets[A]).toBe(t2.state.budgets[A]);
    // base "lucro": só sobre o que passar do valor pago
    const q = reserveOf(base, ais[19]);
    const l1 = direct({ ...rich, budgets: { ...rich.budgets, [B]: 100_000_000, [C]: 100_000_000 } }, q.id, B, { fee: 4_000_000, clauses: [{ type: 'revenda', pct: 0.2, base: 'lucro' }] });
    const la = l1.state.budgets[ais[19]];
    const l2 = direct(l1.state, q.id, C, { fee: 9_000_000 });
    expect(l2.state.budgets[ais[19]]).toBe(la + 1_000_000);          // 20% de (9 - 4) mi
  });
  it('bônus por jogos é pago ao antigo clube quando o jogador atinge o número combinado, uma única vez', () => {
    const { seller, buyer, p } = pair();
    const g0 = { ...open, budgets: { ...open.budgets, [buyer]: 100_000_000 } };
    const t = direct(g0, p.id, buyer, { fee: 2_000_000, clauses: [{ type: 'bonus-jogos', amount: 500_000, threshold: 2 }] });
    let s = t.state;
    const s0 = s.budgets[seller];
    s = clauseGamesFor(s, p.id); expect(s.budgets[seller]).toBe(s0);
    s = clauseGamesFor(s, p.id); expect(s.budgets[seller]).toBe(s0 + 500_000);
    s = clauseGamesFor(s, p.id); expect(s.budgets[seller]).toBe(s0 + 500_000);
  });
});

describe('Decisão do jogador, livres e agentes', () => {
  const dealFor = (g: GameState, pid: string, buyerId: string, wage?: number): Deal => ({ id: 't', kind: 'compra', playerId: pid, sellerId: locate(g, pid)!.clubId, buyerId, terms: { fee: 1_000_000, wage }, state: 'aceita-clube', createdDay: 0, deadlineDay: 9e9, round: 0, history: [] });
  it('Teste 7 — titular de clube grande recusa clube pequeno; jovem reserva aceita onde vai jogar; salário baixo gera pedido de aumento', () => {
    const big = base.divisions[0].clubIds.slice().sort((a, b) => base.clubs[b].reputation - base.clubs[a].reputation)[0];
    const small = base.divisions[3].clubIds[0];
    const star = [...base.teams[big].players].sort((a, b) => b.strength - a.strength)[0];
    expect(playerDecision(base, dealFor(base, star.id, small)).action).toBe('recusar');
    // jovem reserva de clube grande indo para um clube pequeno onde seria titular, com salário melhor
    const bench = [...base.teams[big].players].filter((p) => p.age <= 21).sort((a, b) => a.strength - b.strength)[0] ?? [...base.teams[big].players].sort((a, b) => a.strength - b.strength)[0];
    const young: Player = { ...bench, age: 20, strength: 66, contract: { wage: 20_000, until: 2028 } };
    const g = { ...base, teams: { ...base.teams, [big]: { ...base.teams[big], players: base.teams[big].players.map((p) => (p.id === bench.id ? young : p)) } } };
    const weakTeam = base.divisions[1].clubIds[5];
    const dec = playerDecision(g, dealFor(g, young.id, weakTeam, 400_000));
    expect(['aceitar', 'pedir-mais']).toContain(dec.action);
    // o mesmo jogador com salário muito abaixo do que ganha pede mais
    const low = playerDecision({ ...g, teams: { ...g.teams, [big]: { ...g.teams[big], players: g.teams[big].players.map((p) => (p.id === young.id ? { ...p, contract: { wage: 900_000, until: 2028 } } : p)) } } }, dealFor(g, young.id, weakTeam, 10_000));
    expect(low.action).not.toBe('aceitar');
    // quem quer sair aceita mais fácil
    const star2 = wantsOut(base, star);
    expect(playerDecision(star2, dealFor(star2, star.id, ais[20])).score).toBeGreaterThan(playerDecision(base, dealFor(base, star.id, ais[20])).score);
  });
  it('Teste 8 — jogador livre: contratação move o jogador uma única vez, sem cópias e sem vínculo com o clube anterior', () => {
    const free: Player = { id: 'fa-t8', name: 'Livre Oito', pos: 'ATT', age: 28, strength: 66, lastClubId: ais[0] };
    let g = wantsOut({ ...open, freeAgents: [free] }, free);
    expect(freeList(g)[0]).toMatchObject({ ask: expect.any(Number), agent: expect.any(String) });
    const r = proposeFree(g, free.id);
    g = r.state;
    expect(where(g, free.id)).toEqual(['flamengo']);
    expect((g.freeAgents ?? []).some((p) => p.id === free.id)).toBe(false);
    expect(g.budgets.flamengo).toBe(open.budgets.flamengo); // sem taxa de transferência
    expect(locate(g, free.id)!.player.contract).toBeTruthy();
    expect(proposeFree(g, free.id).error).toBeTruthy(); // já tem clube
    expect(auditUniverse(g)).toEqual([]);
  });
  it('IA contrata livres só com necessidade e salário que cabe (não contrata todos)', () => {
    const frees: Player[] = Array.from({ length: 30 }, (_, i) => ({ id: `fa-m${i}`, name: `Livre ${i}`, pos: (['GK', 'DEF', 'MID', 'ATT'] as const)[i % 4], age: 24 + (i % 10), strength: 45 + (i % 30) }));
    let g: GameState = { ...open, freeAgents: frees, marketDay: undefined };
    for (let d = 0; d < 40; d++) g = marketTick({ ...g, cal: { ...calOf(g), day: calOf(g).day + 1 }, marketDay: undefined });
    const signed = frees.filter((f) => where(g, f.id).length === 1).length;
    expect(signed).toBeGreaterThan(0); expect(signed).toBeLessThan(frees.length);
    expect(auditUniverse(g)).toEqual([]);
  });
  it('Teste 9 — agentes: ofertas combinam com a necessidade do clube, são limitadas e sem duplicações', () => {
    const frees: Player[] = Array.from({ length: 40 }, (_, i) => ({ id: `fa-a${i}`, name: `Livre A${i}`, pos: (['GK', 'DEF', 'MID', 'ATT'] as const)[i % 4], age: 24 + (i % 8), strength: 55 + (i % 25) }));
    let g: GameState = { ...open, freeAgents: frees };
    for (let d = 0; d < 60; d++) g = marketTick({ ...g, cal: { ...calOf(g), day: calOf(g).day + 1 }, marketDay: undefined });
    const offers = g.agentOffers ?? [];
    const ids = offers.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(offers.filter((o) => o.state === 'aberta').length).toBeLessThanOrEqual(4);
    for (const o of offers) {
      expect(agentOf(o.playerId).id).toBe(o.agentId);
      const club = o.clubId;
      expect(g.teams[club]).toBeTruthy();
    }
    // no máximo uma oferta por clube a cada 14 dias
    for (const club of new Set(offers.map((o) => o.clubId))) { const ds = offers.filter((o) => o.clubId === club).map((o) => o.day).sort((a, b) => a - b); for (let i = 1; i < ds.length; i++) expect(ds[i] - ds[i - 1]).toBeGreaterThanOrEqual(14); }
    expect(auditUniverse(g)).toEqual([]);
  });
  it('clubes colocam jogadores à venda por motivos reais (e só alguns)', () => {
    let g: GameState = open;
    for (let d = 0; d < 40; d++) g = marketTick({ ...g, cal: { ...calOf(g), day: calOf(g).day + 1 }, marketDay: undefined });
    const list = listedPlayers(g);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThan(Object.keys(g.teams).length * 3 + 1);
    for (const x of list) expect(x.reason.length).toBeGreaterThan(3);
  });
  it('insatisfação: poucos jogadores por vez e sempre com motivo', () => {
    let g: GameState = open;
    for (let d = 0; d < 60; d++) g = marketTick({ ...g, cal: { ...calOf(g), day: calOf(g).day + 1 }, marketDay: undefined });
    const moods = Object.entries(g.mood ?? {});
    const players = Object.values(g.teams).reduce((a, t) => a + t.players.length, 0);
    expect(moods.length).toBeLessThan(players * 0.1);
    for (const [, m] of moods) expect(m.reason.length).toBeGreaterThan(3);
  });
});

describe('Disputas, dinheiro, atomicidade e persistência', () => {
  it('Teste 12 — dois clubes disputam o mesmo jogador: só uma contratação é concluída', () => {
    const seller = ais[21];
    const p = reserveOf(base, seller);
    const g0 = { ...open, budgets: { ...open.budgets, [ais[22]]: 200_000_000, [ais[23]]: 200_000_000 } };
    const a = openDeal(g0, { kind: 'compra', playerId: p.id, buyerId: ais[22], terms: { fee: 3_000_000 } });
    const b = openDeal(a.state, { kind: 'compra', playerId: p.id, buyerId: ais[23], terms: { fee: 3_000_000 } });
    expect(b.error).toBeUndefined(); // o clube vendedor recebe duas propostas
    expect(askOf(b.state, b.deal!).ask).toBeGreaterThan(askOf(a.state, a.deal!).ask * 0.99); // concorrência não barateia
    const ready = approve(approve(b.state, a.deal!.id), b.deal!.id);
    const r1 = executeDeal(ready, a.deal!.id);
    expect(r1.ok).toBe(true);
    expect(where(r1.state, p.id)).toEqual([ais[22]]);
    const r2 = executeDeal(r1.state, b.deal!.id);
    expect(r2.ok).toBe(false);
    expect(where(r2.state, p.id)).toEqual([ais[22]]);
    expect(r1.state.dealLog?.some((r) => r.id === b.deal!.id && r.state === 'cancelada')).toBe(true);
  });
  it('Teste 13 — clube sem dinheiro: a transferência é impedida e o estado anterior é preservado', () => {
    const seller = ais[24], buyer = ais[25];
    const p = reserveOf(base, seller);
    const g0 = { ...open, budgets: { ...open.budgets, [buyer]: 100_000 } };
    const o = openDeal(g0, { kind: 'compra', playerId: p.id, buyerId: buyer, terms: { fee: 5_000_000 } });
    const g1 = approve(o.state, o.deal!.id);
    const r = executeDeal(g1, o.deal!.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/condições de pagar/);
    expect(r.state).toBe(g1);                       // nada mudou
    expect(where(r.state, p.id)).toEqual([seller]);
  });
  it('conclusão não se repete e jogador que saiu do clube vendedor invalida a negociação', () => {
    const seller = ais[26], buyer = ais[27];
    const p = reserveOf(base, seller);
    const rich = { ...open, budgets: { ...open.budgets, [buyer]: 100_000_000 } };
    const o = openDeal(rich, { kind: 'compra', playerId: p.id, buyerId: buyer, terms: { fee: 2_000_000 } });
    const ready = approve(o.state, o.deal!.id);
    const r = executeDeal(ready, o.deal!.id);
    expect(r.ok).toBe(true);
    expect(executeDeal(r.state, o.deal!.id).ok).toBe(false);
    expect(sum(r.state)).toBe(sum(rich));
  });
  it('Teste 14 — salvar no meio das negociações e reabrir mantém tudo igual', () => {
    const seller = ais[28];
    const p = reserveOf(base, seller);
    const g0 = wantsOut(open, p);
    const ask = askOf(g0, { id: 'x', kind: 'compra', playerId: p.id, sellerId: seller, buyerId: 'flamengo', terms: { fee: 0 }, state: 'enviada', createdDay: 0, deadlineDay: 9e9, round: 0, history: [] } as Deal).ask;
    let a = proposeBuy(g0, p.id, { fee: ask * 0.6, installments: 2 }).state;
    a = days(a, 1);
    let b: GameState = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 20; i++) { a = days(a, 1); b = days(b, 1); if (i % 5 === 0) b = JSON.parse(JSON.stringify(b)); }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
  it('um mesmo dia não é processado duas vezes pelo mercado da IA', () => {
    const g1 = marketTick({ ...open, cal: { ...calOf(open), day: 20468 }, marketDay: undefined });
    const g2 = marketTick(g1);
    expect(g2).toBe(g1);
  });
});

describe('Várias temporadas, compatibilidade e desempenho', () => {
  it('Teste 15 — 3 temporadas: o mercado continua ativo, as janelas alternam e o universo fica íntegro', () => {
    let g = makeCareer('flamengo', 77);
    const per: number[] = [];
    for (let i = 0; i < 3; i++) { const from = calOf(g).day; g = startNextSeason(simulateToEnd(g)); per.push((g.dealLog ?? []).filter((r) => r.state === 'concluida' && r.day >= from).length); }
    for (const n of per) expect(n).toBeGreaterThan(10);
    const ev = g.windowLog ?? [];
    expect(ev.length).toBeGreaterThan(2);
    for (let i = 1; i < ev.length; i++) expect(ev[i].event).not.toBe(ev[i - 1].event); // abre, fecha, abre, fecha…
    expect((g.freeAgents ?? []).length).toBeLessThanOrEqual(600);
    expect((g.dealLog ?? []).length).toBeLessThanOrEqual(300);
    expect((g.debts ?? []).length).toBeLessThanOrEqual(200);
    expect(auditUniverse(g)).toEqual([]);
    expect(Object.values(g.budgets).every(Number.isFinite)).toBe(true);
  }, 300_000);
  it('Teste 16 — compatibilidade: o fluxo antigo de contratação direta continua funcionando', async () => {
    const { quickSign } = await import('../src/engine/market');
    const seller = ais[29];
    const p = reserveOf(base, seller);
    const g = { ...open, budgets: { ...open.budgets, flamengo: 500_000_000 } };
    const r = quickSign(g, seller, p.id);
    expect(r.blocked).toBeUndefined();
    expect(r.deal || r.club.ok === false || r.player.ok === false).toBe(true);
    const closed = quickSign({ ...closedDay, budgets: g.budgets }, seller, p.id);
    expect(closed.blocked).toMatch(/Mercado fechado/);
  });
  it('Teste 17 — desempenho: uma temporada completa com o mercado ligado roda em tempo razoável', () => {
    const t0 = performance.now();
    skipSeasons(makeCareer('flamengo', 5), 1);
    expect(performance.now() - t0).toBeLessThan(15_000);
  }, 60_000);
});

// ---- auxiliares dos testes ----
import { clauseGames } from '../src/engine/dealpay';
import { returnAiLoans } from '../src/engine/aiyouth';
function returnLoansAi(g: GameState): GameState { return returnLoans(returnAiLoans(g)); }
function clauseGamesFor(g: GameState, pid: string): GameState { return clauseGames(g, new Set([pid])); }
void squadNeeds; void clubProfile; void aiTrade; void incomingDeals;
