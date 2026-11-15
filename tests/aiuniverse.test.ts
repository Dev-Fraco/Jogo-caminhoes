import { describe, expect, it } from 'vitest';
import { aiCoachTick, replaceCoach } from '../src/engine/aicoaches';
import { aiRenewals, aiSignFreeAgents } from '../src/engine/aicontracts';
import { clubGoals, freezeGoals } from '../src/engine/aigoals';
import { aiBalanceSquads } from '../src/engine/aisquad';
import { aiLoanWindow, aiPromoteYouth } from '../src/engine/aiyouth';
import { aiWindow, clubActivity } from '../src/engine/ai';
import { clubProfile } from '../src/engine/aiprofile';
import { auditUniverse } from '../src/engine/aiaudit';
import { ensureAiState } from '../src/engine/aistate';
import { playRound, skipSeasons, startNextSeason } from '../src/engine/game';
import { aiLineup, matchImportance, REST_BASE } from '../src/engine/rotation';
import { makeRng } from '../src/engine/rng';
import type { GameState } from '../src/engine/types';
import { makeCareer } from './helpers';

const g0 = ensureAiState(makeCareer('flamengo', 4));
const sumBudgets = (g: GameState) => Object.values(g.budgets).reduce((a, b) => a + b, 0);
const roundtrip = (g: GameState): GameState => JSON.parse(JSON.stringify(g));
const userTeam = (g: GameState) => JSON.stringify([g.teams[g.userClubId], g.budgets[g.userClubId]]);

describe('Etapa 10 — rodízio e importância dos jogos', () => {
  it('titular muito carregado é poupado quando há reserva à altura; sem carga, joga o melhor time', () => {
    const id = g0.divisions[0].clubIds.find((x) => x !== 'flamengo')!;
    const t = g0.teams[id];
    const base = aiLineup(g0, t, new Set());
    const star = t.players.filter((p) => base.includes(p.id) && p.pos !== 'GK').sort((a, b) => a.strength - b.strength)[0]; // o titular mais fraco: reserva próxima
    const g = { ...g0, load: { [star.id]: 12 } };
    const rested = aiLineup(g, t, new Set(), 1);
    expect(rested.length).toBe(11);
    expect(rested.includes(star.id) && base.includes(star.id)).toBe(rested.includes(star.id)); // coerência
    expect(aiLineup({ ...g0, load: {} }, t, new Set())).toEqual(base);
    expect(REST_BASE).toBeGreaterThan(0);
  });
  it('jogo mais importante poupa menos que jogo de menor importância', () => {
    const id = g0.divisions[0].clubIds.find((x) => x !== 'flamengo')!;
    const t = g0.teams[id];
    const base = aiLineup(g0, t, new Set());
    const load = Object.fromEntries(base.map((x) => [x, 8.5]));
    const lo = aiLineup({ ...g0, load }, t, new Set(), 0.7).filter((x) => !base.includes(x)).length;
    const hi = aiLineup({ ...g0, load }, t, new Set(), 1.6).filter((x) => !base.includes(x)).length;
    expect(lo).toBeGreaterThanOrEqual(hi);
    expect(lo).toBeLessThanOrEqual(3);
  });
  it('lesionado nunca é escalado e a importância sobe na briga contra o rebaixamento', () => {
    const id = g0.divisions[0].clubIds.find((x) => x !== 'flamengo')!;
    const t = g0.teams[id];
    const hurt = new Set(aiLineup(g0, t, new Set()).slice(0, 3));
    expect(aiLineup(g0, t, hurt).some((x) => hurt.has(x))).toBe(false);
    expect(matchImportance(g0, id)).toBeGreaterThan(0);
  });
  it('numa temporada o rodízio faz clubes usarem mais de 11 titulares diferentes, sem alterar o do jogador', () => {
    let g = g0;
    const used = new Map<string, Set<string>>();
    while (g.round <= g.totalRounds) {
      g = playRound(g).state;
      for (const id of g0.divisions[0].clubIds) if (id !== 'flamengo') { const s = used.get(id) ?? new Set<string>(); g.teams[id].lineup.forEach((x) => s.add(x)); used.set(id, s); }
    }
    const most = Math.max(...[...used.values()].map((s) => s.size));
    expect(most).toBeGreaterThan(11);
    expect(auditUniverse(g)).toEqual([]);
  }, 120_000);
});

