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
