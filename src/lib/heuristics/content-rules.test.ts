import { describe, it, expect } from 'vitest';
import {
  scamLanguageUrgent,
  scamLanguagePressure,
  governmentImpersonation,
  techSupportImpersonation,
} from './content-rules';
import type { EvaluationContext, PageFeatures } from './rule-types';

function ctx(host: string, bodyExcerpt: string, over: Partial<PageFeatures> = {}): EvaluationContext {
  const features: PageFeatures = {
    url: `https://${host}/`,
    host,
    bodyExcerpt,
    forms: [],
    brandMentions: [],
    phoneNumbers: [],
    linkTargets: [],
    ...over,
  };
  return { features, redirectChain: [], rdap: null, dismissedHosts: [] };
}

const PAYMENT_FORM = [{ actionHost: null, inputNames: ['cc-number'], hasPaymentField: true }];

describe('scam-language-urgent', () => {
  it('fires on an urgency phrase and reports the matched phrase', () => {
    expect(
      scamLanguageUrgent.evaluate(ctx('x.example', 'Warning: your account will be suspended soon.')),
    ).toEqual({ vars: { matchedPhrase: 'account will be suspended' } });
  });
  it('does not fire on ordinary copy', () => {
    expect(scamLanguageUrgent.evaluate(ctx('x.example', 'Thanks for your order. It ships Monday.'))).toBeNull();
  });
});

describe('scam-language-pressure', () => {
  it('fires red on a pressure phrase', () => {
    expect(scamLanguagePressure.severity).toBe('red');
    expect(scamLanguagePressure.evaluate(ctx('scam.example', 'You must pay with gift cards only.'))).toEqual({
      vars: { matchedPhrase: 'gift cards only' },
    });
  });
  it('is suppressed on allow-listed news domains (red on a news article is not acceptable)', () => {
    expect(
      scamLanguagePressure.evaluate(ctx('nytimes.com', 'Scammers told her to pay with gift cards only.')),
    ).toBeNull();
    // subdomain of a news domain is still covered
    expect(
      scamLanguagePressure.evaluate(ctx('www.bbc.co.uk', 'The fraudster said do not tell anyone.')),
    ).toBeNull();
  });
});

describe('government-impersonation', () => {
  it('fires red when an agency is named with a payment ask, off the real domain', () => {
    expect(governmentImpersonation.severity).toBe('red');
    // pay-CTA path
    expect(
      governmentImpersonation.evaluate(ctx('irs-refund.top', 'The IRS requires payment. Click here to pay your balance.')),
    ).toEqual({ vars: { agency: 'IRS', canonical: 'irs.gov' } });
    // payment-form path
    expect(
      governmentImpersonation.evaluate(ctx('usps-fee.top', 'Outstanding USPS delivery fee.', { forms: PAYMENT_FORM })),
    ).toEqual({ vars: { agency: 'USPS', canonical: 'usps.com' } });
  });
  it('does not fire on the real .gov domain or for allow-listed tax-prep companies', () => {
    expect(governmentImpersonation.evaluate(ctx('irs.gov', 'Pay your balance to the IRS here.'))).toBeNull();
    expect(governmentImpersonation.evaluate(ctx('turbotax.com', 'We file with the IRS. Pay now.'))).toBeNull();
  });
  it('does not fire on a mere mention without a payment ask (avoids CPA/blog FPs)', () => {
    expect(governmentImpersonation.evaluate(ctx('taxblog.example', 'A long read about how the IRS works.'))).toBeNull();
  });
  it('does not match an acronym buried in a longer word', () => {
    expect(governmentImpersonation.evaluate(ctx('shop.example', 'Our first sale! Pay now.'))).toBeNull(); // "irs" inside "first"
  });
});

describe('tech-support-impersonation', () => {
  it('fires red on a fake support claim near the top with a phone number, off the real domain', () => {
    expect(
      techSupportImpersonation.evaluate(
        ctx('microsoft-support-247.click', 'Microsoft Support — call now.', { phoneNumbers: ['1-800-555-0199'] }),
      ),
    ).toEqual({ vars: { brand: 'Microsoft' } });
  });
  it('does not fire on the real domain or without a phone number', () => {
    expect(
      techSupportImpersonation.evaluate(ctx('support.microsoft.com', 'Microsoft Support', { phoneNumbers: ['1-800-555-0199'] })),
    ).toBeNull();
    expect(techSupportImpersonation.evaluate(ctx('x.top', 'Apple Support', { phoneNumbers: [] }))).toBeNull();
  });
  it('does not fire when the brand claim is deep in the page, not the headline area', () => {
    const deep = 'x'.repeat(2000) + ' Microsoft Support call now';
    expect(techSupportImpersonation.evaluate(ctx('x.top', deep, { phoneNumbers: ['1-800-555-0199'] }))).toBeNull();
  });
});
