import type { EvaluationContext, Rule, RuleHit, Verdict } from './rule-types';

/**
 * Evaluates the loaded ruleset against one page's context and aggregates a Verdict.
 *
 * Contract (non-negotiables, handoff §6):
 *  - The engine is PURE. All inputs arrive in the context; it performs no I/O.
 *  - It NEVER touches the DOM. It produces a verdict; the banner module renders it.
 *  - A rule that throws is logged and skipped — never a silent dropped verdict.
 *
 * Composition is one level deep (heuristic-ruleset §5): a rule with `elevateWhen`
 * becomes red iff ANY listed partner also fired (OR-of-list). We do not chain
 * elevations. OR (not AND) is the resolution of the spec's composition ambiguity —
 * it's the only reading under which the labeled worked examples come out right
 * (e.g. §4 ex.3: young + payment → red). See ADR-005 revision (2026-06-23).
 */
export function evaluatePage(
  rules: readonly Rule[],
  ctx: EvaluationContext,
  onRuleError: (ruleId: string, err: unknown) => void = defaultRuleErrorLog,
): Verdict {
  // Pass 1: collect which rules fired and the concrete values for their copy.
  const fired = new Map<string, { rule: Rule; vars: Record<string, string> }>();
  for (const rule of rules) {
    try {
      const signal = rule.evaluate(ctx);
      if (signal) fired.set(rule.id, { rule, vars: signal.vars });
    } catch (err) {
      onRuleError(rule.id, err);
    }
  }

  // Pass 2: resolve effective severity (apply one-level elevation).
  const firedIds = new Set(fired.keys());
  const hits: RuleHit[] = [];
  for (const { rule, vars } of fired.values()) {
    const elevated =
      rule.elevateWhen != null &&
      rule.elevateWhen.some((id) => firedIds.has(id));
    hits.push({
      ruleId: rule.id,
      severity: elevated ? 'red' : rule.severity,
      vars,
    });
  }

  // Modifier-only rules add evidence but never surface a banner alone. If the only
  // things that fired are modifiers, there is no banner.
  const substantive = hits.filter((h) => !isModifier(rules, h.ruleId));
  if (substantive.length === 0) return { severity: 'none', hits: [] };

  const severity: Verdict['severity'] = substantive.some((h) => h.severity === 'red')
    ? 'red'
    : 'yellow';

  // Order hits by severity (red first) so the banner's headline is the strongest hit.
  hits.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return { severity, hits };
}

function isModifier(rules: readonly Rule[], ruleId: string): boolean {
  return rules.find((r) => r.id === ruleId)?.modifier === true;
}

function severityRank(s: RuleHit['severity']): number {
  return s === 'red' ? 2 : 1;
}

function defaultRuleErrorLog(ruleId: string, err: unknown): void {
  // Local-only log. Never throws further; the page must still pass through.
  console.error(`[read-twice] rule "${ruleId}" threw and was skipped:`, err);
}
