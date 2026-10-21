# Banner golden images

Visual regression for the banner UI (testing-strategy §1 layer 5, §5).
Playwright renders the **real** banner into a harness page in each of its states, checks on the DOM what it draws, and compares a screenshot against a committed golden PNG.

```sh
pnpm test:golden        # compare against the committed goldens
pnpm test:golden -u     # regenerate after a deliberate visual change — then run it plain
```

First run on a machine: `pnpm exec playwright install chromium firefox`.
The lane is pinned to `@playwright/test` 1.63.0 (Chromium 153, Firefox 155).
A Playwright bump is a browser bump, so expect to regenerate every golden with it.

## Regenerating

When a change legitimately alters the banner:

1. Run `pnpm test:golden -u`.
   It rewrites goldens from the normal-motion runs only.
   The reduced-motion shots report as skipped: they share those goldens, and under `-u` a mismatching one would overwrite its golden and pass.
2. Run a plain `pnpm test:golden`, and commit only once it is green.
   This is the run that checks reduced motion against the new goldens.
   A reduced-motion failure here means its rest state has diverged from normal motion — a regression, not a stale golden.
3. Look at the new PNGs and ship them in the same commit, so the review shows the visual diff explicitly.

A copy change also edits the expected words in `scenarios.ts` (`DRAWN_TEXT`).
Until it does, the text check fails before the shot is taken, so `-u` cannot write a golden of the new copy either.

## How it works

- `harness/` is a plain page served by its own Vite config (`vite.config.ts`, no crxjs).
  `harness.ts` mounts the banner through the content script's own `renderVerdict`, so the buttons run the production dismissal path.
- `scenarios.ts` holds the verdicts, written in the shape the engine emits, and the words each one should draw.
  The verdicts are literals, so a rule-logic change never churns a golden, but a copy change does.
- The banner's shadow root is closed in production.
  The harness forces it open, in the harness only, so Playwright can click the toggle and × and read the banner's DOM.
- Every screenshot test waits for the entry animation and the push-down to finish (no sleeps).
  It then checks on the DOM what a screenshot cannot hold, and shoots the whole viewport.
  The shot includes the page pushed down below the band.
- The DOM checks pin the locked palette (band, border, ink and the eye mark's iris, as computed styles), the exact headline, evidence, action and button text, and the marks (the red slash, the chevron, the ×).
  They run before the shot, so a failure also stops `-u` from writing a golden of a broken banner.

## The matrix

States: yellow single expanded / collapsed, red single expanded / collapsed, yellow multi-rule expanded (stacked evidence, including a modifier line), red compositional expanded (young domain + off-site payment form, both elevated), and a yellow email verdict expanded (webmail mode's email copy, drawn over the same stand-in page).
**Dismissed** is an absence check rather than a screenshot.
It clicks ×, then asserts the banner host is gone, the page's root margin and transition are back exactly as they were, and the 30-day dismissal was requested.

Each state runs on both page backgrounds (the page follows the emulated OS colour scheme), at 100% and 200% zoom, and with and without reduced motion.
That runs on Chromium and on Firefox, each with its own goldens.
Totals: 128 tests and 56 PNGs.

- **200% zoom** is emulated as what it does to layout.
  The CSS viewport halves (1280×720 becomes 640×360) and the device scale factor doubles.
  Shots keep device pixels.
- **Reduced motion shares its golden with normal motion.**
  The preference changes how the banner arrives (a fade instead of the slide, and no push-down transition), never where it comes to rest.
  So both runs must match one image, and the motion difference is asserted directly at mount.
  Only a normal-motion run ever writes a golden (see Regenerating).
- **Tolerance is an absolute `maxDiffPixels: 10`** at the comparator's default colour threshold (0.2), for both engines and zooms.
  Measured with a zero budget over six full runs (one at 16 workers), every golden reproduced exactly at that threshold.
  With the threshold at 0 as well, Chromium's 100% shots vary by up to 5 pixels and Firefox's not at all.
  testing-strategy §5's 0.5% is a share of the whole viewport — 4,608 pixels at 1280×720 — and a blanked red headline (883 pixels) passed under it.
- **Pixels are not the only check.**
  Some real changes stay inside any budget noise allows, or under the colour threshold altogether: the red band moved to `#d9584a` differs by 0 pixels, a period turned comma in the headline by 2, a hidden chevron by 4 (all at 100% zoom).
  Those are what the DOM checks pin.

## Platform dependence

Goldens are per browser and per OS, and on Linux they are also per **font setup**.
Playwright names them `<state>-<page>-<zoom>-<project>-<platform>.png`, and only the `-linux` set is committed.

The banner's font stack starts with `Inter`, then `system-ui`; the harness page uses `system-ui`.
Inter is not bundled yet, so both browsers draw the text in whatever fontconfig resolves `system-ui` to — Noto Sans on the box that made these.
The lane therefore needs a Linux host where:

- `fc-match system-ui` reports Noto Sans, and
- no family named Inter is installed (`fc-list : family | grep -i inter` prints nothing), or the banner switches to it.

Chromium's generic `sans-serif` can resolve to something else (Liberation Sans on that box), but neither stack reaches it.
A host whose `system-ui` resolves elsewhere fails every screenshot at once, on correct code: with DejaVu Sans put first through fontconfig, all 112 shots failed.

If your host can't match, do not `-u` the goldens as part of another change: that re-baselines every PNG on your fonts and buries any real visual change in the font churn.
Regenerate the whole set in a commit of its own, with no other visual change in it, and say in the message that it is a font re-baseline.

On macOS or Windows the goldens are missing: a local run writes new ones and fails, and CI (`updateSnapshots: 'none'`) fails outright.

## Not covered yet

The "This isn't a scam" feedback modal and the first-time feedback opt-in prompt (§5) do not exist yet.
They are deferred with the feedback subsystem, so they have no goldens.
Add both states to the matrix when they land.
