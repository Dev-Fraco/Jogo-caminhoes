import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { CLUBS_DATA, type ClubData } from '../src/data/clubs';
import { brazilPyramid, pyramidOf, slotsOfLeague } from '../src/data/pyramid';
import { generateSquad } from '../src/engine/squad';
import { balanceOf, hasBank, recordSalaryTx, registerBank } from '../src/engine/bank';
import { calOf, formatDay, toDay } from '../src/engine/calendar';
import { coachAfterMatch, coachSeasonEval, payTierNotice, reputationDrift } from '../src/engine/coachcareer';
import { PAY_CONFIG, bumpOverall, clubQuality, coachMonthly, coachOverallInt, coachOverallOf, monthlySalaryFor, payTierOf, salaryRange } from '../src/engine/coachpay';
import { processDays } from '../src/engine/daily';
import { coachSalary, nextPayday, payMonthlySalaries } from '../src/engine/finance';
import { newCareer, simulateToEnd } from '../src/engine/game';
import { answerMessage, inboxOf, postContractOffer, inboxTick } from '../src/engine/inbox';
import { migrateGame } from '../src/engine/migrate';
import { loadGame, saveGame } from '../src/engine/save';
import type { GameState } from '../src/engine/types';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0 } as unknown as Storage;

const coach = { name: 'Carlos Almeida', nationality: 'BR', reputation: 'pro' };
const br = (userClubId: string, difficulty = 'normal', seed = 5): GameState => newCareer({ saveName: 't', coach, difficulty, mode: 'career', season: 2026, userClubId, divisions: brazilPyramid(), cup: true }, seed);
const abroad = (countryId: string, leagueId: string, userClubId: string): GameState => newCareer({ saveName: 't', coach, difficulty: 'normal', mode: 'career', season: 2026, userClubId, divisions: pyramidOf(countryId, leagueId), slots: slotsOfLeague(leagueId) }, 7);
const outsideClub = (): ClubData => ({ id: 'meu-real-esperanca', name: 'Real Esperança', shortName: 'RES', badge: 'x', primaryColor: '#1e6bff', secondaryColor: '#ffffff', stadium: 'Estádio da Esperança', city: 'Fortaleza', budget: 900_000, boardExpectation: 'mid', reputation: 1, uf: 'CE', custom: true, squad: generateSquad({ id: 'meu-real-esperanca', name: 'Real Esperança', short: 'RES', color: '#1e6bff', strength: 48 }, 2026) });
const pyr = brazilPyramid();
const clubOf = (div: number, i = 0) => pyr[div].clubs[i].id;

/** Muda o elenco inteiro para um overall e a reputação do clube. */
const shape = (g: GameState, clubId: string, ovr: number, rep: number): GameState => ({
  ...g,
  teams: { ...g.teams, [clubId]: { ...g.teams[clubId], players: g.teams[clubId].players.map((p) => ({ ...p, strength: ovr })) } },
  clubs: { ...g.clubs, [clubId]: { ...g.clubs[clubId], reputation: rep } },
});
const withOv = (g: GameState, ov: number): GameState => ({ ...g, coachOverall: ov });
const monthlyOf = (g: GameState) => coachMonthly(g);

