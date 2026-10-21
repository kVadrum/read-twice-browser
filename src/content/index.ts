import { extractPageFeatures } from './extract';
import { renderVerdict } from './render';
import { dismissalKey, wasDismissedThisPage } from './dismiss';
import { webmailProviderFor, findOpenMessage, messageSignature } from './webmail';
import { watchOpenMessage, SETTLE_MS, MAX_WAIT_MS } from './webmail/watch';
import { clearBanner, isBannerNode } from '../lib/banner/banner';
import type { WebmailProvider } from '../lib/ruleset/webmail-hosts';
import type { PageFeatures, Verdict } from '../lib/heuristics/rule-types';
import type { ContentToWorker, WorkerToContent } from '../lib/runtime/messaging-types';

// Content-script entry. Runs at document_idle (manifest), extracts page features,
// asks the worker for a verdict, and renders the banner if anything fired. On a webmail
// host it then keeps watching: opening another email is not a navigation, so each newly
// opened email gets its own evaluation and its own banner (heuristic-ruleset §3.4).

// Bumped per evaluation, so a reply for an evaluation the watcher has since replaced is
// dropped instead of drawing over the newer one.
let generation = 0;
// The verdict on screen, serialized — so the client re-drawing the same email with the same
// verdict doesn't replay the banner's entry.
let shownVerdict: string | null = null;

async function evaluate(provider: WebmailProvider | null): Promise<void> {
  const gen = ++generation;
  const features = extractPageFeatures();
  const key = dismissalKey(features);
  // The email these features describe. The watcher only reports a switch once the client
  // settles (watch.ts SETTLE_MS, up to MAX_WAIT_MS), and a cold worker can take longer than
  // that to answer — so the generation alone can't see that the user has moved on. Each
  // await below is a window in which the user can open another email or close the banner;
  // a reply that no longer fits is dropped. Identity only, never the detail: Gmail churns
  // the body while it renders, and a reply dropped for churn would never be asked for again.
  const subject = openMessageId(provider);
  const moot = async (): Promise<boolean> => {
    if (gen !== generation || wasDismissedThisPage(key)) return true;
    if (openMessageId(provider) === subject) return false;
    return !(await returnsTo(provider, subject, gen)) || wasDismissedThisPage(key);
  };

  // Skip the banner if the user already dismissed what the key names: the site, or in
  // webmail mode the sender.
  if (wasDismissedThisPage(key)) return;
  const dismissed = (await chrome.runtime.sendMessage({
    type: 'CheckDismissed',
    key,
  } satisfies ContentToWorker)) as WorkerToContent | undefined;
  if (await moot()) return;
  if (dismissed?.type === 'DismissedResult' && dismissed.dismissed) return;

  const res = (await chrome.runtime.sendMessage({
    type: 'EvaluatePage',
    features,
  } satisfies ContentToWorker)) as WorkerToContent | undefined;
  // A dismissal made during the round trip wins, even over a different verdict for the same
  // sender (a Reply-To revealed meanwhile): the user closed it; it stays closed.
  if (await moot()) return;

  if (res?.type === 'Verdict') show(res.verdict, features, key);
}

/** For a reply that lands while its email is off screen: waits out a client re-render that
 *  hides the email and draws it again — which the watcher, comparing settled states, never
 *  reports, so nothing would ask again. True when the email is back with nothing newer asked
 *  for; false once the watcher has reported a real switch or the wait runs out (then the
 *  watcher, still holding this email's signature, reports whatever is open instead). */
async function returnsTo(provider: WebmailProvider | null, subject: string, gen: number): Promise<boolean> {
  for (let waited = 0; waited < MAX_WAIT_MS + SETTLE_MS; waited += SETTLE_MS) {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    if (gen !== generation) return false;
    if (openMessageId(provider) === subject) return true;
  }
  return false;
}

/** Which email is open — the watcher's identity for it; '' off webmail or with none open. */
function openMessageId(provider: WebmailProvider | null): string {
  return provider ? messageSignature(findOpenMessage(document, provider)).id : '';
}

/** Puts `verdict` on screen, replacing whatever banner is there; no-op when it is already up. */
function show(verdict: Verdict, features: PageFeatures, key: string): void {
  const next = verdict.severity === 'none' ? null : JSON.stringify(verdict);
  if (next === shownVerdict) return;
  if (shownVerdict !== null) clearBanner();
  shownVerdict = next;
  if (next !== null) renderVerdict(verdict, features, key);
}

function onFailure(err: unknown): void {
  console.error('[read-twice] content script failed:', err);
}

function run(): Promise<void> {
  const provider = webmailProviderFor(location.hostname);
  if (provider) {
    watchOpenMessage(
      document,
      provider,
      ({ sameMessage }) => {
        if (!sameMessage) {
          // A different email (or none): the last one's banner must not sit over it, not
          // even for the moment the worker takes to answer.
          clearBanner();
          shownVerdict = null;
        }
        void evaluate(provider).catch(onFailure);
      },
      isBannerNode,
    );
  }
  return evaluate(provider);
}

void run().catch(onFailure);
