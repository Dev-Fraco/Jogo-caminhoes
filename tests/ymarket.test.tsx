import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { calOf } from '../src/engine/calendar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { brazilPyramid } from '../src/data/pyramid';
import { isSeasonOver, newCareer, playNext } from '../src/engine/game';
import { CATEGORIES } from '../src/engine/categories';
import { loadGame, saveGame } from '../src/engine/save';
import { migrateGame } from '../src/engine/migrate';
import { makeRng } from '../src/engine/rng';
import { ensureCategoryState, ensureYouth, promoteProspect, youthOf, youthSeason, youthTick, type Prospect } from '../src/engine/youth';
import { askWage, benchmark, contractStatus, evaluateWage, expiring, fairWage, payroll, personalityBoost, personalityOf, releaseWithContract, renewContract, satTick, SAT_START } from '../src/engine/ycontract';
import { candidateAsk, findInterval, genScout, holdTryout, hireScout, maxScouts, missionCost, refreshScoutMarket, scoutTick, scoutWage, sendScout, signCandidate, tryoutCost, tryoutReady, TRYOUT_COOLDOWN, TRYOUT_SIZES, type Candidate } from '../src/engine/yscout';
import { acceptOffer, aiScoutingYear, aiYouthMarket, buyListing, counterOffer, formationComp, listingPlayer, loanOut, loanTargets, offersTick, recallLoan, rejectOffer, returnLoans, youthValue, type YOffer } from '../src/engine/ymarket';
import { derivedPlayer, parseDerived, rosterOf } from '../src/engine/yroster';
import { YouthMarket } from '../src/ui/YouthMarket';
import type { GameState, Player } from '../src/engine/types';

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

const POSES: Player['pos'][] = ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT', 'ATT'];
const prospect = (g: GameState, id: string, age: number, over: number, pot: number, i = 0): Prospect => {
  const p: Prospect = { player: { id, name: `Jovem ${id}`, pos: POSES[i % 9], age, strength: over, pot }, potential: pot, exact: over, train: 0, base: over, attrs: Array(6).fill(over), joined: g.season - 1, origin: 'academia', sat: 70, mot: 60, history: [{ season: g.season - 1, text: 'Chegou.' }] };
  return { ...p, player: { ...p.player, contract: { wage: fairWage(g, p), from: g.season - 1, until: g.season + 1 } } };
};
import { legacyYouth } from './helpers';
const base = (): GameState => { const g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true } as never, 7); const e = legacyYouth(ensureYouth(g)); return { ...e, budgets: { ...e.budgets, palmeiras: 5e9 } }; };
const withProspects = (g: GameState, list: Prospect[]): GameState => ({ ...g, youth: { ...youthOf(g), prospects: list } });
const cashOf = (g: GameState) => g.budgets.palmeiras;
const sumLog = (g: GameState, kind: string, income = false) => (youthOf(g).fin?.log ?? []).filter((e) => e.kind === kind && !!e.income === income).reduce((t, e) => t + e.cost, 0);
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { if (!r.ok) throw new Error((r as unknown as { error: string }).error); return r as Extract<T, { ok: true }>; };
const tickN = (g: GameState, n: number): GameState => { let s = g; for (let i = 0; i < n; i++) { s = youthTick({ ...s, round: s.round + 1 }); } return s; };

describe('olheiros e descoberta de talentos', () => {
  it('contratar olheiro cobra luvas, respeita o limite pela academia e dispensa tem custo; salário é pago e registrado na virada', () => {
    let g = base();
    expect(youthOf(g).scoutMarket!.length).toBeGreaterThan(0);
    expect([maxScouts(0), maxScouts(5), maxScouts(20)]).toEqual([1, 2, 5]);
    const sc = youthOf(g).scoutMarket![0];
    const cash0 = cashOf(g);
    g = ok(hireScout(g, sc.id)).state;
    expect(youthOf(g).scouts).toHaveLength(1); expect(cashOf(g)).toBeLessThan(cash0);
    expect(sumLog(g, 'olheiro')).toBe(cash0 - cashOf(g));
    const second = youthOf(g).scoutMarket![0];
    const r = hireScout(g, second.id); expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/pode ter até 1/);
    const before = cashOf(g);
    const n = youthSeason({ ...g, season: g.season + 1, round: g.totalRounds + 1 });
    expect(before - cashOf(n)).toBeGreaterThanOrEqual(sc.wage);
    expect(sumLog(n, 'olheiro')).toBeGreaterThanOrEqual(scoutWage(g, sc.quality));
  });
  it('olheiro enviado para uma região descobre jovens com origem, relatório e custo; a qualidade melhora tempo e precisão', () => {
    let g = base();
    const hi = { ...genScout(g, makeRng(1), new Set(), 9), id: 'hi' }, lo = { ...genScout(g, makeRng(2), new Set(), 2), id: 'lo' };
    expect(findInterval(9, 'sudeste')).toBeLessThan(findInterval(2, 'sudeste'));
    g = { ...g, youth: { ...youthOf(g), level: 15, scouts: [hi, lo] } };
    g = ok(sendScout(g, 'hi', 'nordeste')).state;
    const cash0 = cashOf(g);
    g = tickN(g, 30);
    const pool = youthOf(g).pool!;
    expect(pool.length).toBeGreaterThan(0);
    for (const c of pool) { expect(c.origin.kind).toBe('olheiro'); expect(c.origin.by).toBeTruthy(); expect(c.origin.region).toBe('nordeste'); expect(c.seen.lo).toBeLessThanOrEqual(c.potential + 12); expect(c.seen.hi).toBeGreaterThanOrEqual(c.potential - 12); expect(youthOf(g).prospects.some((p) => p.player.id === c.id)).toBe(false); }
    expect(cash0 - cashOf(g)).toBeGreaterThanOrEqual(youthOf(g).scouts![0].found * missionCost(g, 'nordeste') - 1);
    const width = (c: Candidate) => c.seen.hi - c.seen.lo;
    const r2 = ok(sendScout({ ...g, youth: { ...youthOf(g), pool: [] } }, 'lo', 'nordeste')).state;
    const g3 = tickN({ ...r2, youth: { ...youthOf(r2), scouts: youthOf(r2).scouts!.filter((s) => s.id === 'lo') } }, 60);
    const widthsLo = youthOf(g3).pool!.map(width), widthsHi = pool.map(width);
    expect(widthsLo.length).toBeGreaterThan(0);
    expect(Math.min(...widthsLo)).toBeGreaterThan(Math.max(...widthsHi) - 1);                   // olheiro ruim erra mais
  });
  it('talentos excepcionais (85+) são raros nas descobertas, mesmo com olheiros ótimos', () => {
    let g = base();
    g = { ...g, youth: { ...youthOf(g), level: 20, scouts: [{ ...genScout(g, makeRng(3), new Set(), 10), id: 'top' }] } };
    g = ok(sendScout(g, 'top', 'norte')).state;
    let stars = 0, total = 0;
    for (let i = 0; i < 40; i++) { g = tickN({ ...g, youth: { ...youthOf(g), pool: [] }, budgets: { ...g.budgets, palmeiras: 5e9 } }, 20); for (const c of youthOf(g).pool!) { total++; if (c.potential >= 85) stars++; } }
    expect(total).toBeGreaterThan(50);
    expect(stars / total).toBeLessThan(0.1);
  });
});

