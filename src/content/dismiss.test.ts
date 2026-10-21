import { describe, it, expect } from 'vitest';
import { dismissalKey } from './dismiss';
import type { PageFeatures, WebmailFeatures } from '../lib/heuristics/rule-types';

function features(host: string, webmail?: Partial<WebmailFeatures>): PageFeatures {
  return {
    url: `https://${host}/`,
    host,
    bodyExcerpt: '',
    forms: [],
    brandMentions: [],
    phoneNumbers: [],
    linkTargets: [],
    ...(webmail && {
      webmail: { host, displayName: '', fromAddress: '', replyToAddress: null, bodyExcerpt: '', ...webmail },
    }),
  };
}

describe('dismissalKey', () => {
  it('is the page host on a website, as before', () => {
    expect(dismissalKey(features('shop.example'))).toBe('shop.example');
    // A webmail host with no email open is just a site.
    expect(dismissalKey(features('mail.google.com'))).toBe('mail.google.com');
  });

  it("is the open email's sender in webmail mode, so one sender never silences the client", () => {
    const a = dismissalKey(features('mail.google.com', { fromAddress: 'Alerts@Bofa-Secure.EXAMPLE' }));
    const b = dismissalKey(features('mail.google.com', { fromAddress: 'friend@example.org' }));
    expect(a).toBe('mail:alerts@bofa-secure.example');
    expect(b).not.toBe(a);
    expect(b).not.toBe('mail.google.com');
  });

  it('normalizes the address, so the check and the record agree however it was rendered', () => {
    const plain = dismissalKey(features('mail.google.com', { fromAddress: 'alerts@bofa-secure.example' }));
    const rendered = dismissalKey(features('mail.google.com', { fromAddress: 'BofA <ALERTS@bofa-secure.example.>' }));
    expect(rendered).toBe(plain);
  });

  it('falls back to the sender name when the client hides the address, still namespaced', () => {
    expect(dismissalKey(features('outlook.office.com', { displayName: 'Pat Example', fromAddress: '' }))).toBe(
      'mail:name:pat example',
    );
  });
});
