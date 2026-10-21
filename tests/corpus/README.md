# Corpus calibration

The fixture corpus is the truth set the heuristic engine is calibrated against (testing-strategy §2–3).
Each fixture is a captured page; the harness runs the **real** extraction + engine pipeline over it and reports precision/recall.

```sh
pnpm test:fixtures
```

> **If vitest 4 segfaults at startup** (seen on some Linux hosts), use the rolldown-wasi shim, e.g. `NAPI_RS_NATIVE_LIBRARY_PATH=… pnpm test:fixtures`.
> Other machines and CI run it plain.

## What it does

`pnpm test:fixtures` (config `vitest.fixtures.config.ts`, kept out of the fast `pnpm test` loop) loads every fixture, builds the `EvaluationContext` the browser worker would assemble, evaluates the loaded ruleset, and:

- **prints the §3 calibration report** — per-severity rates vs the full-corpus targets, and per-rule TP (on scams) / FP (on legit) precision.
  The config sets `disableConsoleIntercept`, because Vitest 4's default reporter drops a passing test's console output: without it the report vanished while every gate stayed green;
- **enforces two seed-sized hard gates**: no scam is missed, and **no legit page draws a RED banner** (the existential red-FP gate).
  Percentage targets are full-corpus gates — reported, not asserted, at seed size;
- **holds every fixture, scam or legit, to its documented `expected_severity` and `expected_rules`**.
  A legit fixture documented as silent that starts drawing a yellow fails the run, though the red gate cannot see it.

The pipeline is end-to-end on purpose: fixture HTML is parsed by jsdom and run through the same `src/content/extract.ts` the content script uses, so the corpus calibrates real extraction, not a re-implementation.
jsdom lacks `innerText`, so the harness shims it with an approximation (`lib/build-context.ts`): each block element and `<br>` boundary becomes a line break and a row's cells are tab-joined, while inline elements (`<button>`, `<label>`) run together, so a phrase matches across exactly the boundaries a browser's `innerText` would join.
The shim must never break where a browser doesn't: an under-matching shim hides a phrase the extension matches, and the red-FP gate would pass a page that draws red.
The shim does not drop text hidden by CSS or collapse whitespace; fixtures are static HTML with no styling.
The context fields that don't come from the page — the RDAP domain age and the redirect chain — come from the fixture's YAML.

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
expected_rules:             # rule ids that must fire (any fixture, a documented legit yellow included)
  - government-impersonation
domain: irs-refund.example  # page host → drives the synthetic document URL
domain_age_days: 7          # optional → feeds the RDAP context (domain-age-young)
redirect_chain: []          # optional → feeds redirect-chain-long (the shipped worker feeds none)
notes: >
  Provenance + what the fixture exercises.
source: …
captured_at: 2026-06-25
```

`expected_severity`/`expected_rules` are what calibration measures against.
For legit fixtures `none` is the ideal; a documented yellow (e.g. a young legit domain) is recorded as-is and counts toward the legit FP rate.
A webmail fixture (`webmail-*`) sets `domain` to the mail client's real host (`mail.google.com`, `outlook.live.com`, `mail.yahoo.com`); that host is what switches webmail mode on, so the rules judge the open email in the fixture rather than the page.
Webmail fixtures are yellow at most: webmail mode caps every hit at yellow until a legit-email corpus calibrates the red rules there (`src/lib/heuristics/engine.ts`).

## Hygiene (testing-strategy §2.3)

- No live URLs — use `.example` (RFC 2606) hosts, except where a rule keys on a real name.
  Then use that name, and say why in the fixture's `notes`.
  The exceptions:
  - a brand's, agency's or news publisher's own domain, on a legit page that pins an allow-list (`www.chase.com`, `www.irs.gov`, `apnews.com`);
  - a webmail client's host, which webmail mode matches exactly (above);
  - a URL shortener in `redirect_chain` (`t.co`, `bit.ly`), which the shortener list matches by name;
  - an organisation's own role sender address in an email, real or spoofed (`onlinebanking@ealerts.bankofamerica.com`, `notification@canada.ca`), which the rules compare with the organisation's real domains.

  Never "tidy" one of these into a `.example` host: the fixture could keep passing while it silently stops exercising its rule.
- No real PII — synthetic names; phone numbers from the `555-0100`–`555-0199` block, which the North American Numbering Plan reserves for fiction in geographic area codes.
  The one exception is a company's own published corporate line — public, not personal data — named as such in the fixture's `notes`; `contact-guide-bank-real-numbers` needs real ones to pin that a canonical number never fires.
- Email addresses on `.example` hosts too, except the real-name cases above and where a rule turns on a real free-webmail domain (`gmail.com`, `outlook.com`, `att.net`, …).
  Then the domain stays real and the local part carries the `.0142` synthetic marker (`jordan.sample.0142@gmail.com`), so no test names what could be a real person's mailbox — in fixtures and unit tests alike.
- HTML only, scripts stripped.

## Status

Measured 2026-10-21 with `pnpm test:fixtures`: a seed corpus of 23 scam / 34 legit fixtures, toward a full target of ~100/100 (testing-strategy §2.1).
It exercises 12 of the 13 rules.
`tld-elevated-risk` (a modifier) still shows as "not exercised": it needs a real elevated-risk TLD, which the `.example` hygiene rules out.
`redirect-chain-long` is exercised only through fixture `redirect_chain` metadata — the extension itself never feeds it, by decision (`src/background/navigation.ts`).
`domain-age-young` likewise runs only on fixture `domain_age_days` until the RDAP pass lands: the shipped lookup is a stub (`src/lib/rdap/client.ts`), so its yellow on `newbiz-bakery-young` can't occur in the shipped build yet.
Every scam draws a banner, and no legit page draws a red.
Five legit fixtures draw a documented yellow, which puts the legit any-banner rate (5/34) above its ≤ 5% full-corpus target; at seed size that is reported, not gated.
They are one young legit domain and four emails where a red rule fires under the webmail yellow cap — one of them an IRS bulletin whose sender's DMARC doesn't enforce, so its From can't buy the phone rule's exemption.
