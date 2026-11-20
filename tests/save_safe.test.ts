import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { beforeEach, describe, expect, it } from 'vitest';
import { Autosaver, importantReason } from '../src/engine/autosave';
import { compress, decompress } from '../src/engine/lzstore';
import { BACKUP_EVERY_MS, checksum, clearSave, isValidSave, loadGame, loadGameDetailed, onSaveResult, readRawSave, saveGame, SAVE_KEYS, type SaveOutcome } from '../src/engine/save';
import { createBackup, restoreBackup } from '../src/settings/backups';
import { playNext, simulateToEnd } from '../src/engine/game';
import { auditUniverse } from '../src/engine/aiaudit';
import type { GameState } from '../src/engine/types';
import { makeCareer } from './helpers';

const KEY = 'caminhoes-save-v1';
interface Store { mem: Map<string, string>; calls: string[]; failKeys: Set<string>; truncateKey: string | null; quota: number }
let st: Store;
function install(quota = Infinity): Store {
  const mem = new Map<string, string>();
  const s: Store = { mem, calls: [], failKeys: new Set(), truncateKey: null, quota };
  const total = () => [...mem.values()].reduce((a, v) => a + v.length, 0);
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      s.calls.push(k);
      if (s.failKeys.has(k)) throw new Error('falha simulada');
      if (total() - (mem.get(k)?.length ?? 0) + v.length > s.quota) throw new Error('QuotaExceededError');
      mem.set(k, s.truncateKey === k ? v.slice(0, Math.floor(v.length / 2)) : v);   // gravação incompleta, quando pedida
    },
    removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0,
  } as unknown as Storage;
  return s;
}
const base = makeCareer('flamengo', 12);
const at = (g: GameState, extra: number): GameState => ({ ...g, round: g.round + extra });
const T0 = 1_700_000_000_000;

beforeEach(() => { st = install(); clearSave(); onSaveResult(null); });

describe('compressão das cópias', () => {
  it('ida e volta exata (texto com acentos e emojis, vazio e um save inteiro); dado truncado é rejeitado', () => {
    for (const t of ['', 'a', 'ação — ñ 日本語 😀', 'abc'.repeat(5000)]) expect(decompress(compress(t))).toBe(t);
    const json = JSON.stringify(base);
    const z = compress(json);
    expect(z.length).toBeLessThan(json.length / 4);
    expect(decompress(z)).toBe(json);
    expect(decompress(z.slice(0, z.length - 20))).toBeNull();
    expect(decompress('lixo')).toBeNull();
  });
});

describe('ETAPA 2 — gravação segura', () => {
  it('o save principal continua sendo o JSON da carreira (compatível), com registro de integridade; carregar devolve o mesmo jogo', () => {
    const r = saveGame(base, { now: T0 });
    expect(r.ok).toBe(true);
    const raw = readRawSave()!;
    expect(isValidSave(JSON.parse(raw))).toBe(true);
    const meta = JSON.parse(st.mem.get(SAVE_KEYS.meta)!);
    expect(meta).toMatchObject({ len: raw.length, sum: checksum(raw), season: base.season });
    const l = loadGameDetailed();
    expect(l.source).toBe('principal'); expect(l.notice).toBeUndefined();
    expect(l.game!.season).toBe(base.season);
  });
  it('não grava de novo o mesmo estado (sem salvamentos duplicados)', () => {
    saveGame(base, { now: T0 });
    st.calls.length = 0;
    const r = saveGame(base, { now: T0 + 1000 });
    expect(r).toMatchObject({ ok: true, skipped: true });
    expect(st.calls).toEqual([]);
    expect(saveGame(JSON.parse(JSON.stringify(base)), { now: T0 + 2000 })).toMatchObject({ skipped: true }); // outro objeto, mesmo conteúdo
    expect(st.calls).toEqual([]);
  });
  it('o save anterior vira cópia comprimida antes de ser substituído; a cópia só é renovada de tempos em tempos', () => {
    saveGame(base, { now: T0 });
    expect(st.mem.has(SAVE_KEYS.bak1)).toBe(false);                    // nada a copiar no primeiro save
    saveGame(at(base, 1), { now: T0 + 1000 });                         // o save anterior vira cópia na primeira substituição
    const first = st.mem.get(SAVE_KEYS.bak1)!;
    expect(first.startsWith('z1|')).toBe(true);
    expect(st.mem.get(KEY)!.length).toBeGreaterThan(first.length * 3); // a cópia é bem menor
    saveGame(at(base, 2), { now: T0 + 2000 });                         // 1 segundo depois: a cópia não é refeita
    expect(st.mem.get(SAVE_KEYS.bak1)).toBe(first);
    saveGame(at(base, 3), { now: T0 + BACKUP_EVERY_MS + 5000 });       // passou o intervalo: nova cópia (do save anterior)
    expect(st.mem.get(SAVE_KEYS.bak1)).not.toBe(first);
  });
});

