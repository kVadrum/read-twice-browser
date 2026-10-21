import type { Rule } from './rule-types';
import { COPY } from '../banner/copy';
import {
  BRAND_SENDERS,
  ON_BEHALF_SENDERS,
  BRAND_CONTEXT_WORDS,
  VENUE_WORDS,
  FREE_WEBMAIL_DOMAINS,
  WEBMAIL_PROVIDER_FAMILIES,
  REPLY_TO_PLATFORMS_ALLOW,
  CUSTOMER_NAMED_SENDERS,
  type BrandSender,
} from '../ruleset/lists';
import { isOnDomain, registrableDomain, hostHasBrandToken } from './match';
import { parseEmailAddress, type EmailAddress } from './email-address';
import { sendsAs } from './origin';

// Webmail-surface rules (heuristic-ruleset §3.4). Active only when the content script is
// on a recognized webmail host (ruleset/webmail-hosts.ts) and could read the open email into
// ctx.features.webmail. Both are yellow with no elevation: a header mismatch is "worth
// pausing", never proof — legit brands send through odd domains and people reply-to oddly.

export const senderDomainMismatch: Rule = {
  id: 'sender-domain-mismatch',
  category: 'webmail',
  severity: 'yellow',
  evaluate(ctx) {
    const mail = ctx.features.webmail;
    if (!mail) return null;
    const from = parseEmailAddress(mail.fromAddress);
    if (!from) return null; // no address to compare (e.g. OWA hides it for internal mail)

    let claims = brandClaimsIn(mail.displayName);
    // A platform address that puts its customer's chosen name beside its own ("Microsoft
    // Invitations on behalf of <tenant name>") proves only that the platform sent it: its own
    // claim is true and vouches for none of the others, so judge those alone. With none left
    // it is the platform writing as itself.
    if (CUSTOMER_NAMED_SENDERS.some((s) => sendsAs(from, s))) {
      claims = claims.filter((c) => !mailsAs(c.brand, from));
    }
    if (claims.length === 0) return null;
    // A name can claim two brands at once ("Amazon Pay | PayPal"); mail from any one of
    // them is that brand writing, not a mismatch.
    if (claims.some((c) => mailsAs(c.brand, from))) return null;
    if (ON_BEHALF_SENDERS.some((d) => isOnDomain(from.domain, d))) return null;
    const { brand, alone } = claims[0]!;

    const freemail = isFreeWebmail(from.domain);
    // "Chase" <chase.m.0142@gmail.com> is a person named Chase, not the bank.
    if (brand.bareIsFirstName && alone && freemail) return null;
    // Zelle notices legitimately come from any member bank's domain; only a free-webmail
    // From, or a domain dressed up with the brand's own token, is out of place.
    if (
      brand.partnerRelayTokens &&
      !freemail &&
      !brand.partnerRelayTokens.some((t) => hostHasBrandToken(from.domain, t))
    ) {
      return null;
    }
    return { vars: { brand: brand.display, displayName: shown(mail.displayName), fromDomain: from.domain } };
  },
  copy: COPY['sender-domain-mismatch']!,
  knownFalsePositives: [
    'brand mail through a sending domain not on its list (lists are curated, not exhaustive)',
    "third parties writing on a brand's behalf (on-behalf list)",
    "a listed brand's real customer named on a platform sender ('Microsoft Invitations on behalf of JPMorgan Chase')",
  ],
};

export const replyToMismatch: Rule = {
  id: 'reply-to-mismatch',
  category: 'webmail',
  severity: 'yellow',
  evaluate(ctx) {
    const mail = ctx.features.webmail;
    if (!mail?.replyToAddress) return null;
    const from = parseEmailAddress(mail.fromAddress);
    const replyTo = parseEmailAddress(mail.replyToAddress);
    if (!from || !replyTo) return null;

    // §3.4's pattern: a free-webmail From, so the "who" the reader trusts is a person,
    // with replies diverted elsewhere. A brand's own From with a support Reply-To is normal.
    const fromProvider = webmailProvider(from.domain);
    if (fromProvider == null) return null;
    if (REPLY_TO_PLATFORMS_ALLOW.some((d) => isOnDomain(replyTo.domain, d))) return null;
    // Same provider family (hotmail→outlook) or same domain (another gmail address) is not
    // the §3.4 mismatch — the mitigation reads "both free webmail, different domains".
    if (webmailProvider(replyTo.domain) === fromProvider) return null;
    if (registrableDomain(replyTo.domain) === registrableDomain(from.domain)) return null;
    return { vars: {} };
  },
  copy: COPY['reply-to-mismatch']!,
  knownFalsePositives: [
    'a personal free-webmail account replying via a work/school address',
    'mailing lists (googlegroups.com, groups.io allow-listed)',
  ],
};

export const webmailRules: readonly Rule[] = [senderDomainMismatch, replyToMismatch];

// --- Display-name brand claims ----------------------------------------------

interface BrandClaim {
  brand: BrandSender;
  /** The claim is a bare keyword with no context word at all ("Chase", not "Chase Alerts"). */
  alone: boolean;
}

