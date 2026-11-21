import { migrateGame, migrationNotice, SAVE_SCHEMA, type MigrationReport } from './migrate';
import { CLUBS_DATA } from '../data/clubs';
import { compress, decompress } from './lzstore';
import { withSpots } from './squad';
import type { GameState } from './types';

/* =====================================================================
   Salvamento seguro. O save principal continua sendo o JSON da carreira na chave de sempre (compatível com tudo que já lê dele),
   mas agora cada gravação é conferida e protegida:
   - antes de sobrescrever, o save válido anterior vira uma cópia COMPRIMIDA (bak1; a anterior vai para bak2; no fim da temporada, `fim`);
   - depois de gravar, o jogo LÊ DE VOLTA e confere o tamanho e a soma de verificação; se não bater, restaura a cópia e avisa;
   - se não houver espaço, as cópias (menores) cedem lugar ao save principal; se mesmo assim falhar, o save antigo continua intacto e o jogador é avisado;
   - gravar o mesmo estado de novo não faz nada (sem duplicatas);
   - ao carregar, o principal é verificado; estando corrompido, o jogo recupera a cópia válida mais recente e conta o que aconteceu.
   ===================================================================== */

const KEY = 'caminhoes-save-v1'; // mesma chave de antes; o campo `version` do conteúdo diz o formato
export const SAVE_VERSION = 5;
export const originalKey = (schema: number) => `${KEY}:original-s${schema}`;
export const SAVE_KEYS = { meta: `${KEY}:meta`, bak1: `${KEY}:bak1`, bak2: `${KEY}:bak2`, fim: `${KEY}:fim`, corrupt: `${KEY}:corrupto` } as const;
/** Intervalos mínimos entre cópias de segurança (ms): a cópia recente é renovada a cada 2 min; a antiga, a cada 20 min. */
export const BACKUP_EVERY_MS = 2 * 60_000;
export const BACKUP_OLD_EVERY_MS = 20 * 60_000;

/** Soma de verificação (FNV-1a, 32 bits) em hexadecimal. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface SaveMeta { seq: number; savedAt: number; season: number; round: number; len: number; sum: string; bakAt?: number; bak2At?: number }
export type SaveFailure = 'serializar' | 'espaco' | 'conferencia' | 'armazenamento';
export type SaveOutcome = { ok: true; bytes: number; skipped?: boolean; backedUp?: boolean } | { ok: false; reason: SaveFailure; message: string };
export type LoadSource = 'principal' | 'copia-recente' | 'copia-antiga' | 'fim-de-temporada';
export interface LoadReport { game: GameState | null; source?: LoadSource; notice?: string; damaged?: boolean; migration?: MigrationReport }

const MSG: Record<SaveFailure, string> = {
  serializar: 'Não foi possível preparar o jogo para salvar.',
  espaco: 'Sem espaço para salvar: o aparelho está com o armazenamento do jogo cheio. Libere espaço (apague backups em Carregar Jogo) e tente de novo. O último save continua guardado.',
  conferencia: 'A gravação não passou na conferência e o jogo voltou ao último save válido. Tente salvar de novo.',
  armazenamento: 'Não foi possível acessar o armazenamento do aparelho. O progresso desta sessão pode não ser guardado.',
};

const get = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string): boolean => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const del = (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

function readMeta(): SaveMeta | null {
  const raw = get(SAVE_KEYS.meta);
  if (!raw) return null;
  try { const m = JSON.parse(raw) as SaveMeta; return m && typeof m.sum === 'string' && typeof m.len === 'number' ? m : null; } catch { return null; }
}

/** O texto é um save íntegro? (JSON válido, formato conhecido e, se há registro, tamanho e soma conferem) */
function verifyRaw(raw: string | null, meta: SaveMeta | null): { ok: boolean; why?: string } {
  if (!raw) return { ok: false, why: 'vazio' };
  if (meta && meta.len === raw.length && meta.sum !== checksum(raw)) return { ok: false, why: 'soma de verificação diferente' };
  try { return isValidSave(JSON.parse(raw)) ? { ok: true } : { ok: false, why: 'formato inválido' }; } catch { return { ok: false, why: 'JSON truncado' }; }
}

