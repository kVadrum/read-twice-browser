import type { RdapResult } from '../heuristics/rule-types';
import { getCached, putCached } from './cache';

// RDAP lookup — the ONE outbound call the extension makes by default (ADR-006).
// Anonymous, no auth token, cached 30 days. Cloudflare's public RDAP is the working
// provider (handoff §8 open item: confirm ToS + rate limits before depending on it).
// Skeleton: cache wiring is sketched; the fetch + RDAP parsing land with the RDAP pass.

export const RDAP_ENDPOINT = 'https://rdap.cloudflare.com/rdap/v1/domain/';
/** The lookup races the page; past this it's skipped and domain-age-young no-ops (architecture §5). */
export const RDAP_SOFT_TIMEOUT_MS = 500;

const EMPTY: RdapResult = { registeredOn: null, ageDays: null };

export async function lookupDomainAge(host: string, now: number): Promise<RdapResult> {
  const cached = await getCached(host, now);
  if (cached) return cached;

  // TODO: fetch `${RDAP_ENDPOINT}${eTLDplus1}` with a 500ms soft timeout, parse
  // events[?eventAction='registration'].eventDate, compute ageDays. On any failure
  // return EMPTY so the dependent rule simply does not fire (never a silent error).
  // `host` arrives as the page's full hostname (PageFeatures.host): reduce it HERE, in the
  // worker, with match.ts registrableDomain() — both for the query (RDAP answers for
  // registered domains, and the full name would tell the provider more than it needs) and
  // for the cache key — never in the content script (content/extract.ts).
  const result = EMPTY;

  await putCached(host, result, now);
  return result;
}
