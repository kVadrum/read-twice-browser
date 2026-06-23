import { mountBanner } from '../lib/banner/banner';
import { buildHandoffUrl } from '../lib/handoff/send-to-read-twice';
import { dismissForThisSite } from './dismiss';
import type { PageFeatures, Verdict } from '../lib/heuristics/rule-types';

// Wires the verdict to the banner and the banner's two buttons to their actions.
// The Send-to-Read-Twice hand-off opens in a new tab on the user's click gesture.
export function renderVerdict(verdict: Verdict, features: PageFeatures): void {
  mountBanner(verdict, {
    onSendToReadTwice() {
      const url = buildHandoffUrl({
        url: features.url,
        rulesFired: verdict.hits.map((h) => h.ruleId),
        excerpt: features.bodyExcerpt,
        timestamp: new Date().toISOString(),
      });
      window.open(url, '_blank', 'noopener');
    },
    onNotAScam() {
      void dismissForThisSite(features.host);
    },
  });
}
