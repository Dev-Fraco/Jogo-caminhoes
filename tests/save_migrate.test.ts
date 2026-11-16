import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditUniverse } from '../src/engine/aiaudit';
import { balanceOf } from '../src/engine/bank';
import { isSeasonOver, playNext, simulateToEnd, startNextSeason } from '../src/engine/game';
import { detectSchema, migrateGame, migrationNotice, SAVE_SCHEMA, STEPS, verifyPreserved } from '../src/engine/migrate';
import { clearSave, listOriginals, loadGame, loadGameDetailed, originalKey, readRawSave, restoreOriginal, saveGame, takeLoadNotice } from '../src/engine/save';
import { decompress } from '../src/engine/lzstore';
import type { GameState } from '../src/engine/types';
import { makeCareer } from './helpers';

const KEY = 'caminhoes-save-v1';
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
function install() {
  const mem = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0 } as unknown as Storage;
  return mem;
}

/** Uma carreira com história (uma temporada completa e algumas rodadas da seguinte) para os testes de migração. */
let current: GameState;
const getCurrent = () => (current ??= (() => {
  let g = makeCareer('flamengo', 17);
  g = startNextSeason(simulateToEnd(g));
  for (let i = 0; i < 12; i++) g = playNext(g).state;
  return { ...g, coachMoney: 4_321_000 };
})());

const L4 = ['schema'];
const L3 = [...L4, 'apps', 'loanLog', 'contractLog', 'renewTalks'];
const L2 = [...L3, 'deals', 'dealLog', 'debts', 'clauses', 'loanDeals', 'windowState', 'windowLog', 'listed', 'mood', 'agentOffers', 'marketDay', 'aiNewsDay'];
const L1 = [...L2, 'aiCoaches', 'clubCoach', 'aiYouth', 'aiLoans', 'freeAgents', 'load', 'aiGoals', 'squadRules', 'aiMoves'];
const PLAYER_NEW = { 4: [], 3: ['pot', 'formedAt', 'formedSeason', 'nat', 'lastClubId'], 2: ['pot', 'formedAt', 'formedSeason', 'nat', 'lastClubId'], 1: ['pot', 'formedAt', 'formedSeason', 'nat', 'lastClubId', 'contract'] } as const;

/** Simula um save de uma geração anterior: JSON sem os campos que as gerações seguintes criaram. */
function downgrade(g: GameState, level: 1 | 2 | 3 | 4): GameState {
  const o = JSON.parse(JSON.stringify(g)) as Record<string, unknown> & GameState;
  for (const k of { 4: L4, 3: L3, 2: L2, 1: L1 }[level]) delete o[k];
  for (const [id, t] of Object.entries(o.teams)) for (const p of t.players) for (const k of PLAYER_NEW[level]) { if (k === 'contract' && id === o.userClubId) continue; delete (p as unknown as Record<string, unknown>)[k]; }
  return o;
}

beforeEach(() => { install(); clearSave(); });

describe('ETAPA 3 — identificar a versão e o que falta', () => {
  it('deduz a geração do save pelos campos presentes e respeita o registro quando existe', () => {
    const g = getCurrent();
    expect(detectSchema(g)).toBe(SAVE_SCHEMA);
    expect(detectSchema(downgrade(g, 4))).toBe(4);
    expect(detectSchema(downgrade(g, 3))).toBe(3);
    expect(detectSchema(downgrade(g, 2))).toBe(2);
    expect(detectSchema(downgrade(g, 1))).toBe(1);
  });
});

