import type { RuleCopy, Verdict } from '../heuristics/rule-types';

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

// Email variants, for a verdict on the email open in a webmail client (Verdict.surface). The
// rules that can read an email body keep their web copy everywhere else, but over an email
// "This page…" points at the mail client, and "Close this tab" closes the mailbox while the
// email stays in the inbox — the instruction that matters is not to call, click or reply.
// Webmail mode caps every hit at yellow (engine.ts), so these are written in the yellow tone
// (banner-ux-and-copy §3.5): the friend who noticed something, never "almost certainly".
// Rules missing here (the webmail rules) already speak of the email.
export const EMAIL_COPY: Record<string, RuleCopy> = {
  'phone-number-impersonation': {
    headline: "This email lists a {brand} support number that isn't {brand}'s real one.",
    evidence: 'This email shows a phone number for {brand}, but the real {brand} support number is {canonical}.',
    action: 'If you need {brand}, call the number on their official website, not the one in this email.',
  },
  'scam-language-urgent': {
    headline: 'This email is using urgency to pressure you.',
    evidence: 'This email uses the phrase "{matchedPhrase}", which is common in scams.',
    action: 'Real companies rarely create urgency like this. Slow down.',
  },
  'scam-language-pressure': {
    headline: 'This email sounds like a scam.',
    evidence: 'This email says "{matchedPhrase}" — something scammers say and real companies don\'t.',
    action: "Don't call, click or reply — and if you've already sent them anything, call your bank.",
  },
  'tech-support-impersonation': {
    headline: "This email talks about {brand} support, but it isn't from {brand}.",
    evidence: "This email names {brand} support and lists a phone number, but it doesn't come from {brand}'s real email address.",
    action: 'If you need help with {brand}, go to their official website instead of calling a number in this email.',
  },
  'government-impersonation': {
    headline: 'This email uses the {agency} name and asks for a payment.',
    evidence: "This email mentions {agency}, but it doesn't come from {agency}'s real email address.",
    action: "The real {agency} doesn't collect payments through emails like this — don't click or reply, and you can delete it.",
  },
};

/** A rule's copy for the surface a verdict judged: its email variant over an email, if it has
 *  one, else its web copy. */
export function copyFor(ruleId: string, surface?: Verdict['surface']): RuleCopy | undefined {
  return (surface === 'email' ? EMAIL_COPY[ruleId] : undefined) ?? COPY[ruleId];
}

/** Every line of text the banner shows for a verdict. */
export interface BannerText {
  headline: string;
  /** One line per contributing rule that has evidence copy, in hit order. */
  evidence: string[];
  action: string | null;
  /** The ×'s accessible name: it silences what the dismissal key names (content/dismiss.ts) —
   *  the site, or in webmail mode the email's sender. */
  closeLabel: string;
}

/** The banner's text for a verdict (banner-ux-and-copy §2.4). Hits arrive red-first from the
 *  engine; the headline and action come from the strongest hit that actually carries them
 *  (modifier rules have empty headlines). */
export function bannerText(verdict: Verdict): BannerText {
  const copy = (ruleId: string) => copyFor(ruleId, verdict.surface);
  const hits = verdict.hits;
  const headlineHit = hits.find((h) => copy(h.ruleId)?.headline) ?? hits[0];
  const actionHit = hits.find((h) => copy(h.ruleId)?.action);
  return {
    headline: headlineHit ? fillTemplate(copy(headlineHit.ruleId)?.headline ?? '', headlineHit.vars) : '',
    evidence: hits.flatMap((h) => {
      const evidence = copy(h.ruleId)?.evidence;
      return evidence ? [fillTemplate(evidence, h.vars)] : [];
    }),
    action: actionHit ? fillTemplate(copy(actionHit.ruleId)!.action, actionHit.vars) : null,
    closeLabel: verdict.surface === 'email' ? 'Hide this for this sender' : 'Hide this for this site',
  };
}

/** Fills `{key}` placeholders in a template from a flat string map. Unknown keys are left as-is. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : whole,
  );
}
