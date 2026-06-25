# Corpus calibration

The fixture corpus is the truth set the heuristic engine is calibrated against
(testing-strategy §2–3). Each fixture is a captured page; the harness runs the
**real** extraction + engine pipeline over it and reports precision/recall.

```sh
pnpm test:fixtures
```

> **Poseidon:** vitest 4 needs the rolldown-wasi shim here, e.g.
> `NAPI_RS_NATIVE_LIBRARY_PATH=… pnpm test:fixtures` (see the device note). Other
> machines / CI run it plain.

## What it does

`pnpm test:fixtures` (config `vitest.fixtures.config.ts`, kept out of the fast
`pnpm test` loop) loads every fixture, builds the exact `EvaluationContext` the
browser worker would assemble, evaluates the loaded ruleset, and:

- **prints the §3 calibration report** — per-severity rates vs the full-corpus
  targets, and per-rule TP (on scams) / FP (on legit) precision;
- **enforces two seed-sized hard gates**: no scam is missed, and **no legit page
  draws a RED banner** (the existential red-FP gate). Percentage targets are
  full-corpus gates — reported, not asserted, at seed size.

The pipeline is end-to-end on purpose: fixture HTML is parsed by jsdom and run
through the same `src/content/extract.ts` the content script uses, so the corpus
calibrates real extraction, not a re-implementation. (jsdom lacks `innerText`;
the harness shims it to `textContent` — faithful enough for phrase matching.)

## Fixture format (testing-strategy §2.2)

Two files per fixture under `fixtures/scams/` or `fixtures/legit/`:

```
fixtures/scams/<id>.html   # captured page body (HTML only, no scripts)
fixtures/scams/<id>.yaml   # metadata
```

```yaml
id: <id>                    # matches the filename
label: scam | legit
expected_severity: red | yellow | none
expected_rules:             # rule ids that must fire (scam fixtures)
  - government-impersonation
domain: irs-refund.example  # page host → drives the synthetic document URL
domain_age_days: 7          # optional → feeds the RDAP context (domain-age-young)
redirect_chain: []          # optional
notes: >
  Provenance + what the fixture exercises.
source: …
captured_at: 2026-06-25
```

`expected_severity`/`expected_rules` are what calibration measures against. For
legit fixtures `none` is the ideal; a documented yellow (e.g. a young legit
domain) is recorded as-is and counts toward the legit FP rate.

## Hygiene (testing-strategy §2.3)

- No live URLs — use `.example` (RFC 2606) hosts.
- No real PII — synthetic names; phone numbers from the `555-01xx` block (RFC 3966).
- HTML only, scripts stripped.

## Status

Seed corpus (12 scam / 12 legit) covering the 9 live rules and the major
false-positive traps. The full target is ~100/100 (testing-strategy §2.1). The
webmail rules and the not-yet-implemented page rules show as "not exercised".
