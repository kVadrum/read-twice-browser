import { getSettings } from '../lib/storage/settings';
import { lookupDomainAge } from '../lib/rdap/client';
import type { RdapResult } from '../lib/heuristics/rule-types';

// Owns the single default outbound call. Honours the user's RDAP setting: when off,
// returns null so `domain-age-young` simply no-ops (ADR-006). The lookup itself is
// cached 30 days per domain inside lib/rdap.

export async function resolveDomainAge(host: string): Promise<RdapResult | null> {
  const { rdapEnabled } = await getSettings();
  if (!rdapEnabled) return null;
  return lookupDomainAge(host, Date.now());
}
