// The Send-to-Read-Twice hand-off: the extension's single conversion mechanism to
// the paid mobile line (product-spec §5, banner-ux-and-copy §6). The payload is
// anonymous by design — no user identifier, ever. URL contract is deliberately
// app-agnostic so a future paid web verdict surface drops in without an extension update.

export const HANDOFF_BASE_URL = 'https://readtwice.app/send';
/** Page-text excerpt cap (banner-ux-and-copy §6.1). */
export const HANDOFF_EXCERPT_LIMIT = 2048;
/** Total hand-off URL must stay under this (banner-ux-and-copy §6.2). */
export const HANDOFF_URL_LIMIT = 8192;

/** v1 payload schema (banner-ux-and-copy §6.2). Field names are the wire contract — do not rename. */
export interface HandoffPayload {
  v: 1;
  url: string;
  rules_fired: string[];
  excerpt: string;
  /** ISO 8601 timestamp. */
  ts: string;
}

export interface HandoffInput {
  url: string;
  rulesFired: readonly string[];
  excerpt: string;
  /** ISO 8601 — supplied by the caller (keeps this module pure/testable). */
  timestamp: string;
}

export function buildHandoffPayload(input: HandoffInput): HandoffPayload {
  return {
    v: 1,
    url: input.url,
    rules_fired: [...input.rulesFired],
    excerpt: input.excerpt.slice(0, HANDOFF_EXCERPT_LIMIT),
    ts: input.timestamp,
  };
}

export function encodePayload(payload: HandoffPayload): string {
  const json = JSON.stringify(payload);
  return bytesToBase64Url(new TextEncoder().encode(json));
}

export function decodePayload(encoded: string): HandoffPayload {
  const json = new TextDecoder().decode(base64UrlToBytes(encoded));
  return JSON.parse(json) as HandoffPayload;
}

/** Builds the full hand-off URL. Throws if it would exceed HANDOFF_URL_LIMIT. */
export function buildHandoffUrl(input: HandoffInput): string {
  const url = `${HANDOFF_BASE_URL}?via=ext&payload=${encodePayload(buildHandoffPayload(input))}`;
  if (url.length > HANDOFF_URL_LIMIT) {
    throw new RangeError(`hand-off URL exceeds ${HANDOFF_URL_LIMIT} chars (${url.length})`);
  }
  return url;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
