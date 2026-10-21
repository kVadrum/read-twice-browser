import { firstMatch, headerValue, type OpenMessage, type VisibilityTest } from './dom';

// Gmail (mail.google.com). Confidence HIGH: every selector below is read from maintained
// production code with dated history — gmail.js (2014→2026), InboxSDK's selector registry
// (edited Oct 2026), FlowCrypt, Mailvelope, Trocker — plus a third-party live capture dated
// 2026-09-07. Not verified live by us; a miss degrades to "no open email" (silent).
const SEL = {
  // Thread views. Gmail keeps cached/hidden thread views in the DOM (gmail.js loops `.hP`
  // looking for the visible one), so only a VISIBLE view counts. Scoping to it also keeps
  // inbox rows out — they carry `span[email]` too.
  view: 'div[role="main"]',
  // An expanded message's inner element (gmail.js view_email / api.dom.email; InboxSDK's
  // `.h7` open message wraps it). Collapsed messages hold `.adf` instead.
  message: 'div.adn',
  // Sender: gmail.js `span[email].gD` (2014→2026 unchanged), then InboxSDK's senderSpan.
  // The `email` attribute is Gmail's parsed From address; `name` is the display name.
  sender: ['span.gD[email]', 'td.gF span[email]'],
  // Body: InboxSDK messageView.body `.ii.gt` (fallback `.adP`), then gmail.js's `.a3s`.
  body: ['div.ii.gt div.a3s', 'div.adP div.a3s', 'div.a3s'],
  // "Show details" rows. Confidence MEDIUM: present only after the USER opens details (the
  // absence before that is inferred from every reader clicking first, not proven). We read
  // them passively when present and never open them ourselves.
  detailRow: ['div.ajA tr', 'tr.ajv'],
  detailLabel: 'td.gG',
  detailValue: 'td.gL span[email]',
} as const;

// The details label is LOCALIZED; the non-English forms are the ones a 2019 userscript maps.
// An unlisted locale just means no Reply-To — the rule stays quiet.
const REPLY_TO_LABELS = new Set([
  'reply-to', 'reply to', 'antwoorden op', 'responder a', 'répondre à', 'rispondi a', 'adresa pro odpověď',
]);

export function readGmail(doc: Document, isVisible: VisibilityTest): OpenMessage | null {
  const messages = Array.from(doc.querySelectorAll(SEL.view))
    .filter(isVisible)
    .flatMap((view) => Array.from(view.querySelectorAll(SEL.message)))
    .filter((m) => isVisible(m) && bodyOf(m) != null);
  // Gmail auto-expands the newest message; gmail.js also takes the last `.adn`.
  const msg = messages.at(-1);
  if (!msg) return null;
  const body = bodyOf(msg)!;
  const outsideBody = (el: Element) => !body.contains(el);

  // Never read a sender out of the body: email HTML is the sender's own markup.
  const sender = firstMatch(msg, SEL.sender, outsideBody);
  if (!sender) return null;

  return {
    // data-message-id survives a just-sent reply; the legacy hex id can be absent until sync.
    id: `gmail:${msg.getAttribute('data-message-id') || msg.getAttribute('data-legacy-message-id') || `${doc.location.hash}#${messages.length}`}`,
    displayName: headerValue(sender.getAttribute('name') || sender.textContent),
    fromAddress: headerValue(sender.getAttribute('email')),
    replyToAddress: replyToOf(msg, outsideBody),
    body,
  };
}

/** The message's body, skipping inline reply drafts (contenteditable `.a3s`, which gmail.js
 *  filters out too). */
function bodyOf(msg: Element): Element | null {
  return firstMatch(msg, SEL.body, (el) => el.getAttribute('contenteditable') !== 'true');
}

function replyToOf(msg: Element, outsideBody: (el: Element) => boolean): string | null {
  for (const sel of SEL.detailRow) {
    for (const row of Array.from(msg.querySelectorAll(sel))) {
      if (!outsideBody(row)) continue;
      const label = (row.querySelector(SEL.detailLabel)?.textContent ?? '')
        .normalize('NFC')
        .toLowerCase()
        .replace(/[:：\s]+$/u, '')
        .trim();
      if (!REPLY_TO_LABELS.has(label)) continue;
      const address = headerValue(row.querySelector(SEL.detailValue)?.getAttribute('email'));
      if (address) return address;
    }
  }
  return null;
}