// Connectors may sit beside a bare keyword but carry no brand context of their own:
// "The Chase" is still just "Chase".
const CONNECTORS: readonly string[] = ['the', 'your', 'my', 'from', 'and', 'of'];

// Cyrillic and Greek letters drawn identically to a Latin letter in common UI fonts, as
// [code point, Latin]. Code points, not literals, so a reviewer can tell them from Latin.
// Only exact lookalikes: a genuine Cyrillic/Greek name never folds into a different real
// word — it just stops being a Latin brand keyword. The capital-I lookalikes fold to a
// capital I, so they pick up its readings below (they too are drawn as a lowercase l).
const LATIN_LOOKALIKE = new Map(
  (
    [
      // Cyrillic а е о р с у х і ј ѕ ԁ һ ӏ ԛ ԝ, then capitals А В Е К М Н О Р С Т Х І Ј Ѕ Ӏ Ԛ Ԝ
      [0x0430, 'a'], [0x0435, 'e'], [0x043e, 'o'], [0x0440, 'p'], [0x0441, 'c'], [0x0443, 'y'],
      [0x0445, 'x'], [0x0456, 'i'], [0x0458, 'j'], [0x0455, 's'], [0x0501, 'd'], [0x04bb, 'h'],
      [0x04cf, 'l'], [0x051b, 'q'], [0x051d, 'w'], [0x0410, 'a'], [0x0412, 'b'], [0x0415, 'e'],
      [0x041a, 'k'], [0x041c, 'm'], [0x041d, 'h'], [0x041e, 'o'], [0x0420, 'p'], [0x0421, 'c'],
      [0x0422, 't'], [0x0425, 'x'], [0x0406, 'I'], [0x0408, 'j'], [0x0405, 's'], [0x04c0, 'I'],
      [0x051a, 'q'], [0x051c, 'w'],
      // Greek ο ρ ν ι, then capitals Α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Υ Χ
      [0x03bf, 'o'], [0x03c1, 'p'], [0x03bd, 'v'], [0x03b9, 'i'], [0x0391, 'a'], [0x0392, 'b'],
      [0x0395, 'e'], [0x0396, 'z'], [0x0397, 'h'], [0x0399, 'I'], [0x039a, 'k'], [0x039c, 'm'],
      [0x039d, 'n'], [0x039f, 'o'], [0x03a1, 'p'], [0x03a4, 't'], [0x03a5, 'y'], [0x03a7, 'x'],
    ] as const
  ).map(([cp, latin]) => {
    // A capital folds to a capital, so an all-caps word stays all caps (nameWords).
    const c = String.fromCodePoint(cp);
    return [c, c === c.toLowerCase() ? latin : latin.toUpperCase()];
  }),
);

// Latin characters and digits drawn like a different letter in the sans-serif UI fonts
// webmail clients use, as [character, every letter a reader can take it for]. A relation,
// not a fold: "PayPaI" (capital i) reads as PayPal, but a real lowercase i keeps its dot, so
// "Appie" and "Zelie" never read as Apple or Zelle. Looked up BEFORE lowercasing, because
// capital I is where shape and case part ways: it is the capital of i, drawn as an l.
// Readings only add to what a character matched before, so nothing that matched stops.
// Deliberately not "|" (display names use it as a separator: "Amazon Pay | PayPal") nor
// "rn" for m (it changes a word's length, and real surnames are full of it: Turner).
const READINGS = new Map<string, readonly string[]>([
  ['I', ['i', 'l']],
  ['l', ['l', 'i']], // …so a lowercase l reads as that capital I ("lRS")
  ['1', ['1', 'l', 'i']],
  ['0', ['0', 'o']],
  [String.fromCodePoint(0x0131), [String.fromCodePoint(0x0131), 'i']], // dotless ı
  [String.fromCodePoint(0x0130), ['i']], // İ (whose lowercase is two code points)
]);

/** A display-name word as it can be READ: per character, every letter it is drawn as. */
type NameWord = readonly (readonly string[])[];

const BRAND_PATTERNS = BRAND_SENDERS.map((brand) => ({
  brand,
  keywords: brand.keywords.map(plainWords),
  bare: (brand.bareKeywords ?? []).map(plainWords),
  context: [...BRAND_CONTEXT_WORDS, ...(brand.contextWords ?? []), ...CONNECTORS],
}));

/** Every brand a display name claims to be, in list order. Exported for tests. */
export function brandClaimsIn(displayName: string): BrandClaim[] {
  const name = nameWords(displayName);
  const claims: BrandClaim[] = [];
  if (name.length === 0) return claims;
  for (const { brand, keywords, bare, context } of BRAND_PATTERNS) {
    if (keywords.some((k) => containsPhrase(name, k))) {
      claims.push({ brand, alone: false });
      continue;
    }
    for (const k of bare) {
      const rest = standaloneRest(name, k, context);
      if (rest) {
        claims.push({ brand, alone: rest.every((w) => readsAsAny(w, CONNECTORS)) });
        break;
      }
    }
  }
  return claims;
}

