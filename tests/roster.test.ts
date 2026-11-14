import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isSeasonOver, playRound, startNextSeason } from '../src/engine/game';
import { MORALE_START, moodLabel, moraleFactor, targetPosition, updateMorale } from '../src/engine/morale';
import { acceptOffer, checkRelease, generateOffers, myValue, rejectOffer, releasePlayer, repairLineup, returnLoans, rosterOk, toggleLoanList, toggleTransferList } from '../src/engine/roster';
import { isValidSave, loadGame } from '../src/engine/save';
import { makeRng } from '../src/engine/rng';
import { MAX_SQUAD, MIN_SQUAD } from '../src/engine/transfers';
import type { GameState } from '../src/engine/types';
import { makeCareer } from './helpers';

const bench = (g: GameState, pos: 'MID' | 'ATT' | 'DEF' | 'GK' = 'MID') => { const t = g.teams[g.userClubId]; return t.players.filter((p) => p.pos === pos && !t.lineup.includes(p.id)).sort((a, b) => a.strength - b.strength)[0]; };
const playSeason = (g: GameState) => { while (!isSeasonOver(g)) g = playRound(g).state; return g; };

describe('listas de transferência e de empréstimo', () => {
  it('colocar e tirar da lista; uma lista tira o jogador da outra', () => {
    let g = makeCareer('flamengo'); const p = bench(g);
    g = toggleTransferList(g, p.id); expect(g.transferList).toEqual([p.id]);
    g = toggleLoanList(g, p.id); expect(g.loanList).toEqual([p.id]); expect(g.transferList).toEqual([]);
    g = toggleLoanList(g, p.id); expect(g.loanList).toEqual([]);
    expect(toggleTransferList(g, 'palmeiras-1')).toBe(g); // jogador de outro clube é ignorado
  });
});

describe('dispensar jogador', () => {
  it('remove do elenco, das listas e refaz a escalação se era titular; fica no histórico', () => {
    let g = makeCareer('flamengo'); const t = g.teams.flamengo;
    const starter = t.players.find((p) => t.lineup.includes(p.id) && p.pos === 'ATT')!;
    g = toggleTransferList(g, starter.id);
    const s = releasePlayer(g, starter.id);
    expect(s.teams.flamengo.players).toHaveLength(23);
    expect(s.teams.flamengo.players.some((p) => p.id === starter.id)).toBe(false);
    expect(s.teams.flamengo.lineup).toHaveLength(11); expect(s.teams.flamengo.lineup).not.toContain(starter.id);
    expect(s.transferList).toEqual([]);
    expect(s.transfers.at(-1)).toMatchObject({ kind: 'release', playerId: starter.id, fee: 0, toClubId: '' });
    expect(g.teams.flamengo.players).toHaveLength(24); // imutável
  });
  it('não deixa o elenco abaixo do mínimo (total e por posição)', () => {
    let g = makeCareer('flamengo');
    const gks = g.teams.flamengo.players.filter((p) => p.pos === 'GK');
    g = releasePlayer(g, gks[2].id); // 3 → 2 goleiros: ok
    expect(checkRelease(g, gks[0].id)).toMatchObject({ ok: false });
    expect(releasePlayer(g, gks[0].id)).toBe(g);
    // total
    let h = makeCareer('flamengo');
    for (const p of [...h.teams.flamengo.players]) if (h.teams.flamengo.players.length > MIN_SQUAD && checkRelease(h, p.id).ok) h = releasePlayer(h, p.id);
    expect(h.teams.flamengo.players.length).toBeGreaterThanOrEqual(MIN_SQUAD);
    expect(rosterOk(h.teams.flamengo.players)).toBe(true);
  });
  it('repairLineup completa com o melhor reserva da mesma posição', () => {
    const g = makeCareer('flamengo'); const t = g.teams.flamengo;
    const out = t.players.find((p) => t.lineup.includes(p.id) && p.pos === 'DEF')!;
    const rest = t.players.filter((p) => p.id !== out.id);
    const fixed = repairLineup({ ...t, players: rest });
    expect(fixed.lineup).toHaveLength(11);
    const best = rest.filter((p) => p.pos === 'DEF' && !t.lineup.includes(p.id)).sort((a, b) => b.strength - a.strength)[0];
    expect(fixed.lineup).toContain(best.id);
  });
});

