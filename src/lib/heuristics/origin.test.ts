import { describe, it, expect } from 'vitest';
import { contentIsFrom, mailIsFrom, sendsAs } from './origin';
import { parseEmailAddress } from './email-address';
import { isOnDomain } from './match';
import { scamLanguagePressure, techSupportImpersonation, governmentImpersonation } from './content-rules';
import { phoneNumberImpersonation } from './page-rules';
import { evaluatePage } from './engine';
import { loadRuleset } from '../ruleset/loader';
import {
  WEBMAIL_HOSTS,
  FREE_WEBMAIL_DOMAINS,
  NEWS_DOMAINS_ALLOW,
  NEWS_SENDERS_ALLOW,
  TAX_PREP_SENDERS,
  GOVERNMENT_AGENCIES,
  TECH_SUPPORT_BRANDS,
  BRAND_SENDERS,
} from '../ruleset/lists';
import type { EvaluationContext, PageFeatures } from './rule-types';

// In webmail mode the content rules judge one email while the page host is the mail client.
// Their allow-lists must follow the email's sender, or each one is dead there: a fraud-watch
// newsletter or a real agency notice would draw a red its own website never gets.

function mailCtx(
  fromAddress: string,
  bodyExcerpt: string,
  over: Partial<PageFeatures> = {},
  host = 'mail.google.com',
): EvaluationContext {
  const features: PageFeatures = {
    url: `https://${host}/mail/`,
    host,
    bodyExcerpt,
    forms: [],
    brandMentions: [],
    phoneNumbers: [],
    linkTargets: [],
    webmail: { host, displayName: 'Sender', fromAddress, replyToAddress: null, bodyExcerpt },
    ...over,
  };
  return { features, redirectChain: [], rdap: null, dismissedHosts: [] };
}

describe('contentIsFrom', () => {
  it('reads the host list on a website and the sender list in webmail mode — never the other', () => {
    const site = mailCtx('x@y.example', '', { host: 'www.nytimes.com', webmail: undefined }).features;
    expect(contentIsFrom(site, ['nytimes.com'], [])).toBe(true);
    expect(contentIsFrom(site, [], ['nytimes.com'])).toBe(false);

    const mail = mailCtx('AP Newsletters <newsletters@apnews.com>', '').features;
    expect(contentIsFrom(mail, [], ['apnews.com'])).toBe(true);
    // A website domain is not a sender unless its sender list says so: canada.ca is the CRA's
    // real website, but its DMARC is p=none, so anyone can put it in a From header.
    expect(contentIsFrom(mail, ['apnews.com'], [])).toBe(false);
    const spoof = mailCtx('notification@canada.ca', '').features;
    expect(contentIsFrom(spoof, ['canada.ca', 'cra-arc.gc.ca'], ['cra-arc.gc.ca'])).toBe(false);
    expect(contentIsFrom(mailCtx('notification@cra-arc.gc.ca', '').features, ['canada.ca'], ['cra-arc.gc.ca'])).toBe(true);
  });

  it('never counts the mail client: in webmail mode the sender alone is the origin', () => {
    // outlook.live.com sits on live.com and outlook.office.com on office.com, both on
    // Microsoft's web list — every email read there would count as Microsoft's own.
    const live = mailCtx('billing@ms365-renewals.example', '', {}, 'outlook.live.com').features;
    expect(contentIsFrom(live, ['live.com'], [])).toBe(false);
    const office = mailCtx('billing@ms365-renewals.example', '', {}, 'outlook.office.com').features;
    expect(contentIsFrom(office, ['office.com'], ['microsoft.com'])).toBe(false);
  });

  it('never treats an unparseable or lookalike sender as on the domain', () => {
    expect(contentIsFrom(mailCtx('', '').features, [], ['@aarp.org'])).toBe(false);
    expect(contentIsFrom(mailCtx('alerts@aarp.org.example', '').features, [], ['@aarp.org'])).toBe(false);
  });

  it("never counts a host serving pages anyone writes, though it is on the entity's domain", () => {
    const page = 'Microsoft Support\nYour Windows license has expired. Call Microsoft Support at 1-888-555-0142 now.';
    for (const host of ['sway.cloud.microsoft', 'forms.cloud.microsoft', 'loop.cloud.microsoft', 'forms.office.com']) {
      const site = mailCtx('', page, { host, webmail: undefined, phoneNumbers: ['1-888-555-0142'] });
      expect(contentIsFrom(site.features, ['microsoft', 'office.com'], []), host).toBe(false);
      expect(techSupportImpersonation.evaluate(site)?.vars.brand, host).toBe('Microsoft');
      expect(phoneNumberImpersonation.evaluate(site)?.vars.brand, host).toBe('Microsoft');
      // …but not red: organisations publish their own IT notices there too (engine cap).
      expect(evaluatePage(loadRuleset(), site).severity, host).toBe('yellow');
    }
    // Microsoft's own pages on the same TLD stay Microsoft's.
    const admin = mailCtx('', page, { host: 'admin.cloud.microsoft', webmail: undefined, phoneNumbers: ['1-888-555-0142'] });
    expect(techSupportImpersonation.evaluate(admin)).toBeNull();
    expect(phoneNumberImpersonation.evaluate(admin)).toBeNull();
  });
});