/** `s` as words, after folding what makes two names LOOK the same but compare different:
 *  compatibility forms (fullwidth letters), invisible format characters (a zero-width space
 *  inside "PayPal"), and Cyrillic/Greek letters drawn as Latin ones. Punctuation separates
 *  words, so "J.P. Morgan", "Chase.com" and "service@paypal.com" split the way they read.
 *  Case is kept: READINGS needs it. */
function words(s: string): string[][] {
  const folded = Array.from(s.normalize('NFKC').replace(/\p{Cf}/gu, ''), (c) => LATIN_LOOKALIKE.get(c) ?? c).join('');
  return (folded.match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => Array.from(w));
}

/** A keyword as lowercase words — our own list text, read as written. */
function plainWords(s: string): string[] {
  return words(s).map((w) => w.join('').toLowerCase());
}

/** A display name as words a reader can take it for. Matching only: the banner quotes the
 *  name as the sender wrote it (shown). In an all-caps word a capital I stands among capitals,
 *  where the brand's own L would be a capital L too, so it reads only as the I it is
 *  ("ZELIE MARTIN" is not Zelle). */
function nameWords(s: string): NameWord[] {
  return words(s).map((w) => {
    const caps = !w.some((c) => c !== c.toUpperCase());
    return w.map((c) => (caps && c === 'I' ? ['i'] : (READINGS.get(c) ?? [c.toLowerCase()])));
  });
}

/** True when mail from `from` is the brand's own, enforced or not: the display name is true. */
function mailsAs(brand: BrandSender, from: EmailAddress): boolean {
  return [...brand.senders, ...(brand.unenforcedSenders ?? [])].some((s) => sendsAs(from, s));
}

/** True if `word` can be read as the lowercase word `plain`. */
function readsAs(word: NameWord, plain: string): boolean {
  const chars = Array.from(plain);
  return word.length === chars.length && chars.every((c, i) => word[i]!.includes(c));
}

function readsAsAny(word: NameWord, plains: readonly string[]): boolean {
  return plains.some((p) => readsAs(word, p));
}

/** True if `phrase` occurs as consecutive whole words, not directly followed by a venue
 *  word ("Wells Fargo Center" is an arena, not the bank). */
function containsPhrase(name: NameWord[], phrase: string[]): boolean {
  return phraseStarts(name, phrase).some((i) => {
    const next = name[i + phrase.length];
    return next == null || !readsAsAny(next, VENUE_WORDS);
  });
}

/** For a bare keyword: when the name is the keyword plus only `context` words, the words
 *  that are not the keyword (possibly none); otherwise null. "Chase Miller" → null. */
function standaloneRest(name: NameWord[], keyword: string[], context: readonly string[]): NameWord[] | null {
  const starts = phraseStarts(name, keyword);
  if (starts.length === 0) return null;
  const covered = new Set<number>();
  for (const i of starts) keyword.forEach((_, j) => covered.add(i + j));
  const rest = name.filter((_, i) => !covered.has(i));
  return rest.every((w) => readsAsAny(w, context)) ? rest : null;
}

function phraseStarts(name: NameWord[], phrase: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + phrase.length <= name.length; i++) {
    if (phrase.every((t, j) => readsAs(name[i + j]!, t))) out.push(i);
  }
  return out;
}

// Format characters that reorder or hide the text around them: the bidi embeddings,
// overrides, isolates and marks, and the invisible separators (soft hyphen, zero-width space,
// word joiner, invisible operators, BOM, interlinear annotation). Not ZWNJ/ZWJ (U+200C/D),
// which emoji and Persian/Indic names need to display right, nor the tag characters
// subdivision-flag emoji are built from.
const REORDERING_OR_HIDDEN =
  /[\u00ad\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\ufff9-\ufffb]/gu;

/** A display name as the banner quotes it. It is the sender's own text set inside our
 *  sentence, so: stripped of what would reorder that sentence (a right-to-left override in
 *  the name would print the real sender's domain after it backwards), bounded, then
 *  isolated (FSI…PDI) so even a right-to-left name stays inside its quotes. Stripping comes
 *  first, so no PDI of the sender's can close our isolate early. */
function shown(displayName: string): string {
  const s = displayName.replace(REORDERING_OR_HIDDEN, '').replace(/\s+/g, ' ').trim();
  return `\u2068${s.length > 80 ? `${s.slice(0, 79)}…` : s}\u2069`;
}

// --- Sender + provider matching ---------------------------------------------

function isFreeWebmail(domain: string): boolean {
  return webmailProvider(domain) != null;
}

/** The free-webmail provider a domain belongs to — its alias family's first domain, or the
 *  listed domain itself — or null when it is not free webmail. Whole-label matching, so
 *  "gmail.com.example" is not Gmail. */
function webmailProvider(domain: string): string | null {
  const listed = FREE_WEBMAIL_DOMAINS.find((d) => isOnDomain(domain, d));
  if (listed == null) return null;
  return WEBMAIL_PROVIDER_FAMILIES.find((family) => family.includes(listed))?.[0] ?? listed;
}
