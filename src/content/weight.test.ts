import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

// The content script runs on every page, so everything it imports is weight on every page.
// Worker-only modules must never reach it: one value import from anywhere the entry reaches
// puts the whole module in the content script's chunk (Rollup never splits a module). Source
// graph, not the built chunk — a cheap guard; a build is still the measurement.

const ENTRY = resolve(__dirname, 'index.ts');
const WORKER_ONLY = {
  // Curated rule data — content needs only the webmail hosts, which live in webmail-hosts.ts.
  'src/lib/ruleset/lists.ts': 'worker-only rule data',
  // Pulls in tldts, the bundled Public Suffix List (~260 KB).
  'src/lib/heuristics/match.ts': 'the Public Suffix List',
};

/** Module specifiers a file imports for their values (type-only imports are erased). */
function valueImports(source: string): string[] {
  const out: string[] = [];
  const statement = /^\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;
  for (const m of source.matchAll(statement)) {
    if (m[5]) {
      out.push(m[5]); // side-effect import
      continue;
    }
    if (m[2]) continue; // import type / export type
    // `import { type A, type B }` is erased too; one value name keeps the whole module.
    const braced = /^\{([^}]*)\}$/.exec(m[3]!.trim());
    const names = braced?.[1]!.split(',').map((n) => n.trim()).filter(Boolean);
    if (!names?.every((n) => n.startsWith('type '))) out.push(m[4]!);
  }
  return out;
}

function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of valueImports(readFileSync(file, 'utf8'))) {
      if (!spec.startsWith('.')) {
        seen.add(spec); // a package
        continue;
      }
      const base = resolve(dirname(file), spec.replace(/\?.*$/, ''));
      const target = [base, `${base}.ts`, `${base}/index.ts`].find((p) => p.endsWith('.ts') && existsSync(p));
      if (target) visit(target);
    }
  };
  visit(entry);
  return new Set(Array.from(seen, (f) => (f.startsWith('/') ? relative(resolve(__dirname, '../..'), f) : f)));
}

describe('content script weight', () => {
  it('reaches no worker-only module', () => {
    const graph = reachable(ENTRY);
    // The walk itself works: it found the webmail adapters and the hosts they need.
    expect(graph).toContain('src/lib/ruleset/webmail-hosts.ts');
    for (const [file, what] of Object.entries(WORKER_ONLY)) expect(graph.has(file), `${file} (${what})`).toBe(false);
    expect(graph.has('tldts'), 'tldts').toBe(false);
  });
});
