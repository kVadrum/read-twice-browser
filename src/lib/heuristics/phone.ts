// The one US/Canada phone-number definition. The content script derives
// `PageFeatures.phoneNumbers` from it and `phone-number-impersonation` reads positions
// from it, so the feature and the rule can never disagree about what counts as a number.
//
// Its own module, dependency-free, because the content script imports it: match.ts pulls
// in the bundled Public Suffix List (tldts), and importing match.ts from extract.ts would
// put ~260 KB on every page the content script runs on, where today the whole content
// script is ~23 KB (~9 KB gzipped; measured 2026-10-21). content/weight.test.ts guards it.

/** A US/Canada phone number found in text. */
export interface PhoneMatch {
  /** `[index, end)` offsets of the match in the searched text. */
  index: number;
  end: number;
  /** As displayed on the page, e.g. "1-800-275-2273". */
  raw: string;
  /** The 10 NANP digits (area code + exchange + line), country code dropped. */
  digits: string;
}

// One separator between digit groups: a dash (typographic dashes included — some brand
// pages print "1–800–…" — and a minus sign typed for one), a dot, or a single space: plain,
// no-break, or the figure / thin / narrow no-break spaces typesetting puts between digit
// groups. Never a tab or line break, so digits sitting in adjacent table cells or blocks
// don't join up into a "number".
const SEP = String.raw`[-.\u2010-\u2015\u2212 \u00a0\u2007\u2009\u202f]`;
// What continues a digit run past the number's edge: a hyphen or a dot ("112-800…-77").
// Not an en or em dash: touching a number, that is punctuation ("Call 1-888-555-0142—24/7",
// "Open 24/7—1-888-…"), and counting it as a joiner dropped the number outright. The cost,
// accepted as rare: a digit run joined by en/em dashes can match at its edge.
const JOINER = String.raw`[-.\u2010\u2011]`;

// E.164 and the common display forms: +1 800 275 2273, 1-800-275-2273, (800) 275-2273,
// 800.275.2273. The precision lives in the guards: area code and exchange must start 2-9
// (NANP), and no digit may touch the match — bare or hyphen/dot-joined — so a 10-digit run
// inside a longer order/tracking number never reads as a phone. Nor may another country's
// code precede it ("+44 800 …").
const PHONE_RE = new RegExp(
  String.raw`(?<![\d+]|\d${JOINER}|\+\d{1,3}${SEP}?)` +
    String.raw`(?:\+?1${SEP}?)?` +
    String.raw`(?:\(([2-9]\d{2})\)|([2-9]\d{2}))${SEP}?` +
    String.raw`([2-9]\d{2})${SEP}?(\d{4})` +
    String.raw`(?!${JOINER}?\d)`,
  'g',
);

/** Every US/Canada phone number in `text`, in page order, with its offset (rules that
 *  measure proximity need positions) and its normalized 10-digit form. */
export function findPhoneNumbers(text: string): PhoneMatch[] {
  return Array.from(text.matchAll(PHONE_RE), (m) => ({
    index: m.index,
    end: m.index + m[0].length,
    raw: m[0],
    digits: `${m[1] ?? m[2]}${m[3]}${m[4]}`,
  }));
}