describe('ETAPA 3 — migração preserva tudo e só completa o que falta', () => {
  it.each([1, 2, 3, 4] as const)('de uma geração %s: nada do que existia muda, o que faltava é criado, o jogo é carimbado e a migração é idempotente', (level) => {
    const base = getCurrent();
    const old = downgrade(base, level);
    const { game, report } = migrateGame(old);
    expect(report.fromSchema).toBe(level);
    expect(report.rejected).toBe(false); expect(report.failed).toEqual([]); expect(report.violations).toEqual([]);
    expect(game.schema).toBe(SAVE_SCHEMA);
    if (level < 4) expect(report.migrated).toBe(true);
    // dados que existiam: idênticos
    for (const k of ['history', 'results', 'budgets', 'transfers', 'news', 'titles', 'coach', 'userClubId', 'cup', 'fixtures'] as const) expect(canon(game[k])).toBe(canon(old[k]));
    expect(balanceOf(game)).toBe(balanceOf(old)); expect(balanceOf(game)).toBe(4_321_000);
    expect(verifyPreserved(old, game)).toEqual([]);
    // o que faltava foi criado (valores coerentes)
    if (level <= 3) { expect(Object.values(game.teams).flatMap((t) => t.players).filter((p) => p.age <= 25).every((p) => p.pot !== undefined && p.pot >= p.strength)).toBe(true); expect(game.apps).toBeDefined(); }
    if (level <= 2) { expect(game.windowState).toBeDefined(); }
    if (level <= 1) {
      expect(Object.keys(game.aiCoaches ?? {}).length).toBeGreaterThan(50);
      expect(game.aiYouth).toBeDefined(); expect(game.aiGoals).toBeDefined();
      for (const [id, t] of Object.entries(game.teams)) if (id !== game.userClubId) expect(t.players.every((p) => p.contract && p.contract.wage > 0)).toBe(true);
      expect(game.teams[game.userClubId].players.filter((p) => p.contract).length).toBe(old.teams[old.userClubId].players.filter((p) => p.contract).length); // o seu elenco não ganha contratos inventados
    }
    // idempotente: migrar de novo não muda nada (nem o objeto)
    const again = migrateGame(game);
    expect(again.game).toBe(game);
    expect(again.report.migrated).toBe(false);
    expect(canon(migrateGame(JSON.parse(JSON.stringify(game))).game)).toBe(canon(game));
  }, 200_000);
  it('valores que já existiam nunca são trocados por padrões (contrato, potencial, treinadores, objetivos)', () => {
    const base = getCurrent();
    const old = downgrade(base, 2);                                       // geração 2 já tem treinadores, base, objetivos e contratos
    const ai = Object.keys(old.teams).find((id) => id !== old.userClubId)!;
    old.teams[ai].players[0].contract = { wage: 12_345, until: 2031 };
    old.teams[ai].players[1].pot = 77;
    const coachName = Object.values(old.aiCoaches!)[0].name;
    const goals = JSON.stringify(old.aiGoals);
    const { game } = migrateGame(old);
    expect(game.teams[ai].players[0].contract).toEqual({ wage: 12_345, until: 2031 });
    expect(game.teams[ai].players[1].pot).toBe(77);
    expect(Object.values(game.aiCoaches!)[0].name).toBe(coachName);
    expect(JSON.stringify(game.aiGoals)).toBe(goals);
  });
  it('saves do formato v3/v4 (sem orçamentos, humor, listas) são completados sem apagar o que tinham', () => {
    const old = downgrade(getCurrent(), 1) as unknown as Record<string, unknown>;
    for (const k of ['budgets', 'news', 'morale', 'transferList', 'loanList', 'offers', 'loans']) delete old[k];
    old.version = 3;
    for (const c of Object.values((old as unknown as GameState).clubs)) delete (c as unknown as Record<string, unknown>).boardExpectation;
    const { game, report } = migrateGame(old as unknown as GameState);
    expect(game.version).toBe(5);
    expect(report.failed).toEqual([]); expect(report.rejected).toBe(false);
    expect(Object.keys(game.budgets).length).toBeGreaterThan(100);
    expect(game.history.length).toBe(getCurrent().history.length);
    expect(Object.values(game.clubs).every((c) => c.boardExpectation)).toBe(true);
  });
  it('propostas simples antigas viram negociações sem perder valor, jogador e clube', () => {
    const old = downgrade({ ...makeCareer('flamengo', 17), coachMoney: 1 }, 1);               // carreira em andamento (com clube)
    const p = old.teams[old.userClubId].players[8];
    const o = { id: 'o1', kind: 'buy' as const, playerId: p.id, clubId: 'palmeiras', fee: 900_000, season: old.season, expiresRound: old.round + 2 };
    const { game } = migrateGame({ ...old, offers: [o] });
    expect(game.offers).toEqual([]);
    const d = game.deals!.find((x) => x.playerId === p.id)!;
    expect(d).toMatchObject({ buyerId: 'palmeiras', sellerId: old.userClubId, state: 'recebida' });
    expect(d.terms.fee).toBe(900_000);
    expect(game.teams[old.userClubId].players.some((x) => x.id === p.id)).toBe(true);
  });
  it('save atual (já carimbado) é devolvido como está, sem aviso e sem cópia', () => {
    const g = getCurrent();
    const r = migrateGame(g);
    expect(r.game).toBe(g);
    expect(migrationNotice(r.report)).toBeNull();
  });
  it('save atual sem o carimbo (versão logo anterior) é carimbado em silêncio, sem aviso', () => {
    const r = migrateGame(downgrade(getCurrent(), 4));
    expect(r.report.migrated).toBe(false);
    expect(migrationNotice(r.report)).toBeNull();
    expect(r.game.schema).toBe(SAVE_SCHEMA);
  });
  it('jogadores duplicados em clubes (save já danificado) NÃO são apagados: só avisados', () => {
    const old = downgrade(getCurrent(), 1);
    const ids = Object.keys(old.teams).filter((id) => id !== old.userClubId);
    const dup = old.teams[ids[0]].players[0];
    old.teams[ids[1]].players.push({ ...dup });
    const n0 = old.teams[ids[0]].players.length, n1 = old.teams[ids[1]].players.length;
    const { game, report } = migrateGame(old);
    expect(game.teams[ids[0]].players.length).toBe(n0); expect(game.teams[ids[1]].players.length).toBe(n1);
    expect(report.warnings.join(' ')).toMatch(/aparece em/);
  });
  it('depois de migrado, o jogo funciona: uma temporada inteira e a virada ficam íntegras', () => {
    const { game } = migrateGame(downgrade(getCurrent(), 1));
    const e = simulateToEnd(game);
    const n = startNextSeason(e);
    expect(n.season).toBe(game.season + 1);
    expect(auditUniverse(n)).toEqual([]);
    expect(n.history.slice(0, game.history.length)).toEqual(game.history);
  }, 300_000);
});

