// Build da loja: tira o pedaço Premium (assets/prem-*.js|css) do app (dist) e o coloca no pacote de recursos da Play.
// Uso: VITE_SPLIT_PREMIUM=1 npm run build && node scripts/split-premium.mjs && npx cap sync android
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist/assets';
const out = 'android/premium_pack/src/main/assets/prem';
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f !== 'LEIAME.txt') rmSync(join(out, f), { force: true }); // limpa builds antigos
const files = existsSync(dist) ? readdirSync(dist).filter((f) => /^prem-[A-Za-z0-9_-]+\.(js|css)$/.test(f)) : [];
if (!files.some((f) => f.endsWith('.js'))) { console.error('Nenhum pedaço Premium em dist/assets (o build foi feito com SPLIT_PREMIUM=1?)'); process.exit(1); }
for (const f of files) renameSync(join(dist, f), join(out, f));
console.log(`Pacote Premium: ${files.length} arquivos movidos para ${out}: ${files.join(', ')}`);
