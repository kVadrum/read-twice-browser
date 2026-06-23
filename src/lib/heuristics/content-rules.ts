import type { Rule } from './rule-types';
import { COPY } from '../banner/copy';

// Content / text-pattern rules (heuristic-ruleset §3.3). Skeletons pending the
// v0.1 engine pass. These read curated phrase lists from the companion repo
// (lists/urgency-phrases.yaml, lists/pressure-phrases.yaml) — exact-phrase match,
// never bare keyword match, to keep false positives down.

export const scamLanguageUrgent: Rule = {
  id: 'scam-language-urgent',
  category: 'content',
  severity: 'yellow',
  evaluate: () => null, // TODO: exact-phrase match against the urgency-phrase list.
  copy: COPY['scam-language-urgent']!,
};

export const scamLanguagePressure: Rule = {
  id: 'scam-language-pressure',
  category: 'content',
  severity: 'red',
  evaluate: () => null, // TODO: exact-phrase match against the high-confidence pressure list.
  copy: COPY['scam-language-pressure']!,
  knownFalsePositives: ['news articles about scams (allow-listed news domains)'],
};

export const techSupportImpersonation: Rule = {
  id: 'tech-support-impersonation',
  category: 'content',
  severity: 'red',
  // TODO: support-brand keyword in top 30% of text + nearby US/CA number + domain not canonical.
  evaluate: () => null,
  copy: COPY['tech-support-impersonation']!,
};

export const governmentImpersonation: Rule = {
  id: 'government-impersonation',
  category: 'content',
  severity: 'red',
  // TODO: agency keyword + payment/PII-collection element + domain not on the agency's canonical TLD.
  evaluate: () => null,
  copy: COPY['government-impersonation']!,
};

export const contentRules: readonly Rule[] = [
  scamLanguageUrgent,
  scamLanguagePressure,
  techSupportImpersonation,
  governmentImpersonation,
];
