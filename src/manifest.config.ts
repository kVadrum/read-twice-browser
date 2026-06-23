import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

// MV3 manifest, kept in lockstep with package.json's version so the binary never
// reports a version that lies (see workspace bump-audit policy). Permission set is
// deliberately minimal (architecture §7): storage, activeTab, scripting only, plus
// a single outbound host for RDAP. No tabs, no cookies, no webRequest.
//
// NOTE: redirect-chain tracking (`redirect-chain-long`) wants `chrome.webNavigation`,
// which is NOT requested here on purpose — adding a sensitive permission is an operator
// decision, not a scaffold default. navigation.ts degrades gracefully without it.
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
