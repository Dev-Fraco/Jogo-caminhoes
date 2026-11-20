import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { GetModuleInfo } from 'rollup';

/**
 * Build da loja (VITE_SPLIT_PREMIUM=1): tudo que o jogo grátis nunca importa de forma estática (extras do mundo, copas especiais, telas Premium)
 * vai para UM pedaço separado `assets/prem-*.js|css`. O script `scripts/split-premium.mjs` tira esse pedaço do app e o coloca no pacote
 * de recursos da Play (Play Asset Delivery), que só é baixado depois da compra. O restante (inclusive a virada de temporada do grátis) fica no app.
 */
const SPLIT = (process.env.VITE_SPLIT_PREMIUM ?? process.env.SPLIT_PREMIUM) === '1';
const norm = (id: string) => id.replace(/\\/g, '/');
const ALWAYS_BASE = ['/src/premium/season.ts']; // o grátis continua jogando depois da 1ª temporada: a virada de temporada fica no app

function premiumChunker() {
  let base: Set<string> | null = null;
  /** Tudo que o app alcança só com imports estáticos, a partir da entrada (e da virada de temporada do grátis). */
  const reach = (info: GetModuleInfo, ids: Iterable<string>): Set<string> => {
    const out = new Set<string>();
    const stack: string[] = [];
    for (const id of ids) { const m = info(id); if (m && (m.isEntry || ALWAYS_BASE.some((p) => norm(id).endsWith(p)))) stack.push(id); }
    while (stack.length) {
      const id = stack.pop()!;
      if (out.has(id)) continue;
      out.add(id);
      for (const n of info(id)?.importedIds ?? []) if (!out.has(n)) stack.push(n);
    }
    return out;
  };
  return (id: string, { getModuleInfo, getModuleIds }: { getModuleInfo: GetModuleInfo; getModuleIds: () => IterableIterator<string> }): string | undefined => {
    base ??= reach(getModuleInfo, getModuleIds());
    // O que o app usa fica explicitamente no pedaço 'app': sem isso o Rollup puxaria dependências compartilhadas para dentro do pedaço Premium.
    if (base.has(id) || id.includes('\0') || id.includes('node_modules') || !/\.(tsx?|css)$/.test(id)) return 'app';
    return 'prem';
  };
}

export default defineConfig({
  plugins: [react()],
  test: { setupFiles: ['./tests/setup.ts'] },
  base: './', // caminhos relativos: necessário para rodar dentro do app Android (Capacitor)
  build: SPLIT ? { rollupOptions: { output: { manualChunks: premiumChunker() } } } : undefined,
});