describe('sendsAs', () => {
  const from = (raw: string) => parseEmailAddress(raw)!;

  it('matches a bare domain with its subdomains, "@domain" exactly, and "local@domain" as one address', () => {
    expect(sendsAs(from('alerts@email.irs.gov'), 'irs.gov')).toBe(true);
    // aarp.org enforces DMARC on its apex only (sp=none): a subdomain From proves nothing.
    expect(sendsAs(from('fraudwatch@aarp.org'), '@aarp.org')).toBe(true);
    expect(sendsAs(from('Renewals <renewals@members.aarp.org>'), '@aarp.org')).toBe(false);
    expect(sendsAs(from('IRS <IRS@service.govdelivery.com>'), 'irs@service.govdelivery.com')).toBe(true);
    expect(sendsAs(from('tips@service.govdelivery.com'), 'irs@service.govdelivery.com')).toBe(false);
  });
});

describe('sender paths (lists.ts)', () => {
  const senderLists: [string, readonly string[]][] = [
    ['NEWS_SENDERS_ALLOW', NEWS_SENDERS_ALLOW],
    ['TAX_PREP_SENDERS', TAX_PREP_SENDERS],
    ...GOVERNMENT_AGENCIES.map((a): [string, readonly string[]] => [`agency ${a.display}`, a.senders]),
    ...TECH_SUPPORT_BRANDS.map((b): [string, readonly string[]] => [`tech ${b.display}`, b.senders]),
    ...BRAND_SENDERS.map((b): [string, readonly string[]] => [`mail ${b.display}`, b.senders]),
  ];
  const domainOf = (entry: string) => entry.slice(entry.lastIndexOf('@') + 1);

  it('never holds a domain where anyone can get a mailbox (mailIsFrom has no free-webmail check)', () => {
    // Unenforced senders too: they silence sender-domain-mismatch (webmail-rules mailsAs).
    const unenforced = BRAND_SENDERS.map((b): [string, readonly string[]] => [
      `mail ${b.display} (unenforced)`,
      b.unenforcedSenders ?? [],
    ]);
    for (const [name, senders] of [...senderLists, ...unenforced]) {
      for (const entry of senders) {
        const open = FREE_WEBMAIL_DOMAINS.find((fw) => isOnDomain(fw, domainOf(entry)));
        expect(open, `${name}: ${entry}`).toBeUndefined();
      }
    }
  });

  it('keeps the domains whose DMARC does not enforce at the level matched off the sender paths', () => {
    // Measured 2026-10-21 (dig TXT _dmarc.<domain>): canada.ca p=none, krebsonsecurity.com no
    // record, aarp.org and gov.uk sp=none. Each stays a HOST — the agencies' and publishers'
    // real websites — but a bare-domain sender entry would let any From on them silence a rule.
    const weak = ['canada.ca', 'krebsonsecurity.com', 'aarp.org', 'gov.uk'];
    // A brand's unenforced senders (lists.ts BrandSender) are p=none with no sp, so their
    // subdomains are as weak as they are ("news.microsoftstoreemail.com").
    const unenforced = BRAND_SENDERS.flatMap((b) => b.unenforcedSenders ?? []);
    expect(unenforced).toEqual(expect.arrayContaining(['microsoftstoreemail.com', 'irs@service.govdelivery.com']));
    const underUnenforced = (entry: string) =>
      unenforced.find((w) => entry === w || (!w.includes('@') && isOnDomain(domainOf(entry), w)));
    for (const [name, senders] of senderLists) {
      for (const entry of senders) {
        expect(weak, `${name}: ${entry}`).not.toContain(entry);
        expect(underUnenforced(entry), `${name}: ${entry}`).toBeUndefined();
      }
    }
    expect(NEWS_DOMAINS_ALLOW).toEqual(expect.arrayContaining(['krebsonsecurity.com', 'aarp.org']));
    expect(GOVERNMENT_AGENCIES.find((a) => a.display === 'CRA')?.canonical).toContain('canada.ca');
    expect(GOVERNMENT_AGENCIES.find((a) => a.display === 'HMRC')?.canonical).toContain('gov.uk');
  });
});

