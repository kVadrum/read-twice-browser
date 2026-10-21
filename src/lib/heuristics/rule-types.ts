// The engine's type spine. The heuristic engine is the heart of the product
// (architecture §1), and it must stay auditable: a rule is plain data + a pure
// predicate over an EvaluationContext. No I/O lives in here.

export type Severity = 'yellow' | 'red';

/** A form on the page, reduced to only what rules read. */
export interface FormFeature {
  /** The full hostname the form posts to, or null when it posts to the page's own hostname
   *  (relative actions included) or declares no action. Rules that compare sites reduce it
   *  with registrableDomain() (match.ts), as payment-form-anomaly does. */
  actionHost: string | null;
  /** Lowercased `name` attributes of the form's inputs. */
  inputNames: string[];
  /** True when an input name matched the payment-field keyword list. */
  hasPaymentField: boolean;
}

/** Structured features extracted by the content script. Never the full page. They go to the
 *  worker and stay on the device: the one default outbound call (RDAP) carries only the
 *  site's domain name (ADR-006), and the Send-to-Read-Twice hand-off sends the URL and an
 *  excerpt only on the user's own click (content/render.ts). */
export interface PageFeatures {
  url: string;
  /** The page's full hostname as `location.hostname` gives it — mail.google.com, not
   *  google.com. Webmail detection matches it exactly, website dismissals key on it, and
   *  tld-impersonation reads brand tokens in its subdomains. Rules that need the registrable
   *  domain (eTLD+1) reduce it worker-side with registrableDomain() (match.ts), which keeps
   *  the Public Suffix List out of the content script. */
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

/** The email open in a webmail client (heuristic-ruleset §3.4). All of it is page data the
 *  sender controls — rules parse it defensively (email-address.ts). It is also the user's
 *  correspondence: read only from what the client already shows, and kept on the device
 *  like every other feature (PageFeatures). */
export interface WebmailFeatures {
  /** The webmail client's host (mail.google.com) — the same as PageFeatures.host. */
  host: string;
  /** The sender name the client shows. */
  displayName: string;
  /** The From address as the client parsed it; '' when the client hides it. */
  fromAddress: string;
  /** null unless the client already shows it — we never open anything to find it. */
  replyToAddress: string | null;
  /** The open email's body text, capped like PageFeatures.bodyExcerpt (which mirrors it). */
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
  /**
   * Hostnames of the redirect hops that led to this page, in arrival order — this
   * navigation's hops only, never earlier history in the tab — EXCLUDING this page's own
   * host. `['t.co', 'bit.ly', 'hop.example']` reads t.co → bit.ly → hop.example → this
   * page: N = 3 redirects. The page the link was clicked on is not a hop. Hosts are as
   * `URL.hostname` yields them (lowercase ASCII). A host repeated back-to-back (an
   * http→https upgrade) is one hop, so N is the length after collapsing such repeats.
   * Empty when untracked or when the user arrived directly (`redirect-chain-long`). In v0.1
   * it is always empty: nothing collects it, by decision (background/navigation.ts).
   */
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
  /** If ANY listed rule also fires on the page, this rule elevates to red (OR-of-list,
   *  heuristic-ruleset §5). A modifier partner never counts, elevation never chains, and
   *  webmail mode still caps the hit at yellow (engine.ts). */
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
  /** 'email' when the verdict judged the email open in a webmail client (§3.4), so the banner
   *  speaks of "this email", never "this page" or "this tab". Absent for a web page. */
  surface?: 'email';
}
