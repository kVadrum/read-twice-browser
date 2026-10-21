import { describe, it, expect } from 'vitest';
import { senderDomainMismatch, replyToMismatch, brandClaimsIn } from './webmail-rules';
import { urlRules } from './url-rules';
import { WEBMAIL_HOSTS } from '../ruleset/lists';
import type { EvaluationContext, PageFeatures, WebmailFeatures } from './rule-types';

function ctx(mail: Partial<WebmailFeatures> | null): EvaluationContext {
  const features: PageFeatures = {
    url: 'https://mail.google.com/mail/u/0/#inbox/FMfcgzExampleToken',
    host: 'mail.google.com',
    bodyExcerpt: '',
    forms: [],
    brandMentions: [],
    phoneNumbers: [],
    linkTargets: [],
    ...(mail && {
      webmail: {
        host: 'mail.google.com',
        displayName: '',
        fromAddress: '',
        replyToAddress: null,
        bodyExcerpt: '',
        ...mail,
      },
    }),
  };
  return { features, redirectChain: [], rdap: null, dismissedHosts: [] };
}

const sender = (displayName: string, fromAddress: string) =>
  senderDomainMismatch.evaluate(ctx({ displayName, fromAddress }));

/** How the banner quotes a display name: inside a bidi isolate (FSI…PDI). */
const isolated = (name: string) => `\u2068${name}\u2069`;

