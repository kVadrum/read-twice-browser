import type { PageFeatures, FormFeature } from '../lib/heuristics/rule-types';
import { findPhoneNumbers } from '../lib/heuristics/phone';
import { webmailProviderFor, findOpenMessage, toWebmailFeatures } from './webmail';

// Extracts only the structured features the rules need — never the full page
// (architecture §4.2). Body text is capped; nothing here leaves the device.
// On a webmail host the text read is the open email's alone: its sender name, its From
// address, the Reply-To only if the client already shows it, and its body — never the
// inbox around it, and nothing is clicked or expanded to find more (content/webmail).
// Forms and link hrefs are still read page-wide, as on any site.

const BODY_EXCERPT_LIMIT = 16 * 1024;

// Input-name fragments that indicate a payment/PII field. Interim list — the real
// one lives in the companion repo (lists, heuristic-ruleset §3.2).
const PAYMENT_FIELD_HINTS = ['cc-number', 'card', 'cardnumber', 'ssn', 'routing', 'cvv', 'cvc'];

export function extractPageFeatures(doc: Document = document): PageFeatures {
  const url = doc.location.href;
  // The full hostname, on purpose: do NOT reduce it to eTLD+1 here. Webmail mode matches the
  // exact mail host (mail.google.com, never google.com), so reducing it would switch webmail
  // mode off everywhere; website dismissals and tld-impersonation read the full name too.
  // Rules that need the registrable domain reduce it in the worker (match.ts
  // registrableDomain), where the Public Suffix List lives — weight.test.ts keeps that list
  // out of this script.
  // A trailing-dot FQDN ("www.paypal.com.") is the same site; without the strip it would miss
  // every allow-list and read as an impostor of itself.
  const host = doc.location.hostname.replace(/\.$/, '');
  // Webmail mode (heuristic-ruleset §3.4): on a mail client the rules judge the OPEN EMAIL,
  // not the client around it — a spam folder listing scam-looking subject lines is not a
  // scam page. No open email → no text, so the content rules stay silent.
  const mailProvider = webmailProviderFor(host);
  const openMessage = mailProvider ? findOpenMessage(doc, mailProvider) : null;
  const webmail = openMessage ? toWebmailFeatures(openMessage, host, BODY_EXCERPT_LIMIT) : undefined;
  const bodyText = mailProvider ? (webmail?.bodyExcerpt ?? '') : (doc.body?.innerText ?? '');
  const bodyExcerpt = bodyText.slice(0, BODY_EXCERPT_LIMIT);

  return {
    url,
    host,
    bodyExcerpt,
    ...(webmail ? { webmail } : {}),
    forms: extractForms(doc),
    brandMentions: [], // TODO: keyword match against the companion-repo brand list
    // The shared definition (heuristics/phone.ts) that phone-number-impersonation also reads.
    phoneNumbers: unique(findPhoneNumbers(bodyExcerpt).map((m) => m.raw)),
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
