import { describe, it, expect } from 'vitest';
import { buildContext } from './build-context';

// Pins the one fidelity-critical facet of the innerText shim: block-level elements must
// be separated, not glued. A revert to plain textContent would silently let the harness
// match phrases across a block boundary that the shipped extension never would — inflating
// reported precision. No seed fixture splits a phrase across blocks, so without this test
// that regression would pass unnoticed.
describe('buildContext innerText shim', () => {
  it('separates adjacent block elements instead of gluing their text', () => {
    const html = '<body><p>account will be</p><p>suspended within 24 hours</p></body>';
    const ctx = buildContext(html, { id: 'shim-probe', label: 'scam', domain: 'x.example' });

    expect(ctx.features.bodyExcerpt).not.toContain('account will besuspended');
    expect(ctx.features.bodyExcerpt).toContain('account will be');
    expect(ctx.features.bodyExcerpt).toContain('suspended within 24 hours');
  });

  it('renders <br> as a break within a block', () => {
    const html = '<body><p>final<br>notice</p></body>';
    const ctx = buildContext(html, { id: 'br-probe', label: 'scam', domain: 'x.example' });

    expect(ctx.features.bodyExcerpt).not.toContain('finalnotice');
  });

  // The other direction: never break where a browser doesn't. An under-matching shim hides a
  // phrase the extension matches, so the red-FP gate would pass a page that draws red.
  it('runs inline elements together, as a browser does (button, label)', () => {
    const html = '<body><p>Click <button>Pay</button> now</p><p>Enter <label>your card</label> number</p></body>';
    const ctx = buildContext(html, { id: 'inline-probe', label: 'scam', domain: 'x.example' });

    expect(ctx.features.bodyExcerpt).toContain('Click Pay now');
    expect(ctx.features.bodyExcerpt).toContain('Enter your card number');
  });

  it("joins a row's cells with a tab", () => {
    const html = '<body><table><tr><td>account will be</td><td>suspended</td></tr></table></body>';
    const ctx = buildContext(html, { id: 'cell-probe', label: 'scam', domain: 'x.example' });

    expect(ctx.features.bodyExcerpt).toContain('account will be\tsuspended');
  });
});
