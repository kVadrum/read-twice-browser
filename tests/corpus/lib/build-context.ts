import { JSDOM } from 'jsdom';
import { extractPageFeatures } from '../../../src/content/extract';
import type { EvaluationContext } from '../../../src/lib/heuristics/rule-types';
import type { FixtureMeta } from './types';

// Turns a fixture (HTML body + metadata) into the exact EvaluationContext the worker
// would assemble in the browser. The HTML is parsed by jsdom and run through the SAME
// `extractPageFeatures` the content script uses — so the corpus calibrates the real
// extraction + engine pipeline, not a re-implementation. The non-DOM context fields
// (RDAP age, redirect chain) come from the YAML, standing in for what the worker adds. The
// shipped worker adds no redirect chain at all (dormant by decision, background/navigation.ts),
// so a fixture's `redirect_chain` measures redirect-chain-long, not the extension.

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
// `doc.body.innerText`. We approximate it. The behavior that matters for rule
// matching is that innerText separates block-level elements with line breaks, while
// raw `textContent` glues them with no separator ("account will be" + "suspended" →
// "account will besuspended"). Plain textContent would let the harness match phrases
// across a block boundary that the shipped extension never would — inflating reported
// precision on real captured pages. So we join block boundaries with "\n", mirroring
// innerText closely enough for phrase and near-top matching. We do NOT model CSS
// visibility or whitespace collapsing — fixtures are static HTML with no styling.
function shimInnerText(window: JSDOM['window']): void {
  const proto = window.HTMLElement.prototype;
  if (Object.getOwnPropertyDescriptor(proto, 'innerText')) return;
  Object.defineProperty(proto, 'innerText', {
    configurable: true,
    get(this: HTMLElement): string {
      return blockAwareText(this);
    },
  });
}

// Tags whose boundaries innerText renders as line breaks. Not exhaustive — the common
// block-level set is enough to keep distinct blocks' text from gluing together. Never an
// inline (or inline-block) element such as BUTTON or LABEL: a browser runs "Click <button>Pay
// </button> now" together as "Click Pay now", and a break there would hide a phrase the
// extension matches — the shim must never under-match, or the red-FP gate passes pages the
// shipped extension draws red on.
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT',
  'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5',
  'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION',
  'TABLE', 'TR', 'UL',
]);
const CELL_TAGS = new Set(['TD', 'TH']);

/** textContent, but with a newline at each block-element and <br> boundary, and a tab
 *  between a row's cells — the facets of innerText that change which phrases match. */
function blockAwareText(el: Element): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      out += node.textContent ?? '';
    } else if (node.nodeType === 1 /* ELEMENT_NODE */) {
      const child = node as Element;
      if (child.tagName === 'BR') {
        out += '\n';
        continue;
      }
      const block = BLOCK_TAGS.has(child.tagName);
      if (block) out += '\n';
      out += blockAwareText(child);
      if (block) out += '\n';
      if (CELL_TAGS.has(child.tagName) && child.nextElementSibling && CELL_TAGS.has(child.nextElementSibling.tagName)) {
        out += '\t';
      }
    }
  }
  return out;
}