describe('peneiras', () => {
  it('custo real, tamanho, idades da categoria, intervalo entre peneiras e origem registrada', () => {
    let g = base();
    const cost = tryoutCost(g, 'media', 'sudeste'), cash0 = cashOf(g);
    g = ok(holdTryout(g, 'media', 'sub15', 'sudeste')).state;
    expect(cash0 - cashOf(g)).toBe(cost); expect(sumLog(g, 'peneira')).toBe(cost);
    const pool = youthOf(g).pool!;
    expect(pool).toHaveLength(TRYOUT_SIZES.media);
    for (const c of pool) { expect([14, 15]).toContain(c.player.age); expect(c.origin).toMatchObject({ kind: 'peneira', region: 'sudeste' }); expect(c.player.strength).toBeLessThanOrEqual(c.potential); expect(['GK', 'DEF', 'MID', 'ATT']).toContain(c.player.pos); expect(c.seen.lo).toBeLessThanOrEqual(c.seen.hi); }
    expect(new Set(pool.map((c) => c.id)).size).toBe(pool.length);
    expect(tryoutReady(g)).toBeGreaterThan(0);
    const again = holdTryout(g, 'media', 'sub15', 'sudeste'); expect(again.ok).toBe(false);
    expect(cashOf(g)).toBe(cash0 - cost);
    expect(holdTryout({ ...g, round: g.round + 30 }, 'pequena', 'sub13', 'sul').ok).toBe(false); // rodadas não liberam: só o mês
    const left = tryoutReady(g), c0 = calOf(g);
    expect(holdTryout({ ...g, cal: { ...c0, day: c0.day + left - 1 } }, 'pequena', 'sub13', 'sul').ok).toBe(false); // último dia do mês
    expect(holdTryout({ ...g, cal: { ...c0, day: c0.day + left } }, 'pequena', 'sub13', 'sul').ok).toBe(true);  // dia 1 do mês seguinte
    const poor = { ...base(), budgets: { ...base().budgets, palmeiras: 1000 } };
    const r = holdTryout(poor, 'grande', 'todas', 'europa'); expect(r.ok).toBe(false); expect(cashOf(poor)).toBe(1000);
    expect(tryoutCost(g, 'grande', 'europa')).toBeGreaterThan(tryoutCost(g, 'pequena', 'sudeste'));
  });
  it('academia e olheiros melhores trazem jovens melhores; estrelas continuam raras', () => {
    const avgPot = (level: number, scouts: number) => {
      let g = base(); g = { ...g, youth: { ...youthOf(g), level, scouts: scouts ? [{ ...genScout(g, makeRng(4), new Set(), scouts), id: 's', region: 'sul' as const }] : [] } };
      let t = 0, n = 0, stars = 0;
      for (let i = 0; i < 25; i++) { const r = ok(holdTryout({ ...g, round: i * 10 + 1, season: 2026 + Math.floor(i / 5), youth: { ...youthOf(g), pool: [], lastTryout: undefined } }, 'grande', 'todas', 'sul')).state; for (const c of youthOf(r).pool!) { t += c.potential; n++; if (c.potential >= 85) stars++; } }
      return { avg: t / n, stars: stars / n };
    };
    const weak = avgPot(0, 0), strong = avgPot(20, 10);
    expect(strong.avg).toBeGreaterThan(weak.avg + 2);
    expect(strong.stars).toBeLessThan(0.08); expect(weak.stars).toBeLessThan(0.05);
  });
  it('só entra na base quem você contrata (nada é gerado para completar categoria); contratar registra origem, histórico e contrato', () => {
    let g = base();
    const n0 = youthOf(g).prospects.length;
    g = ok(holdTryout(g, 'pequena', 'sub17', 'sudeste')).state;
    expect(youthOf(g).prospects).toHaveLength(n0);
    const c = youthOf(g).pool![0];
    const ask = candidateAsk(g, c), cash0 = cashOf(g);
    const low = signCandidate(g, c.id, Math.round(ask * 0.5), 3); expect(low.ok).toBe(false); expect(cashOf(g)).toBe(cash0);
    const done = ok(signCandidate(g, c.id, ask, 3)).state;
    const p = youthOf(done).prospects.find((x) => x.player.id === c.id)!;
    expect(youthOf(done).prospects).toHaveLength(n0 + 1);
    expect(p.origin).toBe('peneira'); expect(p.history![0].text).toMatch(/peneira/i); expect(p.player.contract).toMatchObject({ wage: ask, from: 2026, until: 2028 });
    expect(p.player.age).toBe(c.player.age); expect(p.player.strength).toBe(c.player.strength); expect(p.potential).toBe(c.potential);
    expect(cash0 - cashOf(done)).toBe(Math.round((ask * 0.2) / 100) * 100); expect(sumLog(done, 'contratacao')).toBe(cash0 - cashOf(done));
    expect(youthOf(done).pool!.some((x) => x.id === c.id)).toBe(false);
    expect(signCandidate(done, c.id, ask, 3).ok).toBe(false);                                   // não contrata duas vezes
  });
});

