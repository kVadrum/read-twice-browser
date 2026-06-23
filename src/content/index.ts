import { extractPageFeatures } from './extract';
import { renderVerdict } from './render';
import type { ContentToWorker, WorkerToContent } from '../lib/runtime/messaging-types';

// Content-script entry. Runs at document_idle (manifest), extracts page features,
// asks the worker for a verdict, and renders the banner if anything fired.
async function run(): Promise<void> {
  const features = extractPageFeatures();

  // Skip the banner if the user already dismissed this site.
  const dismissed = (await chrome.runtime.sendMessage({
    type: 'CheckDismissed',
    host: features.host,
  } satisfies ContentToWorker)) as WorkerToContent | undefined;
  if (dismissed?.type === 'DismissedResult' && dismissed.dismissed) return;

  const res = (await chrome.runtime.sendMessage({
    type: 'EvaluatePage',
    features,
  } satisfies ContentToWorker)) as WorkerToContent | undefined;

  if (res?.type === 'Verdict') renderVerdict(res.verdict, features);
}

void run().catch((err) => console.error('[read-twice] content script failed:', err));
