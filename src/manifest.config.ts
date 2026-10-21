import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

// MV3 manifest, kept in lockstep with package.json's version so the binary never
// reports a version that lies (see workspace bump-audit policy). Permission set is
// deliberately minimal (architecture §7): storage, activeTab, scripting only, plus
// a single outbound host for RDAP. No tabs, no cookies, no webRequest.
//
// webNavigation is NOT requested, in any form (operator decision, 2026-10-21), so
// `redirect-chain-long` stays dormant: built, tested, never fed (background/navigation.ts).
// Basis, checked against Chromium source: webNavigation has no per-redirect event. For a
// server redirect it fires onBeforeNavigate for the start URL and onCommitted for the final
// one, flagged 'server_redirect' (Chromium test api_test/webnavigation/serverRedirect, one
// hop) — so a multi-hop chain's middle hops are, by that event model, never reported, and the
// rule's trigger ("3 or more hops", "{N} redirects") can't be computed from it. Only webRequest.onBeforeRedirect sees each hop, and webRequest is
// excluded above (permissions-and-privacy §2.2). The permission would buy nothing and still
// cost something: Chrome folds its warning into the all-sites one the content script
// already triggers (chrome_permission_message_rules.cc), but Firefox adds a prompt line.
// navigation.test.ts fails if either permission appears here, required or optional.
export default defineManifest({
  manifest_version: 3,
  name: 'Read Twice',
  short_name: 'Read Twice',
  version: pkg.version,
  description: 'A calm second eye for pages that look off.',
  icons: {
    16: 'src/assets/icons/16.png',
    48: 'src/assets/icons/48.png',
    128: 'src/assets/icons/128.png',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      // Keep our own properties banner-free.
      exclude_matches: ['https://*.readtwice.app/*', 'https://*.kvadrum.com/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  action: {
    default_popup: 'src/popup/popup.html',
    default_title: 'Read Twice',
  },
  options_ui: {
    page: 'src/options/options.html',
    open_in_tab: true,
  },
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['https://rdap.cloudflare.com/*'],
  web_accessible_resources: [
    { resources: ['src/assets/icons/*'], matches: ['<all_urls>'] },
  ],
});
