import type { Rule, PageFeatures } from './rule-types';
import { COPY } from '../banner/copy';
import {
  PAYMENT_PROCESSORS_ALLOW,
  NEWS_DOMAINS_ALLOW,
  NEWS_SENDERS_ALLOW,
  CANONICAL_PHONES,
  THIRD_PARTY_PHONES_ALLOW,
  URL_SHORTENERS,
  BRAND_SENDERS,
  type CanonicalPhoneBrand,
} from '../ruleset/lists';
import { isOnDomain, registrableDomain, findWords, type WordSpan } from './match';
import { findPhoneNumbers, type PhoneMatch } from './phone';
import { contentIsFrom } from './origin';

// Page-shape rules (heuristic-ruleset §3.2).

export const paymentFormAnomaly: Rule = {
  id: 'payment-form-anomaly',
  category: 'page',
  severity: 'yellow',
  evaluate(ctx) {
    const pageReg = registrableDomain(ctx.features.host);
    for (const form of ctx.features.forms) {
      if (!form.hasPaymentField || form.actionHost == null) continue;
      // Same registrable domain → normal (cross-subdomain checkout). Not an anomaly.
      if (registrableDomain(form.actionHost) === pageReg) continue;
      // A known payment processor is the expected cross-domain destination.
      if (PAYMENT_PROCESSORS_ALLOW.some((p) => isOnDomain(form.actionHost!, p))) continue;
      return { vars: { actionHost: form.actionHost } };
    }
    return null;
  },
  copy: COPY['payment-form-anomaly']!,
  // The brand-mismatch branch (page brand ≠ action target) is deferred — it needs
  // brand-mention extraction (extract.ts brandMentions is not yet populated).
  elevateWhen: ['domain-age-young', 'tld-impersonation', 'scam-language-pressure'],
  knownFalsePositives: ['legit sites using a regional processor not in the allow-list'],
};

const REDIRECT_CHAIN_MIN_HOPS = 3;

// Dormant in the extension by decision: v0.1 collects no redirect chain, so the worker always
// passes [] (background/navigation.ts). Built and tested against the redirectChain contract,
// and exercised in the corpus through fixture metadata, so it is ready if a collector lands.
export const redirectChainLong: Rule = {
  id: 'redirect-chain-long',
  category: 'page',
  severity: 'yellow',
  modifier: true, // Modifier only — legitimate redirects are too common to surface alone.
  evaluate(ctx) {
    const hops = redirectHops(ctx.redirectChain, ctx.features?.host);
    if (hops.length < REDIRECT_CHAIN_MIN_HOPS) return null;
    // Length alone is ordinary — single sign-on routinely bounces through 3+ hosts. A
    // shortener or tracker in the chain is what says the link was disguised (heuristic-ruleset §3.2).
    const shortener = hops.find((h) => URL_SHORTENERS.some((s) => isOnDomain(h, s)));
    return shortener ? { vars: { N: String(hops.length), shortener } } : null;
  },
  copy: COPY['redirect-chain-long']!,
  knownFalsePositives: ['legit links re-wrapped across platforms (t.co → bit.ly → site) — why it is modifier-only'],
};

// The chain as the rule counts it, per the EvaluationContext.redirectChain contract.
// Precision-first: an entry that can't count as a hop never pushes N over the threshold —
// non-hostname garbage is skipped, a back-to-back repeat is one hop, and a trailing entry
// equal to the page's own host (a same-host hop into the page, or a collector that also
// recorded the page itself) is not a separate place the user was routed through.
function redirectHops(chain: unknown, pageHost: unknown): string[] {
  if (!Array.isArray(chain)) return [];
  const hops: string[] = [];
  for (const entry of chain) {
    const host = normalizeHost(entry);
    if (host != null && host !== hops[hops.length - 1]) hops.push(host);
  }
  const page = normalizeHost(pageHost);
  if (page != null && hops[hops.length - 1] === page) hops.pop();
  return hops;
}

// Hostname characters only (IPv6 brackets included): a URL, a path or free text in the
// chain is a collector bug, not a hop.
const HOSTNAME_SHAPE = /^[a-z0-9._\-[\]:]+$/;

function normalizeHost(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const host = value.trim().toLowerCase().replace(/\.$/, '');
  return HOSTNAME_SHAPE.test(host) ? host : null;
}

