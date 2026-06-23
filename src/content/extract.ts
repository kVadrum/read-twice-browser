import type { PageFeatures, FormFeature } from '../lib/heuristics/rule-types';

// Extracts only the structured features the rules need — never the full page
// (architecture §4.2). Body text is capped; nothing here leaves the device.

const BODY_EXCERPT_LIMIT = 16 * 1024;

// US/CA phone numbers in E.164 and common display variants.
const PHONE_RE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

// Input-name fragments that indicate a payment/PII field. Interim list — the real
// one lives in the companion repo (lists, heuristic-ruleset §3.2).
const PAYMENT_FIELD_HINTS = ['cc-number', 'card', 'cardnumber', 'ssn', 'routing', 'cvv', 'cvc'];

export function extractPageFeatures(doc: Document = document): PageFeatures {
  const url = doc.location.href;
  // TODO: reduce to eTLD+1 via a bundled public-suffix list (data-model 07). The
  // hostname is a stand-in until then; rules that key on eTLD+1 read this field.
  const host = doc.location.hostname;
  const bodyText = doc.body?.innerText ?? '';
  const bodyExcerpt = bodyText.slice(0, BODY_EXCERPT_LIMIT);

  return {
    url,
    host,
    bodyExcerpt,
    forms: extractForms(doc),
    brandMentions: [], // TODO: keyword match against the companion-repo brand list
    phoneNumbers: unique(bodyExcerpt.match(PHONE_RE) ?? []),
    linkTargets: extractLinks(doc),
  };
}

function extractForms(doc: Document): FormFeature[] {
  return Array.from(doc.forms).map((form) => {
    const inputNames = Array.from(form.elements)
      .map((e) => (e as HTMLInputElement).name?.toLowerCase())
      .filter((n): n is string => Boolean(n));
    return {
      actionHost: formActionHost(form, doc),
      inputNames,
      hasPaymentField: inputNames.some((n) => PAYMENT_FIELD_HINTS.some((h) => n.includes(h))),
    };
  });
}

function formActionHost(form: HTMLFormElement, doc: Document): string | null {
  const action = form.getAttribute('action');
  if (!action) return null;
  try {
    const target = new URL(action, doc.location.href).hostname;
    return target === doc.location.hostname ? null : target;
  } catch {
    return null;
  }
}

function extractLinks(doc: Document): string[] {
  return unique(
    Array.from(doc.querySelectorAll('a[href]'))
      .map((a) => a.getAttribute('href'))
      .filter((h): h is string => Boolean(h)),
  );
}

function unique(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
