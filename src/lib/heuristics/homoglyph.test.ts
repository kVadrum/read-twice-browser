import { describe, it, expect } from 'vitest';
import { punycodeDecode, decodeHost, isMixedScriptHost } from './homoglyph';

// Build non-ASCII from code points so the SOURCE stays pure ASCII and unambiguous
// (a literal Latin look-alike pasted by accident couldn't silently pass the tests).
const CYRILLIC_A = String.fromCharCode(0x0430); // 'а', looks like Latin 'a'
const PRIMER = String.fromCharCode(0x043f, 0x0440, 0x0438, 0x043c, 0x0435, 0x0440); // "пример"
const BUCHER = 'b' + String.fromCharCode(0x00fc) + 'cher'; // "bücher"

describe('punycodeDecode', () => {
  it('decodes the RFC 3492 sample (bücher)', () => {
    expect(punycodeDecode('bcher-kva')).toBe(BUCHER);
  });
  it('throws on malformed input', () => {
    expect(() => punycodeDecode('@@@')).toThrow();
  });
});

describe('isMixedScriptHost', () => {
  it('flags a Latin host with a Cyrillic look-alike letter', () => {
    expect(isMixedScriptHost('ch' + CYRILLIC_A + 'se.com')).toBe(true);
  });
  it('does not flag a pure-ASCII host', () => {
    expect(isMixedScriptHost('chase.com')).toBe(false);
  });
  it('does not flag a single-script (all-Cyrillic) label', () => {
    expect(isMixedScriptHost(PRIMER + '.com')).toBe(false);
  });
  it('does not flag accented-Latin IDNs once decoded', () => {
    expect(isMixedScriptHost('xn--bcher-kva.com')).toBe(false); // bücher.com — all Latin
  });
});

describe('decodeHost', () => {
  it('decodes xn-- labels and leaves ASCII labels alone', () => {
    expect(decodeHost('xn--bcher-kva.com')).toBe(BUCHER + '.com');
  });
});
