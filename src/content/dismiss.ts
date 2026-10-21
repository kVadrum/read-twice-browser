import { unmountBanner } from '../lib/banner/banner';
import { parseEmailAddress } from '../lib/heuristics/email-address';
import type { PageFeatures } from '../lib/heuristics/rule-types';
import type { ContentToWorker } from '../lib/runtime/messaging-types';

// Dismissals are extension state, so they live on the extension's side (the worker),
// not in the visited page's origin storage.
//
// The × and "This isn't a scam" are one gesture: "make this go away." Honor it
// immediately and unconditionally — unmount first, then record the 30-day dismissal as
// best-effort. If the worker round-trip fails the banner still closes (the page just
// re-evaluates on the next navigation); we never leave it wedged on a rejected message.
//
// Still deferred: the §7 follow-up sheet (optional anonymized note) — gated on the
// feedback subsystem, which doesn't exist yet.

/**
 * What a dismissal silences — the ONE key both the check and the record path use, so they
 * can never disagree. A website: its host, as before. Webmail mode: the open email's sender,
 * because the host is the whole mail client — dismissing one sender's banner must not
 * silence every other sender for 30 days. The "mail:" namespace cannot collide with a
 * website key: a hostname starts with a letter, a digit or "[" (an IPv6 literal), never "mail:". Local only: keys go to the worker, never off
 * the device, and a sender key names a correspondent, so the store never keeps the plain key
 * (lib/storage/dismissals.ts).
 */
export function dismissalKey(features: PageFeatures): string {
  const mail = features.webmail;
  if (!mail) return features.host;
  const from = parseEmailAddress(mail.fromAddress);
  // No address (Outlook hides it for same-organisation senders): key on the name instead.
  return from ? `mail:${from.local}@${from.domain}` : `mail:name:${mail.displayName.toLowerCase()}`;
}

// Keys dismissed during this page-load. The worker's 30-day record is the real store; this
// stops a webmail re-evaluation — the same email re-rendered, or another email from the
// same sender — from resurrecting a banner the user closed seconds ago, even if the worker
// round-trip failed. That includes a re-evaluation already in flight when they closed it:
// content/index.ts checks this again after every worker round trip.
const dismissedThisPage = new Set<string>();

export function wasDismissedThisPage(key: string): boolean {
  return dismissedThisPage.has(key);
}

/** Closes the banner and records the dismissal of what `key` names (dismissalKey): the site,
 *  or in webmail mode the open email's sender. */
export async function dismissFor(key: string): Promise<void> {
  unmountBanner();
  dismissedThisPage.add(key);
  try {
    await chrome.runtime.sendMessage({ type: 'RecordDismissal', key } satisfies ContentToWorker);
  } catch (err) {
    console.error('[read-twice] failed to record dismissal:', err);
  }
}