describe('ETAPA 3 — falhas durante a migração', () => {
  it('um passo que falha não impede o save de abrir: os outros se aplicam, o carimbo não é dado e a próxima abertura tenta de novo', () => {
    const old = downgrade(getCurrent(), 1);
    const step = STEPS.find((s) => s.id === 'treinadores-ia')!;
    const run = step.run;
    step.run = () => { throw new Error('quebrou de propósito'); };
    try {
      const r1 = migrateGame(old);
      expect(r1.report.failed.map((f) => f.id)).toEqual(['treinadores-ia']);
      expect(r1.report.applied.length).toBeGreaterThan(3);
      expect(r1.game.schema).not.toBe(SAVE_SCHEMA);
      expect(r1.game.aiYouth).toBeDefined();
      expect(migrationNotice(r1.report)).toMatch(/tentados de novo/);
      step.run = run;
      const r2 = migrateGame(r1.game);
      expect(r2.report.failed).toEqual([]);
      expect(r2.game.schema).toBe(SAVE_SCHEMA);
      expect(Object.keys(r2.game.aiCoaches ?? {}).length).toBeGreaterThan(50);
    } finally { step.run = run; }
  }, 200_000);
  it('uma migração que alteraria dados antigos é rejeitada: o save original é mantido sem mudanças', () => {
    const old = downgrade(getCurrent(), 1);
    const step = STEPS.find((s) => s.id === 'contratos-ia')!;
    const run = step.run;
    step.run = (g) => { const id = Object.keys(g.teams)[3]; const t = g.teams[id]; return { ...g, teams: { ...g.teams, [id]: { ...t, players: t.players.map((p, i) => (i === 0 ? { ...p, strength: p.strength + 5 } : p)) } } }; };
    try {
      const r = migrateGame(old);
      expect(r.report.rejected).toBe(true);
      expect(r.report.violations.join(' ')).toMatch(/dados do jogador alterados/);
      expect(r.game).toBe(old);
      expect(migrationNotice(r.report)).toMatch(/cancelada/);
    } finally { step.run = run; }
  }, 100_000);
});

