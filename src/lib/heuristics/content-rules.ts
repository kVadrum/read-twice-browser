import type { Rule } from './rule-types';
import { COPY } from '../banner/copy';
import {
  URGENCY_PHRASES,
  PRESSURE_PHRASES,
  NEWS_DOMAINS_ALLOW,
  GOVERNMENT_AGENCIES,
  TAX_PREP_ALLOW,
  PAY_CTA_PHRASES,
  TECH_SUPPORT_BRANDS,
} from '../ruleset/lists';
import { textHasPhrase, textHasWord, textHasPhraseNearTop, isOnDomain } from './match';

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
  evaluate(ctx) {
    const f = ctx.features;
    // The scam is a fake support page with a number to call, so a displayed phone IS the
    // element. The brand-support claim must be near the top (headline area) to avoid FPs on
    // IT consultants who mention a brand in body copy (heuristic-ruleset §3.3).
    if (f.phoneNumbers.length === 0) return null;
    for (const brand of TECH_SUPPORT_BRANDS) {
      const named = brand.keywords.some((k) => textHasPhraseNearTop(f.bodyExcerpt, k));
      if (named && !brand.canonical.some((c) => isOnDomain(f.host, c))) {
        return { vars: { brand: brand.display } };
      }
    }
    return null;
  },
  copy: COPY['tech-support-impersonation']!,
  knownFalsePositives: ['third-party IT consultants (mitigated by near-top + canonical allow-list)'],
};

export const governmentImpersonation: Rule = {
  id: 'government-impersonation',
  category: 'content',
  severity: 'red',
  evaluate(ctx) {
    const f = ctx.features;
    // Require a PAYMENT ask specifically (payment/SSN form field or a pay CTA), NOT a bare
    // phone number — that keeps legit CPA/tax sites that merely MENTION an agency and list a
    // contact number out of red. (More conservative than §3.3, which also counts a displayed
    // phone; revisit when the corpus exists.)
    const hasPaymentAsk =
      f.forms.some((form) => form.hasPaymentField) ||
      PAY_CTA_PHRASES.some((p) => textHasPhrase(f.bodyExcerpt, p));
    if (!hasPaymentAsk) return null;
    if (TAX_PREP_ALLOW.some((d) => isOnDomain(f.host, d))) return null;

    for (const agency of GOVERNMENT_AGENCIES) {
      const named = agency.keywords.some((k) => textHasWord(f.bodyExcerpt, k));
      if (named && !agency.canonical.some((c) => isOnDomain(f.host, c))) {
        return { vars: { agency: agency.display, canonical: agency.canonical[0]! } };
      }
    }
    return null;
  },
  copy: COPY['government-impersonation']!,
  knownFalsePositives: ['tax-prep companies (allow-listed)', 'news coverage (excluded by the payment-ask requirement)'],
};

export const contentRules: readonly Rule[] = [
  scamLanguageUrgent,
  scamLanguagePressure,
  techSupportImpersonation,
  governmentImpersonation,
];
