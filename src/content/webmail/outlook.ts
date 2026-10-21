import { firstMatch, splitNameAndAddress, type OpenMessage, type VisibilityTest } from './dom';

// Outlook on the web (outlook.live.com, outlook.office.com, outlook.office365.com,
// outlook.cloud.microsoft). Confidence MEDIUM: maintained extensions (Trocker, TMetric,
// aziru — all 2026) plus smaller 2026 repos and a live capture dated 2026-09-07; message
// identity is LOW (no per-message attribute found anywhere). Not verified live by us.
const SEL = {
  // The reading pane (PhishLens, NudeNyang, …), then OWA's own conversation / single-item
  // containers (aziru load-tested both 2026-07-27). role=main is missing on
  // outlook.cloud.microsoft (defluff audit 2026-04-21), so we never rely on it.
  pane: ['[data-app-section="MailReadCompose"]', '#ConversationReadingPaneContainer', '#ItemReadingPaneContainer'],
  // An EXPANDED message body. The id is language-neutral and outlived several redesigns. A
  // bare [role=document] would also match the signature/collapsed block that copies the
  // body's role and label without the id — so the id prefix is the whole selector.
  body: '[id^="UniqueMessageBody"]',
  // Sender text "Name<addr>". The MSG_…_FROM id (PhishLens) is attribute-based; `.OZZZK`
  // and the persona hover target are hashed/library classes stable 2023-07 → 2026-09.
  sender: [
    '[id^="MSG_"][id$="_FROM"] .OZZZK',
    '[id^="MSG_"][id$="_FROM"]',
    'span.lpcCommonWeb-hoverTarget .OZZZK',
    '.OZZZK',
  ],
  // A message card holding an inline reply is a draft, not the email being read.
  draft: '[contenteditable="true"]',
} as const;

export function readOutlook(doc: Document, isVisible: VisibilityTest): OpenMessage | null {
  const pane = firstMatch(doc, SEL.pane, isVisible);
  if (!pane) return null;
  const bodies = Array.from(pane.querySelectorAll(SEL.body)).filter(isVisible);

  // The LAST expanded, non-draft message in the pane is the one being read (PhishLens
  // `olCurrentMessage`).
  for (let i = bodies.length - 1; i >= 0; i--) {
    const body = bodies[i]!;
    const card = cardOf(body, pane);
    if (!card || card.querySelector(SEL.draft)) continue;
    const sender = firstMatch(card, SEL.sender, (el) => !body.contains(el));
    if (!sender) continue;
    const { name, address } = splitNameAndAddress(sender.textContent ?? '');
    // For senders inside the user's own Microsoft 365 org, OWA shows only the name (the
    // address lives in the hover card) — fromAddress stays '' and the sender rule abstains.
    if (!name && !address) continue;
    return {
      // The UniqueMessageBody_<n> suffix is a render counter, not an identity; the route
      // carries the item id, and the index separates messages within one conversation.
      id: `outlook:${doc.location.pathname}#${i}`,
      displayName: name,
      fromAddress: address,
      // Not shown in the reading-pane header (medium-low confidence); only behind
      // "View message details", which we never open.
      replyToAddress: null,
      body,
    };
  }
  return null;
}

/**
 * The message card a body belongs to: its nearest ancestor (within the pane) that also
 * holds a sender. If that ancestor holds a second body, the sender can't be attributed to
 * THIS body — answer null rather than pair one email's text with another's sender.
 */
function cardOf(body: Element, pane: Element): Element | null {
  for (let n = body.parentElement; n && pane.contains(n); n = n.parentElement) {
    if (!firstMatch(n, SEL.sender, (el) => !body.contains(el))) continue;
    return n.querySelectorAll(SEL.body).length === 1 ? n : null;
  }
  return null;
}
