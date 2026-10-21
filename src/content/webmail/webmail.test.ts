import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { webmailProviderFor, findOpenMessage, toWebmailFeatures, messageSignature } from './index';
import { extractPageFeatures } from '../extract';
import { mailIsFrom } from '../../lib/heuristics/origin';

// Synthetic client DOM, shaped after the research skeletons (selectors read from gmail.js,
// InboxSDK, Trocker, Mailvelope and a dated live capture). jsdom has no layout, so
// visibility comes from the markup fallback (display:none / hidden) unless a test injects it.

function doc(url: string, body: string): Document {
  const { window } = new JSDOM(`<!doctype html><body>${body}</body>`, { url });
  // jsdom lacks innerText; textContent is enough here (the corpus harness models it closer).
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent;
    },
  });
  return window.document as unknown as Document;
}

const GMAIL_URL = 'https://mail.google.com/mail/u/0/#inbox/FMfcgzQXJwExampleThreadTokenAbcd';

const gmailDetails = (replyTo: string, label = 'reply-to:') => `
  <div class="ajA SK"><table class="ajC"><tbody>
    <tr class="ajv"><td class="gG"><span class="gI">from:</span></td><td class="gL"><span class="gI"><span class="gD" email="billing@examp1e-pay.example" name="PayPal Billing">PayPal Billing</span></span></td></tr>
    <tr class="ajv"><td class="gG"><span class="gI">${label}</span></td><td class="gL"><span class="gI"><span email="${replyTo}">${replyTo}</span></span></td></tr>
    <tr class="ajv"><td class="gG"><span class="gI">to:</span></td><td class="gL"><span class="gI"><span email="me@example.com">me@example.com</span></span></td></tr>
  </tbody></table></div>`;