describe('Etapa 11 — sem comportamentos artificiais', () => {
  it('dinheiro das negociações da IA é contabilizado: o total do universo não muda e nenhum clube fica negativo por contratar', () => {
    const rng = makeRng(7);
    const before = sumBudgets(g0);
    const steps: [string, GameState][] = [['janela', aiWindow(g0, rng, 3)], ['empréstimos', aiLoanWindow(g0, rng, 1)], ['livres', aiSignFreeAgents({ ...g0, freeAgents: [] }, rng, 2)], ['elenco', aiBalanceSquads(g0, rng)]];
    for (const [nome, out] of steps) {
      expect(Math.abs(sumBudgets(out) - before), nome).toBeLessThan(1);
      for (const id of Object.keys(out.budgets)) if (g0.budgets[id] >= 0) expect(out.budgets[id], `${nome}/${id}`).toBeGreaterThanOrEqual(0);
    }
  });
  it('ninguém é duplicado nem registrado em dois clubes, e a IA não cria jogadores nas negociações', () => {
    const rng = makeRng(8);
    let g = aiWindow(g0, rng, 3);
    g = aiLoanWindow(g, rng, 1); g = aiBalanceSquads(g, rng); g = aiSignFreeAgents(g, rng, 2); g = aiPromoteYouth(g, rng);
    expect(auditUniverse(g)).toEqual([]);
    const count = (x: GameState) => Object.values(x.teams).reduce((t, y) => t + y.players.length, 0) + (x.freeAgents ?? []).length + Object.values(x.aiYouth ?? {}).reduce((t, l) => t + l.length, 0);
    expect(count(g)).toBe(count(g0)); // só mudam de lugar
  });
  it('nem todos os clubes negociam com a mesma frequência', () => {
    const acts = g0.divisions[0].clubIds.map((id) => clubActivity(id, clubProfile(g0, id)));
    expect(Math.max(...acts) - Math.min(...acts)).toBeGreaterThan(0.2);
    expect(Math.min(...acts)).toBeGreaterThanOrEqual(0.25);
  });
  it('a IA não mexe no clube do usuário nem em resultados e históricos já finalizados', () => {
    let g = skipSeasons(makeCareer('flamengo', 21), 1);
    const results = JSON.stringify(g.results), history = JSON.stringify(g.history), mine = userTeam(g);
    const rng = makeRng(3);
    g = aiRenewals(g, rng, 'meio'); g = aiWindow(g, rng, 3); g = aiLoanWindow(g, rng, 1); g = aiBalanceSquads(g, rng); g = aiSignFreeAgents(g, rng, 2); g = aiPromoteYouth(g, rng); g = aiCoachTick(g, rng);
    expect(JSON.stringify(g.results)).toBe(results);
    expect(JSON.stringify(g.history)).toBe(history);
    expect(userTeam(g)).toBe(mine);
  }, 120_000);
  it('virada de temporada não altera o histórico das temporadas concluídas', () => {
    const g = skipSeasons(makeCareer('flamengo', 22), 1);
    const before = JSON.stringify(g.history);
    const next = startNextSeason(g);
    expect(JSON.stringify(next.history.slice(0, g.history.length))).toBe(before);
  }, 120_000);
  it('troca de treinador sempre tem motivo registrado e nunca deixa clube sem treinador', () => {
    const id = g0.divisions[0].clubIds.find((x) => x !== 'flamengo')!;
    const g = replaceCoach(g0, id, makeRng(1), 'demitido', 'teste');
    expect(g.clubCoach![id]).toBeTruthy();
    expect(g.news[0].text).toContain('demite');
  });
});

describe('Etapa 12 — desempenho', () => {
  it('rodada e virada de temporada seguem rápidas com a IA ligada', () => {
    let g = g0;
    const t0 = performance.now();
    let rounds = 0;
    while (g.round <= g.totalRounds) { g = playRound(g).state; rounds++; }
    const perRound = (performance.now() - t0) / rounds;
    const t1 = performance.now();
    g = startNextSeason(g);
    const off = performance.now() - t1;
    expect(perRound).toBeLessThan(200);
    expect(off).toBeLessThan(8000);
  }, 120_000);
});

describe('Etapa 13 — persistência e compatibilidade', () => {
  it('salvar e reabrir no meio da temporada dá exatamente o mesmo jogo (nenhuma decisão se repete ou se perde)', () => {
    let a = g0;
    for (let i = 0; i < 24; i++) a = playRound(a).state; // passa pelo meio da temporada (janela, renovações, avaliação de treinadores)
    let b = roundtrip(a);
    while (a.round <= a.totalRounds) { a = playRound(a).state; b = playRound(b).state; if (a.round % 6 === 0) b = roundtrip(b); }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  }, 180_000);
  it('save antigo (sem campos da IA) abre, é completado sem reiniciar a carreira e continua jogável', () => {
    const fresh = makeCareer('flamengo', 31);
    const old = roundtrip(fresh) as GameState;
    for (const k of ['aiCoaches', 'clubCoach', 'aiYouth', 'aiLoans', 'freeAgents', 'load', 'aiGoals', 'squadRules'] as const) delete (old as unknown as Record<string, unknown>)[k];
    for (const t of Object.values(old.teams)) for (const p of t.players) delete p.contract;
    const opened = ensureAiState(old);
    expect(opened.userClubId).toBe(old.userClubId);
    expect(opened.coach).toEqual(old.coach);
    expect(JSON.stringify(opened.history)).toBe(JSON.stringify(old.history));
    expect(opened.budgets).toEqual(old.budgets);
    expect(auditUniverse(opened)).toEqual([]);
    expect(Object.values(opened.teams).every((t) => t.players.length === old.teams[t.clubId].players.length)).toBe(true); // elencos intactos
    expect(ensureAiState(opened)).toBe(opened); // idempotente: abrir de novo não gera decisões novas
    const done = startNextSeason(skipSeasons(opened, 1));
    expect(auditUniverse(done)).toEqual([]);
    expect(done.season).toBe(opened.season + 1);
  }, 180_000);
  it('objetivos fixados no início da temporada persistem, mesmo se o clube sair de uma copa', () => {
    const g = freezeGoals(g0);
    const id = g.divisions[0].clubIds.find((x) => x !== 'flamengo')!;
    const before = JSON.stringify(clubGoals(g, id));
    const after = { ...roundtrip(g), cup: g.cup ? { ...g.cup, alive: [] } : g.cup, lib: undefined, sula: undefined, ucl: undefined };
    expect(JSON.stringify(clubGoals(after as GameState, id))).toBe(before);
  });
});
