import { JSDOM } from 'jsdom';
import { extractPageFeatures } from '../../../src/content/extract';
import type { EvaluationContext } from '../../../src/lib/heuristics/rule-types';
import type { FixtureMeta } from './types';

// Turns a fixture (HTML body + metadata) into the exact EvaluationContext the worker
// would assemble in the browser. The HTML is parsed by jsdom and run through the SAME
// `extractPageFeatures` the content script uses — so the corpus calibrates the real
// extraction + engine pipeline, not a re-implementation. The non-DOM context fields
// (RDAP age, redirect chain) come from the YAML, mirroring what the worker adds.

export function buildContext(html: string, meta: FixtureMeta): EvaluationContext {
  const dom = new JSDOM(html, { url: `https://${meta.domain}/` });
  shimInnerText(dom.window);

  const features = extractPageFeatures(dom.window.document as unknown as Document);

  const rdap =
    meta.domain_age_days == null ? null : { registeredOn: null, ageDays: meta.domain_age_days };

  return {
    features,
    redirectChain: meta.redirect_chain ?? [],
    rdap,
    dismissedHosts: [],
  };
}

// jsdom does not implement HTMLElement.innerText; the content script reads
// `doc.body.innerText`. Delegate to textContent so phrase/keyword rules see the page
// text. (innerText would collapse whitespace differently, but rule matching is on
// contiguous phrases, so textContent is a faithful-enough stand-in for calibration.)
function shimInnerText(window: JSDOM['window']): void {
  const proto = window.HTMLElement.prototype;
  if (Object.getOwnPropertyDescriptor(proto, 'innerText')) return;
  Object.defineProperty(proto, 'innerText', {
    configurable: true,
    get(this: HTMLElement): string {
      return this.textContent ?? '';
    },
  });
}