/** Cópia comprimida com cabeçalho conferível. */
const pack = (json: string, m: { savedAt: number; season: number; round: number }) => `z1|${checksum(json)}|${json.length}|${m.savedAt}|${m.season}|${m.round}|${compress(json)}`;
function unpack(rec: string | null): { json: string; savedAt: number; season: number; round: number } | null {
  if (!rec || !rec.startsWith('z1|')) return null;
  const parts = rec.split('|', 6);
  if (parts.length < 6) return null;
  const body = rec.slice(parts.join('|').length + 1);
  const json = decompress(body);
  if (json === null || json.length !== Number(parts[2]) || checksum(json) !== parts[1]) return null;
  return { json, savedAt: Number(parts[3]), season: Number(parts[4]), round: Number(parts[5]) };
}

/** Libera espaço apagando as cópias de segurança, das menos valiosas para as mais (o save principal tem prioridade). */
function freeSpace(level: number): boolean {
  const order = [SAVE_KEYS.corrupt, SAVE_KEYS.bak2, SAVE_KEYS.fim, SAVE_KEYS.bak1];
  if (level >= order.length) return false;
  del(order[level]);
  return true;
}

let lastSum: string | null = null;
let statusCb: ((o: SaveOutcome) => void) | null = null;
/** A tela escuta o resultado de cada gravação (para avisar falhas). */
export const onSaveResult = (cb: ((o: SaveOutcome) => void) | null) => { statusCb = cb; };
let corruptPending: string | null = null; // conteúdo ilegível do save principal, guardado à parte antes de ser sobrescrito

/** Grava o texto do save com todas as proteções. `urgent` (fim de temporada etc.) renova as cópias na hora. */
export function commitSave(json: string, info: { season: number; round: number }, opts: { now?: number; urgent?: boolean; endOfSeason?: boolean } = {}): SaveOutcome {
  const now = opts.now ?? Date.now();
  const sum = checksum(json);
  const meta = readMeta();
  const current = get(KEY);
  if (sum === lastSum && current !== null && meta?.sum === sum) return { ok: true, bytes: json.length, skipped: true }; // nada mudou: não grava de novo
  if (current !== null && meta?.sum === sum && meta.len === json.length && current.length === json.length) { lastSum = sum; return { ok: true, bytes: json.length, skipped: true }; }
  const fail = (reason: SaveFailure): SaveOutcome => { const o: SaveOutcome = { ok: false, reason, message: MSG[reason] }; statusCb?.(o); return o; };
  try { localStorage.length; } catch { return fail('armazenamento'); }

  // 0) o conteúdo ilegível que estava no lugar do save é guardado à parte (nunca perdido por ser sobrescrito)
  if (corruptPending) { set(SAVE_KEYS.corrupt, compress(corruptPending.slice(0, 2_000_000))); corruptPending = null; }
  // 1) o save válido anterior vira cópia de segurança comprimida
  let backedUp = false;
  let bak2At = meta?.bak2At;
  const prevOk = current !== null && verifyRaw(current, meta).ok;
  if (prevOk && meta && (opts.urgent || now - (meta.bakAt ?? 0) >= BACKUP_EVERY_MS)) {
    const old1 = get(SAVE_KEYS.bak1);
    if (old1 && now - (meta.bak2At ?? 0) >= BACKUP_OLD_EVERY_MS && set(SAVE_KEYS.bak2, old1)) bak2At = now; // a cópia recente envelhece
    const rec = pack(current!, { savedAt: meta.savedAt, season: meta.season, round: meta.round });
    for (let level = 0; ; level++) { if (set(SAVE_KEYS.bak1, rec)) { backedUp = true; break; } if (!freeSpace(level)) break; }
  }
  // 2) grava o principal (se faltar espaço, as cópias cedem lugar; o save anterior continua intacto enquanto a gravação não conclui)
  let wrote = set(KEY, json);
  for (let level = 0; !wrote && freeSpace(level); level++) wrote = set(KEY, json);
  if (!wrote) return fail('espaco');
  // 3) lê de volta e confere
  if (get(KEY) !== json) {
    const rec = unpack(get(SAVE_KEYS.bak1));
    if (rec) set(KEY, rec.json); // restaura o último save válido
    return fail('conferencia');
  }
  const m: SaveMeta = { seq: (meta?.seq ?? 0) + 1, savedAt: now, season: info.season, round: info.round, len: json.length, sum, bakAt: backedUp ? now : meta?.bakAt, bak2At };
  set(SAVE_KEYS.meta, JSON.stringify(m));
  if (opts.endOfSeason) set(SAVE_KEYS.fim, pack(json, { savedAt: now, season: info.season, round: info.round })); // ponto de recuperação limpo da virada
  lastSum = sum;
  const ok: SaveOutcome = { ok: true, bytes: json.length, backedUp };
  statusCb?.(ok);
  return ok;
}