describe('sender-domain-mismatch', () => {
  it('fires yellow on a brand display name from a domain off its sender list', () => {
    expect(senderDomainMismatch.severity).toBe('yellow');
    expect(senderDomainMismatch.elevateWhen).toBeUndefined();
    expect(sender('Bank of America', 'alerts@bofa-secure-services.example')).toEqual({
      vars: { brand: 'Bank of America', displayName: isolated('Bank of America'), fromDomain: 'bofa-secure-services.example' },
    });
  });

  it("passes the brand's own domains, subdomains included, whatever the address's case", () => {
    expect(sender('Bank of America', 'onlinebanking@ealerts.bankofamerica.com')).toBeNull();
    expect(sender('Netflix', 'INFO@MAILER.NETFLIX.COM.')).toBeNull();
    expect(sender('Microsoft account team', 'account-security-noreply@accountprotection.microsoft.com')).toBeNull();
  });

  it('compares whole domain labels, so a lookalike that merely contains the brand domain fires', () => {
    expect(sender('PayPal', 'service@paypal.com.example')?.vars.fromDomain).toBe('paypal.com.example');
    expect(sender('PayPal', 'service@mypaypal.com')?.vars.brand).toBe('PayPal');
  });

  it('catches a display name dressed up as an address', () => {
    expect(sender('service@paypal.com', 'billing@scam.example')?.vars.brand).toBe('PayPal');
  });

  it('sees through lookalike characters and invisible separators', () => {
    const cyrillicA = String.fromCodePoint(0x430);
    expect(sender(`P${cyrillicA}yPal`, 'x@scam.example')?.vars.brand).toBe('PayPal');
    expect(sender('Ｐａｙｐａｌ', 'x@scam.example')?.vars.brand).toBe('PayPal'); // fullwidth
    expect(sender(`Pay${String.fromCodePoint(0x200b)}Pal`, 'x@scam.example')?.vars.brand).toBe('PayPal');
  });

  it('reads the letters a sans-serif UI font draws alike, the way the reader sees them', () => {
    expect(sender('PayPaI', 'billing@paypai-billing.example')?.vars.brand).toBe('PayPal'); // capital I for l
    expect(sender('PayPa1', 'x@scam.example')?.vars.brand).toBe('PayPal'); // digit 1
    expect(sender(`PayPa${String.fromCodePoint(0x406)}`, 'x@scam.example')?.vars.brand).toBe('PayPal'); // Cyrillic І
    expect(sender(`M${String.fromCodePoint(0x131)}crosoft`, 'x@scam.example')?.vars.brand).toBe('Microsoft'); // dotless ı
    const rho = String.fromCodePoint(0x3c1);
    expect(sender(`${String.fromCodePoint(0x3a1)}ay${rho}al`, 'x@scam.example')?.vars.brand).toBe('PayPal'); // Greek Ρ, ρ
    expect(sender(`${String.fromCodePoint(0x51c)}ells Fargo`, 'x@scam.example')?.vars.brand).toBe('Wells Fargo'); // Cyrillic Ԝ
    expect(sender('Amaz0n.com', 'x@scam.example')?.vars.brand).toBe('Amazon'); // digit 0
  });

  it('reads them in any case, so lowercase and all-caps names keep matching', () => {
    expect(sender('irs', 'x@scam.example')?.vars.brand).toBe('IRS');
    expect(sender('IRS', 'x@scam.example')?.vars.brand).toBe('IRS');
    expect(sender('lRS', 'x@scam.example')?.vars.brand).toBe('IRS'); // lowercase l for capital I
    expect(sender('PAYPAL', 'x@scam.example')?.vars.brand).toBe('PayPal');
    expect(sender('MICROSOFT', 'x@scam.example')?.vars.brand).toBe('Microsoft');
  });

  it('never reads a real name into a brand: a lowercase i keeps its dot', () => {
    for (const name of ['Appie', 'Zelie Martin', 'Iris Chen', 'Ali', 'Ally', 'Dr. Turner', "Applebee's"]) {
      expect(brandClaimsIn(name), name).toEqual([]);
    }
    // In all caps the brand's L is a capital L, so a capital I among capitals is just an I.
    for (const name of ['ZELIE MARTIN', 'APPIE', 'PAYPAI']) expect(brandClaimsIn(name), name).toEqual([]);
    // Lookalike capitals stay capitals, so a homoglyph can't make the word mixed-case again.
    const cyrE = String.fromCodePoint(0x415);
    const cyrP = String.fromCodePoint(0x420);
    const cyrA = String.fromCodePoint(0x410);
    const cyrI = String.fromCodePoint(0x406);
    for (const name of [`Z${cyrE}LIE MARTIN`, `${cyrP}${cyrA}Y${cyrP}${cyrA}${cyrI}`]) {
      expect(brandClaimsIn(name), name).toEqual([]);
    }
    expect(brandClaimsIn(`${cyrP}${cyrA}YPAL`).map((c) => c.brand.display)).toEqual(['PayPal']);
  });

  it('quotes the name without the format characters that would scramble the sentence around it', () => {
    const rlo = String.fromCodePoint(0x202e);
    const zwj = String.fromCodePoint(0x200d);
    // An unterminated right-to-left override prints everything after it backwards — the real
    // sender's domain in the same sentence included.
    expect(sender(`PayPal ${rlo}moc.lapyap@ecivres`, 'x@scam.example')?.vars.displayName).toBe(
      isolated('PayPal moc.lapyap@ecivres'),
    );
    // The sender's own PDI can't close our isolate early to let an override out.
    expect(sender(`PayPal${String.fromCodePoint(0x2069)}${rlo} Team`, 'x@scam.example')?.vars.displayName).toBe(
      isolated('PayPal Team'),
    );
    // The joiners emoji and Persian/Indic names need stay.
    expect(sender(`PayPal 👩${zwj}💻`, 'x@scam.example')?.vars.displayName).toBe(isolated(`PayPal 👩${zwj}💻`));
  });

  describe('person-name and everyday-word guard (bare keywords)', () => {
    it('does not read a person named Chase as the bank', () => {
      expect(sender('Chase Miller', 'chase.miller.0142@gmail.com')).toBeNull();
      expect(sender('Miller, Chase', 'cmiller@lawfirm.example')).toBeNull();
      // First name only, from a personal address: a person, not a brand claim.
      expect(sender('Chase', 'chase.m.0142@gmail.com')).toBeNull();
    });

    it('still fires when the bare brand comes from a custom domain or carries brand context', () => {
      expect(sender('Chase', 'alerts@chase-verify.example')?.vars.brand).toBe('Chase');
      expect(sender('Chase Fraud Alerts', 'chase.alerts.0142@gmail.com')?.vars.brand).toBe('Chase');
      expect(sender('Chase.com', 'no-reply@secure-mail.example')?.vars.brand).toBe('Chase');
      expect(sender('The Apple Support Team', 'help@icloud-verify.example')?.vars.brand).toBe('Apple');
    });

    it('ignores the brand word inside other names and words', () => {
      expect(sender("Applebee's", 'offers@applebees.example')).toBeNull();
      expect(sender('Apple Federal Credit Union', 'news@applefcu.example')).toBeNull();
      expect(sender('Pop-Ups Studio', 'hello@popups.example')).toBeNull();
      expect(sender('The UPS Store', 'store1234@theupsstore.example')).toBeNull();
      expect(sender('Amazon Web Services', 'marketing@partner.example')).toBeNull();
      expect(sender('Social Security Disability Advocates', 'intake@ssd-law.example')).toBeNull();
    });

    it("does not read another bank named after a brand as that brand, yet a bank's own banking words still count", () => {
      // Apple Bank for Savings, a New York bank.
      expect(sender('Apple Bank', 'alerts@applebank.com')).toBeNull();
      expect(sender('Apple Bank Alerts', 'alerts@applebank.com')).toBeNull();
      expect(sender('Chase Online Banking', 'no-reply@chase-secure.example')?.vars.brand).toBe('Chase');
      expect(sender('Chase Banking Alerts', 'alerts@chase-verify.example')?.vars.brand).toBe('Chase');
    });

    it('fires on the bare acronym or phrase standing alone', () => {
      expect(sender('UPS', 'tracking@ups-delivery.example')?.vars.brand).toBe('UPS');
      expect(sender('SSA', 'office@ssa-gov.example')?.vars.brand).toBe('Social Security');
      expect(sender('Social Security', 'benefits@ssa-gov.example')?.vars.brand).toBe('Social Security');
    });
  });

  it('treats a venue named after a brand as a venue, not the brand', () => {
    expect(sender('Wells Fargo Center', 'tickets@arena-tickets.example')).toBeNull();
    expect(sender('Chase Field', 'tickets@ballpark.example')).toBeNull();
    expect(sender('Wells Fargo', 'secure@wf-verify.example')?.vars.brand).toBe('Wells Fargo');
  });

  it('honors exact-address entries without opening up their shared domain', () => {
    expect(sender('IRS', 'irs@service.govdelivery.com')).toBeNull();
    expect(sender('IRS', 'refunds@service.govdelivery.com')?.vars.brand).toBe('IRS');
    expect(sender('Cash App', 'support@drivewealth.com')).toBeNull();
    // A real but unenforced sender (DMARC p=none) is still the brand's own: no mismatch.
    expect(sender('Microsoft Store', 'microsoftstore@microsoftstoreemail.com')).toBeNull();
    expect(sender('Cash App', 'payouts@drivewealth.com')?.vars.brand).toBe('Cash App');
  });

  it("passes third parties that legitimately write on a brand's behalf", () => {
    expect(sender('PayPal Credit', 'statements@synchrony.com')).toBeNull();
    expect(sender('Bank of America Shareholder Services', 'id@proxyvote.com')).toBeNull();
  });

  it('passes FedEx Freight mail from its own domain, as the phone rule does its site', () => {
    expect(sender('FedEx Freight', 'noreply@fedexfreight.com')).toBeNull();
    expect(sender('FedEx Freight', 'billing@fedexfreight-invoices.example')?.vars.brand).toBe('FedEx');
  });

  it('flags Zelle only from free webmail or a Zelle-dressed domain (banks send Zelle notices)', () => {
    expect(sender('Zelle', 'alerts@chase.com')).toBeNull();
    expect(sender('Zelle', 'notify@community-bank.example')).toBeNull();
    expect(sender('Zelle', 'zelle.payments.0142@gmail.com')?.vars.brand).toBe('Zelle');
    expect(sender('Zelle Support', 'help@zelle-refunds.example')?.vars.brand).toBe('Zelle');
  });

  it('bounds an overlong display name before it reaches the banner', () => {
    const long = `PayPal ${'x'.repeat(200)}`;
    expect(sender(long, 'x@scam.example')?.vars.displayName).toBe(isolated(`${long.slice(0, 79)}…`));
  });

  it('abstains without webmail features, without a parseable From, or without a brand', () => {
    expect(senderDomainMismatch.evaluate(ctx(null))).toBeNull();
    expect(sender('PayPal', '')).toBeNull(); // Outlook hides internal senders' addresses
    expect(sender('PayPal', 'not an address')).toBeNull();
    expect(sender('Pat Example', 'pat@scam.example')).toBeNull();
    expect(sender('', 'pat@scam.example')).toBeNull();
  });
});