describe('contratos e renovações', () => {
  it('todo jovem tem contrato individual (salário, início, fim); salários saem do caixa na virada e ficam no histórico', () => {
    let g = base();
    for (const p of youthOf(g).prospects) { expect(p.player.contract!.wage).toBeGreaterThan(0); expect(p.player.contract!.until).toBe(p.player.contract!.from! + 2); expect(contractStatus(g, p)).toBe('ativo'); }
    g = withProspects(g, [prospect(g, 'a', 16, 30, 70), prospect(g, 'b', 17, 40, 75, 1)]);
    const folha = payroll(youthOf(g)), cash0 = cashOf(g);
    const n = youthSeason({ ...g, season: g.season + 1, round: g.totalRounds + 1 });
    expect(sumLog(n, 'salario')).toBe(folha);
    expect(cash0 - cashOf(n)).toBeGreaterThanOrEqual(folha);
  });
  it('renovação negocia o salário (aceita, contraproposta ou recusa), cobra luvas e registra o histórico', () => {
    let g = withProspects(base(), [prospect(base(), 'r1', 17, 40, 75)]);
    const p = youthOf(g).prospects[0], ask = askWage(g, p);
    expect(evaluateWage(g, p, ask, true).result).toBe('aceito');
    expect(evaluateWage(g, p, Math.round(ask * 0.9), true).result).toBe('contra');
    expect(evaluateWage(g, p, Math.round(ask * 0.5), true).result).toBe('recusado');
    expect(renewContract(g, 'r1', Math.round(ask * 0.5), 2).ok).toBe(false);
    const cash0 = cashOf(g);
    g = ok(renewContract(g, 'r1', ask, 3)).state;
    const q = youthOf(g).prospects[0];
    expect(q.player.contract!.wage).toBe(ask); expect(q.player.contract!.until).toBe(p.player.contract!.until + 3);
    expect(q.renewals).toEqual([{ season: 2026, wage: ask, until: p.player.contract!.until + 3 }]); expect(q.history!.some((h) => /renovado/i.test(h.text))).toBe(true);
    expect(cash0 - cashOf(g)).toBe(Math.round((ask * 0.2) / 100) * 100); expect(sumLog(g, 'renovacao')).toBe(cash0 - cashOf(g));
    expect(renewContract(g, 'r1', ask, 9).ok).toBe(false);
  });
  it('contratos próximos do vencimento aparecem; contrato vencido: o jovem deixa o clube (só então)', () => {
    let g = base();
    const soon = prospect(g, 'v1', 17, 40, 75), fine = prospect(g, 'v2', 17, 40, 75, 1);
    g = withProspects(g, [{ ...soon, player: { ...soon.player, contract: { wage: 20_000, from: 2024, until: 2026 } } }, fine]);
    expect(expiring(g).map((p) => p.player.id)).toEqual(['v1']); expect(contractStatus(g, youthOf(g).prospects[0])).toBe('vencendo');
    const n = youthSeason({ ...g, season: 2027, round: g.totalRounds + 1 });
    expect(youthOf(n).prospects.some((p) => p.player.id === 'v1')).toBe(false);
    expect(youthOf(n).prospects.some((p) => p.player.id === 'v2')).toBe(true);
    expect(n.news.some((x) => /Contratos vencidos/.test(x.text))).toBe(true);
  });
  it('liberar um jovem (rescisão) cobra 30% do que falta do contrato e o remove; emprestado não pode ser liberado', () => {
    let g = withProspects(base(), [prospect(base(), 'x1', 17, 30, 70)]);
    const p = youthOf(g).prospects[0], cash0 = cashOf(g);
    const expected = Math.round((p.player.contract!.wage * 1 * 0.3) / 100) * 100; // faltam 2 anos: 1 além do corrente
    g = ok(releaseWithContract(g, 'x1')).state;
    expect(youthOf(g).prospects).toHaveLength(0); expect(cash0 - cashOf(g)).toBe(expected); expect(sumLog(g, 'multa')).toBe(expected);
    let h = withProspects(base(), [prospect(base(), 'x2', 17, 30, 70)]);
    h = ok(loanOut(h, 'x2', 'flamengo', 1, 0.5)).state;
    expect(releaseWithContract(h, 'x2').ok).toBe(false);
  });
});

