import bannerCss from './banner.css?inline';
import { COPY, fillTemplate } from './copy';
import type { Verdict } from '../heuristics/rule-types';

// Renders the verdict banner inside a CLOSED Shadow DOM so page CSS can't restyle our
// warning and the page can't read our state (architecture §1.4, threat model §8.4).
//
// SCAFFOLD SKELETON — structural mount only. The production banner (slide-in motion,
// tap-to-expand, the line-art eye mark, full a11y: role=alert, focus management,
// Esc-to-collapse, Cmd/Ctrl+Shift+R re-show) per banner-ux-and-copy §2 is built
// through the frontend-design skill, not freehanded here.

const HOST_ID = 'read-twice-banner-host';

export interface BannerCallbacks {
  onSendToReadTwice: () => void;
  onNotAScam: () => void;
}

export function mountBanner(verdict: Verdict, cb: BannerCallbacks): void {
  if (verdict.severity === 'none' || verdict.hits.length === 0) return;
  if (document.getElementById(HOST_ID)) return; // already mounted

  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = bannerCss;
  root.append(style);

  const band = document.createElement('section');
  band.className = `rt-band rt-${verdict.severity}`;
  band.setAttribute('role', 'alert');

  const top = verdict.hits[0]!;
  const topCopy = COPY[top.ruleId];
  if (topCopy) band.append(textEl('p', 'rt-headline', fillTemplate(topCopy.headline, top.vars)));

  for (const hit of verdict.hits) {
    const copy = COPY[hit.ruleId];
    if (copy?.evidence) band.append(textEl('p', 'rt-evidence', fillTemplate(copy.evidence, hit.vars)));
  }

  if (topCopy?.action) band.append(textEl('p', 'rt-action', fillTemplate(topCopy.action, top.vars)));

  const actions = document.createElement('div');
  actions.className = 'rt-actions';
  actions.append(
    buttonEl('Send to Read Twice', cb.onSendToReadTwice),
    buttonEl("This isn't a scam", cb.onNotAScam),
  );
  band.append(actions);

  root.append(band);
  document.documentElement.prepend(host);
}

export function unmountBanner(): void {
  document.getElementById(HOST_ID)?.remove();
}

function textEl(tag: 'p', className: string, text: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

function buttonEl(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.setAttribute('aria-label', label);
  btn.addEventListener('click', onClick);
  return btn;
}
