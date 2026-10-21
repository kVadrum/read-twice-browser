import { defineConfig } from '@playwright/test';

// Golden-image lane for the banner UI (testing-strategy §1 layer 5, §5): `pnpm test:golden`
// runs it; `pnpm test:golden -u` regenerates the goldens after a deliberate visual change,
// and a plain run after it checks what `-u` skipped (ship the new PNGs so reviewers see the
// diff). Kept out of `pnpm test` — it needs real browsers and a dev server, and the fast
// vitest loop needs neither. See tests/golden/README.md.

// Fixed and uncommon, below Linux's ephemeral range; Vite's strictPort makes a clash fail
// loudly rather than serving the harness somewhere the tests aren't looking.
const PORT = 4791;

export default defineConfig({
  testDir: 'tests/golden',
  // Not *.test.ts / *.spec.ts: Vitest's default include would collect those.
  testMatch: '**/*.golden.ts',
  // A retry would turn an unstable golden into a silent pass; instability is the bug.
  retries: 0,
  forbidOnly: !!process.env.CI,
  // CI must fail on a missing golden, never mint one from whatever it rendered.
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  expect: {
    toHaveScreenshot: {
      // An absolute budget sized to the measured noise, not testing-strategy §5's 0.5%: that
      // is a share of the whole viewport (4,608 px at 1280×720), so a blanked red headline
      // (883 px) passed it. At the default colour threshold every golden reproduced exactly
      // over six full runs on both engines and zooms; Chromium's sub-threshold jitter at 100%
      // peaks at 5 px. Pixels still miss a palette swap and the smallest copy edits —
      // banner.golden.ts asserts those on the DOM.
      maxDiffPixels: 10,
      // The spec settles every animation before it shoots; this is the backstop.
      animations: 'disabled',
      caret: 'hide',
      // Keep device pixels: a 200%-zoom shot downsampled to CSS pixels would hide exactly
      // the rendering it exists to check.
      scale: 'device',
    },
  },
  // Each engine keeps its own goldens — Chromium and Gecko rasterize text differently, so
  // they are compared within an engine, never against each other.
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
  webServer: {
    command: `pnpm exec vite --config tests/golden/vite.config.ts --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    // Never adopt a server that happens to be on the port: it may not be this harness.
    reuseExistingServer: false,
  },
});