describe('brandClaimsIn', () => {
  it('reports a bare keyword with no context word as alone', () => {
    expect(brandClaimsIn('Chase')).toMatchObject([{ alone: true, brand: { display: 'Chase' } }]);
    expect(brandClaimsIn('The Chase')).toMatchObject([{ alone: true }]);
    expect(brandClaimsIn('Chase Bank')).toMatchObject([{ alone: false }]);
    expect(brandClaimsIn('Chase Alerts')).toMatchObject([{ alone: false }]);
  });

  it('collects every brand a name claims, so mail from any one of them passes', () => {
    expect(brandClaimsIn('Amazon Pay | PayPal').map((c) => c.brand.display)).toEqual(['PayPal', 'Amazon']);
    expect(sender('Amazon Pay | PayPal', 'no-reply@amazonpay.com')).toBeNull();
    expect(sender('Amazon Pay | PayPal', 'service@paypal.com')).toBeNull();
    expect(sender('Amazon Pay | PayPal', 'x@scam.example')?.vars.brand).toBe('PayPal');
  });

  it("does not let a platform address that carries its customer's chosen name vouch for another brand", () => {
    // Microsoft Entra B2B: "Microsoft Invitations on behalf of <tenant name>", and the tenant
    // name is whatever its creator typed.
    expect(sender('Microsoft Invitations on behalf of PayPal Billing', 'invites@microsoft.com')).toEqual({
      vars: {
        brand: 'PayPal',
        displayName: isolated('Microsoft Invitations on behalf of PayPal Billing'),
        fromDomain: 'microsoft.com',
      },
    });
    // A real invitation names no other brand: that is Microsoft writing as itself.
    expect(sender('Microsoft Invitations on behalf of Contoso', 'invites@microsoft.com')).toBeNull();
  });
});