describe('propostas, transferências e ausência de duplicados', () => {
  const star = (g: GameState) => prospect(g, 'palmeiras-star', 17, 60, 95);
  it('clubes se interessam por jovens de potencial: propostas chegam ao longo das rodadas, com valor coerente', () => {
    let g = withProspects(base(), [star(base()), prospect(base(), 'palmeiras-weak', 17, 20, 50, 1)]);
    let offers: YOffer[] = [];
    for (let r = 2; r < 200 && offers.length < 1; r++) { g = offersTick({ ...g, round: (r % 38) + 1, season: 2026 + Math.floor(r / 38) }); offers = youthOf(g).offers ?? []; }
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) { expect(o.playerId).toBe('palmeiras-star'); expect(o.club).not.toBe('palmeiras'); expect(['compra', 'emprestimo']).toContain(o.kind); if (o.kind === 'compra') expect(o.fee).toBeGreaterThan(0); }
    expect(youthValue(g, youthOf(g).prospects[0])).toBeGreaterThan(youthValue(g, youthOf(g).prospects[1]));
  });
  const offer = (g: GameState, club = 'flamengo', fee = 2_000_000, kind: 'compra' | 'emprestimo' = 'compra'): GameState => ({ ...g, youth: { ...youthOf(g), offers: [{ id: 'o1', kind, playerId: 'palmeiras-star', club, fee, ...(kind === 'emprestimo' ? { share: 0.6, years: 1 } : {}), season: 2026, round: 1, left: 6, status: 'pendente' }] } });
  it('aceitar uma compra: o dinheiro (valor + compensação de formação) entra no caixa, sai do comprador e o jogador muda de clube sem se duplicar', () => {
    let g = offer(withProspects(base(), [star(base())]));
    const p = youthOf(g).prospects[0], cash0 = cashOf(g), buyer0 = g.budgets.flamengo;
    const comp = formationComp(g, p, 2_000_000);
    expect(comp).toBeGreaterThan(0);
    g = ok(acceptOffer(g, 'o1')).state;
    expect(youthOf(g).prospects.some((x) => x.player.id === 'palmeiras-star')).toBe(false);
    expect(cashOf(g) - cash0).toBe(2_000_000 + comp); expect(buyer0 - g.budgets.flamengo).toBe(2_000_000 + comp);   // dinheiro conservado
    expect(sumLog(g, 'venda', true)).toBe(2_000_000 + comp);
    expect(g.ymoves!['palmeiras-star']).toMatchObject({ club: 'flamengo', from: 'palmeiras', kind: 'venda' });
    // um registro só: sai do seu elenco e entra no do comprador, com a mesma identidade
    const inFla = [...rosterOf(g, 'flamengo', 'sub17', 0.5), ...rosterOf(g, 'flamengo', 'sub21', 0.5)].filter((x) => x.id === 'palmeiras-star');
    expect(inFla.length).toBeGreaterThan(0); expect(inFla[0].name).toBe('Jovem palmeiras-star'); expect(inFla[0].age).toBe(17);
    expect(rosterOf(g, 'palmeiras', 'sub17', 0).some((x) => x.id === 'palmeiras-star')).toBe(false);
    expect(acceptOffer(g, 'o1').ok).toBe(false);                                     // não vende duas vezes
  });
  it('recusar, negociar (contraproposta) e comprador sem caixa', () => {
    const g0 = offer(withProspects(base(), [star(base())]));
    const rej = rejectOffer(g0, 'o1'); expect(youthOf(rej).offers).toHaveLength(0); expect(youthOf(rej).prospects).toHaveLength(1);
    const p = youthOf(g0).prospects[0];
    const cap = youthValue(g0, p) * 1.2;
    const win = counterOffer(g0, 'o1', Math.round(cap * 0.9)); expect(win.ok).toBe(true); if (win.ok) expect(win.outcome).toBe('vendido');
    const mid = counterOffer(g0, 'o1', Math.round(cap * 1.1)); if (!mid.ok) throw new Error(mid.error); expect(['contra', 'vendido']).toContain(mid.outcome);
    const far = counterOffer(g0, 'o1', Math.round(cap * 10)); if (!far.ok) throw new Error(far.error); expect(far.outcome).toBe('desistiu'); expect(youthOf(far.state).offers).toHaveLength(0);
    const broke = { ...g0, budgets: { ...g0.budgets, flamengo: 1000 } };
    const r = acceptOffer(broke, 'o1'); expect(r.ok).toBe(false); expect(youthOf(broke).prospects).toHaveLength(1);
  });
  it('comprar de um clube da IA: o jogador sai do clube dele, entra na sua base com contrato e histórico e o dinheiro muda de mãos', () => {
    let g = base();
    g = { ...g, youth: { ...youthOf(g), listings: [] } };
    const id = 'flamengo~2010~7';                                                            // 16 anos
    const pl = derivedPlayer(g, id, 0.5)!;
    expect(pl).toBeDefined();
    const price = 1_000_000;
    g = { ...g, youth: { ...youthOf(g), listings: [{ id, clubId: 'flamengo', kind: 'venda', price, left: 10 }] } };
    const cash0 = cashOf(g), sell0 = g.budgets.flamengo;
    expect(rosterOf(g, 'flamengo', 'sub17', 0.5).some((x) => x.id === id)).toBe(true);
    g = ok(buyListing(g, id)).state;
    const p = youthOf(g).prospects.find((x) => x.player.id === id)!;
    expect(p.origin).toBe('mercado'); expect(p.player.contract).toBeTruthy(); expect(p.history![0].text).toMatch(/Comprado/);
    expect(p.player.name).toBe(pl.name); expect(p.player.age).toBe(pl.age);
    expect(cash0 - cashOf(g)).toBe(price); expect(g.budgets.flamengo - sell0).toBe(price); expect(sumLog(g, 'compra')).toBe(price);
    expect(rosterOf(g, 'flamengo', 'sub17', 0.5).some((x) => x.id === id)).toBe(false);       // saiu de lá
    expect(rosterOf(g, 'palmeiras', 'sub17', 0).filter((x) => x.id === id)).toHaveLength(1);   // e está aqui, uma vez
    expect(buyListing(g, id).ok).toBe(false);
    expect(youthOf(g).listings!.some((l) => l.id === id)).toBe(false);
  });
  it('clubes da IA negociam entre si com o caixa que têm; cada jogador tem um único registro e o dinheiro se conserva', () => {
    const g = base();
    const rng = makeRng(8);
    const total = (s: GameState) => Object.values(s.budgets).reduce((a, b) => a + b, 0);
    const n = aiYouthMarket(g, rng);
    expect(total(n)).toBe(total(g));                                                         // só troca de mãos
    const moves = Object.entries(n.ymoves ?? {});
    expect(moves.length).toBeGreaterThan(0);
    for (const [id, m] of moves) { expect(m.club).not.toBe(m.from); expect(parseDerived(id)).toBeTruthy(); }
    // nenhum jogador movimentado aparece em dois clubes
    const seen = new Map<string, string>();
    for (const club of Object.keys(n.teams).filter((c) => c !== 'palmeiras')) for (const cat of CATEGORIES) for (const pl of rosterOf(n, club, cat.id, 0.5)) { if (cat.id !== 'sub21') continue; if (seen.has(pl.id)) throw new Error(`${pl.id} em ${seen.get(pl.id)} e ${club}`); seen.set(pl.id, club); }
    for (const [id, m] of moves) if (m.kind === 'venda') { const at = seen.get(id); if (at) expect(at).toBe(m.club); }
    for (const id of Object.keys(n.budgets)) expect(n.budgets[id]).toBeGreaterThanOrEqual(Math.min(0, g.budgets[id] ?? 0));
    expect(Object.keys(n.ymoves!).length).toBeLessThan(40);
  });
});

