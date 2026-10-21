import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { findPhoneNumbers } from './phone';
import { extractPageFeatures } from '../../content/extract';
import { techSupportImpersonation } from './content-rules';

const digitsIn = (text: string) => findPhoneNumbers(text).map((m) => m.digits);

describe('findPhoneNumbers', () => {
  it.each([
    '(800) 275-2273',
    '(800)275-2273',
    '800.275.2273',
    '800-275-2273',
    '800 275 2273',
    '+1 800 275 2273',
    '+1 (800) 275-2273',
    '1-800-275-2273',
    '1.800.275.2273',
    '+18002752273',
    '1–800–275–2273', // en dashes, as some brand pages print them
    '1\u2212800\u2212275\u22122273', // minus signs typed for dashes
    '800\u00a0275\u00a02273', // no-break spaces
    '1\u2009800\u2009275\u20092273', // thin spaces
    '1\u202f800\u202f275\u202f2273', // narrow no-break spaces
  ])('matches the US/CA display form %s and normalizes it to 10 digits', (form) => {
    expect(digitsIn(`Call ${form} today.`)).toEqual(['8002752273']);
  });

  it('reads an en or em dash touching the number as punctuation, not as a digit joiner', () => {
    expect(digitsIn('Call 1-888-555-0142\u201424/7')).toEqual(['8885550142']);
    expect(digitsIn('Call 1-888-555-0142\u201324 hours')).toEqual(['8885550142']);
    expect(digitsIn('Open 24/7\u20141-888-555-0142')).toEqual(['8885550142']);
    // Hyphens still join: U+2010/U+2011 are hyphens, not dashes.
    expect(digitsIn('Order 112\u20108002752273\u201077')).toEqual([]);
    expect(digitsIn('Order 112\u20118002752273\u201177')).toEqual([]);
  });

  it("keeps tech-support-impersonation's phone gate on a number an em dash touches", () => {
    // The rule fires only when the page shows a number to call (content-rules.ts), and
    // that list comes from this matcher via the content script's extraction.
    const { window } = new JSDOM(
      '<body><h1>Microsoft Support</h1><p>Your PC is infected. Call 1-888-555-0142\u201424/7</p></body>',
      { url: 'https://pc-alert.example/' },
    );
    Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
      configurable: true,
      get(this: HTMLElement) {
        return this.textContent;
      },
    });
    const features = extractPageFeatures(window.document as unknown as Document);
    expect(features.phoneNumbers).toEqual(['1-888-555-0142']);
    const ctx = { features, redirectChain: [], rdap: null, dismissedHosts: [] };
    expect(techSupportImpersonation.evaluate(ctx)).toEqual({ vars: { brand: 'Microsoft' } });
  });

  it('reports each match with its offsets and the text as displayed', () => {
    const text = 'Support: 1-888-555-0142, or (503) 555-0123.';
    expect(findPhoneNumbers(text)).toEqual([
      { index: 9, end: 23, raw: '1-888-555-0142', digits: '8885550142' },
      { index: 28, end: 42, raw: '(503) 555-0123', digits: '5035550123' },
    ]);
  });

  it('rejects a 10-digit run inside a longer number (12+ digits, order and tracking numbers)', () => {
    expect(digitsIn('Ref 800275227312')).toEqual([]); // 12 digits, no separators
    expect(digitsIn('Order 112-8002752273-77')).toEqual([]); // digit-joined on both sides
    expect(digitsIn('Order #114-3456789-2752273')).toEqual([]); // Amazon-style 3-7-7 order id
    expect(digitsIn('Tracking 9400 1000 0000 0000 0000 00')).toEqual([]);
    expect(digitsIn('Card 4111.2752.2273.1111')).toEqual([]);
  });

  it('rejects numbers that are not valid NANP (area code or exchange starting 0/1)', () => {
    expect(digitsIn('Call 100-275-2273')).toEqual([]); // area code starts 1
    expect(digitsIn('Call 800-075-2273')).toEqual([]); // exchange starts 0
    expect(digitsIn('Call (555) 010-0123')).toEqual([]); // exchange starts 0
  });

  it('does not read dates or times as phone numbers', () => {
    expect(digitsIn('Posted 2026-10-21 at 10:45, updated 2026.10.22')).toEqual([]);
    expect(digitsIn('Hours: 9-5, Mon-Fri, since 1998')).toEqual([]);
  });

  it('rejects a number carrying another country code', () => {
    expect(digitsIn('UK: +44 800 275 2273')).toEqual([]);
  });

  it('never joins digit groups across a line break or a table cell', () => {
    expect(digitsIn('Room 800\n275 2273')).toEqual([]);
    expect(digitsIn('800\t275\t2273')).toEqual([]);
  });

  it('keeps space-separated neighbours apart (a phone table row)', () => {
    expect(digitsIn('+1 855 270 0615 800 865 9408')).toEqual(['8552700615', '8008659408']);
  });

  it('returns nothing for gibberish or empty text', () => {
    expect(findPhoneNumbers('')).toEqual([]);
    expect(digitsIn('Call 1-800-FLOWERS or 555-0123')).toEqual([]); // vanity / 7-digit
  });
});