describe('propostas', () => {
  const listed = () => { let g = makeCareer('flamengo'); const p = bench(g); g = toggleTransferList(g, p.id); return { g, p }; };

  it('sem jogador listado nunca há proposta', () => {
    const g = makeCareer('flamengo');
    for (let i = 0; i < 30; i++) expect(generateOffers(g, makeRng(i)).offers).toEqual([]);
  });
  it('jogador listado recebe proposta de outro clube, valor perto do de mercado, validade de 3 rodadas', () => {
    const { g, p } = listed();
    let got = null as GameState | null;
    for (let i = 0; i < 40 && !got; i++) { const s = generateOffers(g, makeRng(i)); if (s.offers.length) got = s; }
    expect(got).not.toBeNull();
    const o = got!.offers[0], v = myValue(g, p);
    expect(o).toMatchObject({ kind: 'buy', playerId: p.id, expiresRound: g.round + 2, season: 2026 });
    expect(o.clubId).not.toBe('flamengo');
    expect(o.fee).toBeGreaterThanOrEqual(v * 0.8); expect(o.fee).toBeLessThanOrEqual(v * 1.2);
    expect(got!.budgets[o.clubId]).toBeGreaterThanOrEqual(o.fee); // o clube tem como pagar
  });
  it('vender (aceitar): jogador sai, dinheiro entra, histórico e listas atualizados, escalação válida', () => {
    let { g, p } = listed();
    g = { ...g, offers: [{ id: 'o1', kind: 'buy', playerId: p.id, clubId: 'palmeiras', fee: 700_000, season: 2026, expiresRound: 3 }] };
    const total = Object.values(g.budgets).reduce((s, v) => s + v, 0);
    const r = acceptOffer(g, 'o1');
    expect(r.result.ok).toBe(true);
    const s = r.state;
    expect(s.teams.flamengo.players.some((x) => x.id === p.id)).toBe(false);
    expect(s.teams.palmeiras.players.some((x) => x.id === p.id)).toBe(true);
    expect(s.budgets.flamengo).toBe(g.budgets.flamengo + 700_000); expect(s.budgets.palmeiras).toBe(g.budgets.palmeiras - 700_000);
    expect(Object.values(s.budgets).reduce((a, v) => a + v, 0)).toBe(total);
    expect(s.offers).toEqual([]); expect(s.transferList).toEqual([]);
    expect(s.transfers.at(-1)).toMatchObject({ kind: 'sale', fromClubId: 'flamengo', toClubId: 'palmeiras', fee: 700_000 });
    expect(s.teams.flamengo.lineup).toHaveLength(11);
  });
  it('recusar remove a proposta; aceitar é bloqueado se deixaria o elenco inválido', () => {
    const { g, p } = listed();
    const withOffer = { ...g, offers: [{ id: 'o1', kind: 'buy' as const, playerId: p.id, clubId: 'palmeiras', fee: 100_000, season: 2026, expiresRound: 3 }] };
    expect(rejectOffer(withOffer, 'o1').offers).toEqual([]);
    const gk = withOffer.teams.flamengo.players.filter((x) => x.pos === 'GK');
    let thin = releasePlayer(withOffer, gk[2].id);
    thin = { ...thin, offers: [{ id: 'o2', kind: 'buy', playerId: gk[0].id, clubId: 'palmeiras', fee: 100_000, season: 2026, expiresRound: 3 }] };
    const r = acceptOffer(thin, 'o2');
    expect(r.result.ok).toBe(false); expect(r.state.teams.flamengo.players.some((x) => x.id === gk[0].id)).toBe(true);
  });
  it('clube sem dinheiro ou sem vaga: proposta cai', () => {
    const { g, p } = listed();
    const broke = { ...g, budgets: { ...g.budgets, palmeiras: 0 }, offers: [{ id: 'o1', kind: 'buy' as const, playerId: p.id, clubId: 'palmeiras', fee: 100_000, season: 2026, expiresRound: 3 }] };
    const r = acceptOffer(broke, 'o1');
    expect(r.result.ok).toBe(false); expect(r.state.offers).toEqual([]);
    const full = { ...g, teams: { ...g.teams, palmeiras: { ...g.teams.palmeiras, players: [...g.teams.palmeiras.players, ...g.teams.santos.players.slice(0, MAX_SQUAD - 24)] } }, offers: broke.offers };
    expect(acceptOffer(full, 'o1').result.ok).toBe(false);
  });
  it('propostas vencem depois de 3 rodadas', () => {
    let { g, p } = listed();
    g = { ...g, offers: [{ id: 'o1', kind: 'buy', playerId: p.id, clubId: 'palmeiras', fee: 100_000, season: 2026, expiresRound: 2 }], round: 3 };
    expect(generateOffers({ ...g, transferList: [] }, makeRng(1)).offers).toEqual([]);
  });
});