describe('Salário do treinador — limites por divisão (valores mensais)', () => {
  it('1. clube de estadual: dentro da faixa de R$ 1.000 a R$ 10.000', () => {
    const g = newCareer({ saveName: 't', coach, difficulty: 'normal', mode: 'career', season: 2026, userClubId: outsideClub().id, divisions: brazilPyramid(), cup: true, outside: outsideClub() }, 5);
    expect(payTierOf(g, g.userClubId)).toBe('estadual');
    for (const [o, r, c] of [[30, 1, 15], [60, 5, 100], [99, 5, 100]] as const) { const m = monthlyOf(withOv(shape(g, g.userClubId, o, r), c)); expect(m).toBeGreaterThanOrEqual(1_000); expect(m).toBeLessThanOrEqual(10_000); }
  });
  it('2. Série D (mesmo disputando estadual junto): faixa da Série D, teto R$ 10.000', () => {
    const g = br(clubOf(3));
    expect(payTierOf(g, g.userClubId)).toBe('serieD');
    const m = monthlyOf(withOv(shape(g, g.userClubId, 99, 5), 100));
    expect(m).toBeLessThanOrEqual(10_000); expect(m).toBeGreaterThanOrEqual(1_000);
  });
  it('3. Série C: teto R$ 30.000', () => { const g = br(clubOf(2)); expect(payTierOf(g, g.userClubId)).toBe('serieC'); const m = monthlyOf(withOv(shape(g, g.userClubId, 99, 5), 100)); expect(m).toBeLessThanOrEqual(30_000); expect(m).toBeGreaterThan(20_000); });
  it('4. Série B: teto R$ 100.000', () => { const g = br(clubOf(1)); expect(payTierOf(g, g.userClubId)).toBe('serieB'); const m = monthlyOf(withOv(shape(g, g.userClubId, 99, 5), 100)); expect(m).toBeLessThanOrEqual(100_000); expect(m).toBeGreaterThan(70_000); });
  it('5. Série A: teto R$ 800.000 (nunca passa, mesmo com tudo no máximo)', () => { const g = br(clubOf(0)); expect(payTierOf(g, g.userClubId)).toBe('serieA'); const m = monthlyOf(withOv(shape(g, g.userClubId, 99, 5), 100)); expect(m).toBeLessThanOrEqual(800_000); expect(m).toBeGreaterThan(700_000); });
  it('6. grande clube europeu pode chegar a R$ 1 milhão, e não passa disso', () => {
    const p = pyramidOf('EN', 'premier-league'); const g0 = abroad('EN', 'premier-league', p[0].clubs[0].id);
    const g = withOv(shape(g0, g0.userClubId, 88, 5), 100);
    expect(payTierOf(g, g.userClubId)).toBe('europa');
    const m = monthlyOf(g); expect(m).toBeLessThanOrEqual(1_000_000); expect(m).toBeGreaterThan(900_000);
  });
  it('7. clube europeu pequeno não ganha como gigante: teto de R$ 800 mil e salário proporcional', () => {
    const p = pyramidOf('EN', 'premier-league'); const g0 = abroad('EN', 'premier-league', p[0].clubs[p[0].clubs.length - 1].id);
    const g = withOv(shape(g0, g0.userClubId, 60, 1), 100);
    expect(salaryRange(g, g.userClubId).max).toBe(800_000);
    expect(monthlyOf(g)).toBeLessThan(120_000);
    // reputação alta, elenco no nível alto, mas "clube pequeno" por reputação baixa: ainda sem o teto de 1 milhão
    const g2 = withOv(shape(g0, g0.userClubId, 88, 2), 100);
    expect(monthlyOf(g2)).toBeLessThanOrEqual(800_000);
  });
});

