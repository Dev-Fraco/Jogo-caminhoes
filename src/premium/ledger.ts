import { Capacitor, registerPlugin } from '@capacitor/core';
import type { GameState } from '../engine/types';

/* =====================================================================
   Livro da temporada grátis. O "onde a carreira começou" (freeStart) fica no save, e o save é do jogador: editar o arquivo ou o
   localStorage devolveria a temporada grátis. Por isso cada carreira também é anotada num livro fora do save:
   - no Android, pelo plugin nativo SecureLedger (arquivo privado do app com selo HMAC de uma chave do Keystore, e uma cópia no
     Block Store do Google Play Services, que costuma sobreviver a limpar dados e reinstalar);
   - nos demais (web, testes) o livro fica no localStorage, sem proteção (nessas versões nada é cobrado).
   Regra: o livro manda. Um save nunca pode "começar depois" do que o livro registrou.
   ===================================================================== */

export interface SecureLedgerPlugin {
  load(): Promise<{ data: string | null }>;
  save(o: { data: string }): Promise<unknown>;
}

const LS_KEY = 'vr-ledger';
const MAX = 300;
interface Book { v: 1; c: Record<string, number> }

let plugin: SecureLedgerPlugin | null = null;
let nativeOverride: boolean | null = null;
let book: Book = { v: 1, c: {} };
/** Só para testes. */
export function setLedgerPlugin(p: SecureLedgerPlugin | null, native: boolean | null = p ? true : null): void { plugin = p; nativeOverride = native; book = { v: 1, c: {} }; }
const isNative = (): boolean => (nativeOverride ?? Capacitor.isNativePlatform());
const api = (): SecureLedgerPlugin => plugin ?? (plugin = registerPlugin<SecureLedgerPlugin>('SecureLedger'));

function parse(text: string | null | undefined): Book | null {
  if (!text) return null;
  try {
    const b = JSON.parse(text) as Book;
    if (b?.v !== 1 || typeof b.c !== 'object' || b.c === null) return null;
    const c: Record<string, number> = {};
    for (const [k, v] of Object.entries(b.c)) if (Number.isFinite(v)) c[k] = v as number;
    return { v: 1, c };
  } catch { return null; }
}

/** Lê o livro (chamar uma vez antes de montar o jogo). Nunca falha: sem livro, começa vazio. */
export async function initLedger(): Promise<void> {
  let text: string | null = null;
  try {
    if (isNative()) text = (await api().load()).data;
    else text = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
  } catch { /* sem livro */ }
  book = parse(text) ?? { v: 1, c: {} };
}

function persist(): void {
  const keys = Object.keys(book.c);
  if (keys.length > MAX) for (const k of keys.slice(0, keys.length - MAX)) delete book.c[k];
  const data = JSON.stringify(book);
  try {
    if (isNative()) void api().save({ data }).catch(() => undefined);
    else if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, data);
  } catch { /* sem armazenamento */ }
}

/** Em que temporada o livro diz que a carreira começou (undefined = carreira desconhecida). */
export const ledgerStart = (seed: number): number | undefined => book.c[String(seed)];

/**
 * Confere o save com o livro. Carreira nova: anota. Carreira conhecida: o save não pode começar depois do livro
 * (apagar ou aumentar o freeStart não devolve a temporada grátis); começar antes vale e atualiza o livro.
 * Devolve o mesmo objeto quando nada muda.
 */
export function reconcile<T extends Pick<GameState, 'seed' | 'season' | 'freeStart'>>(g: T): T {
  const key = String(g.seed);
  const known = book.c[key];
  const claimed = g.freeStart ?? g.season;
  if (known === undefined) { book.c[key] = claimed; persist(); return g.freeStart === undefined ? { ...g, freeStart: claimed } : g; }
  const start = Math.min(known, claimed);
  if (start !== known) { book.c[key] = start; persist(); }
  return g.freeStart === start ? g : { ...g, freeStart: start };
}
