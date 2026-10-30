import { readFileSync, existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Tests always run against the separate test database from .env.test.
const envFile = existsSync('.env.test') ? '.env.test' : '.env.test.example';
const testEnv = dotenv.parse(readFileSync(envFile));
// globalSetup runs in this process, so the test env must be applied here as well.
Object.assign(process.env, testEnv);

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ['./tests/global-setup.ts'],
    // All suites share one database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
