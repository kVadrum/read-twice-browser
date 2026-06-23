import { hasWebNavigation } from '../lib/runtime/browser';

// Per-tab redirect chains, used by `redirect-chain-long`. Only populated when the
// optional `webNavigation` permission is present (NOT requested by default — see
// manifest.config note). Without it this is an empty map and the rule never fires.

const chains = new Map<number, string[]>();

export function getRedirectChain(tabId: number): string[] {
  return chains.get(tabId) ?? [];
}

export function registerNavigation(): void {
  if (!hasWebNavigation()) return; // graceful no-op
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return; // top frame only
    try {
      const host = new URL(details.url).hostname;
      const chain = chains.get(details.tabId) ?? [];
      chain.push(host);
      chains.set(details.tabId, chain);
    } catch {
      // unparseable URL — ignore
    }
  });
  chrome.tabs?.onRemoved.addListener((tabId) => chains.delete(tabId));
}
