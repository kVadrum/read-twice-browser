// Shared plumbing for the webmail adapters. Each adapter reads ONE thing — the email the
// user has open — from a client DOM we don't control and that changes without notice, so
// everything here answers null on a miss rather than guessing: a selector that stops
// matching after a redesign must cost a quiet miss, never a banner.

/** Whether an element is actually shown. Injectable because jsdom has no layout. */
export type VisibilityTest = (el: Element) => boolean;

/** The open email as an adapter found it. Raw page data — the rules parse it defensively. */
export interface OpenMessage {
  /** Identity of the open message inside the client, for change detection only. Never sent
   *  to the worker. */
  id: string;
  displayName: string;
  fromAddress: string;
  /** Only when the client already shows it. We never click or expand anything to find it. */
  replyToAddress: string | null;
  body: Element;
}

export type WebmailAdapter = (doc: Document, isVisible: VisibilityTest) => OpenMessage | null;

/** Header values longer than any real name/address are page junk; bound what we carry. */
const HEADER_LIMIT = 320;

/** Visible = rendered. Webmail clients keep cached, hidden views of other emails in the DOM
 *  (Gmail does, per gmail.js and InboxSDK), and those must never be read as the open one.
 *  `checkVisibility` is the real answer (Chrome 105+, Firefox 106+); without it — jsdom —
 *  we fall back to what the markup declares: `hidden` or display:none on the element or an
 *  ancestor (display is not inherited, so the walk is needed). */
export const isRendered: VisibilityTest = (el) => {
  if (typeof el.checkVisibility === 'function') return el.checkVisibility();
  const view = el.ownerDocument.defaultView;
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.hasAttribute('hidden')) return false;
    if (view?.getComputedStyle(n).display === 'none') return false;
  }
  return true;
};

/**
 * The first element matching the FIRST selector that matches anything acceptable — an
 * ordered fallback chain. (A comma-joined querySelector would return the first match in
 * document order, silently ignoring which selector we trust most.)
 */
export function firstMatch(
  root: ParentNode,
  selectors: readonly string[],
  accept: (el: Element) => boolean = () => true,
): Element | null {
  for (const sel of selectors) {
    for (const el of Array.from(root.querySelectorAll(sel))) {
      if (accept(el)) return el;
    }
  }
  return null;
}

/** An attribute or text value, trimmed and bounded; '' when absent. */
export function headerValue(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, HEADER_LIMIT);
}

/** "Name<addr>" / "Name <addr>" as rendered text → its parts. The LAST bracketed group is
 *  the address: the client appends it, while the name before it is the sender's own text. */
export function splitNameAndAddress(text: string): { name: string; address: string } {
  const m = /^([\s\S]*)<([^<>]*)>\s*$/.exec(text.trim());
  if (!m) return { name: headerValue(text), address: '' };
  return { name: headerValue(m[1]), address: headerValue(m[2]) };
}

/** The text a reader sees. Falls back to textContent where innerText is missing (jsdom). */
export function readText(el: Element): string {
  return (el as HTMLElement).innerText ?? el.textContent ?? '';
}
