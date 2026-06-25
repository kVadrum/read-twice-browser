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
});
