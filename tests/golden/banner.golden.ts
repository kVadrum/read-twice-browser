import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { DRAWN_TEXT, HARNESS_HOST, SCENARIOS, type ScenarioId } from './scenarios';

// Golden images of the banner in every state that exists today (testing-strategy §5),
// photographed across the spec's axes: page background × browser zoom × reduced motion,
// on Chromium and Firefox (one project each, own goldens).
//
// What is combined rather than multiplied: reduced motion changes HOW the banner arrives
// (a 140ms fade instead of the slide, and no push-down transition — banner-ux-and-copy
// §2.5), never where it comes to rest. So each state's reduced-motion run is compared
// against the SAME golden as its normal-motion run — any divergence at rest is a
// regression — and the motion difference itself, which no rest-state picture can show,
// is asserted directly at mount. That covers every axis without doubling the PNGs.
//
// What the picture cannot hold is asserted on the DOM before every shot (expectDraws):
// pixelmatch's per-pixel colour threshold swallows a near-identical palette swap entirely,
// and the pixel budget (playwright.config.ts) is sized to rendering noise, so a punctuation
// edit or a hidden chevron (4 pixels at 100% zoom) can sit inside it.

const STATES: readonly { name: string; scenario: ScenarioId; collapsed: boolean }[] = [
  { name: 'yellow-single-expanded', scenario: 'yellow-single', collapsed: false },
  { name: 'yellow-single-collapsed', scenario: 'yellow-single', collapsed: true },
  { name: 'red-single-expanded', scenario: 'red-single', collapsed: false },
  { name: 'red-single-collapsed', scenario: 'red-single', collapsed: true },
  { name: 'yellow-multi-expanded', scenario: 'yellow-multi', collapsed: false },
  { name: 'red-compositional-expanded', scenario: 'red-compositional', collapsed: false },
  { name: 'yellow-email-expanded', scenario: 'yellow-email', collapsed: false },
];

