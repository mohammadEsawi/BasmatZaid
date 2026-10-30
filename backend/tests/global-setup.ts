import { execSync } from 'node:child_process';

export function assertTestDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/\/[\w-]+_test(\?|$)/.test(url)) {
    throw new Error(`Refusing to run tests: DATABASE_URL must point to a *_test database (got ${url.replace(/:[^:@/]+@/, ':***@')}).`);
  }
}

/** Applies pending migrations (non-destructive) to the test database before the suites run. */
export default function setup() {
  assertTestDatabase();
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
