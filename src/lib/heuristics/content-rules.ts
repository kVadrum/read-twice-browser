import type { Rule } from './rule-types';
import { COPY } from '../banner/copy';
import { URGENCY_PHRASES, PRESSURE_PHRASES, NEWS_DOMAINS_ALLOW } from '../ruleset/lists';
import { textHasPhrase, isOnDomain } from './match';

// Content / text-pattern rules (heuristic-ruleset §3.3). Exact-phrase match against
// curated lists — never bare keyword match — to keep false positives down. The
// phrase lists are the interim TS home for what becomes the companion repo's
// lists/{urgency,pressure}-phrases.yaml.

export const scamLanguageUrgent: Rule = {
  id: 'scam-language-urgent',
  category: 'content',
  severity: 'yellow',
  evaluate(ctx) {
    const matched = URGENCY_PHRASES.find((p) => textHasPhrase(ctx.features.bodyExcerpt, p));
    return matched ? { vars: { matchedPhrase: matched } } : null;
  },
  copy: COPY['scam-language-urgent']!,
};

export const scamLanguagePressure: Rule = {
  id: 'scam-language-pressure',
  category: 'content',
  severity: 'red',
  evaluate(ctx) {
    // News coverage of scams quotes these phrases legitimately — a yellow on a news
    // article is tolerable, a red is not, so suppress on allow-listed news domains.
    if (NEWS_DOMAINS_ALLOW.some((d) => isOnDomain(ctx.features.host, d))) return null;
    const matched = PRESSURE_PHRASES.find((p) => textHasPhrase(ctx.features.bodyExcerpt, p));
    return matched ? { vars: { matchedPhrase: matched } } : null;
  },
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
