import { describe, it, expect } from 'vitest';
import { domainAgeYoung, tldElevatedRisk, tldImpersonation } from './url-rules';
import type { EvaluationContext, PageFeatures, RdapResult } from './rule-types';

function ctx(host: string, over: Partial<PageFeatures> = {}, rdap: RdapResult | null = null): EvaluationContext {
  return {
    features: {
      url: `https://${host}/`,
      host,
      bodyExcerpt: '',
      forms: [],
      brandMentions: [],
      phoneNumbers: [],
      linkTargets: [],
      ...over,
    },
    redirectChain: [],
    rdap,
    dismissedHosts: [],
  };
}

describe('domain-age-young', () => {
  it('fires for a domain younger than 90 days, with the age filled in', () => {
    expect(domainAgeYoung.evaluate(ctx('new.example', {}, { registeredOn: null, ageDays: 4 }))).toEqual({
      vars: { N: '4' },
    });
  });
  it('does not fire for an older domain or when RDAP is unavailable', () => {
    expect(domainAgeYoung.evaluate(ctx('old.example', {}, { registeredOn: null, ageDays: 200 }))).toBeNull();
    expect(domainAgeYoung.evaluate(ctx('x.example', {}, null))).toBeNull();
  });
});

describe('tld-elevated-risk', () => {
  it('fires on an abuse-heavy TLD and is a modifier', () => {
    expect(tldElevatedRisk.modifier).toBe(true);
    expect(tldElevatedRisk.evaluate(ctx('promo.xyz'))).toEqual({ vars: { tld: 'xyz' } });
  });
  it('does not fire on an ordinary TLD', () => {
    expect(tldElevatedRisk.evaluate(ctx('shop.com'))).toBeNull();
  });
});

describe('tld-impersonation', () => {
  it('fires when a brand token is in the host but not on the brand domain', () => {
    expect(tldImpersonation.evaluate(ctx('irs-tax-payment.top'))).toEqual({
      vars: { brand: 'IRS', canonical: 'irs.gov' },
    });
    expect(tldImpersonation.evaluate(ctx('chase-verify.com'))).toEqual({
      vars: { brand: 'Chase', canonical: 'chase.com' },
    });
  });
  it('does not fire on the real brand domain or its subdomains', () => {
    expect(tldImpersonation.evaluate(ctx('irs.gov'))).toBeNull();
    expect(tldImpersonation.evaluate(ctx('secure.chase.com'))).toBeNull();
  });
  it('does not false-match a brand token buried inside a longer word', () => {
    expect(tldImpersonation.evaluate(ctx('purchase.com'))).toBeNull(); // not "chase"
    expect(tldImpersonation.evaluate(ctx('groups.io'))).toBeNull(); // not "ups"
  });
});