describe('empréstimo', () => {
  it('cede o jogador por uma taxa pequena e ele volta no fim da temporada', () => {
    let g = makeCareer('flamengo', 4); const p = bench(g);
    g = toggleLoanList(g, p.id);
    g = { ...g, offers: [{ id: 'l1', kind: 'loan', playerId: p.id, clubId: 'sport', fee: 50_000, season: 2026, expiresRound: 5 }] };
    const r = acceptOffer(g, 'l1'); expect(r.result.ok).toBe(true);
    let s = r.state;
    expect(s.teams.sport.players.some((x) => x.id === p.id)).toBe(true);
    expect(s.teams.flamengo.players.some((x) => x.id === p.id)).toBe(false);
    expect(s.loans).toEqual([{ playerId: p.id, hostClubId: 'sport', season: 2026 }]);
    expect(s.transfers.at(-1)).toMatchObject({ kind: 'loan', toClubId: 'sport', fee: 50_000 });
    s = playSeason(s);
    const next = startNextSeason(s);
    expect(next.teams.flamengo.players.some((x) => x.id === p.id)).toBe(true);
    expect(next.teams.sport.players.some((x) => x.id === p.id)).toBe(false);
    expect(next.loans).toEqual([]);
    expect(returnLoans({ ...s, loans: [] })).toMatchObject({ loans: [] });
  });
});

