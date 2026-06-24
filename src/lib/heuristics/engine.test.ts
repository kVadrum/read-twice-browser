import { describe, it, expect, vi } from 'vitest';
import { evaluatePage } from './engine';
import type { Rule, EvaluationContext } from './rule-types';

// A context where exactly the rules whose id is in `ids` will fire. Keeps these
// tests focused on the engine's composition mechanics, independent of real rules.
function ctxFiring(ids: string[]): EvaluationContext {
  return {
    features: {
      url: 'https://x.example',
      host: 'x.example',
      bodyExcerpt: '',
      forms: [],
      brandMentions: ids,
      phoneNumbers: [],
      linkTargets: [],
    },
    redirectChain: [],
    rdap: null,
    dismissedHosts: [],
  };
}

function rule(id: string, severity: 'yellow' | 'red', extra: Partial<Rule> = {}): Rule {
  return {
    id,
    category: 'content',
    severity,
    evaluate: (ctx) => (ctx.features.brandMentions.includes(id) ? { vars: {} } : null),
    copy: { headline: '', evidence: '', action: '' },
    ...extra,
  };
}

describe('evaluatePage composition', () => {
  it('elevates to red when ANY listed partner fires (OR-of-list)', () => {
    const rules = [rule('a', 'yellow', { elevateWhen: ['b'] }), rule('b', 'yellow')];
    const v = evaluatePage(rules, ctxFiring(['a', 'b']));
    expect(v.severity).toBe('red');
    expect(v.hits.find((h) => h.ruleId === 'a')?.severity).toBe('red');
  });

  it('does NOT require all partners — this is the OR-vs-AND regression', () => {
    // `a` elevates on [b, c]; only `c` fires alongside it. OR → red; AND would be yellow.
    const rules = [rule('a', 'yellow', { elevateWhen: ['b', 'c'] }), rule('b', 'yellow'), rule('c', 'yellow')];
    const v = evaluatePage(rules, ctxFiring(['a', 'c']));
    expect(v.severity).toBe('red');
  });

  it('stays yellow when no listed partner fires', () => {
    const rules = [rule('a', 'yellow', { elevateWhen: ['b'] }), rule('b', 'yellow')];
    const v = evaluatePage(rules, ctxFiring(['a']));
    expect(v.severity).toBe('yellow');
    expect(v.hits.find((h) => h.ruleId === 'a')?.severity).toBe('yellow');
  });
});

describe('evaluatePage modifiers', () => {
  it('does not surface a banner when only a modifier fires', () => {
    const v = evaluatePage([rule('m', 'yellow', { modifier: true })], ctxFiring(['m']));
    expect(v.severity).toBe('none');
    expect(v.hits).toEqual([]);
  });

  it('includes a modifier hit when a substantive rule also fires', () => {
    const rules = [rule('a', 'yellow'), rule('m', 'yellow', { modifier: true })];
    const v = evaluatePage(rules, ctxFiring(['a', 'm']));
    expect(v.severity).toBe('yellow');
    expect(v.hits.map((h) => h.ruleId).sort()).toEqual(['a', 'm']);
  });

  it('does not let a modifier elevate another rule to red', () => {
    // `a` lists modifier `m` as an elevation partner; both fire. `m` is a modifier, so
    // it must not push the verdict to red on its own.
    const rules = [rule('a', 'yellow', { elevateWhen: ['m'] }), rule('m', 'yellow', { modifier: true })];
    const v = evaluatePage(rules, ctxFiring(['a', 'm']));
    expect(v.severity).toBe('yellow');
  });
});

describe('evaluatePage robustness + ordering', () => {
  it('logs and skips a throwing rule rather than dropping the verdict silently', () => {
    const boom: Rule = {
      ...rule('boom', 'yellow'),
      evaluate: () => {
        throw new Error('rule blew up');
      },
    };
    const onErr = vi.fn();
    const v = evaluatePage([boom, rule('ok', 'yellow')], ctxFiring(['ok']), onErr);
    expect(onErr).toHaveBeenCalledWith('boom', expect.any(Error));
    expect(v.hits.map((h) => h.ruleId)).toContain('ok');
    expect(v.severity).toBe('yellow');
  });

  it('orders red hits first so the banner headline is the strongest hit', () => {
    const v = evaluatePage([rule('y', 'yellow'), rule('r', 'red')], ctxFiring(['y', 'r']));
    expect(v.hits[0]!.ruleId).toBe('r');
  });
});
