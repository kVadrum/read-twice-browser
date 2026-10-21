import { describe, it, expect } from 'vitest';
import { domainAgeYoung, tldElevatedRisk, tldImpersonation, domainCharsetMixed } from './url-rules';
import type { EvaluationContext, PageFeatures, RdapResult } from './rule-types';
import { hostHasBrandToken } from './match';
import {
  BRAND_IMPERSONATION,
  CANONICAL_PHONES,
  TECH_SUPPORT_BRANDS,
  GOVERNMENT_AGENCIES,
  BRAND_SENDERS,
  NEWS_DOMAINS_ALLOW,
  NEWS_SENDERS_ALLOW,
  TAX_PREP_ALLOW,
  TAX_PREP_SENDERS,
  PAYMENT_PROCESSORS_ALLOW,
} from '../ruleset/lists';

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
  it("does not fire on a brand's own sites beyond its first domain, and names the one users land on", () => {
    // zellepay.com redirects to www.zelle.com: naming zellepay.com would send the user back here.
    expect(tldImpersonation.evaluate(ctx('www.zelle.com'))).toBeNull();
    expect(tldImpersonation.evaluate(ctx('zelle-refund-desk.example'))).toEqual({
      vars: { brand: 'Zelle', canonical: 'zelle.com' },
    });
    for (const host of ['www.amazon.ca', 'www.amazon.co.uk', 'www.amazon.com.mx', 'www.amazon.jobs']) {
      expect(tldImpersonation.evaluate(ctx(host)), host).toBeNull();
    }
    expect(tldImpersonation.evaluate(ctx('amazon-refund-desk.example'))?.vars.canonical).toBe('amazon.com');
  });
  it('still fires on a brand token in a host anyone can get on a shared platform', () => {
    // amazonaws.com is never Amazon's canonical: an S3 bucket name is the customer's choice.
    expect(tldImpersonation.evaluate(ctx('amazon-support.s3.amazonaws.com'))).toEqual({
      vars: { brand: 'Amazon', canonical: 'amazon.com' },
    });
  });
});

describe("tld-impersonation against the lists' own domains", () => {
  // Every other list that names an entity's own domains — its websites for a content or phone
  // rule, its mail senders — is a claim that the domain is that entity's. tld-impersonation
  // must never call one of them an impostor, or the brand's own site (amazon.ca, zelle.com)
  // draws a red. ON_BEHALF_SENDERS is left out on purpose: those are third parties.
  const owned: [string, readonly string[]][] = [
    ...CANONICAL_PHONES.map((b): [string, readonly string[]] => [`phones ${b.display}`, b.canonical]),
    ...TECH_SUPPORT_BRANDS.flatMap((b): [string, readonly string[]][] => [
      [`tech ${b.display}`, b.canonical],
      [`tech ${b.display} senders`, b.senders],
    ]),
    ...GOVERNMENT_AGENCIES.flatMap((a): [string, readonly string[]][] => [
      [`agency ${a.display}`, a.canonical],
      [`agency ${a.display} senders`, a.senders],
    ]),
    ...BRAND_SENDERS.map((b): [string, readonly string[]] => [
      `mail ${b.display}`,
      [...b.senders, ...(b.unenforcedSenders ?? [])],
    ]),
    ['NEWS_DOMAINS_ALLOW', NEWS_DOMAINS_ALLOW],
    ['NEWS_SENDERS_ALLOW', NEWS_SENDERS_ALLOW],
    ['TAX_PREP_ALLOW', TAX_PREP_ALLOW],
    ['TAX_PREP_SENDERS', TAX_PREP_SENDERS],
    ['PAYMENT_PROCESSORS_ALLOW', PAYMENT_PROCESSORS_ALLOW],
  ];

  it("never flags www.<domain> for a domain another list calls an entity's own", () => {
    let withBrandToken = 0;
    for (const [name, entries] of owned) {
      for (const entry of entries) {
        // An exact address ("irs@service.govdelivery.com") names one mailbox, not the domain's
        // owner; an exact-domain entry ("@aarp.org") is still that domain's.
        if (entry.indexOf('@') > 0) continue;
        const host = `www.${entry.replace(/^@/, '')}`;
        expect(tldImpersonation.evaluate(ctx(host)), `${name}: ${entry}`).toBeNull();
        if (BRAND_IMPERSONATION.some((b) => hostHasBrandToken(host, b.keyword))) withBrandToken++;
      }
    }
    // Positive control: the walk reaches hosts the rule would judge, not only token-free ones.
    expect(withBrandToken).toBeGreaterThan(50);
  });
});

describe('domain-charset-mixed', () => {
  it('fires on a real IDN homoglyph (xn-- produced by the URL parser)', () => {
    // Cyrillic 'а' (U+0430) standing in for Latin 'a' — the URL parser punycodes it.
    const xn = new URL('https://ch' + String.fromCharCode(0x0430) + 'se.example').hostname;
    const hit = domainCharsetMixed.evaluate(ctx(xn));
    expect(hit).not.toBeNull();
    expect(hit!.vars.punycode).toBe(xn.toLowerCase());
    expect(hit!.vars.display).toContain('ch');
  });
  it('does not fire on a plain ASCII host or a legit single-script IDN', () => {
    expect(domainCharsetMixed.evaluate(ctx('chase.com'))).toBeNull();
    expect(domainCharsetMixed.evaluate(ctx('xn--bcher-kva.com'))).toBeNull(); // bücher.com
  });
});
