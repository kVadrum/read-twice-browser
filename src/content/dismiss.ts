import { unmountBanner } from '../lib/banner/banner';
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
export async function dismissForThisSite(host: string): Promise<void> {
  unmountBanner();
  try {
    await chrome.runtime.sendMessage({ type: 'RecordDismissal', host } satisfies ContentToWorker);
  } catch (err) {
    console.error('[read-twice] failed to record dismissal:', err);
  }
}