describe('mailIsFrom', () => {
  it('matches a sender domain (a subdomain counts) or one exact address, and only in webmail mode', () => {
    const senders = ['upsemail.com', 'irs@service.govdelivery.com'];
    expect(mailIsFrom(mailCtx('mcinfo@ups.upsemail.com', '').features, senders)).toBe(true);
    expect(mailIsFrom(mailCtx('IRS <IRS@service.govdelivery.com>', '').features, senders)).toBe(true);
    expect(mailIsFrom(mailCtx('ssa@service.govdelivery.com', '').features, senders)).toBe(false);
    expect(mailIsFrom(mailCtx('x@upsemail.com.example', '').features, senders)).toBe(false);
    const site = mailCtx('', '', { host: 'www.ups.com', webmail: undefined }).features;
    expect(mailIsFrom(site, senders)).toBe(false);
  });
});

describe('phone-number-impersonation in webmail mode', () => {
  const phones = (body: string, from: string, host?: string) =>
    phoneNumberImpersonation.evaluate(mailCtx(from, body, {}, host));

  it("exempts the brand's own email listing a line we don't carry, never a free mailbox", () => {
    const body = 'Questions? Contact Bank of America customer service at 1.866.555.0142 any time.';
    expect(phones(body, 'Bank of America <onlinebanking@ealerts.bankofamerica.com>')).toBeNull();
    expect(phones(body, 'bofa.alerts.0142@gmail.com')).toEqual({
      vars: { brand: 'Bank of America', canonical: '800.432.1000' },
    });
    // Only the claimed brand's own sender: Chase mail quoting a fake Amazon line is judged.
    const amazon = 'Call Amazon customer service at 1-888-555-0123 about your order.';
    expect(phones(amazon, 'no.reply.alerts@chase.com')?.vars.brand).toBe('Amazon');
  });

  it("exempts a brand's mail senders that are not its web domains (BRAND_SENDERS)", () => {
    // The IRS's real bulletin address is p=none: anyone can forge it, so it never exempts.
    const irs = 'Questions about your notice? Call the IRS at 1-800-555-0184.';
    for (const from of ['irs@service.govdelivery.com', 'tips@service.govdelivery.com']) {
      expect(phones(irs, from), from).toEqual({ vars: { brand: 'IRS', canonical: '800-829-1040' } });
    }
    const store = 'Questions about your order? Call Microsoft Support at 1-888-555-0142.';
    expect(phones(store, 'orders@microsoftstoreemail.com')?.vars.brand).toBe('Microsoft');
    expect(phones('Contact UPS Customer Service at 1-800-555-0119.', 'mcinfo@ups.upsemail.com')).toBeNull();
    expect(phones('Contact UPS Customer Service at 1-800-555-0119.', 'parcel.desk.0142@gmail.com')?.vars.brand).toBe('UPS');
    // fedexfreight.com is exempt as a site (CANONICAL_PHONES), so its mail is too.
    const freight = 'Questions about your pickup? Contact FedEx Freight customer service at 1-866-555-0142.';
    expect(phones(freight, 'noreply@fedexfreight.com')).toBeNull();
    expect(phones(freight, 'freight.desk.0142@gmail.com')?.vars.brand).toBe('FedEx');
  });

  it("exempts a news sender's newsletter quoting a scam number", () => {
    const body =
      'The caller said he was with Amazon customer service and asked the resident to call back on 1-888-555-0177.';
    expect(phones(body, 'AP Newsletters <newsletters@apnews.com>')).toBeNull();
    expect(phones(body, 'neighbourhood.watch.0142@gmail.com')?.vars.brand).toBe('Amazon');
    // The same split as the content rules: no DMARC record, so not a sender — still a host.
    expect(phones(body, 'brian@krebsonsecurity.com')?.vars.brand).toBe('Amazon');
    const site = mailCtx('', body, { host: 'krebsonsecurity.com', webmail: undefined });
    expect(phoneNumberImpersonation.evaluate(site)).toBeNull();
  });

  it('gives a Microsoft or Apple claim from a free mailbox the red, whatever the mailbox', () => {
    const ms =
      'Your Microsoft 365 subscription has renewed for $399.99.\nIf you did not authorize this charge, call Microsoft 365 customer support at 1-888-555-0142 within 24 hours.';
    expect(phones(ms, 'ms365.billing.0142@outlook.com')?.vars.brand).toBe('Microsoft');
    expect(phones(ms, 'ms365.billing.0142@live.com')?.vars.brand).toBe('Microsoft');
    expect(phones('Apple Support: 1-888-555-0150', 'apple.help.0142@icloud.com')?.vars.brand).toBe('Apple');
  });

  it('reaches the same verdict on every mail client host', () => {
    const scam =
      'Your Microsoft 365 subscription has renewed for $399.99.\nIf you did not authorize this charge, call Microsoft 365 customer support at 1-888-555-0142 within 24 hours.';
    const real = 'Questions about your subscription? Contact Microsoft Store Sales and Support at 1-877-555-0196.';
    expect(phones(real, 'store.help.0142@gmail.com')?.vars.brand).toBe('Microsoft'); // the claim is live
    for (const { host } of WEBMAIL_HOSTS) {
      expect(phones(scam, 'billing@ms365-renewals.example', host), host).toEqual({
        vars: { brand: 'Microsoft', canonical: '800 642 7676' },
      });
      expect(phones(real, 'microsoftstore@microsoft.com', host), host).toBeNull();
      expect(phones(real, 'account-security-noreply@accountprotection.microsoft.com', host), host).toBeNull();
      // Same-organisation mail, whose From OWA hides: the desk named after the verb owns the line.
      expect(phones('Office 365 support: call the IT Service Desk at 1-866-555-0100.', '', host), host).toBeNull();
    }
  });
});