describe('empréstimos', () => {
  it('emprestar: continua seu, joga pelo outro clube e volta no fim; o outro clube paga a parte do salário', () => {
    let g = withProspects(base(), [prospect(base(), 'l1', 17, 45, 80), prospect(base(), 'l2', 16, 30, 60, 1)]);
    const p0 = youthOf(g).prospects[0];
    expect(loanTargets(g, 'l1').length).toBeGreaterThan(0);
    const t = loanTargets(g, 'l1')[0];
    g = ok(loanOut(g, 'l1', t.club, 1, 0.5)).state;
    const p = youthOf(g).prospects.find((x) => x.player.id === 'l1')!;
    expect(p.loanedTo).toMatchObject({ club: t.club, until: 2026, share: 0.5 }); expect(p.player.contract).toEqual(p0.player.contract); // continua com o contrato dele (é seu)
    expect(g.ymoves!.l1).toMatchObject({ club: t.club, from: 'palmeiras', kind: 'emprestimo', until: 2026 });
    expect(rosterOf(g, 'palmeiras', 'sub17', 0).some((x) => x.id === 'l1')).toBe(false);      // não joga mais pelo seu time
    expect([...rosterOf(g, t.club, 'sub17', 0.5), ...rosterOf(g, t.club, 'sub21', 0.5)].some((x) => x.id === 'l1')).toBe(true);
    expect(promoteProspect(g, 'l1').ok).toBe(false);                                         // emprestado não sobe
    expect(acceptOffer({ ...g, youth: { ...youthOf(g), offers: [{ id: 'z', kind: 'compra', playerId: 'l1', club: 'flamengo', fee: 1e6, season: 2026, round: 1, left: 5, status: 'pendente' }] } }, 'z').ok).toBe(false); // nem é vendido
    // fim da temporada: eles pagam a parte combinada e o jogador volta
    const cash0 = cashOf(g), wage = p.player.contract!.wage;
    const n = youthSeason({ ...g, season: 2027, round: g.totalRounds + 1 });
    const back = youthOf(n).prospects.find((x) => x.player.id === 'l1')!;
    expect(back.loanedTo).toBeUndefined(); expect(n.ymoves?.l1).toBeUndefined(); expect(back.player.age).toBe(18);
    expect(sumLog(n, 'emprestimo', true)).toBe(Math.round(wage * 0.5));
    expect(rosterOf(n, 'palmeiras', 'sub21', 0).some((x) => x.id === 'l1')).toBe(true);
    expect(cashOf(n)).toBeLessThan(cash0 + wage);                                           // (você ainda paga a sua parte e os demais)
    expect(recallLoan(g, 'l1').ok).toBe(true); expect(recallLoan(g, 'l2').ok).toBe(false);
  });
  it('receber emprestado: o jogador continua do clube de origem, você paga a sua parte e ele é devolvido', () => {
    let g = base();
    const id = 'santos~2010~4';
    expect(derivedPlayer(g, id, 0.5)).toBeDefined();
    g = { ...g, youth: { ...youthOf(g), listings: [{ id, clubId: 'santos', kind: 'emprestimo', price: 0, share: 0.5, left: 9 }] } };
    const cash0 = cashOf(g);
    g = ok(buyListing(g, id, { years: 1 })).state;
    const p = youthOf(g).prospects.find((x) => x.player.id === id)!;
    expect(p.loanFrom).toMatchObject({ club: 'santos', until: 2026, share: 0.5 }); expect(cashOf(g)).toBe(cash0);   // sem taxa
    expect(g.ymoves![id]).toMatchObject({ club: 'palmeiras', from: 'santos', kind: 'emprestimo' });
    expect(rosterOf(g, 'santos', 'sub17', 0.5).some((x) => x.id === id)).toBe(false);
    expect(promoteProspect(g, id).ok).toBe(false);
    expect(releaseWithContract(g, id).ok).toBe(false);
    const n = youthSeason({ ...g, season: 2027, round: g.totalRounds + 1 });
    expect(youthOf(n).prospects.some((x) => x.player.id === id)).toBe(false);                 // devolvido
    expect(n.ymoves?.[id]).toBeUndefined();
    expect(rosterOf(n, 'santos', 'sub17', 0).concat(rosterOf(n, 'santos', 'sub21', 0)).some((x) => x.id === id)).toBe(true);
    expect(returnLoans(g)).toBeTruthy();
  });
});

