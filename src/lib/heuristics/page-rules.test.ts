import { describe, it, expect } from 'vitest';
import { paymentFormAnomaly } from './page-rules';
import type { EvaluationContext, PageFeatures, FormFeature } from './rule-types';

function ctx(host: string, forms: FormFeature[]): EvaluationContext {
  const features: PageFeatures = {
    url: `https://${host}/`,
    host,
    bodyExcerpt: '',
    forms,
    brandMentions: [],
    phoneNumbers: [],
    linkTargets: [],
  };
  return { features, redirectChain: [], rdap: null, dismissedHosts: [] };
}

const payForm = (actionHost: string | null): FormFeature => ({
  actionHost,
  inputNames: ['cc-number'],
  hasPaymentField: true,
});

describe('payment-form-anomaly', () => {
  it('fires when a payment form posts cross-domain to a non-processor', () => {
    expect(paymentFormAnomaly.evaluate(ctx('shop.example', [payForm('collect-pay.tk')]))).toEqual({
      vars: { actionHost: 'collect-pay.tk' },
    });
  });
  it('does not fire when the cross-domain target is a known payment processor', () => {
    expect(paymentFormAnomaly.evaluate(ctx('shop.example', [payForm('checkout.stripe.com')]))).toBeNull();
  });
  it('does not fire for a same-site (cross-subdomain) post', () => {
    expect(paymentFormAnomaly.evaluate(ctx('www.shop.example', [payForm('checkout.shop.example')]))).toBeNull();
  });
  // Multi-part public suffix: the last-two-labels approximation read both as "co.uk"
  // and missed the cross-domain post (PSL fix — registrableDomain via tldts).
  it('fires across a multi-part suffix when the registrable domain differs', () => {
    expect(paymentFormAnomaly.evaluate(ctx('shop.example.co.uk', [payForm('attacker.co.uk')]))).toEqual({
      vars: { actionHost: 'attacker.co.uk' },
    });
  });
  it('does not fire across a multi-part suffix when the registrable domain matches', () => {
    expect(paymentFormAnomaly.evaluate(ctx('shop.example.co.uk', [payForm('checkout.example.co.uk')]))).toBeNull();
  });
  it('does not fire without a payment field or without a cross-host action', () => {
    expect(
      paymentFormAnomaly.evaluate(ctx('shop.example', [{ actionHost: 'x.tk', inputNames: ['email'], hasPaymentField: false }])),
    ).toBeNull();
    expect(paymentFormAnomaly.evaluate(ctx('shop.example', [payForm(null)]))).toBeNull();
  });
});
