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
    const bases = entries.filter((f) => f.endsWith('.yaml')).map((f) => f.slice(0, -'.yaml'.length));
    const baseSet = new Set(bases);

    // Orphan-HTML guard: an .html with no .yaml sibling is never loaded, so it silently
    // never enters the truth set — a scam that looks "caught" because it was never tested.
    // That is the false-confidence failure the corpus exists to prevent, so fail loudly.
    for (const f of entries) {
      if (f.endsWith('.html') && !baseSet.has(f.slice(0, -'.html'.length))) {
        throw new Error(`Fixture ${sub}/${f} has no .yaml sibling — it would silently never be tested.`);
      }
    }

    for (const base of bases.sort()) {
      const meta = parse(readFileSync(join(dir, `${base}.yaml`), 'utf8')) as FixtureMeta;
      // The report and assertions key on meta.id; pairing is by filename. Divergence would
      // mislabel results with no detection — pin them together.
      if (meta.id !== base) {
        throw new Error(`Fixture ${sub}/${base}.yaml has id "${meta.id}"; it must match the filename "${base}".`);
      }
      const html = readFileSync(join(dir, `${base}.html`), 'utf8');
      out.push({ meta, html });
    }
  }
  return out;
}
