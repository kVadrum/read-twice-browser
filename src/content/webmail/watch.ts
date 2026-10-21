import type { WebmailProvider } from '../../lib/ruleset/webmail-hosts';
import { findOpenMessage, messageSignature, type MessageSignature } from './index';

// Opening another email in a webmail client is not a navigation: the content script ran
// once at document_idle (often before the client even rendered a message) and would never
// look again. This watches for the open email changing and says so.
//
// Gmail routes by hash, Outlook and Yahoo by pushState (which fires no event a content
// script can see), and all three also swap message DOM with no URL change at all — expanding
// a message, the preview pane. So the trigger is a MutationObserver plus hashchange /
// popstate, and the TEST is the open message's signature: a mutation that leaves the same
// email open (Gmail re-renders constantly) costs one cheap signature read, nothing more.

/** Quiet period after the last mutation before we look — the client is mid-render until then. */
export const SETTLE_MS = 250;
/** Upper bound on the wait while mutations keep coming (hover storms over the inbox list). */
export const MAX_WAIT_MS = 1000;
/** Attribute changes that can show or hide a message without adding or removing nodes:
 *  Gmail's .kv→.h7 expand, Yahoo's data-test-expanded, cached views toggled by style/hidden. */
const WATCHED_ATTRIBUTES = ['class', 'style', 'hidden', 'data-test-expanded'];

export interface OpenMessageChange {
  /** Same email, different details (e.g. its Reply-To became visible). */
  sameMessage: boolean;
}

/**
 * Calls `onChange` whenever the open email (or what we can read of it) changes. `ignore`
 * filters mutations the extension caused itself, so rendering a banner can never re-trigger
 * evaluation. Returns a stop function.
 */
export function watchOpenMessage(
  doc: Document,
  provider: WebmailProvider,
  onChange: (change: OpenMessageChange) => void,
  ignore: (node: Node) => boolean = () => false,
): () => void {
  const view = doc.defaultView;
  if (!view || !doc.body) return () => {};

  let last: MessageSignature = currentSignature(doc, provider);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstPendingAt: number | null = null;

  const check = (): void => {
    timer = null;
    firstPendingAt = null;
    const next = currentSignature(doc, provider);
    if (next.id === last.id && next.detail === last.detail) return;
    const sameMessage = next.id === last.id;
    last = next;
    onChange({ sameMessage });
  };

  // Trailing debounce with a ceiling: wait for the client to settle, but never longer than
  // MAX_WAIT_MS past the first unhandled mutation.
  const schedule = (): void => {
    const now = Date.now();
    firstPendingAt ??= now;
    if (timer) clearTimeout(timer);
    timer = setTimeout(check, Math.max(0, Math.min(SETTLE_MS, firstPendingAt + MAX_WAIT_MS - now)));
  };

  const observer = new view.MutationObserver((records) => {
    if (records.some((r) => !ignore(r.target))) schedule();
  });
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: WATCHED_ATTRIBUTES,
  });
  view.addEventListener('hashchange', schedule);
  view.addEventListener('popstate', schedule);

  return () => {
    observer.disconnect();
    view.removeEventListener('hashchange', schedule);
    view.removeEventListener('popstate', schedule);
    if (timer) clearTimeout(timer);
  };
}

function currentSignature(doc: Document, provider: WebmailProvider): MessageSignature {
  return messageSignature(findOpenMessage(doc, provider));
}
