import type { Rule } from './rule-types';
import { COPY } from '../banner/copy';
import { ELEVATED_TLDS, BRAND_IMPERSONATION } from '../ruleset/lists';
import { tldOf, isOnDomain, hostHasBrandToken } from './match';

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
  // Elevate to red if EITHER partner fires (OR-of-list; resolved 2026-06-23, ADR-005
  // revision). In practice the live trigger is `payment-form-anomaly` — `tld-impersonation`
  // is already base-red, so it's a redundant-but-harmless partner.
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
  evaluate(ctx) {
    const tld = tldOf(ctx.features.host);
    return ELEVATED_TLDS.includes(tld) ? { vars: { tld } } : null;
  },
  copy: COPY['tld-elevated-risk']!,
};

export const tldImpersonation: Rule = {
  id: 'tld-impersonation',
  category: 'url',
  severity: 'red',
  evaluate(ctx) {
    const host = ctx.features.host;
    for (const brand of BRAND_IMPERSONATION) {
      // Brand token in the host, but the host is NOT on the brand's real domain.
      if (hostHasBrandToken(host, brand.keyword) && !brand.canonical.some((c) => isOnDomain(host, c))) {
        return { vars: { brand: brand.display, canonical: brand.canonical[0]! } };
      }
    }
    return null;
  },
  copy: COPY['tld-impersonation']!,
  // Known FP surface: legit third parties with a brand token in their domain (resellers,
  // fan sites). Spec's refinement — pass them unless combined with payment/scam-language —
  // is a calibration follow-up once the corpus exists (heuristic-ruleset §3.1).
  knownFalsePositives: ['brand-authorized resellers', 'fan/community sites with a brand token'],
};

export const urlRules: readonly Rule[] = [
  domainAgeYoung,
  domainCharsetMixed,
  tldElevatedRisk,
  tldImpersonation,
];