describe('Salário do treinador — qualidade do clube (50% elenco, 50% reputação) e overall do treinador', () => {
  const A = () => br(clubOf(0));
  it('8. overall e reputação altos: salário próximo do teto', () => { const g = withOv(shape(A(), clubOf(0), 85, 5), 74); expect(monthlyOf(g)).toBeGreaterThan(0.85 * 800_000); });
  it('9. reputação alta com elenco fraco: salário mediano, não o máximo; e o contrário também', () => {
    const base = withOv(A(), 74);
    const weakSquad = monthlyOf(shape(base, clubOf(0), 52, 5)), strong = monthlyOf(shape(base, clubOf(0), 85, 5)), strongLowRep = monthlyOf(shape(base, clubOf(0), 85, 2));
    expect(weakSquad).toBeLessThan(strong * 0.7); expect(weakSquad).toBeGreaterThan(strong * 0.15);
    expect(strongLowRep).toBeLessThan(strong); expect(strongLowRep).toBeGreaterThan(weakSquad * 0.8);
    expect(monthlyOf(shape(base, clubOf(0), 56, 1))).toBeLessThan(strong * 0.12);       // Série A fraca e sem reputação: muito menos
  });
  it('a média usa TODO o elenco (titulares e reservas), não só os 11 melhores', () => {
    const g = A(); const t = g.teams[clubOf(0)];
    const sorted = [...t.players].sort((a, b) => b.strength - a.strength);
    const g2: GameState = { ...g, teams: { ...g.teams, [clubOf(0)]: { ...t, players: t.players.map((p) => (sorted.slice(11).some((x) => x.id === p.id) ? { ...p, strength: 20 } : p)) } } };
    const all = g2.teams[clubOf(0)].players.reduce((a, p) => a + p.strength, 0) / g2.teams[clubOf(0)].players.length;
    expect(clubQuality(g2, clubOf(0)).ovr).toBeCloseTo(all, 6);
    expect(clubQuality(g2, clubOf(0)).quality).toBeLessThan(clubQuality(g, clubOf(0)).quality);
  });
  it('o overall do treinador valoriza o salário sem passar do teto', () => {
    const g = shape(A(), clubOf(0), 80, 5);
    const lo = monthlyOf(withOv(g, 15)), mid = monthlyOf(withOv(g, 55)), hi = monthlyOf(withOv(g, 100));
    expect(lo).toBeLessThan(mid); expect(mid).toBeLessThan(hi); expect(hi).toBeLessThanOrEqual(800_000);
  });
  it('salário dinâmico: muda com o elenco, a reputação e o overall, e a conta anual é exatamente 12 meses', () => {
    const g = A(); const m0 = monthlyOf(g);
    expect(monthlyOf(shape(g, clubOf(0), 85, 5))).toBeGreaterThan(m0);
    expect(coachSalary(g)).toBe(m0 * 12);                              // sem multiplicar nem dividir por 12 duas vezes
    expect(coachMonthly({ ...g, payMult: 5 })).toBeLessThanOrEqual(800_000);   // aumento negociado também respeita o teto
  });
});

describe('Overall do treinador', () => {
  it('12. começa pela dificuldade (Fácil 70, Normal 55, Difícil 30, Lendário exatamente 15), sem depender da reputação do perfil', () => {
    for (const rep of ['unknown', 'legend']) {
      const mk = (d: string) => newCareer({ saveName: 't', coach: { ...coach, reputation: rep }, difficulty: d, mode: 'career', season: 2026, userClubId: clubOf(3), divisions: brazilPyramid() }, 5);
      expect([mk('easy'), mk('normal'), mk('hard'), mk('legend')].map((g) => g.coachOverall)).toEqual([70, 55, 30, 15]);
    }
    expect(PAY_CONFIG.startOverall.legend).toBe(15);
  });
  it('10. sobe com vitórias seguidas e entrevistas respondidas (ignoradas não rendem), devagar', () => {
    let g = br(clubOf(0)); const o0 = coachOverallOf(g);
    for (let i = 0; i < 6; i++) g = coachAfterMatch(g, 2, 0);
    const afterWins = coachOverallOf(g);
    expect(afterWins).toBeGreaterThan(o0); expect(afterWins - o0).toBeLessThan(2);
    // entrevista respondida rende
    const ib = inboxOf(g);
    const msg = { id: 'MP1', kind: 'press' as const, from: 'Assessoria', title: 'Coletiva', body: '', season: g.season, round: g.round, expires: 99999, options: [{ id: 'praise', label: 'Elogiar', hint: '' }], status: 'open' as const };
    const answered = answerMessage({ ...g, inbox: { ...ib, msgs: [msg, ...ib.msgs] } }, 'MP1', 'praise');
    expect(coachOverallOf(answered)).toBeGreaterThan(afterWins);
    // entrevista ignorada (expira) não concede progresso
    const ignored = inboxTick({ ...g, round: g.round + 5, inbox: { ...ib, msgs: [{ ...msg, expires: 0 }, ...ib.msgs] } });
    expect(coachOverallOf(ignored)).toBeLessThanOrEqual(afterWins);
    // não chega a 100 em poucas partidas
    let h = withOv(br(clubOf(0), 'legend'), 15);
    for (let i = 0; i < 38; i++) h = coachAfterMatch(h, 3, 0);                 // uma temporada inteira só de vitórias
    expect(coachOverallOf(h)).toBeLessThan(40);
    for (let i = 0; i < 160; i++) h = coachAfterMatch(h, 3, 0);                // cinco temporadas perfeitas
    expect(coachOverallOf(h)).toBeLessThan(90);
  });
  it('11. cai com derrotas seguidas e temporada ruim (rebaixamento pesa mais que não cumprir a meta)', () => {
    let g = br(clubOf(0)); const o0 = coachOverallOf(g);
    for (let i = 0; i < 6; i++) g = coachAfterMatch(g, 0, 2);
    expect(coachOverallOf(g)).toBeLessThan(o0 - 0.6);
    const base = br(clubOf(0));
    const bad = coachOverallOf(coachSeasonEval(base, 19, 'relegated', 0)), meh = coachOverallOf(coachSeasonEval(base, 15, 'stay', 0)), great = coachOverallOf(coachSeasonEval(base, 1, 'stay', 1));
    expect(bad).toBeLessThan(meh); expect(meh).toBeLessThan(coachOverallOf(base)); expect(great).toBeGreaterThan(coachOverallOf(base));
    expect(bumpOverall(withOv(base, 2), -50).coachOverall).toBeGreaterThanOrEqual(1);
    expect(bumpOverall(withOv(base, 99), 50).coachOverall).toBeLessThanOrEqual(100);
  });
});

