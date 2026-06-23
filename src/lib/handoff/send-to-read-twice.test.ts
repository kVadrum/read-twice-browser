import { describe, it, expect } from 'vitest';
import {
  buildHandoffPayload,
  encodePayload,
  decodePayload,
  buildHandoffUrl,
  HANDOFF_EXCERPT_LIMIT,
  HANDOFF_URL_LIMIT,
} from './send-to-read-twice';

const TS = '2026-06-23T12:00:00Z';

describe('send-to-read-twice payload', () => {
  it('round-trips through base64url, preserving unicode', () => {
    const payload = buildHandoffPayload({
      url: 'https://irs-tax-payment.top/pay',
      rulesFired: ['government-impersonation', 'scam-language-urgent'],
      excerpt: 'Pay within 24 hours — café résumé 你好 🚨',
      timestamp: TS,
    });
    expect(decodePayload(encodePayload(payload))).toEqual(payload);
  });

  it('produces url-safe encoding (no +, /, or = padding)', () => {
    const encoded = encodePayload(
      buildHandoffPayload({ url: 'https://a.example/???', rulesFired: ['x'], excerpt: 'y', timestamp: TS }),
    );
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('caps the excerpt at the limit', () => {
    const payload = buildHandoffPayload({
      url: 'https://a.example',
      rulesFired: [],
      excerpt: 'z'.repeat(HANDOFF_EXCERPT_LIMIT + 500),
      timestamp: TS,
    });
    expect(payload.excerpt.length).toBe(HANDOFF_EXCERPT_LIMIT);
  });

  it('stamps the schema version and carries the via=ext attribution', () => {
    const url = buildHandoffUrl({ url: 'https://a.example', rulesFired: ['x'], excerpt: 'y', timestamp: TS });
    expect(url.startsWith('https://readtwice.app/send?via=ext&payload=')).toBe(true);
    const encoded = url.split('payload=')[1]!;
    expect(decodePayload(encoded).v).toBe(1);
  });

  it('throws rather than emit an over-long url', () => {
    expect(() =>
      buildHandoffUrl({ url: 'https://a.example/' + 'q'.repeat(HANDOFF_URL_LIMIT), rulesFired: [], excerpt: '', timestamp: TS }),
    ).toThrow(RangeError);
  });
});
