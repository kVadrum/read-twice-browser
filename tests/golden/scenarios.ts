import type { Verdict } from '../../src/lib/heuristics/rule-types';

// The banner states the golden lane photographs (testing-strategy §5). Each verdict is
// written in the shape the engine actually emits — hits red-first, ruleset order within a
// severity, elevation already applied (engine.ts) — so the harness renders a state the
// extension can really reach. They are literals rather than engine output on purpose: a
// golden pins how the banner DRAWS a verdict, so a rule-logic change must not churn it.
// Copy is part of what the banner draws, so a copy change must fail the lane — but pixels
// can't be trusted to see one (a period turned comma moves 2 at 100% zoom, and a collapsed
// state doesn't draw its details at all), so DRAWN_TEXT below pins the words exactly.
//
// Shared by the harness page (which mounts them) and the spec (which names the goldens).

export type ScenarioId = 'yellow-single' | 'red-single' | 'yellow-multi' | 'red-compositional' | 'yellow-email';

export const SCENARIOS: Readonly<Record<ScenarioId, Verdict>> = {
  // §4 ex. 12 shape: one yellow rule, its own headline, evidence and action.
  'yellow-single': {
    severity: 'yellow',
    hits: [{ ruleId: 'domain-age-young', severity: 'yellow', vars: { N: '11' } }],
  },
  // §4 ex. 1: the flagship red, impersonation of a canonical agency.
  'red-single': {
    severity: 'red',
    hits: [{ ruleId: 'government-impersonation', severity: 'red', vars: { agency: 'IRS', canonical: 'irs.gov' } }],
  },
  // §4 ex. 5 shape (young domain + urgency), plus the elevated-TLD modifier so the stack
  // includes a modifier's evidence line — the one hit kind that has no headline of its own.
  'yellow-multi': {
    severity: 'yellow',
    hits: [
      { ruleId: 'domain-age-young', severity: 'yellow', vars: { N: '11' } },
      { ruleId: 'tld-elevated-risk', severity: 'yellow', vars: { tld: 'top' } },
      { ruleId: 'scam-language-urgent', severity: 'yellow', vars: { matchedPhrase: 'final notice' } },
    ],
  },
  // §4 ex. 3: young domain + payment form posting off-site. Each lists the other in
  // `elevateWhen`, so both hits arrive already elevated to red (heuristic-ruleset §5).
  'red-compositional': {
    severity: 'red',
    hits: [
      { ruleId: 'domain-age-young', severity: 'red', vars: { N: '4' } },
      { ruleId: 'payment-form-anomaly', severity: 'red', vars: { actionHost: 'pay-secure-gateway.example' } },
    ],
  },
  // §4 ex. 9's USPS "redelivery fee", arriving as an email in webmail mode — the verdict the
  // engine emits for the webmail-yahoo-usps-fee corpus fixture. Every hit is capped at yellow
  // and `surface` makes the banner speak each rule's email copy; government-impersonation leads
  // because hits rank by the severity a rule was designed to have (engine.ts). The display name
  // arrives wrapped in Unicode isolates, as webmail-rules.ts emits it.
  'yellow-email': {
    severity: 'yellow',
    surface: 'email',
    hits: [
      { ruleId: 'government-impersonation', severity: 'yellow', vars: { agency: 'USPS', canonical: 'usps.com' } },
      {
        ruleId: 'sender-domain-mismatch',
        severity: 'yellow',
        vars: { brand: 'USPS', displayName: '\u2068USPS Delivery\u2069', fromDomain: 'usps-redelivery.example' },
      },
    ],
  },
};

/** The words the banner shows for a scenario, top to bottom. */
export interface DrawnText {
  headline: string;
  evidence: string[];
  action: string;
}

// Literals, never bannerText() output: an expectation computed by the code under test agrees
// with any copy change, which is exactly what this exists to catch. Each is copy.ts's template
// filled with its scenario's vars. A deliberate copy change edits copy.ts, the line here, and
// the goldens together (README → Regenerating).
export const DRAWN_TEXT: Readonly<Record<ScenarioId, DrawnText>> = {
  'yellow-single': {
    headline: 'This website is new — registered 11 days ago.',
    evidence: ['This website was registered 11 days ago.'],
    action: "Worth pausing if it's asking for money or personal information.",
  },
  'red-single': {
    headline: 'This page is pretending to be IRS.',
    evidence: ['This page is using the IRS name but is not on the real IRS website (irs.gov).'],
    action: "The real IRS doesn't collect payments through pages like this. Close this tab.",
  },
  'yellow-multi': {
    headline: 'This website is new — registered 11 days ago.',
    evidence: [
      'This website was registered 11 days ago.',
      "This website's address ends in .top, which is sometimes used in scams.",
      'This page uses the phrase "final notice", which is common in scams.',
    ],
    action: "Worth pausing if it's asking for money or personal information.",
  },
  'red-compositional': {
    headline: 'This website is new — registered 4 days ago.',
    evidence: [
      'This website was registered 4 days ago.',
      'This page is asking for payment information and the form sends it to "pay-secure-gateway.example".',
    ],
    action: "Worth pausing if it's asking for money or personal information.",
  },
  'yellow-email': {
    headline: 'This email uses the USPS name and asks for a payment.',
    evidence: [
      "This email mentions USPS, but it doesn't come from USPS's real email address.",
      'This email says it\'s from "\u2068USPS Delivery\u2069" but the actual sender\'s address is "usps-redelivery.example".',
    ],
    action: "The real USPS doesn't collect payments through emails like this — don't click or reply, and you can delete it.",
  },
};

/** Host the harness page pretends to be — feeds the dismissal record, never displayed. */
export const HARNESS_HOST = 'invoice-portal.example';
