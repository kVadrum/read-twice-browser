// Homoglyph / mixed-script detection for `domain-charset-mixed`. Browsers store an IDN
// host in its ASCII (xn--) form, so to see whether a hostname mixes Latin with Cyrillic/
// Greek lookalikes we decode the punycode labels back to Unicode and inspect their scripts.
//
// A single-script IDN (all-Cyrillic, all-CJK) is legitimate; only Latin MIXED with a
// confusable script (the classic "chаse.com" with a Cyrillic 'а') is the attack.

const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  delta = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > ((BASE - TMIN) * TMAX) >> 1) {
    delta = Math.floor(delta / (BASE - TMIN));
    k += BASE;
  }
  return Math.floor(k + ((BASE - TMIN + 1) * delta) / (delta + SKEW));
}

function basicToDigit(cp: number): number {
  if (cp >= 0x30 && cp <= 0x39) return cp - 0x30 + 26; // 0-9 -> 26-35
  if (cp >= 0x41 && cp <= 0x5a) return cp - 0x41; // A-Z -> 0-25
  if (cp >= 0x61 && cp <= 0x7a) return cp - 0x61; // a-z -> 0-25
  return BASE; // invalid
}

/** RFC 3492 punycode decode of a single label (without the "xn--" prefix). Throws on
 *  malformed input; callers treat a throw as "not a decodable IDN label". */
export function punycodeDecode(input: string): string {
  const output: number[] = [];
  const lastDelim = input.lastIndexOf('-');
  const basic = lastDelim < 0 ? 0 : lastDelim;
  for (let j = 0; j < basic; j++) {
    const c = input.charCodeAt(j);
    if (c >= 0x80) throw new Error('non-basic code point before delimiter');
    output.push(c);
  }

  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  let index = basic > 0 ? basic + 1 : 0;

  while (index < input.length) {
    const oldi = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) throw new Error('unexpected end of input');
      const digit = basicToDigit(input.charCodeAt(index++));
      if (digit >= BASE) throw new Error('invalid digit');
      i += digit * w;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
    }
    const out = output.length + 1;
    bias = adapt(i - oldi, out, oldi === 0);
    n += Math.floor(i / out);
    i %= out;
    output.splice(i, 0, n);
    i++;
  }
  return String.fromCodePoint(...output);
}

type Script = 'latin' | 'cyrillic' | 'greek' | 'other';

function scriptOf(cp: number): Script {
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return 'latin';
  if (cp >= 0x0400 && cp <= 0x04ff) return 'cyrillic';
  if (cp >= 0x0370 && cp <= 0x03ff) return 'greek';
  return 'other';
}

/** True if a label mixes ASCII-Latin with a confusable script (Cyrillic/Greek). Accented
 *  Latin (ü) is 'other', so legitimate European IDNs do not trip this. */
function isMixedLatinLabel(label: string): boolean {
  let hasLatin = false;
  let hasConfusable = false;
  for (const ch of label) {
    const s = scriptOf(ch.codePointAt(0)!);
    if (s === 'latin') hasLatin = true;
    else if (s === 'cyrillic' || s === 'greek') hasConfusable = true;
  }
  return hasLatin && hasConfusable;
}

/** Decodes every xn-- label of a host to Unicode (others pass through unchanged). */
export function decodeHost(host: string): string {
  return host
    .toLowerCase()
    .split('.')
    .map((label) => {
      if (!label.startsWith('xn--')) return label;
      try {
        return punycodeDecode(label.slice(4));
      } catch {
        return label;
      }
    })
    .join('.');
}

/** True if any label of the host (after IDN decode) mixes Latin with Cyrillic/Greek. */
export function isMixedScriptHost(host: string): boolean {
  return decodeHost(host).split('.').some(isMixedLatinLabel);
}