/** Salva a carreira com as proteções acima. */
export function saveGame(g: GameState, opts: { now?: number; urgent?: boolean; endOfSeason?: boolean } = {}): SaveOutcome {
  let json: string;
  try { json = JSON.stringify(g); } catch { const o: SaveOutcome = { ok: false, reason: 'serializar', message: MSG.serializar }; statusCb?.(o); return o; }
  return commitSave(json, { season: g.season, round: g.round }, opts);
}

/** Confere se um JSON de save tem o formato de uma versão suportada (2 a 5). */
export function isValidSave(g: unknown): g is GameState {
  const s = g as Partial<GameState> | null;
  return !!s && ((s.version as number) === 2 || (s.version as number) === 3 || (s.version as number) === 4 || s.version === SAVE_VERSION) && !!s.divisions && !!s.teams && !!s.clubs && !!s.userClubId && typeof s.round === 'number';
}

/**
 * O Cassino do celular foi removido do jogo. Saves antigos: o saldo que estava no Cassino volta para o dinheiro do treinador,
 * o app sai do celular e o histórico de apostas é descartado.
 */
export function retireCasino(g: GameState): GameState {
  const old = g as GameState & { casino?: { balance?: number } };
  const hasApp = !!g.phone?.installed.includes('cassino');
  if (!old.casino && !hasApp) return g;
  const { casino, ...rest } = old;
  const back = Math.max(0, Math.round(casino?.balance ?? 0));
  const next: GameState = { ...(rest as GameState), coachMoney: (g.coachMoney ?? 0) + back };
  if (hasApp && g.phone) next.phone = { ...g.phone, installed: g.phone.installed.filter((id) => id !== 'cassino') };
  return next;
}

/** Completa saves antigos (v2 a v4) com os campos novos: orçamentos, histórico, humor, listas, propostas e empréstimos. */
export function migrateSave(g: GameState): GameState {
  if ((g.version as number) === SAVE_VERSION) return g;
  const data = new Map(Object.values(CLUBS_DATA).flat().map((c) => [c.id, c]));
  const budgets = g.budgets ?? Object.fromEntries(Object.keys(g.clubs).map((id) => [id, data.get(id)?.budget ?? 10_000_000]));
  const clubs = Object.fromEntries(Object.entries(g.clubs).map(([id, c]) => [id, { ...c, boardExpectation: (c as Partial<typeof c>).boardExpectation ?? data.get(id)?.boardExpectation ?? 'mid' }]));
  const transfers = (g.transfers ?? []).map((t) => ({ ...t, kind: (t as Partial<typeof t>).kind ?? ('buy' as const) }));
  return {
    ...g, version: 5, budgets, clubs, transfers, news: g.news ?? [],
    morale: g.morale ?? { team: 60, board: 60, fans: 60 }, transferList: g.transferList ?? [], loanList: g.loanList ?? [], offers: g.offers ?? [], loans: g.loans ?? [],
  };
}

