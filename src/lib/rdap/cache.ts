import type { RdapResult } from '../heuristics/rule-types';

// IndexedDB-backed RDAP cache. Aggressively cached 30 days per domain (ADR-006) so
// the one default outbound call fires at most once per domain per month. Skeleton.

export const RDAP_CACHE_TTL_DAYS = 30;

export interface RdapCacheEntry {
  host: string;
  result: RdapResult;
  /** Epoch ms when this entry goes stale. */
  expiresAt: number;
}

// TODO: implement against db.ts STORES.rdapCache.
export async function getCached(_host: string, _now: number): Promise<RdapResult | null> {
  return null;
}

export async function putCached(_host: string, _result: RdapResult, _now: number): Promise<void> {
  // no-op stub
}
