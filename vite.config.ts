import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { setupFiles: ['./tests/setup.ts'] },
  base: './', // caminhos relativos: necessário para rodar dentro do app Android (Capacitor)
});
