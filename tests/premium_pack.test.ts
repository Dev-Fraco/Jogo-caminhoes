import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensurePack, onPackProgress, packNeeded, setPackPlugin, setSplitPremium, type PremiumPackPlugin } from '../src/premium/pack';

function fake(opts: { ready?: boolean; fail?: boolean; progress?: [number, number] } = {}) {
  let ready = opts.ready ?? false;
  const calls = { ensure: 0, status: 0, removed: 0 };
  const p: PremiumPackPlugin = {
    status: async () => { calls.status++; return { ready }; },
    ensure: async () => { calls.ensure++; await Promise.resolve(); if (opts.fail) throw new Error('unavailable'); ready = true; return { ready: true }; },
    addListener: async (_e, cb) => { if (opts.progress) cb({ done: opts.progress[0], total: opts.progress[1] }); return { remove: async () => { calls.removed++; } }; },
  };
  return { p, calls };
}
afterEach(() => { setPackPlugin(null, null); setSplitPremium(false); });

describe('pacote Premium (Play Asset Delivery)', () => {
  it('build normal (código dentro do app): não faz nada e nem chama a Play', async () => {
    const f = fake(); setPackPlugin(f.p); setSplitPremium(false);
    expect(packNeeded()).toBe(false);
    await ensurePack();
    expect(f.calls.status + f.calls.ensure).toBe(0);
  });
  it('build da loja: baixa uma vez, mostra o progresso e depois não baixa de novo', async () => {
    const f = fake({ progress: [30, 120] }); setPackPlugin(f.p); setSplitPremium(true);
    const seen: number[] = []; const off = onPackProgress((n) => seen.push(n));
    await Promise.all([ensurePack(), ensurePack()]);   // chamadas ao mesmo tempo dividem o mesmo download
    await ensurePack();
    off();
    expect(f.calls.ensure).toBe(1);
    expect(seen).toEqual([25]);
    expect(f.calls.removed).toBe(1);
  });
  it('pacote já no aparelho: não baixa', async () => {
    const f = fake({ ready: true }); setPackPlugin(f.p); setSplitPremium(true);
    await ensurePack();
    expect(f.calls.ensure).toBe(0);
  });
  it('falha no download: avisa com erro e permite tentar de novo', async () => {
    const f = fake({ fail: true }); setPackPlugin(f.p); setSplitPremium(true);
    await expect(ensurePack()).rejects.toThrow(/pack-unavailable/);
    const g = fake(); setPackPlugin(g.p);
    await expect(ensurePack()).resolves.toBeUndefined();
  });
  it('fora do Android o pacote não é necessário', () => {
    setSplitPremium(true); setPackPlugin(null, false);
    expect(packNeeded()).toBe(false);
  });
});