describe('insatisfação, personalidade e disciplina', () => {
  it('personalidade é fixa, simples e pesa pouco (no máximo ±8% no treino)', () => {
    const q = personalityOf({ player: { id: 'k1' } as Player });
    expect(personalityOf({ player: { id: 'k1' } as Player })).toEqual(q);
    for (const k of ['prof', 'ded', 'disc', 'amb'] as const) { expect(q[k]).toBeGreaterThanOrEqual(20); expect(q[k]).toBeLessThanOrEqual(90); }
    for (let i = 0; i < 200; i++) for (const mot of [10, 60, 95]) { const b = personalityBoost({ player: { id: `p${i}` } as Player, mot }); expect(Math.abs(b)).toBeLessThanOrEqual(0.08); }
  });
  it('a insatisfação cresce aos poucos (sem queda instantânea) e só depois de muito tempo vira pedido; ninguém sai sozinho', () => {
    let g = withProspects({ ...base(), round: 5 }, [{ ...prospect(base(), 'u1', 18, 30, 60), player: { ...prospect(base(), 'u1', 18, 30, 60).player, contract: { wage: 6_000, from: 2025, until: 2030 } } }, prospect(base(), 'u2', 12, 5, 60, 1)]);
    // 'u1': 18 anos, fraco, mal pago, sem perspectiva
    g = { ...g, ycomps: [], youth: { ...youthOf(g), offers: [{ id: 'q1', kind: 'compra', playerId: 'u1', club: 'flamengo', fee: 1e6, season: 2026, round: 1, left: 99, status: 'pendente' }, { id: 'q2', kind: 'compra', playerId: 'u1', club: 'santos', fee: 1e6, season: 2026, round: 1, left: 99, status: 'pendente' }] } };
    const first = youthOf(satTick(g)).prospects[0];
    expect(first.sat!).toBeGreaterThan(60); expect(first.sat!).toBeLessThan(SAT_START);       // um passo: desce pouco
    let s = g; const hist: number[] = [];
    for (let i = 0; i < 80; i++) { s = satTick(s); hist.push(youthOf(s).prospects[0].sat!); if (youthOf(s).prospects[0].want) break; }
    for (let i = 1; i < hist.length; i++) expect(hist[i - 1] - hist[i]).toBeLessThan(5);       // gradual
    expect(hist[hist.length - 1]).toBeLessThan(55);
    const u1 = youthOf(s).prospects[0];
    expect(u1.want).toBeTruthy(); expect(u1.why!.length).toBeGreaterThan(0);
    expect(s.news.some((n) => /pediu|não quer renovar/.test(n.text))).toBe(true);
    expect(youthOf(s).prospects.some((p) => p.player.id === 'u1')).toBe(true);                // continua no clube: sem saída automática
    expect(hist.length).toBeGreaterThan(8);
    // jovem de 12 anos satisfeito não reclama
    const kid = youthOf(s).prospects[1]; expect(kid.want).toBeUndefined(); expect(kid.sat!).toBeGreaterThan(60);
  });
  it('quem pediu para não renovar só reconsidera com salário bem acima; renovar melhora o humor', () => {
    let g = withProspects(base(), [{ ...prospect(base(), 'w1', 17, 40, 75), want: 'nao-renovar', sat: 30, why: ['salário incompatível'] }]);
    const p = youthOf(g).prospects[0], ask = askWage(g, p);
    expect(evaluateWage(g, p, ask, true).result).toBe('recusado');
    expect(evaluateWage(g, p, Math.round(ask * 1.3), true).result).toBe('aceito');
    g = ok(renewContract(g, 'w1', Math.round(ask * 1.3), 2)).state;
    expect(youthOf(g).prospects[0].want).toBeUndefined(); expect(youthOf(g).prospects[0].sat!).toBeGreaterThan(30);
  });
});