describe('Proposta de contrato no início da temporada', () => {
  it('13. aparece uma única vez por temporada, mesmo recarregando; aceitar mantém o clube; recusar libera o treinador sem apagar nada', () => {
    const g0 = br('palmeiras');
    const e = simulateToEnd({ ...g0, morale: { ...g0.morale, board: 90 } });
    let g = startNextSeason(e);
    const offers = () => inboxOf(g).msgs.filter((m) => m.kind === 'contract' && m.season === g.season);
    if (g.unemployed) return;                                              // (demitido na virada: sem proposta)
    expect(offers().length).toBe(1);
    expect(offers()[0].body).toContain('Overall do elenco'); expect(offers()[0].body).toContain('Overall do treinador'); expect(offers()[0].amount).toBe(coachMonthly(g));
    expect(g.coachOffer).toMatchObject({ season: g.season, status: 'pendente' });
    expect(postContractOffer(g)).toBe(g);                                  // repetir a rotina não duplica
    saveGame(g); const l = loadGame()!;
    expect(inboxOf(l).msgs.filter((m) => m.kind === 'contract' && m.season === l.season).length).toBe(1);
    expect(postContractOffer(l)).toBe(l);
    // aceitar
    const acc = answerMessage(g, offers()[0].id, 'accept');
    expect(acc.coachOffer?.status).toBe('aceita'); expect(acc.unemployed).toBeFalsy(); expect(acc.userClubId).toBe(g.userClubId);
    // recusar
    const ref = answerMessage(g, offers()[0].id, 'refuse');
    expect(ref.unemployed).toBe(true); expect(ref.coachOffer?.status).toBe('recusada');
    expect(ref.history.length).toBe(g.history.length); expect(ref.coach.name).toBe(g.coach.name); expect(ref.coachOverall).toBe(g.coachOverall);
    expect(ref.jobs![ref.jobs!.length - 1].ended).toBe('não renovou'); expect((ref.jobOffers ?? []).length).toBeGreaterThan(0);
    expect(balanceOf(ref)).toBe(balanceOf(g)); expect(ref.bank).toEqual(g.bank);
    // a temporada seguinte traz outra proposta (uma por temporada)
    const next = startNextSeason(simulateToEnd(acc));
    if (!next.unemployed) expect(inboxOf(next).msgs.filter((m) => m.kind === 'contract' && m.season === next.season).length).toBe(1);
  }, 300_000);
});

