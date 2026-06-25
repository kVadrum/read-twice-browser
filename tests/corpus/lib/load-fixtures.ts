import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { FixtureMeta, LoadedFixture } from './types';

// Loads every HTML+YAML fixture pair under fixtures/{scams,legit}/. Each `<id>.yaml`
// has a sibling `<id>.html` (the captured page body). Sorted for a stable report order.

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url));

export function loadFixtures(): LoadedFixture[] {
  const out: LoadedFixture[] = [];
  for (const sub of ['scams', 'legit'] as const) {
    const dir = join(FIXTURES_DIR, sub);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // directory not created yet
    }
    for (const file of entries.filter((f) => f.endsWith('.yaml')).sort()) {
      const base = file.slice(0, -'.yaml'.length);
      const meta = parse(readFileSync(join(dir, file), 'utf8')) as FixtureMeta;
      const html = readFileSync(join(dir, `${base}.html`), 'utf8');
      out.push({ meta, html });
    }
  }
  return out;
}