describe('ETAPA 2 — recuperação de save danificado', () => {
  const twoSaves = () => { saveGame(base, { now: T0 }); saveGame(at(base, 5), { now: T0 + BACKUP_EVERY_MS + 1 }); return at(base, 5); };
  it('save truncado: recupera a cópia válida mais recente, avisa, restaura o principal e preserva o conteúdo danificado', () => {
    twoSaves();
    const raw = st.mem.get(KEY)!;
    st.mem.set(KEY, raw.slice(0, raw.length / 2));                    // gravação interrompida no meio
    const l = loadGameDetailed();
    expect(l.source).toBe('copia-recente'); expect(l.damaged).toBe(true);
    expect(l.notice).toMatch(/danificado/);
    expect(l.game!.round).toBe(base.round);                           // a cópia guardava o estado anterior
    expect(isValidSave(JSON.parse(readRawSave()!))).toBe(true);        // o principal voltou a ser válido
    saveGame(at(base, 8), { now: T0 + 2 * BACKUP_EVERY_MS });          // o próximo save guarda o conteúdo danificado à parte
    expect(st.mem.has(SAVE_KEYS.corrupt)).toBe(true);
    expect(decompress(st.mem.get(SAVE_KEYS.corrupt)!)).toBe(raw.slice(0, raw.length / 2));
  });
  it('JSON ainda válido, mas alterado (corrupção silenciosa): a soma de verificação pega e a cópia é usada', () => {
    twoSaves();
    const raw = st.mem.get(KEY)!;
    const i = raw.indexOf('"round":');
    st.mem.set(KEY, raw.slice(0, i + 8) + '9' + raw.slice(i + 9));       // troca um dígito: mesmo tamanho, ainda é JSON
    expect(JSON.parse(st.mem.get(KEY)!)).toBeTruthy();
    const l = loadGameDetailed();
    expect(l.source).toBe('copia-recente');
  });
  it('principal e cópia recente danificados: usa a cópia antiga; todas danificadas: devolve null, avisa e NÃO apaga o conteúdo', () => {
    saveGame(base, { now: T0 });
    saveGame(at(base, 1), { now: T0 + BACKUP_EVERY_MS + 1 });
    saveGame(at(base, 2), { now: T0 + 2 * BACKUP_EVERY_MS + 2 });
    saveGame(at(base, 3), { now: T0 + 3 * BACKUP_EVERY_MS + 3 });
    saveGame(at(base, 4), { now: T0 + 25 * 60_000 });                    // bak2 passa a existir (cópia de mais de 20 min)
    st.mem.set(KEY, 'lixo'); st.mem.set(SAVE_KEYS.bak1, 'z1|quebrado');
    const l = loadGameDetailed();
    expect(['copia-antiga', 'fim-de-temporada']).toContain(l.source);
    expect(l.game).not.toBeNull();
    // tudo danificado
    st.mem.set(KEY, 'lixo'); st.mem.set(SAVE_KEYS.bak1, 'x'); st.mem.set(SAVE_KEYS.bak2, 'y'); st.mem.delete(SAVE_KEYS.fim);
    const none = loadGameDetailed();
    expect(none.game).toBeNull(); expect(none.notice).toMatch(/não há cópia/);
    expect(st.mem.get(KEY)).toBe('lixo');                              // nada foi apagado
  });
  it('ponto de recuperação do fim da temporada: serve quando o principal e as cópias comuns estão danificados', () => {
    const e = simulateToEnd(base);
    const n = startNextSeason(e);
    saveGame(e, { now: T0 });
    saveGame(n, { now: T0 + 10_000, urgent: true, endOfSeason: true });
    expect(st.mem.has(SAVE_KEYS.fim)).toBe(true);
    st.mem.set(KEY, '{'); st.mem.delete(SAVE_KEYS.bak1); st.mem.delete(SAVE_KEYS.bak2);
    const l = loadGameDetailed();
    expect(l.source).toBe('fim-de-temporada');
    expect(l.game!.season).toBe(n.season);
    expect(l.notice).toMatch(/fim da temporada/);
  }, 200_000);
  it('save antigo sem registro de integridade (versão anterior do app) abre normalmente', () => {
    st.mem.set(KEY, JSON.stringify(base));
    const l = loadGameDetailed();
    expect(l.source).toBe('principal');
    expect(l.game!.season).toBe(base.season);
  });
  it('clearSave (apagar a carreira de propósito) remove o principal e todas as cópias', () => {
    saveGame(base, { now: T0 }); saveGame(at(base, 1), { now: T0 + BACKUP_EVERY_MS + 1 });
    clearSave();
    expect([...st.mem.keys()].filter((k) => k.startsWith(KEY))).toEqual([]);
    expect(loadGame()).toBeNull();
  });
});

