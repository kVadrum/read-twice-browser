import { describe, it, expect } from 'vitest';
import { paymentFormAnomaly, redirectChainLong, phoneNumberImpersonation } from './page-rules';
import { CANONICAL_PHONES, BRAND_SENDERS } from '../ruleset/lists';
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

// The chain is typed string[], but its collector lives outside the engine — the garbage
// cases deliberately pass what the type forbids.
function viaChain(chain: unknown, host = 'landing.example'): EvaluationContext {
  return { ...ctx(host, []), redirectChain: chain as string[] };
}

describe('redirect-chain-long', () => {
  it('fires at 3 redirects when one is a shortener, as a modifier', () => {
    expect(redirectChainLong.modifier).toBe(true);
    expect(redirectChainLong.evaluate(viaChain(['bit.ly', 'trk.example', 'hop.example']))).toEqual({
      vars: { N: '3', shortener: 'bit.ly' },
    });
  });
  it('does not fire at 2 redirects, even through a shortener', () => {
    expect(redirectChainLong.evaluate(viaChain(['bit.ly', 'hop.example']))).toBeNull();
  });
  it('finds a shortener anywhere in the chain and names the first one', () => {
    expect(redirectChainLong.evaluate(viaChain(['a.example', 'b.example', 'c.example', 'tinyurl.com']))).toEqual({
      vars: { N: '4', shortener: 'tinyurl.com' },
    });
    expect(redirectChainLong.evaluate(viaChain(['a.example', 't.co', 'b.example', 'bit.ly']))?.vars.shortener).toBe('t.co');
  });
  it('counts a subdomain of a shortener, but not a lookalike that only contains its name', () => {
    expect(redirectChainLong.evaluate(viaChain(['go.short.gy', 'a.example', 'b.example']))?.vars.shortener).toBe('go.short.gy');
    expect(redirectChainLong.evaluate(viaChain(['bit.ly.evil.example', 'notbit.ly', 'b.example']))).toBeNull();
  });
  it('does not fire on a long chain with no shortener (a single sign-on bounce)', () => {
    expect(
      redirectChainLong.evaluate(viaChain(['app.example', 'login.idp.example', 'mfa.idp.example', 'sso.example'])),
    ).toBeNull();
  });
  // Pins the list exclusion: these hops check links for the user, so naming one as
  // "including {shortener}" would present a protective hop as suspicious.
  it('does not treat protective mail link rewriters as shorteners', () => {
    const chain = ['nam12.safelinks.protection.outlook.com', 'urldefense.com', 'protect-us.mimecast.com', 'shop.example'];
    expect(redirectChainLong.evaluate(viaChain(chain))).toBeNull();
  });
  it('is silent on an empty or non-array chain, and garbage entries never count toward N', () => {
    for (const chain of [[], undefined, null, 'bit.ly,a.example,b.example', { 0: 'bit.ly', length: 3 }]) {
      expect(redirectChainLong.evaluate(viaChain(chain))).toBeNull();
    }
    const noisy = [null, '', '   ', 42, 'https://x.example/path', 'bit.ly', 'hop.example'];
    expect(redirectChainLong.evaluate(viaChain(noisy))).toBeNull(); // only 2 real hops
    expect(redirectChainLong.evaluate(viaChain([...noisy, 'relay.example']))?.vars.N).toBe('3');
    const noFeatures = { redirectChain: ['bit.ly', 'a.example', 'b.example'] } as unknown as EvaluationContext;
    expect(redirectChainLong.evaluate(noFeatures)?.vars.N).toBe('3');
  });
  it('normalizes case, surrounding whitespace and a trailing dot', () => {
    expect(redirectChainLong.evaluate(viaChain(['BIT.LY', ' Hop.Example ', 'relay.example.']))).toEqual({
      vars: { N: '3', shortener: 'bit.ly' },
    });
  });
  it('collapses back-to-back repeats of a host but counts one revisited later', () => {
    expect(redirectChainLong.evaluate(viaChain(['bit.ly', 'bit.ly', 'hop.example']))).toBeNull();
    expect(redirectChainLong.evaluate(viaChain(['bit.ly', 'hop.example', 'bit.ly']))?.vars.N).toBe('3');
  });
  it("does not count the page's own host at the end of the chain as a redirect", () => {
    expect(redirectChainLong.evaluate(viaChain(['bit.ly', 'hop.example', 'landing.example']))).toBeNull();
    // Earlier in the chain it is a real hop — the user was routed away and back.
    expect(redirectChainLong.evaluate(viaChain(['landing.example', 'bit.ly', 'hop.example']))?.vars.N).toBe('3');
  });
});

