import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLedger, ledgerStart, reconcile, setLedgerPlugin, type SecureLedgerPlugin } from '../src/premium/ledger';
import { inTrial, setPremium } from '../src/premium/entitlement';

let store: Map<string, string>;
beforeEach(() => { store = new Map(); vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }); setLedgerPlugin(null, false); setPremium(false); });
afterEach(() => { setLedgerPlugin(null, null); setPremium(true); vi.unstubAllGlobals(); });

const save = (seed: number, season: number, freeStart?: number) => ({ seed, season, freeStart });

describe('livro da temporada grátis', () => {
  it('carreira nova é anotada; o save sem freeStart ganha o da temporada atual', () => {
    const g = reconcile(save(7, 2026));
    expect(g.freeStart).toBe(2026);
    expect(ledgerStart(7)).toBe(2026);
  });
  it('editar o save para "começar depois" (ou apagar o freeStart) não devolve a temporada grátis', () => {
    reconcile(save(7, 2026, 2026));
    const apagado = reconcile(save(7, 2028));                 // freeStart apagado na 3ª temporada
    expect(apagado.freeStart).toBe(2026);
    expect(inTrial(apagado)).toBe(false);
    const aumentado = reconcile(save(7, 2028, 2028));         // freeStart empurrado para a temporada atual
    expect(aumentado.freeStart).toBe(2026);
    expect(inTrial(aumentado)).toBe(false);
  });
  it('começar antes vale (só prejudica o jogador) e atualiza o livro; outra carreira não é afetada', () => {
    reconcile(save(7, 2026, 2026));
    expect(reconcile(save(7, 2028, 2025)).freeStart).toBe(2025);
    expect(ledgerStart(7)).toBe(2025);
    expect(ledgerStart(8)).toBeUndefined();
  });
  it('1 temporada grátis por aparelho: a primeira carreira tem; as novas já começam sem a temporada grátis', () => {
    const a = reconcile(save(1, 2026));
    expect(inTrial(a)).toBe(true);
    const b = reconcile(save(2, 2026));
    expect(inTrial(b)).toBe(false);
    expect(reconcile(save(2, 2026, 2026)).freeStart).toBe(2025);   // editar não devolve
    expect(inTrial(reconcile(save(1, 2026, 2026)))).toBe(true);    // a primeira continua com a dela
  });
  it('nada muda: devolve o mesmo objeto', () => {
    const g = save(1, 2026, 2026);
    expect(reconcile(g)).toBe(g);
    expect(reconcile(g)).toBe(g);
  });
  it('o livro persiste: depois de "reabrir o app" a carreira continua conhecida', async () => {
    reconcile(save(7, 2026, 2026));
    setLedgerPlugin(null, false);                             // zera a memória (como um novo início do app)
    expect(ledgerStart(7)).toBeUndefined();
    await initLedger();
    expect(ledgerStart(7)).toBe(2026);
  });
  it('no Android o livro vai para o plugin nativo e volta dele; livro adulterado/ilegível começa vazio sem quebrar', async () => {
    let disk: string | null = null;
    const p: SecureLedgerPlugin = { load: async () => ({ data: disk }), save: async ({ data }) => { disk = data; } };
    setLedgerPlugin(p);
    await initLedger();
    reconcile(save(9, 2026, 2026));
    expect(disk).toContain('"9":2026');
    setLedgerPlugin(p); await initLedger();
    expect(ledgerStart(9)).toBe(2026);
    disk = '{lixo';
    setLedgerPlugin(p); await initLedger();
    expect(ledgerStart(9)).toBeUndefined();
    setLedgerPlugin({ load: async () => { throw new Error('x'); }, save: async () => undefined });
    await expect(initLedger()).resolves.toBeUndefined();
  });
});