/** Saves antigos: dá função (lateral, ponta, centroavante...) aos jogadores que não têm, sem mexer em quem já tem. */
export function withSpotsAll(g: GameState): GameState {
  const fix = (teams: GameState['teams']) => Object.fromEntries(Object.entries(teams).map(([id, t]) => [id, t.players.every((p) => p.spot) ? t : { ...t, players: withSpots(t.players) }]));
  return { ...g, teams: fix(g.teams), ...(g.foreign ? { foreign: { ...g.foreign, teams: fix(g.foreign.teams) } } : {}) };
}

/** Guarda o save original (antes de migrar) numa cópia comprimida: uma por geração de origem, nunca sobrescrita. */
function preserveOriginal(raw: string, g: GameState, fromSchema: number): boolean {
  if (get(originalKey(fromSchema))) return true;
  const rec = pack(raw, { savedAt: Date.now(), season: g.season, round: g.round });
  for (let level = 0; ; level++) { if (set(originalKey(fromSchema), rec)) return true; if (!freeSpace(level)) return false; }
}

/** Abre o save: migra para a geração atual (guardando antes o original) e devolve o jogo com o relatório. */
function prepareGame(raw: string): { game: GameState; migration: MigrationReport; notice: string | null } {
  const g = JSON.parse(raw) as GameState;
  const { game, report } = migrateGame(g);
  let notice = migrationNotice(report);
  if (report.migrated || report.rejected || report.failed.length) {
    const kept = preserveOriginal(raw, g, report.fromSchema);
    if (!kept && notice) notice += ' Atenção: não houve espaço para guardar a cópia do save original.';
  }
  return { game, migration: report, notice };
}

/** Lista os saves originais guardados antes de migrações (para restaurar se o jogador quiser). */
export function listOriginals(): { schema: number; savedAt: number; season: number; round: number }[] {
  const out: { schema: number; savedAt: number; season: number; round: number }[] = [];
  for (let s = 0; s <= SAVE_SCHEMA; s++) { const u = unpack(get(originalKey(s))); if (u) out.push({ schema: s, savedAt: u.savedAt, season: u.season, round: u.round }); }
  return out;
}

/** Volta ao save original guardado antes da migração (ele será migrado de novo ao abrir). */
export function restoreOriginal(schema: number): boolean {
  const u = unpack(get(originalKey(schema)));
  if (!u || !verifyRaw(u.json, null).ok) return false;
  try { return commitSave(u.json, { season: u.season, round: u.round }, { urgent: true }).ok; } catch { return false; }
}

export type AutoCopyKind = 'bak1' | 'bak2' | 'fim';
const COPY_LABEL: Record<AutoCopyKind, string> = { bak1: 'Cópia automática recente', bak2: 'Cópia automática antiga', fim: 'Início da última temporada' };
/** Cópias automáticas de segurança disponíveis (a mais recente, a antiga e o ponto de recuperação do fim da temporada). */
export function listAutoCopies(): { kind: AutoCopyKind; label: string; savedAt: number; season: number; round: number }[] {
  return (['bak1', 'bak2', 'fim'] as const).flatMap((kind) => { const u = unpack(get(SAVE_KEYS[kind])); return u ? [{ kind, label: COPY_LABEL[kind], savedAt: u.savedAt, season: u.season, round: u.round }] : []; });
}
/** Volta o jogo para uma cópia automática (o save atual vira cópia antes de ser substituído). */
export function restoreAutoCopy(kind: AutoCopyKind): boolean {
  const u = unpack(get(SAVE_KEYS[kind]));
  if (!u || !verifyRaw(u.json, null).ok) return false;
  return commitSave(u.json, { season: u.season, round: u.round }, { urgent: true }).ok;
}

