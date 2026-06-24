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

  it('drops the excerpt (not the routing url) to stay under budget', () => {
    const longUrl = 'https://shop.example/search?q=' + 'q'.repeat(5000); // big but not pathological
    const url = buildHandoffUrl({
      url: longUrl,
      rulesFired: ['payment-form-anomaly'],
      excerpt: 'z'.repeat(2048),
      timestamp: TS,
    });
    expect(url.length).toBeLessThanOrEqual(HANDOFF_URL_LIMIT);
    const decoded = decodePayload(url.split('payload=')[1]!);
    expect(decoded.url).toBe(longUrl); // url preserved for routing
    expect(decoded.excerpt).toBe(''); // excerpt sacrificed
  });

  it('throws only when even the excerpt-less url exceeds the limit', () => {
    expect(() =>
      buildHandoffUrl({ url: 'https://a.example/' + 'q'.repeat(HANDOFF_URL_LIMIT), rulesFired: [], excerpt: '', timestamp: TS }),
    ).toThrow(RangeError);
  });
});
