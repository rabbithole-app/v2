import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  resolve: {
    alias: [
      {
        find: '@rabbithole/declarations/encrypted-storage',
        replacement: fileURLToPath(
          new URL('../declarations/src/encrypted-storage.ts', import.meta.url),
        ),
      },
      {
        find: '@rabbithole/declarations',
        replacement: fileURLToPath(
          new URL('../declarations/src/index.ts', import.meta.url),
        ),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
