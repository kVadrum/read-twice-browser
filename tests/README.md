# Tests

Unit tests are **co-located** next to source as `*.test.ts` (workspace convention),
run with Vitest via `pnpm test`. See `src/lib/handoff/send-to-read-twice.test.ts` for
the first one.

Two corpus-backed suites are planned (architecture §10, testing-strategy 08) and will
land with the engine pass:

- `fixtures/` — calibration against the 100-scam / 100-legit fixture corpus sourced
  from the companion repo (`read-twice-rules`). Gate: TP ≥70% (yellow), FP ≤5%
  (yellow) / ≤1% (red).
- `golden/` — Playwright golden-image tests for the banner UI.

> **If Vitest 4 segfaults at startup** (seen on some Linux hosts), prefix test runs
> with `NAPI_RS_NATIVE_LIBRARY_PATH=…/rolldown-binding.wasi.cjs`.
