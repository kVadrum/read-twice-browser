import { describe, it, expect } from 'vitest';
import { parseEmailAddress, emailDomain } from './email-address';

describe('parseEmailAddress', () => {
  it('parses a plain address, lowercasing both parts', () => {
    expect(parseEmailAddress('Billing@Examp1e-Pay.EXAMPLE')).toEqual({ local: 'billing', domain: 'examp1e-pay.example' });
  });

  it('takes the LAST bracketed group, so a display name that embeds an address cannot win', () => {
    expect(parseEmailAddress('"PayPal <service@paypal.com>" <billing@scam.example>')?.domain).toBe('scam.example');
    expect(parseEmailAddress('PayPal Billing <billing@scam.example>')?.domain).toBe('scam.example');
  });

  it('splits on the last @, so a quoted local part holding an @ keeps the real domain', () => {
    expect(parseEmailAddress('"service@paypal.com"@scam.example')).toEqual({
      local: '"service@paypal.com"',
      domain: 'scam.example',
    });
  });

  it('tolerates mailto:, surrounding whitespace and a trailing root dot', () => {
    expect(emailDomain('  mailto:info@mailer.netflix.com.  ')).toBe('mailer.netflix.com');
  });

  it('returns IDN domains in punycode, the form host comparisons use', () => {
    // "pаypal.example" with a Cyrillic а (U+0430)
    expect(emailDomain(`x@p${String.fromCodePoint(0x430)}ypal.example`)).toBe('xn--pypal-4ve.example');
  });

  it('rejects anything that is not a mail domain', () => {
    for (const bad of [
      '',
      'no-at-sign.example',
      '@scam.example',
      'user@',
      'user@localhost', // single label
      'user@1.2.3.4', // IPv4, not a domain
      'user@[1.2.3.4]',
      'user@evil.example/paypal.com', // a path would otherwise parse as host evil.example
      'user@evil.example?paypal.com',
      'user@bad domain.example',
      'user@-bad.example',
      'user@double..dot.example',
    ]) {
      expect(parseEmailAddress(bad), bad).toBeNull();
    }
  });
});