describe('ETAPA 3 — cópia do save original e abertura pelo caminho real', () => {
  const put = (raw: string) => (globalThis.localStorage as Storage).setItem(KEY, raw);
  it('ao abrir um save antigo: migra, avisa e guarda uma cópia exata do original; abrir de novo não repete nem sobrescreve', () => {
    const old = downgrade(getCurrent(), 1);
    const raw = JSON.stringify(old);
    put(raw);
    const l1 = loadGameDetailed();
    expect(l1.source).toBe('principal');
    expect(l1.migration!.migrated).toBe(true);
    expect(l1.notice).toMatch(/atualizado/);
    expect(listOriginals().map((o) => o.schema)).toEqual([1]);
    const copy = (globalThis.localStorage as Storage).getItem(originalKey(1))!;
    expect(decompress(copy.split('|').slice(6).join('|'))).toBe(raw);                       // cópia idêntica ao original
    // o jogo salva a versão migrada e o original continua guardado
    saveGame(l1.game!, { now: 1_700_000_000_000 });
    const l2 = loadGameDetailed();
    expect(l2.migration!.migrated).toBe(false); expect(l2.notice).toBeUndefined();
    expect(listOriginals().length).toBe(1);
    expect((globalThis.localStorage as Storage).getItem(originalKey(1))).toBe(copy);        // não foi sobrescrito
    // restaurar o original devolve exatamente o que o jogador tinha, e ele abre normalmente de novo
    expect(restoreOriginal(1)).toBe(true);
    expect(readRawSave()).toBe(raw);
    const l3 = loadGameDetailed();
    expect(l3.game).not.toBeNull(); expect(l3.migration!.migrated).toBe(true);
  }, 200_000);
  it('loadGame deixa o aviso para a tela mostrar uma única vez', () => {
    put(JSON.stringify(downgrade(getCurrent(), 2)));
    expect(loadGame()).not.toBeNull();
    expect(takeLoadNotice()).toMatch(/atualizado/);
    expect(takeLoadNotice()).toBeNull();
  }, 100_000);
});

/** Saves reais de versões anteriores do jogo (quando disponíveis nesta máquina): a migração precisa preservar tudo neles também. */
const dir = process.env.SAVE_FIXTURES_DIR ?? '/tmp/claude-0/-home-user-Jogo-caminhoes/ea9da4ed-98cb-5a0d-81b9-6b5623986a25/scratchpad';
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^save.*\.json$/.test(f)) : [];
describe.skipIf(files.length === 0)('ETAPA 3 — saves reais de versões anteriores', () => {
  it.each(files)('%s: migra sem violar nada, é idempotente e continua jogável', (f) => {
    const old = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as GameState;
    const { game, report } = migrateGame(old);
    expect(report.rejected, report.violations.join(';')).toBe(false);
    expect(report.failed).toEqual([]);
    expect(game.schema).toBe(SAVE_SCHEMA);
    expect(verifyPreserved(old, game)).toEqual([]);
    expect(balanceOf(game)).toBe(balanceOf(old));
    expect(game.history.length).toBe(old.history.length);
    expect(migrateGame(game).game).toBe(game);
    if (isSeasonOver(game)) { const n = startNextSeason(game); expect(n.season).toBe(game.season + 1); expect(n.history.length).toBe(old.history.length + 1); return; }
    let g = game;
    for (let i = 0; i < 6; i++) g = playNext(g).state;
    expect(canon(g)).not.toBe(canon(game));                                  // o jogo avança (partidas, estaduais, dias)
    expect(g.results.length + (g.estadual?.step ?? 0)).toBeGreaterThan(game.results.length + (game.estadual?.step ?? 0));
  }, 200_000);
});

describe('ETAPA 3 — conferência de dados protegidos', () => {
  it('completar registros antigos com campos novos é permitido; trocar valores, tamanhos ou apagar é violação', async () => {
    const { covers } = await import('../src/engine/migrate');
    expect(covers({ a: 1 }, { a: 1, novo: 2 })).toBe(true);
    expect(covers([{ a: 1 }], [{ a: 1, kind: 'buy' }])).toBe(true);
    expect(covers({ a: 1 }, { a: 2 })).toBe(false);
    expect(covers([1, 2], [1, 2, 3])).toBe(false);
    expect(covers({ a: { b: 1 } }, { a: {} })).toBe(false);
    expect(covers(undefined, 5)).toBe(true);
    expect(covers(5, undefined)).toBe(false);
  });
});
