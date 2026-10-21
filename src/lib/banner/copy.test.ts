import { describe, it, expect } from 'vitest';
import { COPY, EMAIL_COPY, bannerText, copyFor } from './copy';
import { contentRules } from '../heuristics/content-rules';
import { phoneNumberImpersonation } from '../heuristics/page-rules';
import type { Verdict } from '../heuristics/rule-types';

const IRS = { agency: 'IRS', canonical: 'irs.gov' };

describe('bannerText', () => {
  it('draws a web page verdict from the web copy, byte for byte', () => {
    // The golden lane's red-single state (tests/golden/scenarios.ts).
    const v: Verdict = { severity: 'red', hits: [{ ruleId: 'government-impersonation', severity: 'red', vars: IRS }] };
    expect(bannerText(v)).toEqual({
      headline: 'This page is pretending to be IRS.',
      evidence: ['This page is using the IRS name but is not on the real IRS website (irs.gov).'],
      action: "The real IRS doesn't collect payments through pages like this. Close this tab.",
      closeLabel: 'Hide this for this site',
    });
  });

  it('draws a verdict on an email from the email variants, falling back to copy that already speaks of the email', () => {
    const v: Verdict = {
      severity: 'yellow',
      surface: 'email',
      hits: [
        { ruleId: 'government-impersonation', severity: 'yellow', vars: { agency: 'USPS', canonical: 'usps.com' } },
        {
          ruleId: 'sender-domain-mismatch',
          severity: 'yellow',
          vars: { brand: 'USPS', displayName: 'USPS Delivery', fromDomain: 'usps-redelivery.example' },
        },
      ],
    };
    expect(bannerText(v)).toEqual({
      headline: 'This email uses the USPS name and asks for a payment.',
      evidence: [
        "This email mentions USPS, but it doesn't come from USPS's real email address.",
        'This email says it\'s from "USPS Delivery" but the actual sender\'s address is "usps-redelivery.example".',
      ],
      action: "The real USPS doesn't collect payments through emails like this — don't click or reply, and you can delete it.",
      closeLabel: 'Hide this for this sender',
    });
  });

  it('takes the headline and action from the first hit that has them, skipping a modifier', () => {
    const v: Verdict = {
      severity: 'yellow',
      hits: [
        { ruleId: 'tld-elevated-risk', severity: 'yellow', vars: { tld: 'top' } },
        { ruleId: 'domain-age-young', severity: 'yellow', vars: { N: '4' } },
      ],
    };
    const text = bannerText(v);
    expect(text.headline).toBe('This website is new — registered 4 days ago.');
    expect(text.evidence).toHaveLength(2);
    expect(text.action).toBe(COPY['domain-age-young']!.action);
  });
});

describe('email copy', () => {
  // Every rule that reads the text of an open email: the content rules and the phone rule.
  const bodyRules = [...contentRules, phoneNumberImpersonation].map((r) => r.id);

  it('covers every rule that can fire over an email body', () => {
    for (const id of bodyRules) expect(EMAIL_COPY[id], id).toBeDefined();
    expect(copyFor('sender-domain-mismatch', 'email')).toBe(COPY['sender-domain-mismatch']);
    expect(copyFor('government-impersonation')).toBe(COPY['government-impersonation']);
  });

  it('speaks of the email, never a page or a tab, in the yellow tone webmail mode is capped at', () => {
    for (const [id, copy] of Object.entries(EMAIL_COPY)) {
      expect(copy.headline, id).toMatch(/\bemail\b/);
      for (const line of [copy.headline, copy.evidence, copy.action]) {
        expect(line, id).not.toMatch(/\b(?:page|tab)\b/i);
        expect(line, id).not.toMatch(/almost certainly|fake/i);
        // banner-ux-and-copy §2.6
        expect(line, id).not.toMatch(
          /\b(?:threat|warning|detected|blocked|phishing|malware|virus|scanning|protected|secure|alert|danger)\b/i,
        );
      }
    }
  });

  it('fills the same placeholders its rule provides', () => {
    for (const [id, copy] of Object.entries(EMAIL_COPY)) {
      const web = COPY[id]!;
      const keys = (s: string) => Array.from(s.matchAll(/\{(\w+)\}/g), (m) => m[1]);
      const provided = new Set([...keys(web.headline), ...keys(web.evidence), ...keys(web.action)]);
      for (const key of [...keys(copy.headline), ...keys(copy.evidence), ...keys(copy.action)]) {
        expect(provided, `${id}: {${key}}`).toContain(key);
      }
    }
  });
});