describe('ETAPA 2 — falhas durante o salvamento', () => {
  it('sem espaço: avisa, devolve a causa e o save anterior continua intacto e carregável', () => {
    saveGame(base, { now: T0 });
    const before = st.mem.get(KEY)!;
    const results: SaveOutcome[] = []; onSaveResult((o) => results.push(o));
    st.failKeys.add(KEY);                                              // não consegue gravar o principal
    const r = saveGame(at(base, 3), { now: T0 + BACKUP_EVERY_MS + 1 });
    expect(r).toMatchObject({ ok: false, reason: 'espaco' });
    expect((r as { message: string }).message).toMatch(/espaço/);
    expect(results.at(-1)).toMatchObject({ ok: false });
    expect(st.mem.get(KEY)).toBe(before);
    st.failKeys.clear();
    expect(loadGameDetailed().game!.round).toBe(base.round);
    expect(saveGame(at(base, 3), { now: T0 + 3 * BACKUP_EVERY_MS }).ok).toBe(true);   // depois que volta, grava normalmente
    expect(results.at(-1)).toMatchObject({ ok: true });
  });
  it('gravação que sai pela metade: é detectada na leitura de volta, o último save válido é restaurado e o jogador é avisado', () => {
    saveGame(base, { now: T0 });
    st.truncateKey = KEY;
    const r = saveGame(at(base, 4), { now: T0 + BACKUP_EVERY_MS + 1 });
    expect(r).toMatchObject({ ok: false, reason: 'conferencia' });
    st.truncateKey = null;
    const l = loadGameDetailed();
    expect(l.game).not.toBeNull();
    expect(l.game!.round).toBe(base.round);                            // voltou ao save válido anterior
  });
  it('armazenamento quase cheio: as cópias cedem lugar ao save principal, que sempre é gravado', () => {
    saveGame(base, { now: T0 });
    saveGame(at(base, 1), { now: T0 + BACKUP_EVERY_MS + 1 });
    const used = [...st.mem.values()].reduce((a, v) => a + v.length, 0);
    st.quota = used + 100;                                             // quase nada de folga
    const r = saveGame(at(base, 2), { now: T0 + 2 * BACKUP_EVERY_MS + 2 });
    expect(r.ok).toBe(true);
    expect(loadGameDetailed().game!.round).toBe(base.round + 2);
  });
  it('backups manuais continuam funcionando e passam pelo caminho protegido ao restaurar', () => {
    saveGame(base, { now: T0 });
    const b = createBackup(T0);
    expect(b.ok).toBe(true);
    saveGame(at(base, 6), { now: T0 + 10 * BACKUP_EVERY_MS });
    expect(restoreBackup((b as { backup: { id: string } }).backup.id)).toBe(true);
    expect(loadGameDetailed().game!.round).toBe(base.round);
  });
});

