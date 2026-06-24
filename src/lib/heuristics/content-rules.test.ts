import { describe, it, expect } from 'vitest';
import { scamLanguageUrgent, scamLanguagePressure } from './content-rules';
import type { EvaluationContext, PageFeatures } from './rule-types';

function ctx(host: string, bodyExcerpt: string): EvaluationContext {
  const features: PageFeatures = {
    url: `https://${host}/`,
    host,
    bodyExcerpt,
    forms: [],
    brandMentions: [],
    phoneNumbers: [],
    linkTargets: [],
  };
  return { features, redirectChain: [], rdap: null, dismissedHosts: [] };
}

describe('scam-language-urgent', () => {
  it('fires on an urgency phrase and reports the matched phrase', () => {
    expect(
      scamLanguageUrgent.evaluate(ctx('x.example', 'Warning: your account will be suspended soon.')),
    ).toEqual({ vars: { matchedPhrase: 'account will be suspended' } });
  });
  it('does not fire on ordinary copy', () => {
    expect(scamLanguageUrgent.evaluate(ctx('x.example', 'Thanks for your order. It ships Monday.'))).toBeNull();
  });
});

describe('scam-language-pressure', () => {
  it('fires red on a pressure phrase', () => {
    expect(scamLanguagePressure.severity).toBe('red');
    expect(scamLanguagePressure.evaluate(ctx('scam.example', 'You must pay with gift cards only.'))).toEqual({
      vars: { matchedPhrase: 'gift cards only' },
    });
  });
  it('is suppressed on allow-listed news domains (red on a news article is not acceptable)', () => {
    expect(
      scamLanguagePressure.evaluate(ctx('nytimes.com', 'Scammers told her to pay with gift cards only.')),
    ).toBeNull();
    // subdomain of a news domain is still covered
    expect(
      scamLanguagePressure.evaluate(ctx('www.bbc.co.uk', 'The fraudster said do not tell anyone.')),
    ).toBeNull();
  });
});
