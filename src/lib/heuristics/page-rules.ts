import type { Rule } from './rule-types';
import { COPY } from '../banner/copy';

// Page-shape rules (heuristic-ruleset §3.2). Skeletons pending the v0.1 engine pass.

export const paymentFormAnomaly: Rule = {
  id: 'payment-form-anomaly',
  category: 'page',
  severity: 'yellow',
  // TODO: payment field present AND (cross-eTLD+1 action not in processor allow-list
  //       OR declared brand ≠ action target).
  evaluate: () => null,
  copy: COPY['payment-form-anomaly']!,
  elevateWhen: ['domain-age-young', 'tld-impersonation', 'scam-language-pressure'],
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
