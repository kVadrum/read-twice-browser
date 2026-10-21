// The redirect chain behind `redirect-chain-long` (EvaluationContext.redirectChain).
// DORMANT BY DECISION (operator, 2026-10-21; basis in manifest.config.ts): v0.1 requests no
// permission that can see a redirect hop, so nothing collects a chain and every tab's is
// empty. The rule is built and tested; it is never fed. navigation.test.ts pins both halves.
//
// The webNavigation.onCommitted collector that used to live here was removed rather than
// left waiting on the permission, because granting webNavigation would have switched on a
// collector that breaks the redirectChain contract (rule-types.ts) three ways:
//  - it appended every top-frame commit for the tab's lifetime, typed and bookmarked
//    navigations included, so one shortened link early in a tab put "{N} redirects,
//    including t.co" on every later banner in that tab;
//  - it recorded the page's own host as a hop;
//  - it recorded only commits, and a server-side 3xx hop never commits, so the bit.ly in the
//    middle of a chain is exactly what it could not see.
// A collector that meets the contract starts over on each user-initiated navigation and
// records every hop as it happens. For a server redirect, only webRequest.onBeforeRedirect
// sees the hop, and webRequest is excluded by the privacy posture
// (permissions-and-privacy §2.2, ADR-006). Changing that is an operator decision, not a fix.

export function getRedirectChain(_tabId: number): string[] {
  return [];
}
