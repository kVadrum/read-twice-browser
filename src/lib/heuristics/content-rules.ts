import type { Rule } from './rule-types';
import { COPY } from '../banner/copy';
import {
  URGENCY_PHRASES,
  PRESSURE_PHRASES,
  NEWS_DOMAINS_ALLOW,
  NEWS_SENDERS_ALLOW,
  GOVERNMENT_AGENCIES,
  TAX_PREP_ALLOW,
  TAX_PREP_SENDERS,
  PAY_CTA_PHRASES,
  TECH_SUPPORT_BRANDS,
} from '../ruleset/lists';
import { textHasPhrase, textHasWord, textHasPhraseNearTop, findPhrases, type WordSpan } from './match';
import { contentIsFrom } from './origin';

// Content / text-pattern rules (heuristic-ruleset §3.3). Exact-phrase match against
// curated lists — never bare keyword match — to keep false positives down. The
// phrase lists are the interim TS home for what becomes the companion repo's
// lists/{urgency,pressure}-phrases.yaml.

export const scamLanguageUrgent: Rule = {
  id: 'scam-language-urgent',
  category: 'content',
  severity: 'yellow',
  evaluate(ctx) {
    const matched = URGENCY_PHRASES.find((p) => textHasPhrase(ctx.features.bodyExcerpt, p));
    return matched ? { vars: { matchedPhrase: matched } } : null;
  },
  copy: COPY['scam-language-urgent']!,
};

export const scamLanguagePressure: Rule = {
  id: 'scam-language-pressure',
  category: 'content',
  severity: 'red',
  evaluate(ctx) {
    // News coverage of scams quotes these phrases legitimately — a yellow on a news
    // article is tolerable, a red is not, so suppress on allow-listed news domains.
    if (contentIsFrom(ctx.features, NEWS_DOMAINS_ALLOW, NEWS_SENDERS_ALLOW)) return null;
    const text = String(ctx.features.bodyExcerpt ?? '');
    const matched = PRESSURE_PHRASES.find((p) => findPhrases(text, p).some((at) => isPressure(text, at)));
    return matched ? { vars: { matchedPhrase: matched } } : null;
  },
  copy: COPY['scam-language-pressure']!,
  knownFalsePositives: [
    'news articles about scams (allow-listed news domains)',
    'anti-fraud advice or a scam report whose cue sits in another sentence than the phrase',
  ],
};

