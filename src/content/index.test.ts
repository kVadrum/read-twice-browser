import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { evaluatePage } from '../lib/heuristics/engine';
import { loadRuleset } from '../lib/ruleset/loader';
import type { ContentToWorker, WorkerToContent } from '../lib/runtime/messaging-types';

// The content script's webmail lifecycle, end to end: the real entry module on a synthetic
// Gmail DOM, a worker that answers with the real engine — but only when a test says so, so
// each test can put the user's next move inside the round trip. Opening another email is
// not a navigation, and a cold MV3 worker can take longer to answer than the client takes
// to swap emails; a reply must only ever land on the email it was asked about.

const GMAIL_URL = 'https://mail.google.com/mail/u/0/#inbox/FMfcgzQXJwExampleThreadTokenAbcd';
const SCAM = { id: '#msg-f:1001', name: 'Bank of America Alerts', from: 'boa.alerts.0142@gmail.com', body: 'Your account is locked.' };
const LEGIT = { id: '#msg-f:1002', name: 'Pat Example', from: 'pat@example.org', body: 'Lunch on Friday?' };

const replyToRow = (address: string) => `<div class="ajA"><table><tbody><tr class="ajv"><td class="gG">reply-to:</td>
  <td class="gL"><span email="${address}">${address}</span></td></tr></tbody></table></div>`;

function email(m: { id: string; name: string; from: string; body: string }, details = ''): string {
  return `<div role="main"><div class="adn" data-message-id="${m.id}">
    <span class="gD" email="${m.from}" name="${m.name}">${m.name}</span>
    ${details}
    <div class="ii gt"><div class="a3s">${m.body}</div></div>
  </div></div>`;
}

const ruleset = loadRuleset();

let window: JSDOM['window'];
let pending: { msg: ContentToWorker; reply: (r: WorkerToContent) => void }[];
// The banner's shadow root is closed; keep a handle the way only its creator could.
let rootOf: WeakMap<Element, ShadowRoot>;

/** Let promise continuations and MutationObserver deliveries run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** Answers the oldest held request of `type` the way the worker would. */
async function answer(type: 'CheckDismissed' | 'EvaluatePage'): Promise<void> {
  const i = pending.findIndex((p) => p.msg.type === type);
  expect(i, `a held ${type} request`).toBeGreaterThanOrEqual(0);
  const [{ msg, reply }] = pending.splice(i, 1) as [(typeof pending)[number]];
  if (msg.type === 'CheckDismissed') reply({ type: 'DismissedResult', key: msg.key, dismissed: false });
  if (msg.type === 'EvaluatePage') {
    const ctx = { features: msg.features, redirectChain: [], rdap: null, dismissedHosts: [] };
    reply({ type: 'Verdict', verdict: evaluatePage(ruleset, ctx) });
  }
  await flush();
}

/** The banner on screen, as text, or null. */
function banner(): { headline: string; evidence: string[] } | null {
  const root = bannerRoot();
  if (!root) return null;
  return {
    headline: root.querySelector('.rt-headline')!.textContent ?? '',
    evidence: Array.from(root.querySelectorAll('.rt-evidence'), (p) => p.textContent ?? ''),
  };
}

function bannerRoot(): ShadowRoot | null {
  const host = window.document.getElementById('read-twice-banner-host');
  return (host && rootOf.get(host)) ?? null;
}

/** Swaps the open email the way a client does: new DOM, no navigation. */
async function open(html: string): Promise<void> {
  window.document.body.innerHTML = html;
  await flush();
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  ({ window } = new JSDOM(`<!doctype html><body>${email(SCAM)}</body>`, { url: GMAIL_URL }));
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent;
    },
  });
  rootOf = new WeakMap();
  const attach = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
    const root = attach.call(this, init);
    rootOf.set(this, root);
    return root;
  };

  pending = [];
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('location', window.location);
  vi.stubGlobal('getComputedStyle', window.getComputedStyle.bind(window));
  vi.stubGlobal('matchMedia', () => ({ matches: true })); // reduced motion: no entry timer
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: (msg: ContentToWorker) =>
        msg.type === 'RecordDismissal'
          ? Promise.resolve({ type: 'Ack' })
          : new Promise<WorkerToContent>((reply) => pending.push({ msg, reply })),
    },
  });

  vi.resetModules();
  await import('./index'); // runs the content script: evaluates the open email, starts watching
});

