import type { RuleCopy } from '../heuristics/rule-types';

// Read Twice voice copy, one block per rule. Transcribed verbatim from the voice
// IP (heuristic-ruleset §3 + banner-ux-and-copy §4). This is the interim home;
// post-v0.1 the copy moves into the companion repo's per-rule YAML (ADR-004) and
// is compiled in at build time. Until then, edit copy ONLY against the voice guide
// (banner-ux-and-copy §3): one calm sentence each, no alarm words, no confidence.
//
// `{placeholders}` are filled at runtime with concrete page values via fillTemplate.

export const COPY: Record<string, RuleCopy> = {
  'domain-age-young': {
    headline: 'This website is new — registered {N} days ago.',
    evidence: 'This website was registered {N} days ago.',
    action: "Worth pausing if it's asking for money or personal information.",
  },
  'domain-charset-mixed': {
    headline: 'This web address uses tricky characters.',
    evidence: 'The web address looks like "{display}" but the actual address is "{punycode}".',
    action: 'Look at the address bar carefully. This might be a fake version of a site you trust.',
  },
  'tld-elevated-risk': {
    // Modifier-only: never a standalone headline (heuristic-ruleset §3.1).
    headline: '',
    evidence: "This website's address ends in .{tld}, which is sometimes used in scams.",
    action: '',
  },
  'tld-impersonation': {
    headline: 'This page is pretending to be {brand}.',
    evidence: 'This web address contains "{brand}" but is not on {brand}\'s real website ({canonical}).',
    action: 'Close this tab. The real {brand} website is {canonical}.',
  },
  'payment-form-anomaly': {
    headline: 'This page wants payment information, and the payment goes somewhere unexpected.',
    evidence: 'This page is asking for payment information and the form sends it to "{actionHost}".',
    action: 'Make sure you trust where this payment is going before you enter anything.',
  },
  'redirect-chain-long': {
    // Modifier-only.
    headline: '',
    evidence: 'You arrived at this page through {N} redirects, including {shortener}.',
    action: '',
  },
  'phone-number-impersonation': {
    headline: 'This page lists a fake {brand} support number.',
    evidence: 'This page shows a phone number for {brand}, but the real {brand} support number is {canonical}.',
    action: "Don't call this number. Look up {brand}'s real number on their official website.",
  },
  'scam-language-urgent': {
    headline: 'This page is using urgency to pressure you.',
    evidence: 'This page uses the phrase "{matchedPhrase}", which is common in scams.',
    action: 'Real companies rarely create urgency like this. Slow down.',
  },
  'scam-language-pressure': {
    headline: 'This is almost certainly a scam.',
    evidence: 'This page mentions "{matchedPhrase}" — that\'s a strong scam signal.',
    action:
      "Close this tab. If someone is on the phone, hang up. If you've already given them anything, call your bank now.",
  },
  'tech-support-impersonation': {
    headline: 'This is not really {brand} support.',
    evidence: "This page says it's {brand} support, but it's not on {brand}'s real website.",
    action:
      "Close this tab. {brand} doesn't operate support pages like this. If you have a problem with {brand}, go to their official website.",
  },
  'government-impersonation': {
    headline: 'This page is pretending to be {agency}.',
    evidence: 'This page is using the {agency} name but is not on the real {agency} website ({canonical}).',
    action: "The real {agency} doesn't collect payments through pages like this. Close this tab.",
  },
  'sender-domain-mismatch': {
    headline: "This email isn't really from {brand}.",
    evidence: 'This email says it\'s from "{displayName}" but the actual sender\'s address is "{fromDomain}".',
    action: "Don't click any links here. If you're not sure, go to {brand}'s website directly.",
  },
  'reply-to-mismatch': {
    headline: "If you reply, it won't go to who you think.",
    evidence: "This email's reply address is different from its sender address.",
    action: "If you weren't expecting this email, don't reply.",
  },
};

/** Fills `{key}` placeholders in a template from a flat string map. Unknown keys are left as-is. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : whole,
  );
}