/** Carrega a carreira: confere o save principal e, se estiver corrompido, recupera a cópia válida mais recente. O relatório diz de onde veio. */
export function loadGameDetailed(): LoadReport {
  try {
    const meta = readMeta();
    const raw = get(KEY);
    const v = verifyRaw(raw, meta);
    if (v.ok) {
      const p = prepareGame(raw!);
      return { game: p.game, source: 'principal', migration: p.migration, ...(p.notice ? { notice: p.notice } : {}) };
    }
    const hadData = raw !== null && raw.length > 0;
    if (hadData) corruptPending = raw; // preservado para não ser perdido pelo próximo salvamento
    const candidates: { src: LoadSource; rec: ReturnType<typeof unpack> }[] = [
      { src: 'copia-recente', rec: unpack(get(SAVE_KEYS.bak1)) }, { src: 'copia-antiga', rec: unpack(get(SAVE_KEYS.bak2)) }, { src: 'fim-de-temporada', rec: unpack(get(SAVE_KEYS.fim)) },
    ];
    const best = candidates.filter((c) => c.rec && verifyRaw(c.rec.json, null).ok).sort((a, b) => b.rec!.savedAt - a.rec!.savedAt)[0];
    if (best) {
      const pg = prepareGame(best.rec!.json);
      set(KEY, best.rec!.json); // o principal volta a ser um save válido
      set(SAVE_KEYS.meta, JSON.stringify({ seq: (meta?.seq ?? 0) + 1, savedAt: best.rec!.savedAt, season: best.rec!.season, round: best.rec!.round, len: best.rec!.json.length, sum: checksum(best.rec!.json), bakAt: meta?.bakAt, bak2At: meta?.bak2At } satisfies SaveMeta));
      lastSum = null;
      const label = best.src === 'fim-de-temporada' ? 'o ponto de recuperação do fim da temporada' : 'a cópia de segurança mais recente';
      return { game: pg.game, source: best.src, damaged: true, migration: pg.migration, notice: `${pg.notice ? `${pg.notice} ` : ''}⚠️ O save mais recente estava danificado (${v.why}). Recuperamos ${label}: temporada ${best.rec!.season}, rodada ${Math.min(best.rec!.round, 99)}. Pode ser que as últimas partidas precisem ser jogadas de novo.` };
    }
    return { game: null, damaged: hadData, notice: hadData ? '⚠️ Não foi possível abrir o save: ele está danificado e não há cópia de segurança válida. O conteúdo foi preservado no aparelho e não será apagado.' : undefined };
  } catch { return { game: null }; }
}

export function loadGame(): GameState | null {
  const r = loadGameDetailed();
  if (r.notice) pendingNotice = r.notice;
  return r.game;
}
let pendingNotice: string | null = null;
/** Mensagem sobre a última recuperação (uma vez só). */
export function takeLoadNotice(): string | null { const n = pendingNotice; pendingNotice = null; return n; }

/** Apaga o save e todas as cópias (só quando o jogador decide apagar a carreira). */
export function clearSave() {
  for (const k of [KEY, ...Object.values(SAVE_KEYS), ...Array.from({ length: SAVE_SCHEMA + 1 }, (_, i) => originalKey(i))]) del(k);
  lastSum = null; corruptPending = null;
}

/** Acesso ao JSON bruto do save principal (usado pelos backups manuais). */
export function readRawSave(): string | null { return get(KEY); }

/** Substitui o save principal por um texto de save (restauração de backup), pelo mesmo caminho protegido. */
export function writeRawSave(raw: string): boolean {
  try {
    const g = JSON.parse(raw) as GameState;
    if (!isValidSave(g)) return false;
    return commitSave(raw, { season: g.season, round: g.round }, { urgent: true }).ok;
  } catch { return false; }
}
