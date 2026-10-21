import { defineConfig } from 'vitest/config';

// Dedicated config for the corpus calibration run (pnpm test:fixtures). Kept separate
// from the default unit-test run so the corpus (jsdom-backed, slower, fixture-dependent)
// never bloats the fast `pnpm test` loop. No crxjs plugin — the harness only needs Node.
export default defineConfig({
  test: {
    include: ['tests/corpus/**/*.fixtures.ts'],
    environment: 'node',
    // The printed calibration report IS this run's output (testing-strategy §3). Vitest 4's
    // default reporter drops a passing test's intercepted console output, so without this the
    // report vanished while every gate stayed green.
    disableConsoleIntercept: true,
  },
});
