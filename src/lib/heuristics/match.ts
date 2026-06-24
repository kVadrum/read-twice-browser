// Pure matchers shared by the rules. Kept tiny and side-effect-free so they're
// trivially testable and the rules read declaratively.

/** Last dot-label of a hostname, lowercased. Approximates the TLD — fine for the
 *  single-suffix TLDs (.com/.gov/.top) the v0.1 lists use; a public-suffix list
 *  replaces this for multi-part suffixes (.co.uk) in a later pass. */
export function tldOf(host: string): string {
  const labels = host.toLowerCase().split('.');
  return labels[labels.length - 1] ?? '';
}

/** True if `host` IS `domain` or a subdomain of it — i.e. legitimately on that domain. */
export function isOnDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith('.' + d);
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
