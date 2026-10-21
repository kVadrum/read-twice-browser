// Cross-browser shim (architecture §9). Chrome and Firefox both expose MV3 APIs;
// Firefox aliases `chrome`, so we standardize on `chrome.*` and isolate any real
// divergence here rather than sprinkling `typeof browser` checks across the codebase.

/** Opens a URL in a new tab (used by the Send-to-Read-Twice hand-off). */
export function openInNewTab(url: string): void {
  void chrome.tabs?.create({ url });
}
