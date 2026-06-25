// Pure matchers shared by the rules. Kept tiny and side-effect-free so they're
// trivially testable and the rules read declaratively.
//
// `tldOf` / `registrableDomain` resolve the real public suffix via the bundled Public
// Suffix List (tldts), so multi-part suffixes are handled correctly — `attacker.co.uk`
// and `shop.example.co.uk` are NOT the same registrable domain. We use tldts's default
// ICANN-only section: private suffixes (github.io, herokuapp.com) are deliberately NOT
// treated as registrable boundaries, so two subdomains of a shared host read same-site
// — the precision-first choice (no payment-anomaly false-positives on shared hosting).
import { getDomain, getPublicSuffix } from 'tldts';

/** The host's public suffix (eTLD) per the PSL — "co.uk", "top", "gov". tldts returns
 *  the trailing label even for unlisted TLDs; null only for IPs / empty, where we fall
 *  back to the last label. */
export function tldOf(host: string): string {
  return getPublicSuffix(host) ?? (host.toLowerCase().split('.').pop() ?? '');
}

/** True if `host` IS `domain` or a subdomain of it — i.e. legitimately on that domain. */
export function isOnDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith('.' + d);
}

/** The host's registrable domain (eTLD+1) per the PSL — "example.co.uk". Tells a same-site
 *  (cross-subdomain) form post from a genuinely cross-domain one. null only for IPs / empty,
 *  where we fall back to the whole host so distinct IPs stay distinct (never falsely same-site). */
export function registrableDomain(host: string): string {
  return getDomain(host) ?? host.toLowerCase();
}

/**
 * True if a hyphen/underscore/dot-delimited token of the host exactly equals `brand`.
 * Token equality (not substring) is the FP guard: `chase-verify.com` matches "chase",
 * but `purchase.com` and `groups.io` do not match "chase"/"ups".
 */
export function hostHasBrandToken(host: string, brand: string): boolean {
  return host
    .toLowerCase()
    .split('.')
    .flatMap((label) => label.split(/[-_]/))
    .includes(brand.toLowerCase());
}

/** Case-insensitive exact-phrase (substring) match. */
export function textHasPhrase(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

/** Case-insensitive whole-word/phrase match with word boundaries — for acronyms ("IRS")
 *  and names ("Internal Revenue Service") so they don't match inside longer words. */
export function textHasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i').test(text);
}

/** True if `phrase` occurs within the top `fraction` of the text — approximates "near the
 *  top of the page" (the headline area), with a floor so short pages still match a header. */
export function textHasPhraseNearTop(text: string, phrase: string, fraction = 0.3): boolean {
  const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx === -1) return false;
  return idx < Math.max(1500, Math.floor(text.length * fraction));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
