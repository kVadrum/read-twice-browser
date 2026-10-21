// Webmail hosts (heuristic-ruleset §3.4) — interim home for the companion repo's
// lists/webmail-hosts.yaml. Its own module, dependency-free, because the content script
// imports it to decide whether it is on a mail client: everything else in lists.ts is
// worker-only rule data, and one import of lists.ts from the content side puts all of it
// on every page the content script runs on. lists.ts re-exports this for the worker side.

export type WebmailProvider = 'gmail' | 'outlook' | 'yahoo';

/** Exact hostnames where the content script switches into webmail mode. AOL Mail
 *  (mail.aol.com) very likely runs the Yahoo app, but that is unverified — it stays out
 *  until a fixture proves its DOM matches. */
export const WEBMAIL_HOSTS: readonly { host: string; provider: WebmailProvider }[] = [
  { host: 'mail.google.com', provider: 'gmail' },
  { host: 'outlook.live.com', provider: 'outlook' }, // consumer
  { host: 'outlook.office.com', provider: 'outlook' }, // work/school
  { host: 'outlook.office365.com', provider: 'outlook' }, // work/school, older alias
  // Microsoft 365's work/school domain since the Nov 2025 migration (Message Center
  // MC1188995); Trocker had to add it in July 2026 after reports that only office.com worked.
  { host: 'outlook.cloud.microsoft', provider: 'outlook' },
  { host: 'mail.yahoo.com', provider: 'yahoo' },
];