describe('humor', () => {
  const base = { home: true, position: 5, size: 20, round: 10, expectation: 'top4' as const };
  it('vitória sobe; derrota desce; empate pouco muda', () => {
    const w = updateMorale(MORALE_START, { ...base, gf: 2, ga: 0 }), l = updateMorale(MORALE_START, { ...base, position: 12, gf: 0, ga: 2 }), d = updateMorale(MORALE_START, { ...base, gf: 1, ga: 1 });
    expect(w.team).toBeGreaterThan(60); expect(w.fans).toBeGreaterThan(60); expect(w.board).toBeGreaterThan(60);
    expect(l.team).toBeLessThan(60); expect(l.fans).toBeLessThan(60); expect(l.board).toBeLessThan(60);
    expect(Math.abs(d.team - 60)).toBeLessThan(2); expect(d.fans).toBeLessThanOrEqual(60);
  });
  it('dirigentes comparam a posição com a meta; antes da rodada 4 só olham o resultado', () => {
    const early = updateMorale(MORALE_START, { ...base, round: 2, position: 20, gf: 1, ga: 1 });
    expect(early.board).toBe(60);
    const ok = updateMorale(MORALE_START, { ...base, position: 3, gf: 1, ga: 1 }), bad = updateMorale(MORALE_START, { ...base, position: 18, gf: 1, ga: 1 });
    expect(ok.board).toBeGreaterThan(bad.board);
    expect([targetPosition('title', 20), targetPosition('top4', 20), targetPosition('mid', 20), targetPosition('survive', 20)]).toEqual([3, 6, 14, 16]);
  });
  it('sempre entre 0 e 100; rótulos e fator de força', () => {
    let m = MORALE_START;
    for (let i = 0; i < 100; i++) m = updateMorale(m, { ...base, gf: 3, ga: 0 });
    expect(m.team).toBeLessThanOrEqual(100); expect(m.fans).toBeLessThanOrEqual(100); expect(m.board).toBeLessThanOrEqual(100);
    for (let i = 0; i < 100; i++) m = updateMorale(m, { ...base, position: 20, gf: 0, ga: 3 });
    expect(m.team).toBeGreaterThanOrEqual(0); expect(m.board).toBeGreaterThanOrEqual(0);
    expect(moodLabel(90)).toBe('Excelente'); expect(moodLabel(65)).toBe('Bom'); expect(moodLabel(45)).toBe('Regular'); expect(moodLabel(25)).toBe('Ruim'); expect(moodLabel(5)).toBe('Crítico');
    expect(moraleFactor(0)).toBeCloseTo(0.96); expect(moraleFactor(100)).toBeCloseTo(1.04);
  });
  it('joga rodada: humor muda conforme o resultado do seu clube; temporada inteira mantém tudo válido', () => {
    let g = makeCareer('flamengo', 8);
    expect(g.morale).toEqual({ team: 60, board: 60, fans: 60 });
    g = playRound(g).state;
    expect(g.morale).not.toEqual({ team: 60, board: 60, fans: 60 });
    g = playSeason(g);
    for (const v of Object.values(g.morale)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
  });
});

describe('temporada com listas e propostas', () => {
  it('propostas aparecem ao longo da temporada para listados; fim de temporada limpa as propostas', () => {
    let g = makeCareer('flamengo', 3);
    for (const p of g.teams.flamengo.players.filter((x) => !g.teams.flamengo.lineup.includes(x.id)).slice(0, 3)) g = toggleTransferList(g, p.id);
    let seen = 0;
    while (!isSeasonOver(g)) { g = playRound(g).state; seen += g.offers.length; for (const o of g.offers) expect(o.expiresRound).toBeGreaterThanOrEqual(g.round); }
    expect(seen).toBeGreaterThan(0);
    expect(startNextSeason(g).offers).toEqual([]);
  });
});

describe('saves', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
  });
  it('save da versão 3 (antes do humor/listas) é migrado para a versão atual', () => {
    const g4 = makeCareer('palmeiras');
    const { morale: _m, transferList: _t, loanList: _l, offers: _o, loans: _ln, ...rest } = g4;
    const clubs = Object.fromEntries(Object.entries(g4.clubs).map(([id, c]) => { const { boardExpectation: _b, ...r } = c; return [id, r]; }));
    const v3 = { ...rest, clubs, version: 3, transfers: [{ season: 2026, round: 1, playerId: 'x', playerName: 'X', pos: 'MID', strength: 50, fromClubId: 'a', toClubId: 'palmeiras', fee: 1 }] };
    expect(isValidSave(v3)).toBe(true);
    localStorage.setItem('caminhoes-save-v1', JSON.stringify(v3));
    const g = loadGame()!;
    expect(g.version).toBe(5);
    expect(g.news).toEqual([]);
    expect(g.morale).toEqual({ team: 60, board: 60, fans: 60 });
    expect([g.transferList, g.loanList, g.offers, g.loans]).toEqual([[], [], [], []]);
    expect(g.clubs.palmeiras.boardExpectation).toBe('title');
    expect(g.transfers[0].kind).toBe('buy');
  });
});
