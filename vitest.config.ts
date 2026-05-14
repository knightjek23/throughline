import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Loads .env.local before tests run so SUPABASE_URL, SUPABASE_JWT_SECRET, etc.
 * are available to the RLS smoke tests. Mirrors the Next.js tsconfig path
 * alias so test files can import from `@/lib/...`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      // Stub out `server-only` which throws when imported outside RSC.
      'server-only': resolve(__dirname, 'tests/_mocks/server-only.ts'),
    },
  },
  test: {
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
  },
});
