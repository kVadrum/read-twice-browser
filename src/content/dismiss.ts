import { unmountBanner } from '../lib/banner/banner';
import type { ContentToWorker } from '../lib/runtime/messaging-types';

// Dismissals are extension state, so they live on the extension's side (the worker),
// not in the visited page's origin storage. The content script just asks the worker
// to record the dismissal, then removes the banner.
//
// SCAFFOLD: the full "This isn't a scam" follow-up sheet (optional anonymized note,
// banner-ux-and-copy §7) is a frontend-design build. This wires the 30-day dismissal.
export async function dismissForThisSite(host: string): Promise<void> {
  const msg: ContentToWorker = { type: 'RecordDismissal', host };
  await chrome.runtime.sendMessage(msg);
  unmountBanner();
}