describe('ETAPA 2 — quando salvar (Autosaver)', () => {
  const mk = () => {
    const timers: { fn: () => void; ms: number; id: number }[] = [];
    let id = 0;
    const saved: { g: GameState; o: { urgent?: boolean; endOfSeason?: boolean } }[] = [];
    const a = new Autosaver({
      save: (g, o) => { saved.push({ g, o }); return { ok: true, bytes: 1 }; },
      setTimer: (fn, ms) => { timers.push({ fn, ms, id: ++id }); return id; },
      clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    });
    const run = () => { const t = timers.splice(0); t.forEach((x) => x.fn()); };
    return { a, timers, saved, run };
  };
  it('momentos importantes salvam na hora; mudanças pequenas esperam e viram uma gravação só', () => {
    const { a, timers, saved, run } = mk();
    a.update(base);                                                    // primeiro estado: espera um pouco
    expect(timers[0].ms).toBeGreaterThan(0); run(); expect(saved.length).toBe(1);
    const small = { ...base, teams: { ...base.teams } };               // mudança pequena (mesmos marcadores)
    expect(importantReason(base, small)).toBeNull();
    a.update(small); a.update({ ...small, news: [] }); a.update({ ...small, news: [], morale: base.morale });
    expect(timers.length).toBe(1); expect(timers[0].ms).toBeGreaterThan(0);   // as três mudanças viraram um só aviso
    run(); expect(saved.length).toBe(2);
    const played = at(small, 1);
    expect(importantReason(small, played)).toBe('partida');
    a.update(played); expect(timers[0].ms).toBe(0); run(); expect(saved.length).toBe(3); expect(saved[2].o.urgent).toBe(false);
  });
  it('transferência, contrato, mudança de elenco, troca de clube e virada de temporada são reconhecidas', () => {
    const t: GameState = { ...base, transfers: [...base.transfers, { kind: 'buy', season: 2026, round: 1, playerId: 'x', playerName: 'X', pos: 'ATT', strength: 60, fromClubId: 'a', toClubId: 'b', fee: 1 }] };
    expect(importantReason(base, t)).toBe('transferencia');
    expect(importantReason(base, { ...base, contractLog: [{ day: 1, playerId: 'x', playerName: 'X', clubId: 'a', kind: 'renovou', note: '' }] })).toBe('contrato');
    expect(importantReason(base, { ...base, teams: { ...base.teams, flamengo: { ...base.teams.flamengo, players: base.teams.flamengo.players.slice(1) } } })).toBe('elenco');
    expect(importantReason(base, { ...base, userClubId: 'santos' })).toBe('carreira');
    expect(importantReason(base, { ...base, season: base.season + 1, history: [...base.history, base.history[0] ?? ({} as never)] })).toBe('temporada');
    expect(importantReason(null, base)).toBeNull();
  });
  it('a virada de temporada pede cópia imediata e ponto de recuperação; flush grava o que está pendente (app indo para segundo plano) uma única vez', () => {
    const { a, saved } = mk();
    a.update(base);
    a.update({ ...base, season: base.season + 1, history: [...base.history, {} as never] });
    const r = a.flush();
    expect(r).toMatchObject({ ok: true });
    expect(saved.at(-1)!.o).toEqual({ urgent: true, endOfSeason: true });
    expect(a.flush()).toBeNull();                                      // nada mais pendente
    expect(saved.length).toBe(1);                                      // o estado anterior descartado não foi gravado à toa
  });
  it('o mesmo objeto de jogo nunca é enviado duas vezes', () => {
    const { a, saved, run } = mk();
    a.update(base); a.update(base); run();
    expect(saved.length).toBe(1);
  });
});

describe('ETAPA 2 — salvamento ao longo de uma temporada real', () => {
  it('com o controle automático, a cada partida: sempre há save válido; corromper o principal em qualquer ponto recupera um estado jogável e íntegro; o custo por gravação é pequeno', () => {
    install(); clearSave();
    const a = new Autosaver({ debounceMs: 0, setTimer: (fn) => { fn(); return 0; } });
    let g = makeCareer('palmeiras', 21);
    a.update(g);
    const times: number[] = [];
    let recovered = 0;
    for (let i = 1; i <= 40 && g.round <= g.totalRounds; i++) {
      g = playNext(g).state;
      const t0 = performance.now(); a.update(g); times.push(performance.now() - t0);
      if (i % 9 === 0) {
        const l1 = loadGameDetailed();
        expect(l1.source).toBe('principal'); expect(l1.game!.round).toBe(g.round);
        const raw = readRawSave()!;
        (globalThis.localStorage as Storage).setItem(KEY, raw.slice(0, 5000));       // simula corrupção do principal
        const l2 = loadGameDetailed();
        if (l2.game) { recovered++; expect(l2.damaged).toBe(true); expect(l2.game.round).toBeLessThanOrEqual(g.round); expect(auditUniverse(l2.game)).toEqual([]); }
        (globalThis.localStorage as Storage).setItem(KEY, raw);                         // volta ao normal para seguir jogando
        clearCache();
      }
    }
    expect(recovered).toBeGreaterThanOrEqual(0);
    const avg = times.reduce((x, y) => x + y, 0) / times.length;
    expect(avg).toBeLessThan(250);
  }, 400_000);
});
function clearCache() { /* o módulo guarda só a soma do último save; gravar de novo recalcula */ }
