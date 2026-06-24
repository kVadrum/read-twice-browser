import bannerCss from './banner.css?inline';
import { COPY, fillTemplate } from './copy';
import type { Verdict } from '../heuristics/rule-types';

// Renders the verdict banner inside a CLOSED Shadow DOM so page CSS can't restyle our
// warning and the page can't read our state (architecture §1.4, threat model §8.4).
//
// The banner is brand surface: the verdict palette, the humanist type scale, and the
// line-art eye mark are LOCKED tokens shared with the Read Twice mobile line
// (banner-ux-and-copy §2.2). What lives here is the behavior the spec asks for —
// slide-in that pushes page content down (§2.1), tap-to-expand with the eye + chevron
// (§2.3), highest-severity headline with one evidence line per contributing rule (§2.4),
// and the a11y contract (§2.5): role=alert, Escape collapses, Ctrl/Cmd+Shift+R re-shows.

const HOST_ID = 'read-twice-banner-host';
const DETAILS_ID = 'read-twice-banner-details';

export interface BannerCallbacks {
  onSendToReadTwice: () => void;
  /** Records the 30-day per-domain dismissal and unmounts (content/dismiss.ts). */
  onNotAScam: () => void;
}

// Module state survives a close-then-reshow within one page-load but dies with the
// document (a fresh navigation re-runs the engine). `lastMount` lets the re-show
// shortcut rebuild the banner without re-evaluating the page.
let lastMount: { verdict: Verdict; cb: BannerCallbacks } | null = null;
let dismissedThisLoad = false;
let reshowBound = false;
let active: ActiveBanner | null = null;

interface ActiveBanner {
  host: HTMLElement;
  band: HTMLElement;
  detailsWrap: HTMLElement;
  toggle: HTMLButtonElement;
  resize: ResizeObserver;
  /** The page's own root margin-top, captured once so push-down is additive + reversible. */
  baseMarginTop: number;
  prevMarginTop: string;
  prevTransition: string;
  entryTimer: ReturnType<typeof setTimeout> | null;
  collapsed: boolean;
}

export function mountBanner(verdict: Verdict, cb: BannerCallbacks): void {
  if (verdict.severity === 'none' || verdict.hits.length === 0) return;
  lastMount = { verdict, cb };
  dismissedThisLoad = false;
  bindReshow();
  if (document.getElementById(HOST_ID)) return; // already mounted
  render(verdict, cb);
}

export function unmountBanner(): void {
  if (active) {
    active.resize.disconnect();
    if (active.entryTimer) clearTimeout(active.entryTimer);
    // Restore the page's layout exactly as we found it.
    document.documentElement.style.marginTop = active.prevMarginTop;
    document.documentElement.style.transition = active.prevTransition;
    active.host.remove();
    active = null;
    return;
  }
  document.getElementById(HOST_ID)?.remove();
}

function render(verdict: Verdict, cb: BannerCallbacks): void {
  const severity = verdict.severity === 'red' ? 'red' : 'yellow';
  const hits = verdict.hits;
  // Hits arrive red-first from the engine. The headline + action come from the
  // strongest hit that actually carries copy (modifier rules have empty headlines).
  const headlineHit = hits.find((h) => COPY[h.ruleId]?.headline) ?? hits[0]!;
  const actionHit = hits.find((h) => COPY[h.ruleId]?.action);

  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = bannerCss;
  root.append(style);

  const band = document.createElement('section');
  band.className = `rt-band rt-${severity}`;
  band.setAttribute('role', 'alert');

  const shell = div('rt-shell');
  const bar = div('rt-bar');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'rt-toggle';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-controls', DETAILS_ID);

  const mark = span('rt-mark');
  mark.append(eyeMark(severity === 'red'));
  const headline = span('rt-headline');
  headline.textContent = fillTemplate(COPY[headlineHit.ruleId]?.headline ?? '', headlineHit.vars);
  const chev = span('rt-chev');
  chev.append(chevronMark());
  toggle.append(mark, headline, chev);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'rt-close';
  close.setAttribute('aria-label', 'Hide this for this site');
  close.append(closeMark());

  bar.append(toggle, close);

  const detailsWrap = div('rt-detailswrap');
  const details = div('rt-details');
  details.id = DETAILS_ID;
  const inner = div('rt-detailsinner');

  for (const hit of hits) {
    const evidence = COPY[hit.ruleId]?.evidence;
    if (evidence) inner.append(p('rt-evidence', fillTemplate(evidence, hit.vars)));
  }
  if (actionHit) {
    inner.append(p('rt-action', fillTemplate(COPY[actionHit.ruleId]!.action, actionHit.vars)));
  }

  const actions = div('rt-actions');
  actions.append(
    button('Send to Read Twice', cb.onSendToReadTwice),
    button("This isn't a scam", () => dismiss(cb)),
  );
  inner.append(actions);
  details.append(inner);
  detailsWrap.append(details);

  shell.append(bar, detailsWrap);
  band.append(shell);
  root.append(band);

  toggle.addEventListener('click', () => setExpanded(toggle.getAttribute('aria-expanded') !== 'true'));
  close.addEventListener('click', () => dismiss(cb));
  // Escape collapses the expanded view (§2.5). The listener lives on the band, so it
  // only fires when a banner control already holds focus — we never hijack the page's
  // own Escape (closing its modals, etc.).
  band.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active && !active.collapsed) {
      e.stopPropagation();
      setExpanded(false);
      toggle.focus();
    }
  });

  document.documentElement.prepend(host);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prevMarginTop = document.documentElement.style.marginTop;
  const prevTransition = document.documentElement.style.transition;
  const baseMarginTop = parseFloat(getComputedStyle(document.documentElement).marginTop) || 0;

  const resize = new ResizeObserver(() => syncPushdown());
  resize.observe(band);

  active = {
    host,
    band,
    detailsWrap,
    toggle,
    resize,
    baseMarginTop,
    prevMarginTop,
    prevTransition,
    entryTimer: null,
    collapsed: false,
  };

  // Push the page down by the banner's height (§2.1: content is pushed, not covered).
  // For the entry we transition the root margin so content slides down in time with the
  // band; then we drop the transition so later height changes (expand/collapse) track
  // the band frame-for-frame via the ResizeObserver instead of lagging behind it.
  if (!reduced) {
    document.documentElement.style.transition = 'margin-top 240ms cubic-bezier(0.22, 0.61, 0.36, 1)';
    active.entryTimer = setTimeout(() => {
      if (active) document.documentElement.style.transition = active.prevTransition;
    }, 300);
  }
  syncPushdown();
}

