import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.config';

// Production build is plain Vite + crxjs's manifest handling. The crxjs plugin's
// HMR is a dev-only convenience (see ADR-002); nothing about the shipped bundle
// depends on it. Output is `dist/` ready to zip for store submission.
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Bundle size is a feature (architecture §1.7): v0.1 target <250KB zipped.
    target: 'es2022',
  },
});
