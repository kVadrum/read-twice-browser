import { loadRuleset } from '../lib/ruleset/loader';
import { evaluatePage } from '../lib/heuristics/engine';
import { getRedirectChain } from './navigation';
import { resolveDomainAge } from './rdap-orchestrator';
import { isDismissed, recordDismissal } from '../lib/storage/dismissals';
import type { EvaluationContext } from '../lib/heuristics/rule-types';
import type { ContentToWorker, WorkerToContent } from '../lib/runtime/messaging-types';

// The worker assembles the EvaluationContext and runs the (pure) engine. The content
// script only extracts features and renders — all rule evaluation happens here, where
// the ruleset, redirect chains, RDAP, and dismissal store live (architecture §4.1).

const ruleset = loadRuleset();

export function registerMessaging(): void {
  chrome.runtime.onMessage.addListener((msg: ContentToWorker, sender, sendResponse) => {
    handle(msg, sender)
      .then(sendResponse)
      .catch((err) => {
        console.error('[read-twice] worker message handler failed:', err);
        sendResponse({ type: 'Ack' } satisfies WorkerToContent);
      });
    return true; // keep the channel open for the async response
  });
}

async function handle(msg: ContentToWorker, sender: chrome.runtime.MessageSender): Promise<WorkerToContent> {
  switch (msg.type) {
    case 'EvaluatePage': {
      const tabId = sender.tab?.id;
      const ctx: EvaluationContext = {
        features: msg.features,
        redirectChain: tabId != null ? getRedirectChain(tabId) : [],
        rdap: await resolveDomainAge(msg.features.host),
        dismissedHosts: [],
      };
      return { type: 'Verdict', verdict: evaluatePage(ruleset, ctx) };
    }
    case 'CheckDismissed':
      return { type: 'DismissedResult', host: msg.host, dismissed: await isDismissed(msg.host, Date.now()) };
    case 'RecordDismissal':
      await recordDismissal(msg.host, Date.now());
      return { type: 'Ack' };
  }
}