// Playwright can't press the browser's zoom control, so 200% is emulated by what it does
// to layout: the CSS viewport halves while each CSS pixel covers two device pixels. A
// 1280×720 window at 200% IS a 640×360 viewport at deviceScaleFactor 2.
const ZOOMS = [
  { label: '100', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  { label: '200', viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 },
] as const;

// The harness page follows the emulated OS scheme, so this is the page background axis.
// The banner itself is a self-contained light surface in v0.1 (dark banner is v0.2).
const PAGES = ['light', 'dark'] as const;

// Declared normal-first, so the normal-motion run is the one that writes a shared golden.
const MOTIONS = ['no-preference', 'reduce'] as const;

/**
 * True when this run may overwrite an existing golden (`-u` is `changed`; `all` too). A
 * reduced-motion run never shoots then: on a mismatch Playwright would overwrite the golden it
 * shares with the normal-motion run and report a pass, so a diverged rest state would become
 * the golden instead of failing. The plain run that must follow `-u` checks it (README).
 */
const rewritesGoldens = (info: TestInfo) =>
  info.config.updateSnapshots === 'changed' || info.config.updateSnapshots === 'all';

// The verdict palette, as banner-ux-and-copy §2.2 writes it, plus the eye mark's second tone
// (the iris, banner.css). LOCKED tokens, so drift is a failure, never a re-baseline — and the
// screenshot cannot see it: the band moved to #d9584a differs from the golden by 0 pixels at
// the comparator's colour threshold.
const PALETTE = {
  yellow: { band: '#f4b860', border: '#d89b40', ink: '#2a1f1a', iris: '#e8654c' },
  red: { band: '#e8654c', border: '#c7503a', ink: '#faf3ec', iris: '#c7503a' },
} as const;

/** `#rrggbb` → the `rgb(r, g, b)` form getComputedStyle reports. */
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

/**
 * Asserts the banner draws the scenario's tokens, words and marks. Runs before the shot, so a
 * failure here also stops `-u` from minting a golden of a broken banner.
 */
async function expectDraws(page: Page, scenario: ScenarioId): Promise<void> {
  const red = SCENARIOS[scenario].severity === 'red';
  const tokens = PALETTE[red ? 'red' : 'yellow'];
  const band = page.locator('.rt-band');
  await expect(band).toHaveCSS('background-color', rgb(tokens.band));
  await expect(band).toHaveCSS('border-bottom-color', rgb(tokens.border));
  await expect(band).toHaveCSS('color', rgb(tokens.ink));
  await expect(page.locator('.rt-mark svg circle').first()).toHaveCSS('fill', rgb(tokens.iris));

  // textContent, so a collapsed state's hidden details are checked too.
  const text = DRAWN_TEXT[scenario];
  await expect(page.locator('.rt-headline')).toHaveText(text.headline);
  await expect(page.locator('.rt-evidence')).toHaveText(text.evidence);
  await expect(page.locator('.rt-action')).toHaveText(text.action);
  await expect(page.locator('.rt-btn')).toHaveText(['Send to Read Twice', "This isn't a scam"]);

  // The slash is what makes the mark say red (§2.2): an underlay line and the stroke over it.
  // The marks are counted rather than left to the picture, where the chevron is 4 pixels at
  // 100% zoom.
  await expect(page.locator('.rt-mark svg line')).toHaveCount(red ? 2 : 0);
  await expect(page.locator('.rt-chev svg path')).toHaveCount(1);
  await expect(page.locator('.rt-close svg line')).toHaveCount(2);
  for (const mark of ['.rt-mark svg', '.rt-chev svg', '.rt-close svg']) {
    await expect(page.locator(mark)).toBeVisible();
  }
}

const HOST_SELECTOR = '#read-twice-banner-host';

async function mount(page: Page, scenario: ScenarioId, motion: (typeof MOTIONS)[number]): Promise<void> {
  const entry = await page.evaluate((id) => window.harness.mount(id), scenario);
  // §2.5: the slide becomes a fade and nothing else moves — the page is not slid down.
  if (motion === 'reduce') {
    expect(entry).toEqual({ bandAnimations: ['rt-fade'], pageTransitioning: false });
  } else {
    expect(entry).toEqual({ bandAnimations: ['rt-enter'], pageTransitioning: true });
  }
}

const settle = (page: Page) => page.evaluate(() => window.harness.settle());

/** The page's own root layout — what the push-down must leave exactly as it found it. */
const rootLayout = (page: Page) =>
  page.evaluate(() => ({
    inlineMarginTop: document.documentElement.style.marginTop,
    inlineTransition: document.documentElement.style.transition,
    computedMarginTop: getComputedStyle(document.documentElement).marginTop,
    contentTop: document.body.getBoundingClientRect().top,
  }));

for (const colorScheme of PAGES) {
  for (const zoom of ZOOMS) {
    for (const motion of MOTIONS) {
      test.describe(`${colorScheme} page, ${zoom.label}% zoom, motion ${motion}`, () => {
        test.use({
          colorScheme,
          reducedMotion: motion,
          viewport: zoom.viewport,
          deviceScaleFactor: zoom.deviceScaleFactor,
        });

        for (const state of STATES) {
          test(state.name, async ({ page }) => {
            await page.goto('/');
            await mount(page, state.scenario, motion);
            await settle(page);

            if (state.collapsed) {
              const toggle = page.locator('.rt-toggle');
              await toggle.click();
              await expect(toggle).toHaveAttribute('aria-expanded', 'false');
              // Park the pointer on the page, off the banner, so the shot is the resting
              // collapsed state rather than the toggle's :hover.
              await page.mouse.move(1, zoom.viewport.height - 1);
              await settle(page);
            }

            await expectDraws(page, state.scenario);
            test.skip(motion === 'reduce' && rewritesGoldens(test.info()), 'reduced motion never writes the shared golden');
            await expect(page).toHaveScreenshot(`${state.name}-${colorScheme}-${zoom.label}.png`);
          });
        }

        // An absence check, not a screenshot (§5): × removes the banner, hands the page its
        // layout back untouched, and asks the worker for the 30-day per-site dismissal.
        test('dismissed', async ({ page }) => {
          await page.goto('/');
          const before = await rootLayout(page);
          await mount(page, 'red-single', motion);
          await settle(page);
          // Without a real push-down the restore check below would pass vacuously.
          expect((await rootLayout(page)).contentTop).toBeGreaterThan(before.contentTop);

          await page.locator('.rt-close').click();

          await expect(page.locator(HOST_SELECTOR)).toHaveCount(0);
          expect(await rootLayout(page)).toEqual(before);
          await expect
            .poll(() => page.evaluate(() => window.harness.sent))
            .toEqual([{ type: 'RecordDismissal', key: HARNESS_HOST }]);
        });
      });
    }
  }
}