function syncPushdown(): void {
  if (!active) return;
  const height = active.band.getBoundingClientRect().height;
  document.documentElement.style.marginTop = `${active.baseMarginTop + height}px`;
}

function setExpanded(expand: boolean): void {
  if (!active) return;
  active.collapsed = !expand;
  active.band.classList.toggle('rt-collapsed', !expand);
  active.toggle.setAttribute('aria-expanded', String(expand));
  // Keep collapsed content out of the tab order and the a11y tree.
  active.detailsWrap.toggleAttribute('inert', !expand);
}

function dismiss(cb: BannerCallbacks): void {
  // Both the × and "This isn't a scam" record the 30-day per-domain dismissal (§2.3 / §7).
  // Marking it dismissed-this-load arms the re-show shortcut below.
  dismissedThisLoad = true;
  cb.onNotAScam();
}

// Ctrl/Cmd+Shift+R re-shows a banner the user closed during this page-load (§2.5).
// We only swallow the keystroke when we genuinely have something to re-show; otherwise
// the browser's hard-reload passes straight through, so we never trap the shortcut.
function bindReshow(): void {
  if (reshowBound) return;
  reshowBound = true;
  document.addEventListener(
    'keydown',
    (e) => {
      const combo = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'R' || e.key === 'r');
      if (!combo || active || !dismissedThisLoad || !lastMount) return;
      e.preventDefault();
      dismissedThisLoad = false;
      render(lastMount.verdict, lastMount.cb);
    },
    true,
  );
}

// --- Element helpers -------------------------------------------------------

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function span(className: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  return el;
}

function p(className: string, text: string): HTMLParagraphElement {
  const el = document.createElement('p');
  el.className = className;
  el.textContent = text;
  return el;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'rt-btn';
  el.textContent = label;
  el.setAttribute('aria-label', label);
  el.addEventListener('click', onClick);
  return el;
}

// --- The line-art eye mark (§2.2) ------------------------------------------
// Built node-by-node (never innerHTML) so it survives strict Trusted-Types pages.
// Two-tone: the eye outline + pupil take the band's text color (currentColor); the
// iris takes the verdict accent. Red adds a clean slash, knocked out by a band-colored
// underlay so it reads as cut through the eye rather than laid on top of it.

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function svgRoot(viewBox: string): SVGSVGElement {
  return svgEl('svg', { viewBox, fill: 'none', 'aria-hidden': 'true', focusable: 'false' }) as SVGSVGElement;
}

function eyeMark(slashed: boolean): SVGSVGElement {
  const stroke = { stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  const root = svgRoot('0 0 28 28');
  root.append(
    svgEl('path', { d: 'M3 14C8 7.5 20 7.5 25 14C20 20.5 8 20.5 3 14Z', 'stroke-width': '1.7', ...stroke }),
    svgEl('circle', { cx: '14', cy: '14', r: '4', fill: 'var(--rt-accent)', 'stroke-width': '1.4', ...stroke }),
    svgEl('circle', { cx: '14', cy: '14', r: '1.5', fill: 'currentColor' }),
  );
  if (slashed) {
    root.append(
      svgEl('line', { x1: '5.5', y1: '23', x2: '22.5', y2: '5', stroke: 'var(--rt-band-bg)', 'stroke-width': '4', 'stroke-linecap': 'round' }),
      svgEl('line', { x1: '5.5', y1: '23', x2: '22.5', y2: '5', 'stroke-width': '1.9', ...stroke }),
    );
  }
  return root;
}

function chevronMark(): SVGSVGElement {
  const root = svgRoot('0 0 24 24');
  root.append(
    svgEl('path', { d: 'M7 15L12 10L17 15', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  );
  return root;
}

function closeMark(): SVGSVGElement {
  const root = svgRoot('0 0 24 24');
  const stroke = { stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' };
  root.append(
    svgEl('line', { x1: '6.5', y1: '6.5', x2: '17.5', y2: '17.5', ...stroke }),
    svgEl('line', { x1: '17.5', y1: '6.5', x2: '6.5', y2: '17.5', ...stroke }),
  );
  return root;
}
