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

  const mail = (fromAddress: string, bodyExcerpt: string): EvaluationContext => {
    const c = ctx('mail.google.com', bodyExcerpt);
    c.features.webmail = { host: 'mail.google.com', displayName: 'Sender', fromAddress, replyToAddress: null, bodyExcerpt };
    return c;
  };

  it('is quiet on anti-fraud advice: a "never ask you to" cue before the phrase in its sentence', () => {
    // A credit union's security page, and a bank's email footer.
    const page = 'Protect your account. We will never ask you to pay with gift cards or move money to a new account.';
    expect(scamLanguagePressure.evaluate(ctx('riverbend-cu.example', page))).toBeNull();
    const footer =
      'Chase will never ask you to pay with gift cards, wire money to yourself, or share a one-time code.';
    expect(scamLanguagePressure.evaluate(mail('no.reply.alerts@chase.com', footer))).toBeNull();
    for (const advice of [
      "We won't ever ask you to pay with gift cards.",
      'Your bank never asks customers to pay with gift cards.',
      'The IRS will never call you and demand payment with gift cards only.',
    ]) {
      expect(scamLanguagePressure.evaluate(ctx('x.example', advice)), advice).toBeNull();
    }
  });

  it('is quiet on a scam report: the sentence names a scam or quotes the person who said it', () => {
    const family =
      "Mom — that call you got was a scam. The man said 'do not tell anyone' and wanted gift cards only.";
    expect(scamLanguagePressure.evaluate(mail('sam.rivera.0142@gmail.com', family))).toBeNull();
    expect(scamLanguagePressure.evaluate(ctx('neighbors.example', 'Scammers told my aunt to pay with gift cards.'))).toBeNull();
    expect(scamLanguagePressure.evaluate(ctx('neighbors.example', 'They told you: do not hang up.'))).toBeNull();
  });

  it('keeps the guard sentence-local: one advice line never exempts pressure elsewhere', () => {
    const scam =
      'We will never ask you to share your password. To keep your account open, pay with gift cards only.';
    expect(scamLanguagePressure.evaluate(ctx('billing-desk.example', scam))).toEqual({
      vars: { matchedPhrase: 'gift cards only' },
    });
    const report = 'Read our scam guide. Stay on the line and do not hang up.';
    expect(scamLanguagePressure.evaluate(ctx('billing-desk.example', report))?.vars.matchedPhrase).toBe('do not hang up');
    // Same in an email: the advice guards only its own sentence.
    expect(scamLanguagePressure.evaluate(mail('desk.0142@gmail.com', scam))).not.toBeNull();
  });

  it('does not take a bare "never" or "this is not a scam" as advice or a report', () => {
    for (const pressure of [
      'You will never see your money again unless you pay with gift cards.',
      'This is not a scam, so do not hang up.',
      "This isn't a scam, so do not hang up.",
      'This is no scam, do not hang up or your account will be closed.',
      'Never call your bank about this and do not tell anyone.',
    ]) {
      expect(scamLanguagePressure.evaluate(ctx('x.example', pressure)), pressure).not.toBeNull();
    }
  });

  it('trades recall for precision: a scam sentence that names scammers is exempt too', () => {
    // Narrower report frames were tried and drew reds on real fraud-awareness pages (ADR-005).
    const cost = 'To protect your savings from scammers, do not tell anyone about this call.';
    expect(scamLanguagePressure.evaluate(ctx('x.example', cost))).toBeNull();
  });

  it('reads "do not tell anyone this code" as a one-time-code notice', () => {
    const otp = 'Your Wells Fargo verification code is 482913. Do not tell anyone this code.';
    expect(scamLanguagePressure.evaluate(ctx('www.wellsfargo.com', otp))).toBeNull();
    for (const notice of ['Do not tell anyone this OTP.', 'Do not tell anyone your security code, not even us.']) {
      expect(scamLanguagePressure.evaluate(ctx('x.example', notice)), notice).toBeNull();
    }
    // Only when the code ends the sentence: anything after it is a script.
    for (const script of [
      'Do not tell anyone about this call.',
      'A representative will call you. Do not tell anyone the code except the representative.',
      'Buy the cards, then do not tell anyone the PIN except our agent.',
      'Do not tell anyone your PIN has been compromised; call 1-888-555-0142 now.',
      'Do not tell anyone this code is being reviewed by the fraud department.',
    ]) {
      expect(scamLanguagePressure.evaluate(ctx('x.example', script)), script).not.toBeNull();
    }
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
    // USPS's other domains — the Postal Inspection Service's site quotes the fee scam it fights.
    const uspis = 'Texts claiming USPS needs you to pay the fee for redelivery are a scam.';
    expect(governmentImpersonation.evaluate(ctx('www.uspis.gov', uspis))).toBeNull();
    expect(governmentImpersonation.evaluate(ctx('usps-redelivery.example', uspis))?.vars.agency).toBe('USPS');
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
    // `.microsoft` is Microsoft's closed brand TLD (as in tld-impersonation).
    expect(
      techSupportImpersonation.evaluate(ctx('admin.cloud.microsoft', 'Microsoft Support', { phoneNumbers: ['1-800-555-0199'] })),
    ).toBeNull();
    expect(techSupportImpersonation.evaluate(ctx('x.top', 'Apple Support', { phoneNumbers: [] }))).toBeNull();
  });
  it('does not fire when the brand claim is deep in the page, not the headline area', () => {
    const deep = 'x'.repeat(2000) + ' Microsoft Support call now';
    expect(techSupportImpersonation.evaluate(ctx('x.top', deep, { phoneNumbers: ['1-800-555-0199'] }))).toBeNull();
  });
});
