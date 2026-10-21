import type { EvaluationContext, PageFeatures, Rule, RuleHit, Severity, Verdict } from './rule-types';
import { WEBMAIL_HOSTS, USER_CONTENT_HOSTS } from '../ruleset/lists';
import { isOnDomain } from './match';

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
 *
 * Webmail mode and pages anyone can write on a brand's own server cap every hit at yellow
 * (see capsAtYellow).
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

  // Pass 2: resolve effective severity (apply one-level elevation, then the webmail cap).
  const firedIds = new Set(fired.keys());
  const modifierIds = new Set(rules.filter((r) => r.modifier).map((r) => r.id));
  const yellowOnly = capsAtYellow(ctx.features);
  const ranked: { hit: RuleHit; designed: Severity }[] = [];
  for (const { rule, vars } of fired.values()) {
    // Elevate to red if any NON-modifier partner also fired. Modifiers add evidence
    // but must never push a verdict to red — including by elevating someone else.
    const elevated =
      rule.elevateWhen != null &&
      rule.elevateWhen.some((id) => firedIds.has(id) && !modifierIds.has(id));
    const designed: Severity = elevated ? 'red' : rule.severity;
    ranked.push({ hit: { ruleId: rule.id, severity: yellowOnly ? 'yellow' : designed, vars }, designed });
  }

  // Modifier-only rules add evidence but never surface a banner alone. If the only
  // things that fired are modifiers, there is no banner.
  const hits = ranked.map((r) => r.hit);
  const substantive = hits.filter((h) => !modifierIds.has(h.ruleId));
  if (substantive.length === 0) return { severity: 'none', hits: [] };

  const severity: Verdict['severity'] = substantive.some((h) => h.severity === 'red')
    ? 'red'
    : 'yellow';

  // Order hits by severity (red first) so the banner's headline is the strongest hit. Ranked
  // by the severity the rule was designed to have, so under the webmail cap the headline is
  // still the most specific hit (pressure before urgency), not just the first in ruleset order.
  ranked.sort((a, b) => severityRank(b.designed) - severityRank(a.designed));
  return {
    severity,
    hits: ranked.map((r) => r.hit),
    ...(ctx.features.webmail ? { surface: 'email' as const } : {}),
  };
}

/**
 * True in webmail mode (and on USER_CONTENT_HOSTS, below), where no hit may be red. Heuristic-ruleset §4: new rules and surfaces
 * ship yellow until corpus calibration shows ≥ 95% precision, and there is no legit-email
 * corpus yet — while the rules' red criteria were written for web pages, where the brand's own
 * domain is the page host, and email bodies are where anti-fraud advice, scam warnings and
 * invoices naming an agency show up all the time. ADR-005: a red on a legitimate page is the
 * existential failure, and if we're not very sure, we say yellow. The banner still shows, so
 * detection is unchanged; only the severity is capped.
 *
 * Applied once, here, rather than in each rule, so a red rule added later can't forget it. On
 * a webmail client with no email open (an inbox list), extraction carries no text, but the
 * page is still the mail client — so the client's own host caps too, not only an open email.
 */
function capsAtYellow(features: PageFeatures): boolean {
  if (features?.webmail != null) return true;
  const host = String(features?.host ?? '').toLowerCase();
  if (WEBMAIL_HOSTS.some((w) => w.host === host)) return true;
  // A Sway, Form or Loop page: the brand's server, anyone's words. It never exempts a rule
  // (origin.ts), so a scam there still draws a banner, but a red by construction assumes we
  // know who wrote the page — and organisations publish their own IT notices there daily.
  return USER_CONTENT_HOSTS.some((d) => isOnDomain(host, d));
}

function severityRank(s: Severity): number {
  return s === 'red' ? 2 : 1;
}

function defaultRuleErrorLog(ruleId: string, err: unknown): void {
  // Local-only log. Never throws further; the page must still pass through.
  console.error(`[read-twice] rule "${ruleId}" threw and was skipped:`, err);
}