// Anti-fraud advice and scam reports quote the very phrases this rule matches: a bank's
// footer ("Chase will never ask you to pay with gift cards"), a family warning ("The man said
// 'do not tell anyone' and wanted gift cards only"). Neither is the text applying pressure, and
// §3.3's "essentially no legitimate use" is about the phrase used AT the reader. The check is
// sentence-local on purpose: one boilerplate "we never ask for gift cards" line must not
// exempt a scam page's real pressure two sentences on. Precision over recall, as for every red
// rule (ADR-005): a scam sentence that also names scammers ("protect your savings from
// scammers, do not tell anyone") or opens with a disclaimer clause is exempt too — narrower
// frames were tried and drew reds on real fraud-awareness pages.
const SENTENCE_BREAK_RE = /[.!?](?=\s)|\n/g;
// Advice: a "never ask/require…" cue before the phrase in its sentence — a disclaimer's shape.
// Never a bare "never": "you will never see your money again unless you pay with gift cards"
// is pressure. Tell/call/text/email/contact count only with "you" ("will never call you and
// ask…"), since "never tell your bank" is a scam script.
const ADVICE_RE =
  /\b(?:never|won['’]t\s+ever|will\s+not\s+ever)\s+(?:\w+\s+)?(?:asks?|requests?|requires?|demands?|pressures?|(?:tells?|calls?|texts?|emails?|contacts?)\s+you)\b/i;
// A report: the sentence names a scam or quotes the person who said it — the phone rule's
// scam-writing exemption, narrowed to one sentence. A denial is no report: scam pages say
// "this is not a scam", "this isn't a scam", "this is no scam".
const SCAM_REPORT_RE =
  /(?<!\b(?:not|no|never)\s+(?:a\s+)?)(?<!n['’]t\s+(?:a\s+)?)\b(?:scam(?:s|med|mers?)?|fraudsters?)\b|\b(?:the\s+(?:man|woman|caller|person)\s+(?:said|told)|(?:he|she)\s+said|they\s+told\s+(?:you|me|him|her|us|them))\b/i;
// "Do not tell anyone this code." is a one-time-code notice protecting the code, and only
// when the code ends the sentence: "…the code except the representative" or "…your PIN has
// been compromised" is a script.
const CODE_NOTICE_RE =
  /^\s+(?:this|the|your)\s+(?:(?:one[-\s]time|verification|security|access|sign[-\s]in|login|otp)\s+)?(?:code|passcode|pin|password|otp)(?:\s+with\s+anyone)?(?:,\s*not\s+even\b[^.!?]*)?[.!?]?\s*$/i;

/** True when this occurrence of a pressure phrase presses the reader: its sentence is neither
 *  advice against the phrase nor a report of someone else saying it. */
function isPressure(text: string, at: WordSpan): boolean {
  let start = 0;
  let end = text.length;
  for (const m of text.matchAll(SENTENCE_BREAK_RE)) {
    if (m.index < at.index) start = m.index + m[0].length;
    else if (m.index >= at.end) {
      end = m.index;
      break;
    }
  }
  if (ADVICE_RE.test(text.slice(start, at.index)) || SCAM_REPORT_RE.test(text.slice(start, end))) return false;
  return !CODE_NOTICE_RE.test(text.slice(at.end, end));
}

export const techSupportImpersonation: Rule = {
  id: 'tech-support-impersonation',
  category: 'content',
  severity: 'red',
  evaluate(ctx) {
    const f = ctx.features;
    // The scam is a fake support page with a number to call, so a displayed phone IS the
    // element. The brand-support claim must be near the top (headline area) to avoid FPs on
    // IT consultants who mention a brand in body copy (heuristic-ruleset §3.3).
    if (f.phoneNumbers.length === 0) return null;
    for (const brand of TECH_SUPPORT_BRANDS) {
      const named = brand.keywords.some((k) => textHasPhraseNearTop(f.bodyExcerpt, k));
      if (named && !contentIsFrom(f, brand.canonical, brand.senders)) {
        return { vars: { brand: brand.display } };
      }
    }
    return null;
  },
  copy: COPY['tech-support-impersonation']!,
  knownFalsePositives: ['third-party IT consultants (mitigated by near-top + canonical allow-list)'],
};

export const governmentImpersonation: Rule = {
  id: 'government-impersonation',
  category: 'content',
  severity: 'red',
  evaluate(ctx) {
    const f = ctx.features;
    // Require a PAYMENT ask specifically (payment/SSN form field or a pay CTA), NOT a bare
    // phone number — that keeps legit CPA/tax sites that merely MENTION an agency and list a
    // contact number out of red. (More conservative than §3.3, which also counts a displayed
    // phone; revisit when the corpus exists.)
    const hasPaymentAsk =
      f.forms.some((form) => form.hasPaymentField) ||
      PAY_CTA_PHRASES.some((p) => textHasPhrase(f.bodyExcerpt, p));
    if (!hasPaymentAsk) return null;
    if (contentIsFrom(f, TAX_PREP_ALLOW, TAX_PREP_SENDERS)) return null;

    for (const agency of GOVERNMENT_AGENCIES) {
      const named = agency.keywords.some((k) => textHasWord(f.bodyExcerpt, k));
      if (named && !contentIsFrom(f, agency.canonical, agency.senders)) {
        return { vars: { agency: agency.display, canonical: agency.canonical[0]! } };
      }
    }
    return null;
  },
  copy: COPY['government-impersonation']!,
  knownFalsePositives: ['tax-prep companies (allow-listed)', 'news coverage (excluded by the payment-ask requirement)'],
};

export const contentRules: readonly Rule[] = [
  scamLanguageUrgent,
  scamLanguagePressure,
  techSupportImpersonation,
  governmentImpersonation,
];
