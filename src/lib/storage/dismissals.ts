// Per-domain dismissal records. Dismissing on example.com suppresses the banner on
// example.com for 30 days; it does NOT suppress on lookalike-example.com (product-spec §7.6).
// Keyed by eTLD+1 with a TTL. Skeleton — wiring lands with the storage pass.

export const DISMISSAL_TTL_DAYS = 30;

export interface DismissalRecord {
  host: string;
  /** Epoch ms when this dismissal expires. */
  expiresAt: number;
}

// TODO: implement against db.ts STORES.dismissals.
export async function isDismissed(_host: string, _now: number): Promise<boolean> {
  return false;
}

export async function recordDismissal(_host: string, _now: number): Promise<void> {
  // no-op stub
}