describe('Promoção e rebaixamento', () => {
  it('14. promoção: mensagem com o novo limite, uma vez só, e o salário passa a respeitar a faixa nova', () => {
    const g0 = br(clubOf(2));
    const up = (g: GameState): GameState => ({ ...g, divisions: g.divisions.map((d, i) => (i === 2 ? { ...d, clubIds: d.clubIds.filter((x) => x !== g.userClubId) } : i === 1 ? { ...d, clubIds: [...d.clubIds, g.userClubId] } : d)) });
    const g = payTierNotice(up(g0));
    const m = inboxOf(g).msgs.filter((x) => x.kind === 'tier');
    expect(m.length).toBe(1); expect(m[0].title).toBe('PROMOÇÃO'); expect(m[0].body).toContain('R$ 30.000'); expect(m[0].body).toContain('R$ 100.000'); expect(m[0].body).toContain('Série B');
    expect(payTierNotice(g)).toBe(g);                                       // sem repetir
    expect(payTierOf(g, g.userClubId)).toBe('serieB');
    expect(coachMonthly(g)).toBeLessThanOrEqual(100_000);
  });
  it('15. rebaixamento: mensagem explica o novo limite e o salário cai para a faixa de baixo', () => {
    const g0 = withOv(shape(br(clubOf(1)), clubOf(1), 66, 3), 70);
    const before = coachMonthly(g0);
    const down = (g: GameState): GameState => ({ ...g, divisions: g.divisions.map((d, i) => (i === 1 ? { ...d, clubIds: d.clubIds.filter((x) => x !== g.userClubId) } : i === 2 ? { ...d, clubIds: [...d.clubIds, g.userClubId] } : d)) });
    const g = payTierNotice(down(g0));
    const m = inboxOf(g).msgs.filter((x) => x.kind === 'tier');
    expect(m.length).toBe(1); expect(m[0].title).toBe('REBAIXAMENTO'); expect(m[0].body).toContain('R$ 30.000');
    expect(coachMonthly(g)).toBeLessThanOrEqual(30_000); expect(coachMonthly(g)).toBeLessThan(before);
    expect(payTierNotice(g)).toBe(g);
  });
});

