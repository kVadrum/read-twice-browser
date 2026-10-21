import { WEBMAIL_HOSTS, type WebmailProvider } from '../../lib/ruleset/webmail-hosts';
import type { WebmailFeatures } from '../../lib/heuristics/rule-types';
import { isRendered, readText, type OpenMessage, type VisibilityTest, type WebmailAdapter } from './dom';
import { readGmail } from './gmail';
import { readOutlook } from './outlook';
import { readYahoo } from './yahoo';

// Webmail mode (heuristic-ruleset §3.4). On a recognized webmail host the page itself is
// the mail client; what the rules should judge is the ONE email the user has open — its
// sender, From, Reply-To and body — read by a per-client adapter. Everything is read
// passively from the DOM: no clicks, no expanding, no network.

const ADAPTERS: Record<WebmailProvider, WebmailAdapter> = {
  gmail: readGmail,
  outlook: readOutlook,
  yahoo: readYahoo,
};

/** The webmail client served on this exact hostname, or null for any other site. */
export function webmailProviderFor(hostname: string): WebmailProvider | null {
  const h = hostname.toLowerCase();
  return WEBMAIL_HOSTS.find((w) => w.host === h)?.provider ?? null;
}

/** The email open in the client, or null when none is (an inbox list, settings, a client
 *  redesign our selectors no longer match). Never throws — a broken adapter must leave the
 *  page silent, not take the content script down with it. */
export function findOpenMessage(
  doc: Document,
  provider: WebmailProvider,
  isVisible: VisibilityTest = isRendered,
): OpenMessage | null {
  let msg: OpenMessage | null;
  try {
    msg = ADAPTERS[provider](doc, isVisible);
  } catch {
    return null;
  }
  return msg && withRememberedReplyTo(doc, msg);
}

// A Reply-To is only on screen while the user has the client's details view open; closing
// it doesn't change the email's header. Remember it per message (per document, bounded), so
// the warning doesn't vanish the moment the user closes the popup that revealed it.
const seenReplyTo = new WeakMap<Document, Map<string, string>>();
const SEEN_REPLY_TO_LIMIT = 50;

function withRememberedReplyTo(doc: Document, msg: OpenMessage): OpenMessage {
  let seen = seenReplyTo.get(doc);
  if (!seen) seenReplyTo.set(doc, (seen = new Map()));
  if (msg.replyToAddress) {
    seen.set(msg.id, msg.replyToAddress);
    if (seen.size > SEEN_REPLY_TO_LIMIT) seen.delete(seen.keys().next().value!);
    return msg;
  }
  const remembered = seen.get(msg.id);
  return remembered ? { ...msg, replyToAddress: remembered } : msg;
}

/** The open email as rule features. Body text is read here, not in the adapter, because
 *  innerText forces layout — the change watcher only needs the cheap header fields. */
export function toWebmailFeatures(msg: OpenMessage, host: string, bodyLimit: number): WebmailFeatures {
  return {
    host,
    displayName: msg.displayName,
    fromAddress: msg.fromAddress,
    replyToAddress: msg.replyToAddress,
    bodyExcerpt: readText(msg.body).slice(0, bodyLimit),
  };
}

/** What identifies the open email (`id`) and what would change its verdict without changing
 *  which email it is (`detail` — e.g. Gmail's details rows appearing once the user opens
 *  them). Cheap by design: header attributes and the body's text length, no layout. */
export interface MessageSignature {
  id: string;
  detail: string;
}

export function messageSignature(msg: OpenMessage | null): MessageSignature {
  if (!msg) return { id: '', detail: '' };
  return {
    id: msg.id,
    detail: [msg.displayName, msg.fromAddress, msg.replyToAddress ?? '', msg.body.textContent?.length ?? 0].join('\n'),
  };
}
