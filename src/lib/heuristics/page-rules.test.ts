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
  it('does not fire without a payment field or without a cross-host action', () => {
    expect(
      paymentFormAnomaly.evaluate(ctx('shop.example', [{ actionHost: 'x.tk', inputNames: ['email'], hasPaymentField: false }])),
    ).toBeNull();
    expect(paymentFormAnomaly.evaluate(ctx('shop.example', [payForm(null)]))).toBeNull();
  });
});
