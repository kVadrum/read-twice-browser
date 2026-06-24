import type { Rule } from './rule-types';
import { COPY } from '../banner/copy';
import { PAYMENT_PROCESSORS_ALLOW } from '../ruleset/lists';
import { isOnDomain, registrableDomain } from './match';

// Page-shape rules (heuristic-ruleset §3.2).

export const paymentFormAnomaly: Rule = {
  id: 'payment-form-anomaly',
  category: 'page',
  severity: 'yellow',
  evaluate(ctx) {
    const pageReg = registrableDomain(ctx.features.host);
    for (const form of ctx.features.forms) {
      if (!form.hasPaymentField || form.actionHost == null) continue;
      // Same registrable domain → normal (cross-subdomain checkout). Not an anomaly.
      if (registrableDomain(form.actionHost) === pageReg) continue;
      // A known payment processor is the expected cross-domain destination.
      if (PAYMENT_PROCESSORS_ALLOW.some((p) => isOnDomain(form.actionHost!, p))) continue;
      return { vars: { actionHost: form.actionHost } };
    }
    return null;
  },
  copy: COPY['payment-form-anomaly']!,
  // The brand-mismatch branch (page brand ≠ action target) is deferred — it needs
  // brand-mention extraction (extract.ts brandMentions is not yet populated).
  elevateWhen: ['domain-age-young', 'tld-impersonation', 'scam-language-pressure'],
  knownFalsePositives: ['legit sites using a regional processor not in the allow-list'],
};

export const redirectChainLong: Rule = {
  id: 'redirect-chain-long',
  category: 'page',
  severity: 'yellow',
  modifier: true, // Modifier only — legitimate redirects are too common to surface alone.
  // TODO: ≥3 hops AND ≥1 hop is a known shortener/tracker (lists/url-shorteners.yaml).
  evaluate: () => null,
  copy: COPY['redirect-chain-long']!,
};

export const phoneNumberImpersonation: Rule = {
  id: 'phone-number-impersonation',
  category: 'page',
  severity: 'red',
  // TODO: brand keyword within 200 chars of a US/CA number not matching the canonical phone.
  evaluate: () => null,
  copy: COPY['phone-number-impersonation']!,
};

export const pageRules: readonly Rule[] = [
  paymentFormAnomaly,
  redirectChainLong,
  phoneNumberImpersonation,
];
