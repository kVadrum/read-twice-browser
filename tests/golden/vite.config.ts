import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Serves the golden harness page; Playwright's webServer starts it (playwright.config.ts
// owns the port). Deliberately not the extension's config: crxjs would demand a manifest
// and rewrite the entry points, and the harness needs neither. Plain Vite resolves the
// banner's `?inline` stylesheet the same way the production build does, so the page
// renders the real banner module.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('./harness', import.meta.url)),
  // Own cache, so alternating `pnpm dev` and the golden lane doesn't thrash one dep cache.
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite-golden', import.meta.url)),
  clearScreen: false,
  logLevel: 'warn',
  server: {
    // Loopback only: the harness is a test fixture, not something to expose on the LAN.
    host: '127.0.0.1',
    strictPort: true,
    // No hot updates, so a source edit mid-run can't swap the banner under a shot. That is
    // all this turns off: the page still loads /@vite/client, which opens its socket, and the
    // client's error overlay still shows on a transform error — one that fails every shot
    // anyway. (`ws: false` would drop the socket too; it is experimental in Vite 8.)
    hmr: false,
    // The harness root is tests/golden/harness, but it imports the banner from src/.
    fs: { allow: [repoRoot] },
  },
});
