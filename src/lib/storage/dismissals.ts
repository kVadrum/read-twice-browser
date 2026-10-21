// Dismissal records, per site — or, in webmail mode, per sender. Dismissing on example.com
// suppresses the banner on example.com for 30 days; it does NOT suppress on
// lookalike-example.com (product-spec §7.6). Skeleton — wiring lands with the storage pass.
//
// The key is content/dismiss.ts dismissalKey(), resolved once on the content side: the
// page's full hostname on a website (architecture §5 and testing-strategy §4.4 disagree on
// eTLD+1; reducing it is the storage pass's call, never the content script's), and in webmail
// mode the open email's sender —
// "mail:local@domain", or "mail:name:<display name>" when the client hides the address — so
// one sender's dismissal never silences the whole mail client. A sender key is the user's
// correspondence: who wrote to them. Never store the plain key. A plain hash only keeps it
// out of plain text: hostnames and addresses are guessable, so anyone with a dump can hash a
// top-sites list or a suspected correspondent and confirm the match. Not anonymisation. A
// keyed hash (HMAC) resists that only for a dump that doesn't also hold the key, so the key
// can't simply sit in the same IndexedDB.

export const DISMISSAL_TTL_DAYS = 30;

export interface DismissalRecord {
  /** Hash (hex) of the dismissal key — a hostname, or a "mail:…" sender key in webmail
   *  mode. Never the plain key (see above for what a hash does and doesn't hide). */
  host: string;
  /** Epoch ms when this dismissal expires. */
  expiresAt: number;
}

// TODO: implement against db.ts STORES.dismissals.
export async function isDismissed(_key: string, _now: number): Promise<boolean> {
  return false;
}

export async function recordDismissal(_key: string, _now: number): Promise<void> {
  // no-op stub
}
