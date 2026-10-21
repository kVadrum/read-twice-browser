# Tests

Unit tests are **co-located** next to source as `*.test.ts` (workspace convention), run with Vitest via `pnpm test`.
See `src/lib/handoff/send-to-read-twice.test.ts` for the first one.

Two heavier suites live here, each kept out of the fast `pnpm test` loop with its own command (architecture §10, testing-strategy 08):

- `corpus/` — `pnpm test:fixtures`.
  Calibration of the real extraction + engine pipeline against the scam / legit fixture corpus; hard gates: no scam missed, no red banner on any legit page.
  Seed-sized today (target 100 / 100).
  See `corpus/README.md`.
- `golden/` — `pnpm test:golden` (`-u` to regenerate, then a plain run before committing).
  Playwright golden images of the banner UI in every built state, on Chromium and Firefox, across page background, 200% zoom and reduced motion.
  Needs real browsers (`pnpm exec playwright install chromium firefox`).
  Goldens are Linux-only and tied to the host's fonts: `system-ui` must resolve to Noto Sans, with no Inter installed.
  See `golden/README.md`.

> **If Vitest 4 segfaults at startup** (seen on some Linux hosts), prefix test runs
> with `NAPI_RS_NATIVE_LIBRARY_PATH=…/rolldown-binding.wasi.cjs`.