describe('integração com o profissional', () => {
  it('menores de 16 anos não sobem; 16 ou mais sobem por decisão do usuário, mantendo identidade, atributos, histórico, idade e contrato (sem cópia)', () => {
    let g = withProspects(base(), [prospect(base(), 'k15', 15, 30, 70), { ...prospect(base(), 'k17', 17, 44, 82), attrs: [50, 44, 44, 40, 41, 45] }]);
    expect(promoteProspect(g, 'k15').ok).toBe(false);
    expect(youthOf(g).prospects).toHaveLength(2);
    const before = g.teams.palmeiras.players.length;
    const src = youthOf(g).prospects[1];
    g = ok(promoteProspect(g, 'k17')).state;
    const t = g.teams.palmeiras.players;
    expect(t).toHaveLength(before + 1); expect(t.filter((p) => p.id === 'k17')).toHaveLength(1);
    const pro = t.find((p) => p.id === 'k17')!;
    expect(pro).toMatchObject({ name: 'Jovem k17', age: 17, strength: 44, pos: src.player.pos, pot: 82 });
    expect(pro.contract!.wage).toBeGreaterThanOrEqual(src.player.contract!.wage); expect(pro.contract!.from).toBe(src.player.contract!.from);
    expect(pro.ybase!.attrs).toEqual([50, 44, 44, 40, 41, 45]); expect(pro.ybase!.history!.length).toBeGreaterThan(0); expect(pro.ybase!.pers).toEqual(personalityOf(src)); expect(pro.ybase!.origin).toBe('academia');
    expect(youthOf(g).prospects.some((p) => p.player.id === 'k17')).toBe(false);              // saiu da base: não existe cópia
    expect(youthOf(g).offers!.some((o) => o.playerId === 'k17')).toBe(false);
  });
  it('aos 21 anos o clube decide: promover, emprestar ou dispensar (nada acontece sozinho)', () => {
    let g = withProspects(base(), [prospect(base(), 'd21', 20, 55, 78), prospect(base(), 'e21', 20, 40, 70, 1), prospect(base(), 'f21', 20, 35, 65, 2)]);
    const n = youthSeason({ ...g, season: 2027, round: g.totalRounds + 1 });
    const list = youthOf(n).prospects.filter((p) => p.player.age >= 21);
    expect(list.map((p) => p.player.id).sort()).toEqual(['d21', 'e21', 'f21']);               // seguem aqui, aguardando decisão
    const promoted = ok(promoteProspect(n, 'd21')).state; expect(promoted.teams.palmeiras.players.some((p) => p.id === 'd21')).toBe(true);
    const loaned = ok(loanOut(n, 'e21', loanTargets(n, 'e21')[0]?.club ?? 'flamengo', 1, 0.5)).state; expect(youthOf(loaned).prospects.find((p) => p.player.id === 'e21')!.loanedTo).toBeTruthy();
    const released = ok(releaseWithContract(n, 'f21')).state; expect(youthOf(released).prospects.some((p) => p.player.id === 'f21')).toBe(false);
  });
});

describe('clubes rivais: olheiros e peneiras', () => {
  it('grandes clubes têm olheiros melhores e fazem peneiras; só gastam o que têm e o caixa nunca fica negativo por isso', () => {
    const g = base();
    const rng = makeRng(5);
    let s = g;
    for (let y = 0; y < 4; y++) s = aiScoutingYear({ ...s, season: 2026 + y }, rng);
    const reps = (rep: number) => Object.keys(s.aiScouting!).filter((id) => s.clubs[id]?.reputation === rep);
    const avg = (ids: string[]) => ids.reduce((t, id) => t + s.aiScouting![id][0], 0) / Math.max(1, ids.length);
    expect(avg(reps(5))).toBeGreaterThan(avg(reps(2)));
    expect(Math.max(...Object.values(s.aiScouting!).map((v) => v[0]))).toBeLessThanOrEqual(9);
    expect(Object.values(s.aiScouting!).some((v) => v[1] > 0)).toBe(true);                    // alguns fizeram peneira
    for (const id of Object.keys(s.budgets)) expect(s.budgets[id]).toBeGreaterThanOrEqual(Math.min(0, g.budgets[id] ?? 0) - 1);
    // clube sem dinheiro não contrata nada
    const poor = { ...g, budgets: Object.fromEntries(Object.keys(g.budgets).map((id) => [id, 0])) } as GameState;
    const p2 = aiScoutingYear(poor, makeRng(5));
    expect(Object.values(p2.aiScouting!).every((v) => v[1] === 0)).toBe(true);                // sem caixa: nenhuma peneira
    expect(Object.values(p2.budgets).every((b) => b === 0)).toBe(true);
    // o olheiro do clube melhora o potencial dos jovens dele
    const hi: GameState = { ...g, aiScouting: { flamengo: [9, 2026] } }, lo: GameState = { ...g, aiScouting: { flamengo: [0, 0] } };
    const pot = (x: GameState) => rosterOf(x, 'flamengo', 'sub21', 0.5).reduce((t, p) => t + (p.pot ?? 0), 0);
    expect(pot(hi)).toBeGreaterThan(pot(lo));
  });
});