describe('phone-number-impersonation', () => {
  const evaluate = (host: string, bodyExcerpt: string) => {
    const base = ctx(host, []);
    return phoneNumberImpersonation.evaluate({ ...base, features: { ...base.features, bodyExcerpt } });
  };

  it('fires red on a fake number presented as the brand support line, naming the real one', () => {
    expect(phoneNumberImpersonation.severity).toBe('red');
    expect(evaluate('orders-help.example', 'Call Amazon Customer Service at 1-888-555-0123 for refunds.')).toEqual({
      vars: { brand: 'Amazon', canonical: '1-888-280-4331' },
    });
  });
  it('recognizes the call/contact, possessive and "phone number" phrasings', () => {
    expect(evaluate('x.example', 'Contact Microsoft at (888) 555-0142 right away')?.vars.brand).toBe('Microsoft');
    expect(evaluate('x.example', "Microsoft's support line: 1-888-555-0142")?.vars.brand).toBe('Microsoft');
    expect(evaluate('x.example', 'Wells Fargo phone number: 1-877-555-0188')?.vars.brand).toBe('Wells Fargo');
    expect(evaluate('x.example', 'Call the IRS at 1-866-555-0190 to settle')?.vars.brand).toBe('IRS');
    // all-caps "US" is the country, not the page speaking for itself
    expect(evaluate('x.example', 'Microsoft Support (US toll-free): 1-888-555-0142')?.vars.brand).toBe('Microsoft');
  });
  it("is silent on the brand's own domain and on allow-listed news domains", () => {
    expect(evaluate('www.chase.com', 'Chase customer service: 1-888-555-0101')).toBeNull();
    expect(evaluate('apnews.com', 'The caller claimed to be Amazon customer service and gave 1-888-555-0123.')).toBeNull();
    // Microsoft's own admin pages on its brand TLD, which tld-impersonation already treats as
    // Microsoft's. (Its Outlook client there never exempts an email: origin.test, every mail host.)
    expect(evaluate('admin.cloud.microsoft', 'Contact Microsoft support at 1-855-555-0100.')).toBeNull();
  });
  it("never fires on a real number — the brand's own, another listed brand's, or a known third-party line", () => {
    expect(evaluate('contact-guide.example', 'Call Apple Support at 1-800-275-2273.')).toBeNull();
    // brand A's phrase within reach of brand B's real line
    expect(
      evaluate('contact-guide.example', 'Chase customer service: 1-800-935-9935 | Bank of America customer service: 800.432.1000'),
    ).toBeNull();
    // TIGTA's hotline sits right beside "Contact the IRS" on legit advice pages
    expect(evaluate('tax-tips.example', 'Contact the IRS at 800-829-1040 or TIGTA at 800-366-4484.')).toBeNull();
  });
  it('attributes a fake number to the nearest brand claim', () => {
    expect(
      evaluate('x.example', 'Chase customer service: 1-800-935-9935 | Bank of America customer service: 1-888-555-0101'),
    ).toEqual({ vars: { brand: 'Bank of America', canonical: '800.432.1000' } });
  });
  it('needs the brand presented as the owner: a bare brand keyword is not enough', () => {
    expect(evaluate('repair-shop.example', 'Fast Apple and Microsoft device repair: 1-888-555-0150')).toBeNull();
  });
  it('ignores a number the page presents as its own ("call us", "our")', () => {
    expect(evaluate('x.example', 'Apple support and repair, same day — call us at 1-888-555-0150')).toBeNull();
    expect(evaluate('x.example', 'Call us at 1-888-555-0150 for Microsoft support')).toBeNull();
    expect(evaluate('x.example', 'Microsoft support from our certified team: 1-888-555-0150')).toBeNull();
  });
  it('links a phrase and a number only within one line and clause, at most 80 chars apart', () => {
    expect(evaluate('x.example', 'Microsoft support\nPhone: 1-888-555-0150')).toBeNull();
    expect(evaluate('x.example', 'Microsoft\nSupport 1-888-555-0150')).toBeNull(); // nav items, not a phrase
    expect(evaluate('x.example', 'Need Apple support? Call 1-888-555-0150.')).toBeNull();
    // Tighter than the spec's 200 on purpose: a long connective has moved on to someone else.
    const gap = (n: number) => `Call Microsoft Support ${'x'.repeat(n - 2)} 1-888-555-0142`;
    expect(evaluate('x.example', gap(80))).not.toBeNull();
    expect(evaluate('x.example', gap(81))).toBeNull();
  });
  it('gives each claim one number, so a directory line never lends a brand to the next vendor', () => {
    const quiet = [
      'Apple Support: 1-800-275-2273 · Samsung Support: 1-800-555-0164',
      'Samsung Support: 1-800-555-0164 · Apple Support: 1-800-275-2273',
      'Samsung Support: 1-800-555-0164 — Apple Support: 1-800-275-2273', // a heading, not a label
      'Microsoft Support: 1-800-642-7676 | Dell Support: 1-800-555-0166',
      'Dell Support: 1-800-555-0166 | Microsoft Support: 1-800-642-7676',
      'For Apple devices call Apple Support at 1-800-275-2273, and for Samsung devices call 1-800-555-0164.',
      // innerText joins table cells with tabs
      'Microsoft Support\t1-800-642-7676\tDell Technical Support\t1-800-555-0166',
      'Dell Technical Support\t1-800-555-0166\tMicrosoft Support\t1-800-642-7676',
      'Microsoft 365 support\tIT Service Desk\t1-877-555-0100', // the desk's line, one cell over
    ];
    for (const line of quiet) expect(evaluate('library.example', line), line).toBeNull();
    // A fake first number still fires; the claim owns the number it leads into.
    expect(evaluate('x.example', 'Microsoft Support: 1-888-555-0142 / 1-888-555-0143')?.vars.brand).toBe('Microsoft');
    expect(evaluate('x.example', 'Microsoft Support\t1-888-555-0142')?.vars.brand).toBe('Microsoft');
  });
  it('reads a brand after the number only as its label, never as a second contact', () => {
    expect(evaluate('x.example', 'Call 1-888-555-0142 (Microsoft Support) now')?.vars.brand).toBe('Microsoft');
    expect(evaluate('x.example', 'Call 1-888-555-0142 — Microsoft Support')?.vars.brand).toBe('Microsoft');
    const quiet: [string, string][] = [
      // referrals: the brand is where the page sends you, not whose number it shows
      [
        'www.ssa.gov',
        'If you have questions about your SSA-1099, call Social Security at 1-800-555-0160; for questions about your taxes, contact the IRS.',
      ],
      ['it.state.edu', 'Call the IT Service Desk at 1-877-555-0100 for Microsoft 365 support.'],
      ['www.bestbuy.com', 'Contact Geek Squad at 1-800-555-0178 for Apple support.'],
      ['www.verizon.com', 'Verizon Customer Service: 1-800-555-0104 — for AppleCare questions, contact Apple Support.'],
      [
        'www.zellepay.com',
        'Questions about Zelle? Call 1-844-555-0142; for account issues, contact Bank of America customer service.',
      ],
      // the recall cost, taken deliberately (ADR-005): a verb claim after the number
      ['x.example', 'Call 1-888-555-0142 to reach Microsoft Support.'],
      ['x.example', 'Call 1-888-555-0142 (for Microsoft support).'],
    ];
    for (const [host, line] of quiet) expect(evaluate(host, line), line).toBeNull();
  });
  it('breaks the link when the number is handed to a second party before it', () => {
    const quiet: [string, string][] = [
      [
        'www.delta.com',
        'Questions about your PayPal payment? Contact PayPal customer service; for your booking, call 1-800-555-0121.',
      ],
      [
        'shop.example',
        'Paid with PayPal? Contact PayPal customer service for disputes, or call the store at 1-888-555-0199 for returns.',
      ],
      ['it.state.edu', 'For Microsoft 365 support, contact the IT Service Desk at 1-877-555-0100.'],
      ['www.bestbuy.com', 'For Apple support, call a Geek Squad agent at 1-800-555-0178.'],
      // under a topic ("For … support,"), generic staff are whoever the page sends you to
      ['it.state.edu', 'For Microsoft 365 support, contact the help desk at 1-877-555-0100.'],
      ['library.example', 'For help with Apple support, call technical services at 1-877-555-0100.'],
    ];
    for (const [host, line] of quiet) expect(evaluate(host, line), line).toBeNull();
    // The recall cost, taken deliberately (ADR-005): under the brand's heading a generic staff
    // object reads exactly like an IT page's referral ("Microsoft 365 support: call the help
    // desk at …"), so these go quiet too.
    const cost: [string, string][] = [
      ['Amazon', 'Amazon Customer Service: call customer care at 1-888-555-0123'],
      ['Microsoft', 'Microsoft Technical Support: Call Support 1-888-555-0142'],
      ['Apple', 'Apple Support: Call Expert Technicians at 1-888-555-0150'],
      ['Microsoft', 'Microsoft Support: reach a live agent at 1-888-555-0142'],
      ['Microsoft', 'Microsoft Support: please call Windows technicians at 1-888-555-0142'],
      ['Microsoft', 'Microsoft Support: call support desk 1-888-555-0142'],
      ['IRS', 'IRS Helpline: call the collections unit at 1-866-555-0190'],
      ['Microsoft', 'Contact Microsoft Support, please call technical department: 1-888-555-0142'],
      ['PayPal', 'PayPal Customer Service, please call the billing department at 1-888-555-0199'],
    ];
    for (const [, line] of cost) expect(evaluate('pc-help.example', line), line).toBeNull();
    expect(evaluate('its.uiowa.edu', 'Microsoft 365 support: call the Help Desk at 1-877-555-0100.')).toBeNull();
    // Words that only dial the number keep the link.
    const own = 'Amazon Customer Service – please call their toll free number 1-888-555-0123';
    expect(evaluate('pc-help.example', own)?.vars.brand).toBe('Amazon');
    // A verb that still dials the number itself keeps the link.
    expect(evaluate('x.example', 'Microsoft Support: call 1-888-555-0142 now')?.vars.brand).toBe('Microsoft');
    expect(evaluate('x.example', 'Microsoft Support — call toll-free, 24/7, at 1-888-555-0142')?.vars.brand).toBe(
      'Microsoft',
    );
    expect(evaluate('x.example', 'Microsoft Support: contact an agent at 1-888-555-0142')?.vars.brand).toBe('Microsoft');
  });
  it('only considers toll-free numbers (a local number beside a brand is a branch or a shop)', () => {
    expect(evaluate('bank-branches.example', 'Chase Bank phone number: (212) 555-0123')).toBeNull();
  });
  it('is silent on pages writing about scams', () => {
    expect(
      evaluate('consumer-tips.example', 'Scammers posing as Amazon customer service ask people to call 1-888-555-0123.'),
    ).toBeNull();
  });
  it('guards brand names that are everyday words or first names', () => {
    expect(evaluate('x.example', 'Questions? Call Chase at 1-888-555-0101')).toBeNull(); // likely a person
    expect(evaluate('x.example', 'Contact Chase Bank at 1-888-555-0101')?.vars.brand).toBe('Chase');
    expect(evaluate('x.example', 'chase support line: 1-888-555-0101')).toBeNull(); // the verb, lowercase
    expect(evaluate('x.example', 'apple support line: 1-888-555-0150')).toBeNull(); // the fruit, lowercase
  });
  it('reads an all-caps claim for those brands when the support phrase is in caps too', () => {
    expect(evaluate('x.example', 'CALL AMAZON CUSTOMER SERVICE TOLL-FREE AT 1-888-555-0123')?.vars.brand).toBe('Amazon');
    expect(evaluate('x.example', 'APPLE SUPPORT: 1-888-555-0150')?.vars.brand).toBe('Apple');
    expect(evaluate('x.example', 'CHASE BANK CUSTOMER SERVICE 1-888-555-0101')?.vars.brand).toBe('Chase');
    // still likely a person, and a caps name before a lowercase noun is no caps heading
    expect(evaluate('x.example', 'CALL CHASE AT 1-888-555-0101')).toBeNull();
    expect(evaluate('x.example', 'APPLE support line: 1-888-555-0150')).toBeNull();
    // every ownership guard still applies
    expect(evaluate('x.example', 'APPLE SUPPORT AND REPAIR — CALL US AT 1-888-555-0150')).toBeNull();
    expect(evaluate('x.example', 'APPLE SUPPORT: 1-800-275-2273 · SAMSUNG SUPPORT: 1-800-555-0164')).toBeNull();
    expect(evaluate('x.example', 'CALL 1-888-555-0123 FOR AMAZON CUSTOMER SERVICE')).toBeNull();
  });
  it('can find mail senders for every phone brand (the webmail exemption joins them by name)', () => {
    const senders = new Set(BRAND_SENDERS.map((b) => b.display));
    expect(CANONICAL_PHONES.map((b) => b.display).filter((d) => !senders.has(d))).toEqual([]);
  });
  it('ignores the product-lifecycle sense of "support"', () => {
    expect(
      evaluate('it-shop.example', 'Microsoft support for Windows 10 ends soon — book an upgrade at 1-866-555-0177'),
    ).toBeNull();
  });
  it('is silent with no brand, with no number, and on missing data', () => {
    expect(evaluate('x.example', 'Customer service: 1-888-555-0150')).toBeNull();
    expect(evaluate('x.example', 'Call Microsoft Support today.')).toBeNull();
    for (const features of [{}, { host: null, bodyExcerpt: null }]) {
      expect(
        phoneNumberImpersonation.evaluate({
          features: features as unknown as PageFeatures,
          redirectChain: [],
          rdap: null,
          dismissedHosts: [],
        }),
      ).toBeNull();
    }
  });
});
