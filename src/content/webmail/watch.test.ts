import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { watchOpenMessage, type OpenMessageChange } from './watch';

// The watcher's contract: report a change exactly when the open email (or what we can read
// of it) changes — not on every DOM churn — and never on mutations we caused ourselves.

const message = (id: string, from: string, details = '') => `
  <div class="adn" data-message-id="${id}">
    <span class="gD" email="${from}" name="Sender">Sender</span>
    ${details}
    <div class="ii gt"><div class="a3s">Body of ${id}</div></div>
  </div>`;

const replyToRow = `<div class="ajA"><table><tbody><tr class="ajv"><td class="gG">reply-to:</td>
  <td class="gL"><span email="desk@example.net">desk@example.net</span></td></tr></tbody></table></div>`;

let window: JSDOM['window'];
let main: HTMLElement;
let changes: OpenMessageChange[];
let stop: () => void;

/** Let jsdom deliver MutationObserver records (a microtask), then run out the debounce. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  vi.advanceTimersByTime(1500);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  ({ window } = new JSDOM(`<!doctype html><body><div role="main">${message('#msg-f:1', 'a@example.org')}</div></body>`, {
    url: 'https://mail.google.com/mail/u/0/#inbox/FMfcgzOne',
  }));
  main = window.document.querySelector('[role="main"]') as unknown as HTMLElement;
  changes = [];
  stop = watchOpenMessage(window.document as unknown as Document, 'gmail', (c) => changes.push(c));
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe('watchOpenMessage', () => {
  it('reports opening a different email once, after the client settles', async () => {
    main.innerHTML = message('#msg-f:2', 'b@example.org');
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(100);
    expect(changes).toEqual([]); // still settling
    vi.advanceTimersByTime(1500);
    expect(changes).toEqual([{ sameMessage: false }]);
  });

  it("reports a detail change on the same email (Gmail's details rows revealing Reply-To)", async () => {
    main.innerHTML = message('#msg-f:1', 'a@example.org', replyToRow);
    await settle();
    expect(changes).toEqual([{ sameMessage: true }]);
  });

  it('stays quiet when the DOM churns but the open email is unchanged', async () => {
    main.append(window.document.createElement('div'));
    main.firstElementChild!.classList.add('hover');
    await settle();
    expect(changes).toEqual([]);
  });

  it('reports leaving the email for the inbox list', async () => {
    main.innerHTML = '<table><tr><td>Inbox row</td></tr></table>';
    await settle();
    expect(changes).toEqual([{ sameMessage: false }]);
  });

  it('checks on hash navigation too', async () => {
    // Swap without the observer seeing it, so only the hashchange can trigger the check.
    stop();
    stop = watchOpenMessage(window.document as unknown as Document, 'gmail', (c) => changes.push(c), () => true);
    main.innerHTML = message('#msg-f:3', 'c@example.org');
    await settle();
    expect(changes).toEqual([]);
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await settle();
    expect(changes).toEqual([{ sameMessage: false }]);
  });

  it('never schedules a check for mutations it is told are our own (the banner)', async () => {
    stop();
    stop = watchOpenMessage(window.document as unknown as Document, 'gmail', (c) => changes.push(c), () => true);
    main.innerHTML = message('#msg-f:4', 'd@example.org');
    await settle();
    expect(changes).toEqual([]);
  });
});