describe('content rules in webmail mode', () => {
  // Pressure used AT the reader: a scam report or anti-fraud advice is exempt on its own
  // (content-rules.test), so these isolate the sender exemption.
  const pressureText = 'Settle the balance today with gift cards only, and do not tell anyone at your bank.';

  it('scam-language-pressure: a news/fraud-watch sender is exempt; any other sender is not', () => {
    expect(scamLanguagePressure.evaluate(mailCtx('alerts@email.aarp.org', pressureText))).toBeNull();
    expect(scamLanguagePressure.evaluate(mailCtx('jordan.sample.0142@gmail.com', pressureText))).not.toBeNull();
  });

  it('scam-language-pressure: a sender exempts only where its DMARC enforces (aarp.org: the apex alone)', () => {
    expect(scamLanguagePressure.evaluate(mailCtx('AARP <fraudwatch@aarp.org>', pressureText))).toBeNull();
    // aarp.org is sp=none, so any subdomain From is spoofable; krebsonsecurity.com has no DMARC
    // record at all. Both stay exempt as websites.
    expect(scamLanguagePressure.evaluate(mailCtx('renewals@members.aarp.org', pressureText))).not.toBeNull();
    expect(scamLanguagePressure.evaluate(mailCtx('brian@krebsonsecurity.com', pressureText))).not.toBeNull();
    const site = (host: string) => mailCtx('', pressureText, { host, webmail: undefined });
    expect(scamLanguagePressure.evaluate(site('www.aarp.org'))).toBeNull();
    expect(scamLanguagePressure.evaluate(site('krebsonsecurity.com'))).toBeNull();
  });

  it("tech-support-impersonation: the brand's own sender is exempt; a free-webmail sender is not", () => {
    const body = 'Apple Support\nYour order receipt. Questions? Call 555-0142.';
    const phones = { phoneNumbers: ['555-0142'] };
    expect(techSupportImpersonation.evaluate(mailCtx('no_reply@email.apple.com', body, phones))).toBeNull();
    expect(techSupportImpersonation.evaluate(mailCtx('apple.help.0142@gmail.com', body, phones))).toEqual({
      vars: { brand: 'Apple' },
    });
  });

  it("government-impersonation: the agency's own sender and tax-prep senders are exempt", () => {
    const body = 'Your IRS balance is ready. Click here to pay.';
    expect(governmentImpersonation.evaluate(mailCtx('updates@irs.gov', body))).toBeNull();
    expect(governmentImpersonation.evaluate(mailCtx('reminders@email.turbotax.com', body))).toBeNull();
    expect(governmentImpersonation.evaluate(mailCtx('irs.refund.0142@gmail.com', body))).toEqual({
      vars: { agency: 'IRS', canonical: 'irs.gov' },
    });
  });

  it("government-impersonation: an agency's website exempts as a host, its mail only from an enforcing sender", () => {
    const cra = 'Canada Revenue Agency: your account shows an unpaid balance. Pay now to avoid penalties.';
    // canada.ca is p=none: a spoofed From on it proves nothing, while cra-arc.gc.ca is p=reject.
    expect(governmentImpersonation.evaluate(mailCtx('notification@canada.ca', cra))?.vars.agency).toBe('CRA');
    expect(governmentImpersonation.evaluate(mailCtx('notification@cra-arc.gc.ca', cra))).toBeNull();
    // ...and canada.ca is still the CRA's real website: its payment page draws nothing.
    const craSite = mailCtx('', cra, { host: 'www.canada.ca', webmail: undefined });
    expect(governmentImpersonation.evaluate(craSite)).toBeNull();

    const hmrc = 'HMRC: you have an outstanding tax balance. Make a payment today.';
    // gov.uk is sp=none, so only HMRC's own hmrc.gov.uk (p=reject) exempts as a sender.
    expect(governmentImpersonation.evaluate(mailCtx('refunds@taxrefund.gov.uk', hmrc))?.vars.agency).toBe('HMRC');
    expect(governmentImpersonation.evaluate(mailCtx('noreply@notifications.hmrc.gov.uk', hmrc))).toBeNull();
    const hmrcSite = mailCtx('', hmrc, { host: 'www.gov.uk', webmail: undefined });
    expect(governmentImpersonation.evaluate(hmrcSite)).toBeNull();
  });
});
