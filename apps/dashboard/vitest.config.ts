/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
