import { firstMatch, headerValue, splitNameAndAddress, type OpenMessage, type VisibilityTest } from './dom';

// Yahoo Mail (mail.yahoo.com). Confidence LOW: one maintained source written after the
// January 2026 redesign (Trocker, commit 1cb5bf9) plus Mailvelope's 2019-era selectors;
// many small repos repeat these, possibly copying each other, so their count is not
// independent evidence. The data-test-id hooks are the reason to try at all — Yahoo's
// body test-id appears in both 2019 DOM dumps and 2026 code. Not verified live by us; a
// miss degrades to "no open email" (silent).
const SEL = {
  // One per message in the conversation; expanded ones carry data-test-expanded="true".
  message: '[data-test-id="message-view"]',
  expanded: '[data-test-expanded="true"]',
  body: ['[data-test-id="message-view-body-content"]', '.msg-body'],
  // Mailvelope scopes to the header; the bare test-id is the fallback. Captured pills keep
  // the address in `title` and the name in text (seen on RECIPIENT pills; the From pill's
  // inner shape is unverified).
  from: ['[data-test-id="message-header"] [data-test-id="message-from"]', '[data-test-id="message-from"]'],
  addressTitle: '[title*="@"]',
} as const;

/** An address as the last word of the rendered text — where the client appends the From. */
const TRAILING_ADDRESS = /(?:^|\s)([^\s<>@]+@[^\s<>@]+)$/;
/** An address-shaped word: a name holding one is dressed as an address. A bare "@" is not
 *  one ("PayPal @ Billing"). Anchored and tested per word, so a long unbroken name stays
 *  linear — this runs on every watcher check. */
const ADDRESS_WORD = /^[^<>@]+@[^<>@]+\.[^<>@]+$/;

export function readYahoo(doc: Document, isVisible: VisibilityTest): OpenMessage | null {
  const views = Array.from(doc.querySelectorAll(SEL.message)).filter(
    (v) => isVisible(v) && bodyOf(v) != null,
  );
  // Prefer the last EXPANDED message with a body (Trocker drops matches without one); fall
  // back to any visible one if the expanded flag is gone.
  const expanded = views.filter((v) => v.matches(SEL.expanded));
  const pool = expanded.length > 0 ? expanded : views;
  const msg = pool.at(-1);
  if (!msg) return null;
  const body = bodyOf(msg)!;

  const from = firstMatch(msg, SEL.from, (el) => !body.contains(el));
  if (!from) return null;
  const titled = from.matches(SEL.addressTitle) ? from : from.querySelector(SEL.addressTitle);
  let address = headerValue(titled?.getAttribute('title'));
  let name = headerValue((titled ?? from).textContent);
  if (!address) {
    // Mailvelope's fallback: pull the address out of the rendered text. The name comes
    // first and is the sender's own text, so only a TRAILING address can be the client's —
    // and only while the name before it holds none: in "service@paypal.com
    // billing@scam.example" the first is a name dressed as an address. Otherwise abstain:
    // no From beats the sender's choice of one, which the rules would trust (origin.ts
    // mailIsFrom).
    const split = splitNameAndAddress(from.textContent ?? '');
    if (split.address) {
      address = split.address;
      name = split.name;
    } else {
      // Over the whole text, not the bounded name: padding could push the client's address
      // past the bound and leave the sender's own last.
      const text = (from.textContent ?? '').replace(/\s+/g, ' ').trim();
      const trailing = TRAILING_ADDRESS.exec(text);
      const before = trailing ? text.slice(0, trailing.index) : text;
      const dressed = before.includes('@') && before.split(' ').some((w) => ADDRESS_WORD.test(w));
      address = trailing && !dressed ? headerValue(trailing[1]) : '';
      name = headerValue(address ? before : text);
    }
  }
  if (!name && !address) return null;

  return {
    // No message-id attribute exists in any source; the route plus the position among
    // visible messages is the best identity available (low confidence).
    id: `yahoo:${doc.location.pathname}#${views.indexOf(msg)}`,
    displayName: name,
    fromAddress: address,
    // Not in the DOM without opening "View raw message" (PhishGuard hard-codes undefined).
    replyToAddress: null,
    body,
  };
}

function bodyOf(view: Element): Element | null {
  return firstMatch(view, SEL.body);
}
