import type { Rule } from './rule-types';
import { COPY } from '../banner/copy';

// Webmail-surface rules (heuristic-ruleset §3.4). Active only when the content
// script is on a recognized webmail host (lists/webmail-hosts.yaml) and has
// populated ctx.features.webmail. Skeletons pending the v0.1 engine pass.

export const senderDomainMismatch: Rule = {
  id: 'sender-domain-mismatch',
  category: 'webmail',
  severity: 'yellow',
  // TODO: display name carries a brand keyword AND From: domain not in that brand's sender allow-list.
  evaluate: () => null,
  copy: COPY['sender-domain-mismatch']!,
};

export const replyToMismatch: Rule = {
  id: 'reply-to-mismatch',
  category: 'webmail',
  severity: 'yellow',
  // TODO: From: on a free webmail, Reply-To: on a different free webmail / unrelated domain.
  evaluate: () => null,
  copy: COPY['reply-to-mismatch']!,
};

export const webmailRules: readonly Rule[] = [senderDomainMismatch, replyToMismatch];