// The spec trigger (§3.2) is a US/CA number within 200 chars of a brand keyword that isn't
// the brand's canonical number. Shipped tighter, because that bare trigger draws a red on
// ordinary pages, and a red-only rule has no yellow to fall back to (ADR-005):
//  - the brand must be presented as the number's OWNER — a support phrase ("Chase customer
//    service", "call Microsoft") leading into the number within its clause, or labelling it
//    right after ("1-800-… (Apple Support)"), which the page isn't claiming as its own
//    ("call us"). A repair shop that "fixes Apple and Microsoft devices" names brands beside
//    its own number all day, and a referral ("call Social Security at …; for your taxes,
//    contact the IRS") names a second party in the number's own sentence;
//  - ownership is exclusive: a claim owns one number, so on a contact-directory line each
//    brand keeps its own entry and never lends its claim to the next vendor's line;
//  - toll-free numbers only: impersonated support lines are toll-free, while the legit long
//    tail of local numbers beside a brand name (bank branches, post offices, store
//    listings) is geographic;
//  - writing ABOUT scams ("scammers posing as Amazon…") quotes the very numbers we flag.
export const phoneNumberImpersonation: Rule = {
  id: 'phone-number-impersonation',
  category: 'page',
  severity: 'red',
  evaluate(ctx) {
    const f = ctx.features;
    const text = String(f.bodyExcerpt ?? '');
    // News coverage quotes scam numbers beside the brand they impersonate (as for
    // scam-language-pressure); in webmail mode, so does a news sender's newsletter (origin.ts).
    if (contentIsFrom(f, NEWS_DOMAINS_ALLOW, NEWS_SENDERS_ALLOW)) return null;

    const numbers = findPhoneNumbers(text);
    if (!numbers.some(isSuspect)) return null;
    // Over every number, listed ones included: a claim already owning a real line can't
    // fall through to the unlisted line beside it.
    const owned = findSupportClaims(text).map((claim) => ({ claim, n: ownedNumber(text, claim, numbers) }));

    for (const n of numbers.filter(isSuspect)) {
      const owners = owned.filter((o) => o.n === n).map((o) => o.claim);
      if (owners.length === 0) continue;
      // A brand's own site and mail list lines we don't carry, so the brand talking about
      // itself is exempt, as in every impersonation rule.
      if (owners.some((c) => isBrandsOwn(f, c.brand))) continue;
      if (SCAM_REPORT_RE.test(text.slice(Math.max(0, n.index - PROXIMITY), n.end + PROXIMITY))) continue;
      const nearest = owners.reduce((a, b) => (gapBetween(b, n) < gapBetween(a, n) ? b : a));
      return { vars: { brand: nearest.brand.display, canonical: nearest.brand.primary } };
    }
    return null;
  },
  copy: COPY['phone-number-impersonation']!,
  knownFalsePositives: [
    'a real brand line missing from the canonical list (mitigated by verified sourcing + the third-party allow-list)',
    'a third-party support business that leads a brand-support phrase into its own toll-free number without "we"/"us"/"our"',
  ],
};

/** The spec's proximity window (heuristic-ruleset §3.2), kept for the scam-report check. */
const PROXIMITY = 200;

/** How far a claim may lead into its number. Well under the spec's 200: past a short
 *  connective ("Call Microsoft Support immediately at"), a sentence has usually moved on to
 *  something, or someone, else. */
const OWNER_REACH = 80;

/** NANP toll-free area codes in service. */
const TOLL_FREE = new Set(['800', '833', '844', '855', '866', '877', '888']);

// Canonical for ANY listed brand, not just the nearest one: a contact-directory page puts
// brand A's name within reach of brand B's real line. Known third-party lines never fire either.
const KNOWN_PHONES = new Set([...CANONICAL_PHONES.flatMap((b) => b.numbers), ...THIRD_PARTY_PHONES_ALLOW]);

function isSuspect(n: PhoneMatch): boolean {
  return TOLL_FREE.has(n.digits.slice(0, 3)) && !KNOWN_PHONES.has(n.digits);
}

// A brand's mail domains differ from its web domains (BRAND_SENDERS), joined by display name;
// a test pins that every phone brand has an entry.
const MAIL_SENDERS = new Map(BRAND_SENDERS.map((b) => [b.display, b.senders]));

