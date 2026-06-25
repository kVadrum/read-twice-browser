import { loadRuleset } from '../../../src/lib/ruleset/loader';
import { evaluatePage } from '../../../src/lib/heuristics/engine';
import { RULESET_VERSION } from '../../../src/lib/ruleset/version';
import type { Severity, Verdict } from '../../../src/lib/heuristics/rule-types';
import { loadFixtures } from './load-fixtures';
import { buildContext } from './build-context';

export type ExpectedSeverity = Severity | 'none';

export interface FixtureResult {
  id: string;
  label: 'scam' | 'legit';
  expectedSeverity: ExpectedSeverity;
  expectedRules: string[];
  verdict: Verdict;
  firedRuleIds: string[];
}

/** Runs the loaded ruleset over every fixture and returns one result per fixture. */
export function runCorpus(): FixtureResult[] {
  const rules = loadRuleset();
  return loadFixtures().map((f) => {
    const verdict = evaluatePage(rules, buildContext(f.html, f.meta));
    return {
      id: f.meta.id,
      label: f.meta.label,
      expectedSeverity: f.meta.expected_severity ?? (f.meta.label === 'scam' ? 'yellow' : 'none'),
      expectedRules: f.meta.expected_rules ?? [],
      verdict,
      firedRuleIds: verdict.hits.map((h) => h.ruleId),
    };
  });
}

// Calibration targets (testing-strategy §3) — these apply at the full 100/100 corpus.
// On a seed corpus they are indicative only, printed for direction, never a hard gate.
const TARGETS = {
  scamAnyBanner: 0.7, // ≥
  scamRedBanner: 0.3, // ≥
  legitAnyBanner: 0.05, // ≤
  legitRedBanner: 0.01, // ≤
} as const;

/** Formats the §3 calibration report from a set of fixture results. */
export function calibrationReport(results: FixtureResult[]): string {
  const scams = results.filter((r) => r.label === 'scam');
  const legit = results.filter((r) => r.label === 'legit');
  const sev = (rs: FixtureResult[], s: ExpectedSeverity) =>
    rs.filter((r) => r.verdict.severity === s).length;

  const L: string[] = [];
  L.push(`Corpus calibration — ruleset v${RULESET_VERSION}`);
  L.push(`seed corpus: ${scams.length} scam / ${legit.length} legit fixtures`);
  L.push('─'.repeat(54));

  L.push(`Scams (${scams.length} fixtures):`);
  L.push(line('Any banner shown', sev(scams, 'red') + sev(scams, 'yellow'), scams.length, '≥', TARGETS.scamAnyBanner));
  L.push(line('Red banner shown', sev(scams, 'red'), scams.length, '≥', TARGETS.scamRedBanner));
  L.push(line('Yellow banner shown', sev(scams, 'yellow'), scams.length));
  L.push(line('Missed (silent)', sev(scams, 'none'), scams.length));
  L.push('');

  L.push(`Legit (${legit.length} fixtures):`);
  L.push(line('Any banner shown', sev(legit, 'red') + sev(legit, 'yellow'), legit.length, '≤', TARGETS.legitAnyBanner));
  L.push(line('Red banner shown', sev(legit, 'red'), legit.length, '≤', TARGETS.legitRedBanner));
  L.push(line('Yellow banner shown', sev(legit, 'yellow'), legit.length));
  L.push(line('Correctly silent', sev(legit, 'none'), legit.length));
  L.push('');

  L.push('Per-rule (TP on scams / FP on legit):');
  for (const rule of loadRuleset()) {
    const tp = scams.filter((r) => r.firedRuleIds.includes(rule.id)).length;
    const fp = legit.filter((r) => r.firedRuleIds.includes(rule.id)).length;
    if (tp + fp === 0) {
      L.push(`  ${rule.id.padEnd(28)} —  (not exercised by this seed)`);
      continue;
    }
    const precision = (tp / (tp + fp)).toFixed(2);
    L.push(`  ${rule.id.padEnd(28)} TP: ${String(tp).padStart(2)}  FP: ${String(fp).padStart(2)}  precision: ${precision}`);
  }

  const legitFP = legit.filter((r) => r.verdict.severity !== 'none');
  if (legitFP.length > 0) {
    L.push('');
    L.push('Legit fixtures that surfaced a banner (false positives):');
    for (const r of legitFP) {
      L.push(`  ${r.verdict.severity.toUpperCase().padEnd(7)} ${r.id}  [${r.firedRuleIds.join(', ')}]`);
    }
  }

  L.push('');
  L.push('Targets shown are the full-corpus gate (§3); seed numbers are indicative.');
  return L.join('\n');
}

function line(
  label: string,
  count: number,
  total: number,
  cmp?: '≥' | '≤',
  target?: number,
): string {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  const head = `  ${label}:`.padEnd(26) + `${String(count).padStart(3)}/${total}  (${String(pct).padStart(2)}%`;
  if (cmp == null || target == null) return head + ')';
  const ok = cmp === '≥' ? count / total >= target : count / total <= target;
  return `${head} — target ${cmp} ${Math.round(target * 100)}%)${ok ? '' : '  ⚠'}`;
}
