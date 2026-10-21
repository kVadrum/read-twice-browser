// Email-address parsing for the webmail rules and the webmail dismissal key. Addresses
// arrive from the webmail page's DOM, which renders attacker-chosen headers, so this
// parses defensively and answers null rather than guessing. Deliberately PSL-free: the
// content script imports it, and the Public Suffix List stays worker-only.

export interface EmailAddress {
  /** Lowercased local part (case-insensitive in practice at every provider we read). */
  local: string;
  /** Lowercased ASCII (punycode) domain, no trailing dot. */
  domain: string;
}

const DOMAIN_CHARS = /^[\p{L}\p{N}.-]+$/u;
const ASCII_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Parses "local@domain", tolerating what real headers and DOM text carry:
 * `Display Name <addr>` (the LAST bracketed group wins — the display part is attacker text
 * and may itself contain a bracketed address), `mailto:`, uppercase, trailing dots, and
 * quoted local parts holding an `@` (the domain is after the LAST `@`). IDN domains come
 * back in punycode, the form every host comparison here uses. Anything else → null.
 */
export function parseEmailAddress(raw: string): EmailAddress | null {
  let s = raw.normalize('NFKC').trim();
  const bracketed = /<([^<>]*)>[^<>]*$/.exec(s);
  if (bracketed) s = bracketed[1]!.trim();
  s = s.replace(/^mailto:/i, '');

  const at = s.lastIndexOf('@');
  if (at <= 0 || at === s.length - 1) return null;
  const local = s.slice(0, at).toLowerCase();
  const rawDomain = s.slice(at + 1).replace(/\.+$/, '');
  // Character allow-list BEFORE handing the domain to the URL parser: "evil.example/x.com"
  // would otherwise parse as host evil.example plus a path, and an IP literal is no domain.
  if (!DOMAIN_CHARS.test(rawDomain)) return null;

  let domain: string;
  try {
    domain = new URL(`http://${rawDomain}`).hostname;
  } catch {
    return null;
  }
  if (!ASCII_DOMAIN.test(domain) || domain.length > 253) return null;
  // An all-numeric last label is an IPv4 address, not a mail domain.
  if (!/[a-z]/.test(domain.slice(domain.lastIndexOf('.') + 1))) return null;
  return { local, domain };
}

/** The address's domain, or null when it does not parse. */
export function emailDomain(raw: string): string | null {
  return parseEmailAddress(raw)?.domain ?? null;
}