/** The brand talking about itself: the page is on one of its web domains or, in webmail
 *  mode, the email is from one of its mail senders (origin.ts — never the mail client's host).
 *  The web domains are the host path only; the sender path is BRAND_SENDERS' enforced senders,
 *  curated for mail with its DMARC basis, so neither the free webmail on Microsoft's and
 *  Apple's web lists (live.com, outlook.com, icloud.com) nor a p=none sender ever counts. Only
 *  the claimed brand's own: a chase.com email quoting a fake "Amazon customer service" number
 *  is still judged. */
function isBrandsOwn(features: PageFeatures, brand: CanonicalPhoneBrand): boolean {
  return contentIsFrom(features, brand.canonical, MAIL_SENDERS.get(brand.display) ?? []);
}

// What follows a brand name when the page presents a support line. Not "support for" /
// "support ends": that's product lifecycle ("Microsoft support for Windows 10 ends…"), which
// IT shops write right beside their own number. `[^\S\n]` is whitespace short of a line
// break: a claim never spans two blocks (a "Microsoft" nav item above a "Support" one).
const SUPPORT_NOUN_RE =
  /^(?:['’]s)?[^\S\n]+(?:customer[^\S\n]+(?:service|care|support)|(?:tech(?:nical)?[^\S\n]+)?support(?![^\S\n]+(?:for|ends?|ended|ending)\b)|help[^\S\n]?desk|help[^\S\n]?line|hotline|phone[^\S\n]+number)\b/i;
const CALL_VERB_RE = /\b(?:call|contact)[^\S\n]+(?:the[^\S\n]+)?$/i;

// A line break or sentence end between the brand phrase and the number breaks the link: page
// chrome (nav, footers, service lists) sets a site's own number near unrelated brand text.
const CLAUSE_BREAK_RE = /[.!?](?=\s)|\n/;
// First person: the page presents the number as its own. All-caps "US" is usually the
// country ("US toll-free"), so it counts only after a contact verb ("CALL US").
const SELF_CLAIM_RE = /\b(?:[Ww]e|WE|[Oo]urs?|OURS?|[Uu]s)\b|\b(?:CALL|CONTACT|REACH|TEXT)\s+US\b/;
const SCAM_REPORT_RE = /\b(?:scam\w*|fraudsters?|fake|impostors?|imposters?|impersonat\w*)\b/i;

// After the number, only a label names its owner: an opening parenthesis or a dash, then the
// support phrase ("1-800-… (Apple Support)", "1-888-… — Microsoft Support"). Not a "·" or "|"
// separator — that is the next directory entry — and never a verb ("…, contact the IRS") or
// "for {brand} support", which send the reader to someone other than the number.
const LABEL_GAP_RE = /^[^\S\n]*[(\-–—][^\S\n]*$/;

// Words that may follow a call verb inside the claim-to-number gap and still mean the number
// itself ("call toll-free at", "call back on", "please call their number"). Any other word
// names whom to call: a second party. Precision over recall (ADR-005): "Microsoft Support: call
// customer care at N" goes quiet too, because it reads exactly like an IT page's "Microsoft 365
// support: call the help desk at N" — a staff-word allowance was tried and drew reds there.
const DIAL_FILLER = new Set([
  'toll', 'free', 'now', 'back', 'today', 'anytime', 'directly', 'immediately', 'right', 'away',
  'at', 'on', 'or', 'text', 'the', 'this', 'a', 'an', 'their', 'please', 'number', 'line',
  'helpline', 'hotline', 'hours', 'day', 'days', 'week', 'agent', 'agents', 'technician',
  'technicians', 'specialist', 'specialists', 'representative', 'representatives', 'advisor',
  'advisors',
]);
const GAP_CALL_VERB_RE = /\b(?:call|contact|reach|dial)\b/i;

interface SupportClaim extends WordSpan {
  brand: CanonicalPhoneBrand;
  /** "Chase customer service" names a support line; "call Chase Bank" points at one. Only a
   *  noun claim can label a number it follows. */
  kind: 'noun' | 'verb';
}

/** Every place the page presents a listed brand as the owner of a support line. */
function findSupportClaims(text: string): SupportClaim[] {
  const claims: SupportClaim[] = [];
  for (const brand of CANONICAL_PHONES) {
    for (const keyword of brand.keywords) {
      for (const w of findWords(text, keyword, brand.commonWord)) {
        const noun = SUPPORT_NOUN_RE.exec(text.slice(w.end, w.end + 40));
        if (noun) {
          claims.push({ brand, kind: 'noun', index: w.index, end: w.end + noun[0].length });
          continue;
        }
        // "Call Chase at …" is as likely a person as the bank; a multi-word name isn't.
        if (brand.commonWord && !keyword.includes(' ')) continue;
        const before = text.slice(Math.max(0, w.index - 20), w.index);
        const verb = CALL_VERB_RE.exec(before);
        if (verb) claims.push({ brand, kind: 'verb', index: w.index - (before.length - verb.index), end: w.end });
      }
      // The case-sensitive match above keeps "apple" the fruit and "chase" the verb out, and
      // with them an all-caps heading ("APPLE SUPPORT", or text-transform: uppercase, which
      // innerText returns in caps). A caps brand followed by a caps support noun is neither
      // fruit nor verb. Noun claims only: "CALL CHASE AT …" is still as likely a person.
      const caps = keyword.toUpperCase();
      if (!brand.commonWord || caps === keyword) continue;
      for (const w of findWords(text, caps, true)) {
        const noun = SUPPORT_NOUN_RE.exec(text.slice(w.end, w.end + 40));
        if (noun && noun[0] === noun[0].toUpperCase()) {
          claims.push({ brand, kind: 'noun', index: w.index, end: w.end + noun[0].length });
        }
      }
    }
  }
  return claims;
}

/** The one number a claim presents as the brand's: the first after it, when the claim leads
 *  into it ("Chase customer service: N", "Call Chase Bank at N"), else the one just before
 *  it, when the claim labels it ("N (Apple Support)"). The number after wins, so in
 *  "Samsung Support: N1 — Apple Support: N2" the Apple claim is N2's heading, not N1's label.
 *  Exclusive: "Apple Support: N1 · Samsung Support: N2" never lends Apple's claim to N2. */
function ownedNumber(text: string, claim: SupportClaim, numbers: readonly PhoneMatch[]): PhoneMatch | null {
  const after = numbers.find((n) => n.index >= claim.end);
  if (after && leadsInto(text, claim, after)) return after;
  let before: PhoneMatch | undefined;
  for (const n of numbers) if (n.end <= claim.index) before = n;
  if (before && labels(text, claim, before)) return before;
  return null;
}

/** True when the claim leads into the number: same line and clause, at most OWNER_REACH
 *  apart, no second party named in between, and not the page's own number. */
function leadsInto(text: string, claim: SupportClaim, n: PhoneMatch): boolean {
  const between = text.slice(claim.end, n.index);
  if (between.length > OWNER_REACH || CLAUSE_BREAK_RE.test(between)) return false;
  // A semicolon opens a second clause, usually about a second party ("Contact PayPal
  // customer service; for your booking, call N").
  if (between.includes(';')) return false;
  // innerText joins table cells with tabs: across cells, only the one right beside the claim
  // is its number ("Microsoft 365 support\tIT Service Desk\t1-877-…" is the desk's line).
  if (between.includes('\t') && /[\p{L}\p{N}]/u.test(between)) return false;
  if (namesAnotherParty(between)) return false;
  return !SELF_CLAIM_RE.test(between) && !SELF_CLAIM_RE.test(leadIn(text, n.index));
}

/** True when a noun claim right after the number labels it ("N (Apple Support)"). */
function labels(text: string, claim: SupportClaim, n: PhoneMatch): boolean {
  if (claim.kind !== 'noun' || !LABEL_GAP_RE.test(text.slice(n.end, claim.index))) return false;
  return !SELF_CLAIM_RE.test(leadIn(text, n.index));
}

/** True when a call verb in the gap has someone else as its object: "…, contact the IT
 *  Service Desk at N", "…, or call the store at N". A second verb counts as a second party. */
function namesAnotherParty(between: string): boolean {
  const verb = GAP_CALL_VERB_RE.exec(between);
  if (!verb) return false;
  const words = between.slice(verb.index + verb[0].length).match(/\p{L}+/gu) ?? [];
  return words.some((w) => !DIAL_FILLER.has(w.toLowerCase()));
}

/** The stretch of the number's own clause just before it ("…call us at "). */
function leadIn(text: string, index: number): string {
  return text.slice(Math.max(0, index - 60), index).split(CLAUSE_BREAK_RE).pop() ?? '';
}

function gapBetween(a: WordSpan, b: WordSpan): number {
  return a.end <= b.index ? b.index - a.end : a.index - b.end;
}

export const pageRules: readonly Rule[] = [
  paymentFormAnomaly,
  redirectChainLong,
  phoneNumberImpersonation,
];