describe('webmail hosts', () => {
  // Webmail mode re-evaluates on every opened email, so a URL rule firing on the client's own
  // host would be a banner on every email. outlook.cloud.microsoft carries the "microsoft"
  // brand token and used to read as Microsoft impersonation (red).
  it('are never themselves flagged by a URL rule', () => {
    for (const { host } of WEBMAIL_HOSTS) {
      const c = ctx(null);
      c.features.host = host;
      for (const rule of urlRules) expect(rule.evaluate(c), `${rule.id} on ${host}`).toBeNull();
    }
  });
});

const reply = (fromAddress: string, replyToAddress: string | null) =>
  replyToMismatch.evaluate(ctx({ displayName: 'Jordan Sample', fromAddress, replyToAddress }));

describe('reply-to-mismatch', () => {
  it('fires yellow when a free-webmail From replies to a different provider or an unrelated domain', () => {
    expect(replyToMismatch.severity).toBe('yellow');
    expect(replyToMismatch.elevateWhen).toBeUndefined();
    expect(reply('jordan.sample.0142@gmail.com', 'jordan.sample.desk.0142@outlook.com')).toEqual({ vars: {} });
    expect(reply('jordan.sample.0142@gmail.com', 'payments@invoice-desk.example')).toEqual({ vars: {} });
    expect(reply('jordan.sample.0142@gmail.com', 'Jordan <jordan.desk.0142@yahoo.com>')).toEqual({ vars: {} });
  });

  it('does not fire on the same domain, or within one provider family', () => {
    expect(reply('jordan.sample.0142@gmail.com', 'jordan.other.0142@gmail.com')).toBeNull();
    expect(reply('jordan.sample.0142@gmail.com', 'jordan.sample.0142@googlemail.com')).toBeNull();
    expect(reply('jordan.sample.0142@hotmail.com', 'jordan.sample.0142@outlook.com')).toBeNull();
    expect(reply('jordan.sample.0142@sbcglobal.net', 'jordan.sample.0142@att.net')).toBeNull();
    // Roadrunner's regional subdomains share a registrable domain.
    expect(reply('jordan.0142@nc.rr.com', 'jordan.0142@twcny.rr.com')).toBeNull();
  });

  it('does not fire on a mailing list answering for a free-webmail poster', () => {
    expect(reply('jordan.sample.0142@gmail.com', 'neighborhood-watch@googlegroups.com')).toBeNull();
    expect(reply('jordan.sample.0142@gmail.com', 'main@garden-club.groups.io')).toBeNull();
  });

  it('only fires for a free-webmail From — a lookalike of one is not free webmail', () => {
    expect(reply('billing@paypal.com', 'support@helpdesk.example')).toBeNull();
    expect(reply('jordan@gmail.com.example', 'jordan.0142@yahoo.com')).toBeNull();
    // ...but a lookalike Reply-To is just another unrelated domain.
    expect(reply('jordan.sample.0142@gmail.com', 'jordan.sample@gmail.com.example')).toEqual({ vars: {} });
  });

  it('abstains when the Reply-To is absent or unparseable', () => {
    expect(reply('jordan.sample.0142@gmail.com', null)).toBeNull();
    expect(reply('jordan.sample.0142@gmail.com', '')).toBeNull();
    expect(reply('jordan.sample.0142@gmail.com', 'not-an-address')).toBeNull();
    expect(reply('', 'jordan.0142@yahoo.com')).toBeNull();
    expect(replyToMismatch.evaluate(ctx(null))).toBeNull();
  });
});
