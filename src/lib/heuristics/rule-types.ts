// The engine's type spine. The heuristic engine is the heart of the product
// (architecture §1), and it must stay auditable: a rule is plain data + a pure
// predicate over an EvaluationContext. No I/O lives in here.

export type Severity = 'yellow' | 'red';

/** A form on the page, reduced to only what rules read. */
export interface FormFeature {
  /** eTLD+1 the form posts to, or null when same-site / relative. */
  actionHost: string | null;
  /** Lowercased `name` attributes of the form's inputs. */
  inputNames: string[];
  /** True when an input name matched the payment-field keyword list. */
  hasPaymentField: boolean;
}

/** Structured features extracted by the content script. Never the full page. */
export interface PageFeatures {
  url: string;
  /** eTLD+1 of the page. */
  host: string;
  /** Body text excerpt, capped (architecture §5: 16KB). */
  bodyExcerpt: string;
  forms: FormFeature[];
  /** Brand keywords detected by simple keyword match. */
  brandMentions: string[];
  /** Phone numbers (US/CA E.164 and common variants) found in text. */
  phoneNumbers: string[];
  /** Outbound link hrefs. */
  linkTargets: string[];
  /** Present only on a recognized webmail host. */
  webmail?: WebmailFeatures;
}

export interface WebmailFeatures {
  host: string;
  displayName: string;
  fromAddress: string;
  replyToAddress: string | null;
  bodyExcerpt: string;
}

export interface RdapResult {
  /** ISO date of the domain's registration event, or null if unknown. */
  registeredOn: string | null;
  /** Whole days since registration, or null when the lookup was skipped/failed. */
  ageDays: number | null;
}

/** Everything a rule may read. Assembled by the worker; the engine is pure over it. */
export interface EvaluationContext {
  features: PageFeatures;
  /** Hostnames, in arrival order, that led here (empty when untracked). */
  redirectChain: string[];
  /** null when RDAP was disabled, skipped, or timed out. */
  rdap: RdapResult | null;
  /** Hosts the user has dismissed (informational; suppression happens upstream). */
  dismissedHosts: string[];
}

/**
 * A rule's predicate result. Returning a value means "I fired". `vars` holds the
 * concrete page values that fill this rule's copy `{placeholders}` (e.g. `{N: "4"}`
 * for a 4-day-old domain); use `{}` when the copy has none. Severity is resolved by
 * the engine (base severity + any elevation), not by the predicate.
 */
export interface RuleSignal {
  vars: Record<string, string>;
}

export interface RuleCopy {
  /** One-line warning in Read Twice voice. */
  headline: string;
  /** Template explanation of what tripped, with {placeholders}. */
  evidence: string;
  /** One-line recommended action. */
  action: string;
}

export interface Rule {
  /** kebab-case, stable, never renamed (users reference it in feedback). */
  id: string;
  category: 'url' | 'page' | 'content' | 'webmail';
  /** Default severity when triggered; may elevate to red via `elevateWhen`. */
  severity: Severity;
  /**
   * Modifier-only rules (e.g. `tld-elevated-risk`, `redirect-chain-long`) never
   * surface a banner alone — they only add an evidence line when a real rule fires.
   */
  modifier?: boolean;
  /** Pure predicate over the context. Returns a signal or null. Must not throw on bad data. */
  evaluate: (ctx: EvaluationContext) => RuleSignal | null;
  copy: RuleCopy;
  knownFalsePositives?: string[];
  /** If every listed rule also fires on the page, this rule elevates to red. One level only. */
  elevateWhen?: string[];
}

export interface RuleHit {
  ruleId: string;
  /** Effective severity after elevation. */
  severity: Severity;
  /** Concrete values that fill this rule's copy placeholders (banner-side). */
  vars: Record<string, string>;
}

export interface Verdict {
  severity: Severity | 'none';
  hits: RuleHit[];
}