afterEach(async () => {
  // Close the window while the fakes and stubs are still in place: closing delivers the live
  // watcher's last mutation records, and its check must land on a fake timer and the stubbed
  // document — not a real timer firing into the next test with `document` gone.
  window.close();
  await flush();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('content script in webmail mode', () => {
  it("draws the open email's verdict once the worker answers", async () => {
    await answer('CheckDismissed');
    await answer('EvaluatePage');
    expect(banner()?.headline).toBe("This email isn't really from Bank of America.");
  });

  it('drops a late reply for an email the user has already left, before the watcher notices', async () => {
    await answer('CheckDismissed');
    await open(email(LEGIT));
    vi.advanceTimersByTime(100); // inside the watcher's settle window: it hasn't looked yet
    await answer('EvaluatePage'); // the scam email's verdict arrives over Pat's email
    expect(banner()).toBeNull();

    // The watcher still reports the switch, and Pat's email gets its own evaluation.
    vi.advanceTimersByTime(1500);
    await flush();
    await answer('CheckDismissed');
    const evaluation = pending.find((p) => p.msg.type === 'EvaluatePage')?.msg;
    expect(evaluation?.type === 'EvaluatePage' && evaluation.features.webmail?.fromAddress).toBe(LEGIT.from);
    await answer('EvaluatePage');
    expect(banner()).toBeNull();
  });

  it('keeps a reply when the client hides the same email and draws it again meanwhile', async () => {
    // The thread view swapped for the inbox and back, faster than the watcher settles: it
    // never sees a change, so a dropped reply would never be asked for again.
    await answer('CheckDismissed');
    await open('<div role="main"><div class="inbox">Inbox</div></div>');
    vi.advanceTimersByTime(50);
    await answer('EvaluatePage');
    expect(banner()).toBeNull();
    await open(email(SCAM));
    vi.advanceTimersByTime(300);
    await flush();
    expect(banner()?.headline).toBe("This email isn't really from Bank of America.");
    expect(pending).toEqual([]); // the watcher saw no switch, so nothing is asked twice
  });

  it('keeps a reply when the client merely re-renders the same email meanwhile', async () => {
    // Gmail mutates constantly; churn that leaves the same email open must not cost the
    // banner — no later signature change would ever re-request it.
    await answer('CheckDismissed');
    const main = window.document.querySelector('[role="main"]')!;
    main.append(window.document.createElement('div'));
    main.firstElementChild!.classList.add('hover');
    await flush();
    vi.advanceTimersByTime(100);
    await answer('EvaluatePage');
    expect(banner()?.headline).toBe("This email isn't really from Bank of America.");
  });

  it('lets a dismissal win over a re-evaluation of the same sender already in flight', async () => {
    await answer('CheckDismissed');
    await answer('EvaluatePage');
    expect(banner()?.evidence).toHaveLength(1);

    // The user opens "Show details" (a Reply-To appears): the same email is re-evaluated…
    await open(email(SCAM, replyToRow('desk.0142@yahoo.com')));
    vi.advanceTimersByTime(1500);
    await flush();
    await answer('CheckDismissed');
    // …and closes the banner while the worker is still answering.
    (bannerRoot()!.querySelector('.rt-close') as HTMLElement).click();
    expect(banner()).toBeNull();

    await answer('EvaluatePage'); // a new verdict (two evidence lines) for the same sender
    expect(banner()).toBeNull();
  });
});
