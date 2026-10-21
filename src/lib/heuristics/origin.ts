import type { PageFeatures } from './rule-types';
import { isOnDomain } from './match';
import { parseEmailAddress, type EmailAddress } from './email-address';
import { USER_CONTENT_HOSTS } from '../ruleset/lists';

/**
 * True when the text being judged comes from an allow-listed entity (a news publisher, an
 * agency, a brand, a tax-prep company) — for the rules' exemptions. Each allow-list has two
 * paths, because a website and an email prove where they come from differently:
 *
 * - `hosts` (off webmail): the page host. A browser only shows a page on a domain whose
 *   owner serves it, so an entity's websites are its hosts — except where that owner serves
 *   pages anyone writes (USER_CONTENT_HOSTS).
 * - `senders` (webmail mode): the email's From. The page host is the mail client, which
 *   wrote none of the email — matching it too would let any list entry the client happens
 *   to sit on exempt every email read there (outlook.live.com is on live.com, a Microsoft web
 *   domain). A From header, though, is the sender's own claim: it only means something where
 *   the domain's DMARC policy makes receivers refuse or quarantine a spoof. So a sender list
 *   holds only domains whose DMARC enforces at the level the entry matches, each with its
 *   measured basis (lists.ts) — never simply the host list again. canada.ca is the CRA's real
 *   website and a host, but its DMARC is p=none, so as a sender it proves nothing.
 *
 * Without the sender path every allow-list is dead in webmail mode: an AARP fraud-watch
 * newsletter quoting "do not tell anyone", or an irs.gov notice with a payment link, would
 * draw the banner its own website never gets.
 *
 * Exemption-only: an origin can silence a rule, never make one fire.
 */
export function contentIsFrom(
  features: PageFeatures,
  hosts: readonly string[],
  senders: readonly string[],
): boolean {
  if (features.webmail) return mailIsFrom(features, senders);
  const host = String(features.host ?? '');
  // An entity's own server, but anyone's page (a Sway on sway.cloud.microsoft).
  if (USER_CONTENT_HOSTS.some((d) => isOnDomain(host, d))) return false;
  return hosts.some((d) => isOnDomain(host, d));
}

/**
 * True when the open email is from one of `senders` (entry forms: sendsAs). False off
 * webmail. Sender lists never hold a domain where anyone can get a mailbox (free webmail,
 * shared hosting) — a test pins it — so no free-webmail check is needed here; one would also
 * reject the narrow Apple-owned insideicloud.icloud.com. Exemption-only, as contentIsFrom.
 */
export function mailIsFrom(features: PageFeatures, senders: readonly string[]): boolean {
  if (!features.webmail) return false;
  const from = parseEmailAddress(String(features.webmail.fromAddress ?? ''));
  return from != null && senders.some((s) => sendsAs(from, s));
}

/**
 * A sender entry is one of:
 * - `domain` — that domain or any subdomain (its DMARC must cover subdomains: no sp=none);
 * - `@domain` — that exact domain only (DMARC enforced on it, but not on its subdomains);
 * - `local@domain` — one exact address.
 */
export function sendsAs(from: EmailAddress, entry: string): boolean {
  const e = entry.toLowerCase();
  const at = e.lastIndexOf('@');
  if (at === -1) return isOnDomain(from.domain, e);
  if (at === 0) return from.domain === e.slice(1);
  return `${from.local}@${from.domain}` === e;
}
