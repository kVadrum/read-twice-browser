import { describe, it, expect, beforeAll } from 'vitest';
import { runCorpus, calibrationReport, type FixtureResult } from './lib/calibrate';

// The corpus calibration run (testing-strategy §2–3). Lives outside the default
// `*.test.ts` glob (it needs jsdom + the full fixture set) and runs via its own config:
//   pnpm test:fixtures
// It prints the §3 report and enforces the two hard gates a seed corpus can stand on:
// no scam is missed, and no legit page draws a RED banner (the existential red-FP gate).
// The percentage targets are full-corpus gates — reported, not asserted, at seed size.

let results: FixtureResult[];

beforeAll(() => {
  results = runCorpus();
});

describe('corpus calibration', () => {
  it('loads fixtures and prints the calibration report', () => {
    // eslint-disable-next-line no-console
    console.log('\n' + calibrationReport(results) + '\n');
    expect(results.length).toBeGreaterThan(0);
  });

  it('surfaces a banner on every scam fixture (no missed scams)', () => {
    const missed = results.filter((r) => r.label === 'scam' && r.verdict.severity === 'none');
    expect(missed.map((r) => r.id)).toEqual([]);
  });

  it('draws no RED banner on any legit fixture (red-FP gate)', () => {
    const redFP = results.filter((r) => r.label === 'legit' && r.verdict.severity === 'red');
    expect(redFP.map((r) => r.id)).toEqual([]);
  });

  it('matches each scam fixture to its expected severity and rules', () => {
    for (const r of results.filter((r) => r.label === 'scam')) {
      expect(r.verdict.severity, `${r.id}: severity`).toBe(r.expectedSeverity);
      for (const ruleId of r.expectedRules) {
        expect(r.firedRuleIds, `${r.id}: expected rule "${ruleId}" to fire`).toContain(ruleId);
      }
    }
  });
});
