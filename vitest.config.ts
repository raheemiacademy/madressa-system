import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
// Tests only ever touch the throwaway test database.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false, // DB tests share one database and reset it between tests
    testTimeout: 20_000,
    hookTimeout: 30_000 // resetting the test database before each test can be slow on a busy machine
  }
});
