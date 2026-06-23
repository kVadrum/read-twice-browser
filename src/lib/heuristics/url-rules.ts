import type { Rule } from './rule-types';
import { COPY } from '../banner/copy';

// URL / domain-shape rules (heuristic-ruleset §3.1).
// `domain-age-young` is implemented as the reference rule that exercises the whole
// pipeline end-to-end; the remaining three are skeletons (return null) pending the
// v0.1 engine pass (handoff §7 step 3) and the lists they read from the companion repo.

const DOMAIN_AGE_THRESHOLD_DAYS = 90;

export const domainAgeYoung: Rule = {
  id: 'domain-age-young',
  category: 'url',
  severity: 'yellow',
  evaluate(ctx) {
    const age = ctx.rdap?.ageDays;
    if (age == null || age >= DOMAIN_AGE_THRESHOLD_DAYS) return null;
    return { vars: { N: String(age) } };
  },
  copy: COPY['domain-age-young']!,
  // NOTE: spec composition semantics are unresolved — heuristic-ruleset §5 says ALL
  // listed rules must fire (AND), but the worked examples (§4 ex.3: young + payment → red)
  // read as pairwise/ANY. Reconcile during the engine pass before calibration.
  elevateWhen: ['payment-form-anomaly', 'tld-impersonation'],
  knownFalsePositives: ['recently-launched small businesses', 'conference sites', 'newly-spun-off corporate domains'],
};

export const domainCharsetMixed: Rule = {
  id: 'domain-charset-mixed',
  category: 'url',
  severity: 'yellow',
  evaluate: () => null, // TODO: homoglyph detection on the punycode-decoded hostname.
  copy: COPY['domain-charset-mixed']!,
  elevateWhen: ['payment-form-anomaly'],
};

export const tldElevatedRisk: Rule = {
  id: 'tld-elevated-risk',
  category: 'url',
  severity: 'yellow',
  modifier: true, // Never surfaces a banner alone — elevation/evidence modifier only.
  evaluate: () => null, // TODO: match against lists/elevated-tlds.yaml.
  copy: COPY['tld-elevated-risk']!,
};

export const tldImpersonation: Rule = {
  id: 'tld-impersonation',
  category: 'url',
  severity: 'red',
  evaluate: () => null, // TODO: brand keyword in host AND host not in canonical allow-list.
  copy: COPY['tld-impersonation']!,
};

export const urlRules: readonly Rule[] = [
  domainAgeYoung,
  domainCharsetMixed,
  tldElevatedRisk,
  tldImpersonation,
];
