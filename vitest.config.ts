import { defineConfig } from 'vitest/config';

/**
 * Loads .env.local before tests run so SUPABASE_URL, SUPABASE_JWT_SECRET, etc.
 * are available to the RLS smoke tests.
 */
export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
  },
});
