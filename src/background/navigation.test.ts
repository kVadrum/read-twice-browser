import { describe, it, expect, vi, afterEach } from 'vitest';
import manifest from '../manifest.config';

// `redirect-chain-long` is dormant by decision (operator, 2026-10-21; manifest.config.ts):
// v0.1 requests no permission that could feed it, and the worker collects no chain. Either
// half is one edit from undone — a manifest line, or a listener that a newly granted API
// would switch on — so both are pinned here. Changing either is an operator decision; this
// test is the reminder, not the gate.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('redirect chain: dormant by decision', () => {
  it('requests neither webNavigation nor webRequest, required or optional', async () => {
    const m = await (typeof manifest === 'function' ? manifest({ command: 'build', mode: 'production' }) : manifest);
    // Positive control: the permission list is really being read.
    expect(m.permissions).toContain('storage');
    const requested: string[] = [...(m.permissions ?? []), ...(m.optional_permissions ?? [])];
    // webNavigation can't count server-redirect hops; webRequest can, and is excluded by the
    // privacy posture (permissions-and-privacy §2.2).
    expect(requested).not.toContain('webNavigation');
    expect(requested).not.toContain('webRequest');
  });

  it('subscribes to no navigation or request events, even where those APIs exist', async () => {
    const subscribed: string[] = [];
    const event = (name: string) => ({ addListener: () => void subscribed.push(name) });
    // A browser that exposes both APIs — what granting either permission would look like.
    vi.stubGlobal('chrome', {
      runtime: { onMessage: event('runtime.onMessage') },
      tabs: { onRemoved: event('tabs.onRemoved') },
      webNavigation: {
        onBeforeNavigate: event('webNavigation.onBeforeNavigate'),
        onCommitted: event('webNavigation.onCommitted'),
      },
      webRequest: { onBeforeRedirect: event('webRequest.onBeforeRedirect') },
    });
    await import('./index'); // the worker entry, exactly as the browser wakes it
    const { getRedirectChain } = await import('./navigation');

    // Positive control: the stub sees the worker's subscriptions.
    expect(subscribed).toContain('runtime.onMessage');
    expect(subscribed.filter((s) => /^web(Navigation|Request)\./.test(s))).toEqual([]);
    expect(getRedirectChain(1)).toEqual([]);
  });
});