describe('Pagamento mensal e extrato do banco', () => {
  const run = (g: GameState, days: number) => { const d0 = calOf(g).day; return processDays(g, d0, d0 + days); };
  it('16. cada pagamento vira uma entrada no extrato (descrição, clube, mês/ano, data, valor), sem creditar duas vezes', () => {
    const g0 = br('palmeiras');
    const d0 = calOf(g0).day; const pay = nextPayday(d0 + 1);
    const before = balanceOf(g0);
    const g = processDays(g0, d0, pay);
    const tx = g.bank!.txs.filter((t) => t.title === 'Salário de treinador');
    expect(tx.length).toBe(1);
    expect(tx[0].amount).toBe(coachMonthly(g0)); expect(tx[0].kind).toBe('income');
    expect(tx[0].detail).toContain(g0.clubs.palmeiras?.name ?? 'Atlético Santa Aurora'); expect(tx[0].detail).toMatch(/de 2026$/); expect(tx[0].day).toBe(pay);
    expect(formatDay(tx[0].day!)).toMatch(/^05\//);
    expect(balanceOf(g) - before).toBe(coachMonthly(g0));                   // creditado uma única vez no saldo pessoal
  });
  it('um pagamento por mês, nenhum antecipado, e o mês seguinte também paga', () => {
    const g0 = br('palmeiras'); const d0 = calOf(g0).day;
    const g = run(g0, 100);
    const n = g.bank!.txs.filter((t) => t.title === 'Salário de treinador').length;
    let paydays = 0; for (let d = d0 + 1; d <= d0 + 100; d++) if (nextPayday(d) === d) paydays++;
    expect(n).toBe(paydays); expect(paydays).toBeGreaterThanOrEqual(3);
    for (const t of g.bank!.txs) expect(t.day!).toBeLessThanOrEqual(d0 + 100);
    expect(new Set(g.bank!.txs.map((t) => t.id)).size).toBe(g.bank!.txs.length);
  });
  it('17. sem conta aberta o salário entra no saldo e fica no histórico; ao abrir a conta os pagamentos aparecem sem duplicar', () => {
    const g0 = br('palmeiras'); expect(hasBank(g0)).toBe(false);
    const g = run(g0, 70);
    expect(hasBank(g)).toBe(false); expect(balanceOf(g)).toBeGreaterThan(balanceOf(g0));
    const pending = g.bank!.txs.filter((t) => t.title === 'Salário de treinador').length; expect(pending).toBeGreaterThanOrEqual(2);
    const r = registerBank(g, 'Carlos Almeida', 'senha123', 'senha123'); if (!r.ok) throw new Error(r.error);
    expect(r.state.bank!.txs.filter((t) => t.title === 'Salário de treinador').length).toBe(pending);
    expect(balanceOf(r.state)).toBe(balanceOf(g));
    // próximo pagamento depois de abrir a conta continua somando sem apagar os antigos
    const g2 = run(r.state, 40);
    expect(g2.bank!.txs.filter((t) => t.title === 'Salário de treinador').length).toBeGreaterThan(pending);
    expect(g2.bank!.passHash).toBe(r.state.bank!.passHash);
  });
  it('18. recarregar o jogo ou processar o mesmo dia de novo não paga nem registra duas vezes', () => {
    const g0 = br('palmeiras'); const d0 = calOf(g0).day; const pay = nextPayday(d0 + 1);
    const g = processDays(g0, d0, pay);
    saveGame(g); const l = loadGame()!;
    expect(l.coachMoney).toBe(g.coachMoney); expect(l.bank!.txs.length).toBe(g.bank!.txs.length);
    const again = processDays(l, d0, pay);                                  // o mesmo intervalo, de novo
    expect(balanceOf(again)).toBe(balanceOf(g)); expect(again.bank!.txs.length).toBe(g.bank!.txs.length);
    expect(payMonthlySalaries({ ...l, cal: { ...calOf(l), day: pay } })).toEqual({ ...l, cal: { ...calOf(l), day: pay } }); // guarda do dia
    expect(recordSalaryTx(l)).toBe(l);
  });
  it('desempregado não recebe salário', () => {
    const g0 = { ...br('palmeiras'), unemployed: true } as GameState; const d0 = calOf(g0).day;
    const g = processDays(g0, d0, d0 + 70);
    expect(g.bank?.txs.filter((t) => t.title === 'Salário de treinador').length ?? 0).toBe(0); expect(balanceOf(g)).toBe(balanceOf(g0));
  });
});

describe('Saves antigos e reputação', () => {
  it('save antigo (sem overall do treinador): ganha o valor da dificuldade e preserva saldo, histórico bancário e carreira', () => {
    const g0 = processDays(br('palmeiras', 'hard'), toDay(2026, 1, 12), toDay(2026, 3, 1));
    const old = JSON.parse(JSON.stringify(g0)) as GameState & Record<string, unknown>;
    for (const k of ['coachOverall', 'coachStreak', 'coachOffer', 'payTier', 'salaryPaidDay', 'salaryPaid', 'repPressure', 'schema']) delete old[k];
    const { game, report } = migrateGame(old as GameState);
    expect(report.failed).toEqual([]); expect(report.rejected).toBe(false);
    expect(game.coachOverall).toBe(30);
    expect(game.coachMoney).toBe(g0.coachMoney); expect(game.bank).toEqual(g0.bank); expect(game.userClubId).toBe(g0.userClubId); expect(game.history).toEqual(g0.history);
    expect(game.payTier?.tier).toBe('serieA');
    expect(migrateGame(game).game).toBe(game);                                   // idempotente
  });
  it('reputação: sobe 1 ponto só depois de 2 temporadas seguidas com elenco no nível do porte seguinte, nunca passa de 5', () => {
    const g = br(clubOf(1));
    // clube da B com elenco no nível médio da A (top)
    const club = clubOf(1);
    const strong = shape(g, club, 90, g.clubs[club].reputation);
    const r1 = reputationDrift(strong);
    expect(r1.clubs[club].reputation).toBe(g.clubs[club].reputation);               // 1ª temporada: só pressão
    expect(r1.repPressure![club]).toBe(1);
    const r2 = reputationDrift(r1);
    expect(r2.clubs[club].reputation).toBe(g.clubs[club].reputation + 1);           // 2ª: sobe 1
    expect(r2.repPressure![club]).toBeUndefined();
    const top = shape(g, clubOf(0), 99, 5);
    expect(reputationDrift(reputationDrift(top)).clubs[clubOf(0)].reputation).toBeLessThanOrEqual(5);
    // elenco fraco desfaz a pressão
    expect(reputationDrift({ ...r1, teams: g.teams }).repPressure![club]).toBeUndefined();
  });
});
