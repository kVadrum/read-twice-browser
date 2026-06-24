// Curated v0.1 detection data. INTERIM home — per architecture §3 / ADR-004 this
// data moves to the companion repo's lists/*.yaml and compiles in at build time.
//
// For RED rules the accuracy of these lists IS the precision (ADR-005 red criteria
// #1 impersonation-of-canonical and #3 no-legitimate-use phrases): the canonical
// allow-lists are the high-leverage mitigation against the existential red-FP. Lists
// are deliberately conservative; corpus calibration (heuristic-ruleset §4) tunes them.

/** `tld-elevated-risk`: abuse-heavy TLDs. Modifier only — never a standalone banner. */
export const ELEVATED_TLDS: readonly string[] = [
  'zip', 'top', 'xyz', 'click', 'support', 'link', 'country', 'work', 'gq', 'tk',
];

export interface BrandImpersonation {
  /** Lowercase token matched against host labels (hyphen/dot-bounded, not substring). */
  keyword: string;
  /** Name shown to the user. */
  display: string;
  /** The brand's real domain(s). A host on any of these is legitimate, not impersonation. */
  canonical: readonly string[];
}

/** `tld-impersonation`: a brand token in the host while NOT on the brand's real domain. */
export const BRAND_IMPERSONATION: readonly BrandImpersonation[] = [
  { keyword: 'irs', display: 'IRS', canonical: ['irs.gov'] },
  { keyword: 'usps', display: 'USPS', canonical: ['usps.com'] },
  { keyword: 'ssa', display: 'Social Security', canonical: ['ssa.gov'] },
  { keyword: 'medicare', display: 'Medicare', canonical: ['medicare.gov'] },
  { keyword: 'chase', display: 'Chase', canonical: ['chase.com'] },
  { keyword: 'wellsfargo', display: 'Wells Fargo', canonical: ['wellsfargo.com'] },
  { keyword: 'bankofamerica', display: 'Bank of America', canonical: ['bankofamerica.com'] },
  { keyword: 'paypal', display: 'PayPal', canonical: ['paypal.com'] },
  { keyword: 'venmo', display: 'Venmo', canonical: ['venmo.com'] },
  { keyword: 'cashapp', display: 'Cash App', canonical: ['cash.app'] },
  { keyword: 'zelle', display: 'Zelle', canonical: ['zellepay.com'] },
  { keyword: 'fedex', display: 'FedEx', canonical: ['fedex.com'] },
  { keyword: 'ups', display: 'UPS', canonical: ['ups.com'] },
  { keyword: 'dhl', display: 'DHL', canonical: ['dhl.com'] },
  { keyword: 'microsoft', display: 'Microsoft', canonical: ['microsoft.com'] },
  { keyword: 'apple', display: 'Apple', canonical: ['apple.com'] },
  { keyword: 'amazon', display: 'Amazon', canonical: ['amazon.com'] },
];

/** `scam-language-urgent` (yellow): exact phrases, not bare keywords (heuristic-ruleset §3.3). */
export const URGENCY_PHRASES: readonly string[] = [
  'account will be suspended',
  'act now or lose',
  'your computer is infected',
  'your account has been compromised',
  'verify your identity within',
  'you are required to call',
  'your subscription will be automatically renewed unless',
  'suspended within 24 hours',
  'immediate action is required',
  'final notice',
];

/** `scam-language-pressure` (red): phrases with essentially no legitimate use in context.
 *  Kept to specific multi-word forms ("gift cards only", not bare "gift cards") to hold
 *  the red-FP rate down. Compound co-occurrence checks (bitcoin+verify, wire+today) are a
 *  slice-2 refinement. */
export const PRESSURE_PHRASES: readonly string[] = [
  'gift cards only',
  'pay with gift cards',
  'do not tell anyone',
  'do not hang up',
  "don't hang up",
  'we will send a courier',
  'your social security number has been suspended',
  'social security number has been suspended',
];

/** News coverage of scams legitimately quotes pressure phrases — suppress red there. */
export const NEWS_DOMAINS_ALLOW: readonly string[] = [
  'nytimes.com', 'washingtonpost.com', 'apnews.com', 'reuters.com', 'bbc.com', 'bbc.co.uk',
  'wsj.com', 'npr.org', 'theguardian.com', 'cnn.com', 'forbes.com', 'bloomberg.com',
  'krebsonsecurity.com', 'aarp.org', 'ftc.gov',
];
