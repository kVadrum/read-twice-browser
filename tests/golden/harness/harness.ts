import { renderVerdict } from '../../../src/content/render';
import { dismissalKey } from '../../../src/content/dismiss';
import { SCENARIOS, HARNESS_HOST, type ScenarioId } from '../scenarios';
import type { PageFeatures } from '../../../src/lib/heuristics/rule-types';
import type { ContentToWorker } from '../../../src/lib/runtime/messaging-types';

// Harness page for the banner golden lane (testing-strategy §5). It mounts the REAL banner
// through the content script's own wiring (content/render.ts), so the × and "This isn't a
// scam" buttons run the production dismissal path rather than a test stand-in.

// The banner renders into a CLOSED shadow root (architecture §1.4), which Playwright cannot
// locate inside — and the toggle and × must take real pointer clicks for the collapsed and
// dismissed states. So, in this page only, every shadow root is forced open. That changes
// nothing that renders, and this page has no shadow roots of its own, so only the banner's
// is affected. Production code stays closed.
const attachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit): ShadowRoot {
  return attachShadow.call(this, { ...init, mode: 'open' });
};

// No extension runtime here. The worker's side of a dismissal is just the message, so
// record it — the dismissed-state test asserts the × really asked for the 30-day record.
const sent: ContentToWorker[] = [];
(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: {
    sendMessage: async (message: ContentToWorker) => {
      sent.push(message);
    },
  },
};

const BANNER_HOST_ID = 'read-twice-banner-host';

/** Which entry motion the banner started, read in the same task as the mount (see mount). */
export interface EntryMotion {
  bandAnimations: string[];
  pageTransitioning: boolean;
}

export interface Harness {
  mount(id: ScenarioId): EntryMotion;
  /** Resolves once every banner + push-down animation has finished and the page has repainted. */
  settle(): Promise<void>;
  readonly sent: readonly ContentToWorker[];
}

declare global {
  interface Window {
    harness: Harness;
  }
}

function bannerRoot(): ShadowRoot | null {
  return document.getElementById(BANNER_HOST_ID)?.shadowRoot ?? null;
}

function runningAnimations(): Animation[] {
  return [...document.getAnimations(), ...(bannerRoot()?.getAnimations() ?? [])];
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

window.harness = {
  mount(id) {
    const verdict = SCENARIOS[id];
    if (!verdict) throw new Error(`unknown banner scenario "${id}"`);
    const features: PageFeatures = {
      url: `https://${HARNESS_HOST}/invoices/0412`,
      host: HARNESS_HOST,
      bodyExcerpt: '',
      forms: [],
      brandMentions: [],
      phoneNumbers: [],
      linkTargets: [],
    };
    renderVerdict(verdict, features, dismissalKey(features));
    // Captured synchronously because the reduced-motion fade lasts 140ms: a separate
    // round-trip from the test could arrive after it ended and see nothing at all.
    return {
      bandAnimations: (bannerRoot()?.getAnimations() ?? []).map((a) =>
        a instanceof CSSAnimation ? a.animationName : a.constructor.name,
      ),
      pageTransitioning: document.documentElement.getAnimations().length > 0,
    };
  },

  async settle() {
    // Loop, not a single wait: a collapse can start the root's margin transition while the
    // details are still closing, and a retargeted transition cancels its predecessor
    // (whose `finished` rejects). Nothing in the banner animates forever, so this ends;
    // the Playwright test timeout is the backstop if that ever stops being true.
    let running = runningAnimations();
    while (running.length > 0) {
      await Promise.all(running.map((a) => a.finished.catch(() => undefined)));
      running = runningAnimations();
    }
    // The push-down follows the band via ResizeObserver, which delivers after layout —
    // two frames guarantee its final margin has been applied and painted.
    await nextFrame();
    await nextFrame();
  },

  sent,
};