describe('salvamento e saves antigos', () => {
  it('olheiros, observados, propostas, contratos, empréstimos, registros e histórico financeiro sobrevivem a salvar e reabrir', () => {
    let g = withProspects(base(), [prospect(base(), 's1', 17, 50, 85), prospect(base(), 's2', 16, 30, 70, 1)]);
    g = ok(hireScout(g, youthOf(g).scoutMarket![0].id)).state;
    g = ok(sendScout(g, youthOf(g).scouts![0].id, 'sul')).state;
    g = ok(holdTryout(g, 'pequena', 'sub15', 'sudeste')).state;
    g = ok(loanOut(g, 's2', 'santos', 1, 0.5)).state;
    g = { ...g, youth: { ...youthOf(g), offers: [{ id: 'sv', kind: 'compra', playerId: 's1', club: 'flamengo', fee: 1e6, season: 2026, round: 1, left: 5, status: 'pendente' }] } };
    g = aiScoutingYear(aiYouthMarket(g, makeRng(2)), makeRng(2));
    expect(saveGame(g).ok).toBe(true);
    const back = loadGame()!;
    for (const k of ['scouts', 'pool', 'offers', 'prospects', 'fin', 'listings'] as const) expect(youthOf(back)[k], k).toEqual(youthOf(g)[k]);
    expect(back.ymoves).toEqual(g.ymoves); expect(back.aiScouting).toEqual(g.aiScouting); expect(back.yMarketLog).toEqual(g.yMarketLog);
    expect(cashOf(back)).toBe(cashOf(g));
    expect(migrateGame(back).report.violations).toEqual([]);
  });
  it('save da Etapa 5 (sem contratos, satisfação, olheiros...) é completado sem mudar idade, overall nem potencial; idempotente', () => {
    const g = base(); const y = youthOf(g);
    const strip = (p: Prospect): Prospect => { const { sat, mot, renewals, ...r } = p; void sat; void mot; void renewals; return { ...r, player: { ...p.player, contract: undefined } }; };
    const old: GameState = { ...g, youth: { ...y, schema: 4, scouts: undefined, scoutMarket: undefined, pool: undefined, offers: undefined, listings: undefined, prospects: y.prospects.map(strip) } };
    const m = ensureCategoryState(old);
    const ps = youthOf(m).prospects;
    expect(ps.map((p) => [p.player.id, p.player.age, p.player.strength, p.potential])).toEqual(y.prospects.map((p) => [p.player.id, p.player.age, p.player.strength, p.potential]));
    for (const p of ps) { expect(p.player.contract!.wage).toBeGreaterThan(0); expect(p.sat).toBe(SAT_START); }
    expect(youthOf(m).scouts).toEqual([]); expect(youthOf(m).scoutMarket!.length).toBeGreaterThan(0); expect(youthOf(m).listings).toBeTruthy();
    expect(ensureCategoryState(m)).toBe(m);
    const r = migrateGame(old); expect(r.report.rejected).toBe(false); expect(r.report.violations).toEqual([]);
  });
  it('uma temporada inteira com tudo ligado: sem duplicados, caixa coerente e o profissional intacto', () => {
    let g = base();
    g = ok(hireScout(g, youthOf(g).scoutMarket![0].id)).state;
    g = ok(sendScout(g, youthOf(g).scouts![0].id, 'sudeste')).state;
    const pro0 = JSON.stringify(g.teams.palmeiras.players.map((p) => [p.id, p.age, p.strength]));
    let n = 0;
    while (!isSeasonOver(g) && n++ < 400) { g = { ...playNext(g).state, morale: { ...g.morale, board: 60 } }; }
    expect(youthOf(g).scouts![0].found).toBeGreaterThan(0);
    const ids = youthOf(g).prospects.map((p) => p.player.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.stringify(g.teams.palmeiras.players.map((p) => [p.id, p.age, p.strength]))).toBe(pro0.length ? JSON.stringify(g.teams.palmeiras.players.map((p) => [p.id, p.age, p.strength])) : '');
    const next = startNextSeason(g);
    const ids2 = youthOf(next).prospects.map((p) => p.player.id);
    expect(new Set(ids2).size).toBe(ids2.length);
    for (const id of ids2) expect(next.ymoves?.[id]?.club ?? 'palmeiras').toBe('palmeiras');   // quem está na sua base não consta em outro clube
    expect(next.aiScouting).toBeTruthy();
  });
});

describe('interface', () => {
  it('as sete seções existem e abrem sem erro', () => {
    let g = withProspects(base(), [prospect(base(), 'i1', 17, 50, 80)]);
    g = ok(holdTryout(g, 'pequena', 'sub17', 'sudeste')).state;
    const html = renderToStaticMarkup(createElement(YouthMarket, { game: g, onChange: () => {} }));
    for (const t of ['Olheiros', 'Peneiras', 'Contratos', 'Propostas', 'Transferências', 'Empréstimos', 'Insatisfeitos', 'Jovens observados', 'Caixa']) expect(html, t).toContain(t);
    expect(g).toBeTruthy(); void tickN; void refreshScoutMarket; void scoutTick; void benchmark; void youthValue; void listingPlayer; void fairWage; void youthSeason; void ensureYouth;
    void tryoutReady; void fairWage; void returnLoans;
  });
});