function gmailThread({ details = '', bodyExtra = '', hidden = false, id = '#msg-f:1812595164201674230' } = {}): string {
  return `
  <div role="main"${hidden ? ' style="display:none"' : ''}>
    <div class="nH a98 iY">
      <div class="ha"><h2 class="hP">Action required: your account is on hold</h2></div>
      <div role="list">
        <div role="listitem" class="kv">
          <div class="adf ads" data-message-id="#msg-f:1812595164201672704">
            <span class="gD" email="pat@example.org" name="Pat Example">Pat Example</span>
          </div>
        </div>
        <div role="listitem" class="h7">
          <div class="adn ads" data-message-id="${id}" data-legacy-message-id="1927a1b2c3d4e5f6">
            <div class="gs">
              <table class="cf gJ"><tbody><tr class="acZ"><td class="gF gK">
                <h3 class="iw"><span class="qu"><span class="gD" email="billing@examp1e-pay.example" name="PayPal Billing"><span>PayPal Billing</span></span>
                <span class="go">&lt;billing@examp1e-pay.example&gt;</span></span></h3>
              </td></tr></tbody></table>
              ${details}
              <div class="ii gt m1927a1b2c3d4e5f6"><div class="a3s aiL"><div dir="ltr">Your account is on hold. Confirm your details today.${bodyExtra}</div></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

describe('webmailProviderFor', () => {
  it('maps exactly the webmail hosts, nothing that merely contains them', () => {
    expect(webmailProviderFor('mail.google.com')).toBe('gmail');
    expect(webmailProviderFor('MAIL.GOOGLE.COM')).toBe('gmail');
    expect(webmailProviderFor('outlook.cloud.microsoft')).toBe('outlook');
    expect(webmailProviderFor('mail.yahoo.com')).toBe('yahoo');
    expect(webmailProviderFor('mail.google.com.example')).toBeNull();
    expect(webmailProviderFor('google.com')).toBeNull();
    expect(webmailProviderFor('mail.aol.com')).toBeNull(); // unverified DOM — not enabled
  });
});

describe('Gmail adapter', () => {
  it('reads the open message: header name + parsed From, no Reply-To until details are open', () => {
    const msg = findOpenMessage(doc(GMAIL_URL, gmailThread()), 'gmail');
    expect(msg).toMatchObject({
      id: 'gmail:#msg-f:1812595164201674230',
      displayName: 'PayPal Billing',
      fromAddress: 'billing@examp1e-pay.example',
      replyToAddress: null,
    });
  });

  it('reads Reply-To passively once the user has opened "Show details", in a known locale', () => {
    const open = findOpenMessage(doc(GMAIL_URL, gmailThread({ details: gmailDetails('refunds.desk@example.net') })), 'gmail');
    expect(open?.replyToAddress).toBe('refunds.desk@example.net');

    const es = gmailThread({ details: gmailDetails('refunds.desk@example.net', 'responder a:') });
    expect(findOpenMessage(doc(GMAIL_URL, es), 'gmail')?.replyToAddress).toBe('refunds.desk@example.net');

    // An unknown label is not guessed at: no Reply-To, and the rule stays quiet.
    const unknown = gmailThread({ details: gmailDetails('refunds.desk@example.net', 'antwort an:') });
    expect(findOpenMessage(doc(GMAIL_URL, unknown), 'gmail')?.replyToAddress).toBeNull();
  });

  it('keeps a revealed Reply-To for that email after the details view closes — and only for it', () => {
    const d = doc(GMAIL_URL, gmailThread({ details: gmailDetails('refunds.desk@example.net') }));
    expect(findOpenMessage(d, 'gmail')?.replyToAddress).toBe('refunds.desk@example.net');
    d.querySelector('.ajA')!.remove(); // user closed "Show details"
    expect(findOpenMessage(d, 'gmail')?.replyToAddress).toBe('refunds.desk@example.net');

    d.querySelector('div.adn')!.setAttribute('data-message-id', '#msg-f:999'); // another email
    expect(findOpenMessage(d, 'gmail')?.replyToAddress).toBeNull();
  });

  it('reads the body of the open email only — not the header, not the earlier collapsed message', () => {
    const msg = findOpenMessage(doc(GMAIL_URL, gmailThread()), 'gmail')!;
    const features = toWebmailFeatures(msg, 'mail.google.com', 16 * 1024);
    expect(features.bodyExcerpt).toContain('Your account is on hold. Confirm your details today.');
    expect(features.bodyExcerpt).not.toContain('billing@examp1e-pay.example');
    expect(features.bodyExcerpt).not.toContain('Pat Example');
    expect(toWebmailFeatures(msg, 'mail.google.com', 12).bodyExcerpt).toHaveLength(12);
  });

  it("never takes the sender from inside the body (email HTML is the sender's own markup)", () => {
    // Header sender removed; a forged header span planted in the body must not stand in.
    const forged = '<span class="gD" email="service@paypal.com" name="PayPal">PayPal</span>';
    const html = gmailThread({ bodyExtra: forged }).replace(
      /<span class="gD" email="billing@examp1e-pay.example" name="PayPal Billing"><span>PayPal Billing<\/span><\/span>/,
      '',
    );
    expect(findOpenMessage(doc(GMAIL_URL, html), 'gmail')).toBeNull();
  });

  it('ignores hidden cached thread views and reads the visible one', () => {
    const html = gmailThread({ hidden: true, id: '#msg-f:111' }) + gmailThread({ id: '#msg-f:222' });
    expect(findOpenMessage(doc(GMAIL_URL, html), 'gmail')?.id).toBe('gmail:#msg-f:222');
    expect(findOpenMessage(doc(GMAIL_URL, gmailThread({ hidden: true })), 'gmail')).toBeNull();
  });

  it('skips an inline reply draft and finds no open message in an inbox list', () => {
    const draftOnly = `<div role="main"><div class="adn"><span class="gD" email="me@example.com" name="Me">Me</span>
      <div class="ii gt"><div class="a3s" contenteditable="true">my draft</div></div></div></div>`;
    expect(findOpenMessage(doc(GMAIL_URL, draftOnly), 'gmail')).toBeNull();

    const inbox = `<div role="main"><table><tr class="zA"><td><span class="yP" email="alerts@scam.example" name="PayPal">PayPal</span></td>
      <td>Your account will be suspended — pay with gift cards only</td></tr></table></div>`;
    expect(findOpenMessage(doc('https://mail.google.com/mail/u/0/#inbox', inbox), 'gmail')).toBeNull();
  });
});

const OUTLOOK_URL = 'https://outlook.live.com/mail/0/inbox/id/AAQkADAwATExAMPLEmsgOPEN000002%3D';

function outlookPane(cards: string): string {
  return `<div id="app">
    <div role="listbox"><div role="option" aria-selected="true" data-convid="AAQkADAwATExAMPLEconvOPEN00001=">PayPal Billing</div></div>
    <div data-app-section="MailReadCompose" role="main"><div id="ConversationReadingPaneContainer">${cards}</div></div>
  </div>`;
}

const outlookCard = (from: string, body: string | null, extra = '') => `
  <div aria-label="Email message" class="SlLx9">
    <div id="MSG_AAQkExample_FROM"><span class="lpcCommonWeb-hoverTarget" aria-label="From: x"><span class="OZZZK">${from}</span></span></div>
    ${body == null ? '<div class="_nzWz">Earlier message preview…</div>' : `<div class="XbIp4"><div id="UniqueMessageBody_2" role="document" aria-label="Message body">${body}</div></div>`}
    <div role="document" aria-label="Message body">signature block, not a body</div>
    ${extra}
  </div>`;

describe('Outlook adapter', () => {
  it('reads the last expanded message and splits "Name<addr>"', () => {
    const html = outlookPane(
      outlookCard('Pat Example&lt;pat@example.org&gt;', null) +
        outlookCard('PayPal Billing&lt;billing@examp1e-pay.example&gt;', 'Your account is on hold.'),
    );
    const msg = findOpenMessage(doc(OUTLOOK_URL, html), 'outlook');
    expect(msg).toMatchObject({ displayName: 'PayPal Billing', fromAddress: 'billing@examp1e-pay.example', replyToAddress: null });
    expect(toWebmailFeatures(msg!, 'outlook.live.com', 1024).bodyExcerpt).toBe('Your account is on hold.');
  });

  it('keeps the address the client appended when the display name itself fakes one', () => {
    const html = outlookPane(outlookCard('PayPal &lt;service@paypal.com&gt;&lt;billing@scam.example&gt;', 'Hi'));
    expect(findOpenMessage(doc(OUTLOOK_URL, html), 'outlook')).toMatchObject({
      displayName: 'PayPal <service@paypal.com>',
      fromAddress: 'billing@scam.example',
    });
  });

  it('leaves fromAddress empty for a same-organisation sender shown by name only', () => {
    const html = outlookPane(outlookCard('Pat Example', 'Lunch at noon?'));
    expect(findOpenMessage(doc('https://outlook.cloud.microsoft/mail/inbox/id/AAMk', html), 'outlook')).toMatchObject({
      displayName: 'Pat Example',
      fromAddress: '',
    });
  });

  it('skips a draft card, and finds nothing without a reading pane', () => {
    const html = outlookPane(
      outlookCard('Pat Example&lt;pat@example.org&gt;', 'Original message') +
        outlookCard('Me&lt;me@example.com&gt;', 'reply text', '<div contenteditable="true"></div>'),
    );
    expect(findOpenMessage(doc(OUTLOOK_URL, html), 'outlook')?.fromAddress).toBe('pat@example.org');
    expect(findOpenMessage(doc(OUTLOOK_URL, '<div id="app">Select an item to read</div>'), 'outlook')).toBeNull();
  });

  it('refuses to pair a body with a sender it cannot attribute to that body', () => {
    // Two bodies under one sender-holding container: whose sender is it? Answer none.
    const html = outlookPane(`<div id="MSG_X_FROM"><span class="OZZZK">PayPal&lt;x@scam.example&gt;</span></div>
      <div id="UniqueMessageBody_1">one</div><div id="UniqueMessageBody_2">two</div>`);
    expect(findOpenMessage(doc(OUTLOOK_URL, html), 'outlook')).toBeNull();
  });
});

const YAHOO_URL = 'https://mail.yahoo.com/d/folders/1/messages/123456';

const yahooView = (expanded: boolean, from: string, body: string | null) => `
  <div data-test-id="message-view" data-test-expanded="${expanded}">
    <header data-test-id="message-header"><div data-test-id="message-from">${from}</div></header>
    ${body == null ? '' : `<div data-test-id="message-view-body"><div class="msg-body" data-test-id="message-view-body-content"><div>${body}</div></div></div>`}
  </div>`;

describe('Yahoo adapter', () => {
  it('reads the last expanded message: address from the pill title, name from its text', () => {
    const html = `<div role="main">
      ${yahooView(false, '<span data-test-id="email-pill"><span title="pat@example.org">Pat Example</span></span>', null)}
      ${yahooView(true, '<span data-test-id="email-pill"><span title="billing@examp1e-pay.example"><span>PayPal Billing</span></span></span>', 'Your account is on hold.')}
    </div>`;
    const msg = findOpenMessage(doc(YAHOO_URL, html), 'yahoo');
    expect(msg).toMatchObject({ displayName: 'PayPal Billing', fromAddress: 'billing@examp1e-pay.example', replyToAddress: null });
    expect(toWebmailFeatures(msg!, 'mail.yahoo.com', 1024).bodyExcerpt).toBe('Your account is on hold.');
  });

  it('falls back to an address in the rendered text when the pill has no title', () => {
    const plain = yahooView(true, 'PayPal Billing billing@examp1e-pay.example', 'Hi');
    expect(findOpenMessage(doc(YAHOO_URL, plain), 'yahoo')).toMatchObject({
      displayName: 'PayPal Billing',
      fromAddress: 'billing@examp1e-pay.example',
    });
    const bracketed = yahooView(true, 'PayPal Billing &lt;billing@examp1e-pay.example&gt;', 'Hi');
    expect(findOpenMessage(doc(YAHOO_URL, bracketed), 'yahoo')?.fromAddress).toBe('billing@examp1e-pay.example');
  });

  it('abstains rather than take an address the sender wrote into the display name', () => {
    const spoof = yahooView(true, 'service@paypal.com billing@scam.example', 'Hi');
    expect(findOpenMessage(doc(YAHOO_URL, spoof), 'yahoo')).toMatchObject({
      displayName: 'service@paypal.com billing@scam.example',
      fromAddress: '',
    });
    // So the spoof can't buy an origin exemption: this "USPS" email is not from usps.com.
    const usps = yahooView(true, 'alerts@usps.com notice@usps-redelivery.example', 'Pay the $3.00 redelivery fee.');
    expect(mailIsFrom(extractPageFeatures(doc(YAHOO_URL, usps)), ['usps.com'])).toBe(false);
    // Nor by padding the name until the client's address falls past the header bound.
    const pad = `${'USPS '.repeat(64).slice(0, 320 - ' alerts@usps.com'.length)} alerts@usps.com`;
    const padded = yahooView(true, `${pad} notice@usps-redelivery.example`, 'Pay the $3.00 redelivery fee.');
    expect(findOpenMessage(doc(YAHOO_URL, padded), 'yahoo')?.fromAddress).toBe('');
  });

  it('reads a bare "@" in the name as text, not as an address', () => {
    for (const name of ['PayPal @ Billing', 'Support @PayPal', 'Support@PayPal']) {
      const view = yahooView(true, `${name} billing@scam.example`, 'Hi');
      expect(findOpenMessage(doc(YAHOO_URL, view), 'yahoo'), name).toMatchObject({
        displayName: name,
        fromAddress: 'billing@scam.example',
      });
    }
  });
});

describe('fail-quiet contract', () => {
  it('answers null — never throws — whatever the page or the visibility test does', () => {
    const boom = () => {
      throw new Error('layout exploded');
    };
    expect(findOpenMessage(doc(GMAIL_URL, gmailThread()), 'gmail', boom)).toBeNull();
    expect(findOpenMessage(doc(GMAIL_URL, ''), 'gmail')).toBeNull();
    expect(findOpenMessage(doc(OUTLOOK_URL, ''), 'outlook')).toBeNull();
    expect(findOpenMessage(doc(YAHOO_URL, ''), 'yahoo')).toBeNull();
  });

  it('signs no-message distinctly from any message, and a revealed Reply-To as a detail change', () => {
    const plain = messageSignature(findOpenMessage(doc(GMAIL_URL, gmailThread()), 'gmail'));
    const withDetails = messageSignature(
      findOpenMessage(doc(GMAIL_URL, gmailThread({ details: gmailDetails('refunds.desk@example.net') })), 'gmail'),
    );
    expect(messageSignature(null)).toEqual({ id: '', detail: '' });
    expect(withDetails.id).toBe(plain.id);
    expect(withDetails.detail).not.toBe(plain.detail);
  });
});

describe('extractPageFeatures in webmail mode', () => {
  it('judges the open email: webmail features populated, body = the email, host unchanged', () => {
    const f = extractPageFeatures(doc(GMAIL_URL, `<nav>Inbox 1,204 · Starred · Spam</nav>${gmailThread()}`));
    expect(f.host).toBe('mail.google.com');
    expect(f.webmail).toMatchObject({ displayName: 'PayPal Billing', fromAddress: 'billing@examp1e-pay.example' });
    expect(f.bodyExcerpt).toContain('Your account is on hold.');
    expect(f.bodyExcerpt).not.toContain('Starred');
    expect(f.webmail!.bodyExcerpt).toBe(f.bodyExcerpt);
  });

  it('has no text to judge when no email is open — the inbox chrome is not a page to warn on', () => {
    const inbox = `<div role="main">Your account will be suspended · Pay with gift cards only · do not tell anyone</div>`;
    const f = extractPageFeatures(doc('https://mail.google.com/mail/u/0/#spam', inbox));
    expect(f.webmail).toBeUndefined();
    expect(f.bodyExcerpt).toBe('');
    expect(f.phoneNumbers).toEqual([]);
  });

  it('reads a trailing-dot hostname as the same site (www.paypal.com. is www.paypal.com)', () => {
    expect(extractPageFeatures(doc('https://www.paypal.com./', '<p>Sign in</p>')).host).toBe('www.paypal.com');
    expect(extractPageFeatures(doc('https://mail.google.com./mail/u/0/', gmailThread())).webmail).toBeDefined();
  });

  it('leaves ordinary websites exactly as before', () => {
    const f = extractPageFeatures(doc('https://shop.example/', '<p>Pay with gift cards only</p>'));
    expect(f.webmail).toBeUndefined();
    expect(f.bodyExcerpt).toContain('Pay with gift cards only');
  });
});
