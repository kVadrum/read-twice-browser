import type { Rule } from '../heuristics/rule-types';
import { urlRules } from '../heuristics/url-rules';
import { pageRules } from '../heuristics/page-rules';
import { contentRules } from '../heuristics/content-rules';
import { webmailRules } from '../heuristics/webmail-rules';

// Assembles the v0.1 ruleset for the engine.
//
// INTERIM: rules are defined as TypeScript modules. Per architecture §3 the eventual
// source of truth is YAML in the companion repo (kvadrum/read-twice-rules), compiled
// to these typed objects at build time (no runtime YAML parser in the bundle). When
// that pipeline lands, this loader reads the compiled bundle instead of importing the
// hand-written modules — the Rule shape and engine contract stay identical.
export function loadRuleset(): readonly Rule[] {
  return [...urlRules, ...pageRules, ...contentRules, ...webmailRules];
}
