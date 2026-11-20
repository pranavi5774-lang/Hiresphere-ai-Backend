import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/helpers/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/ai/**/*.ts', 'src/lib/auth.ts'],
      exclude: ['src/lib/ai/analyze-service.ts'],
      reporter: ['text', 'html'],
    },
  },
});