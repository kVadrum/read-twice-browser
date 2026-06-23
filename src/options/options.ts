import { h, render } from 'preact';
import { getSettings, setSettings, type Settings } from '../lib/storage/settings';

// Settings page (architecture §4.3): enable/disable, RDAP toggle, feedback opt-in,
// read-only ruleset version. SCAFFOLD: imperative render-on-load; full visual pass
// via frontend-design.

async function main(): Promise<void> {
  const settings = await getSettings();
  const root = document.getElementById('app');
  if (root) render(view(settings), root);
}

function view(s: Settings) {
  return h('main', null, [
    h('h1', { style: 'font-size:20px' }, 'Read Twice'),
    toggle('Protection is on', s.enabled, (v) => save({ enabled: v })),
    toggle('Check how new a website is (one lookup per site, cached 30 days)', s.rdapEnabled, (v) =>
      save({ rdapEnabled: v }),
    ),
    toggle('Send an anonymized note when I mark something “not a scam”', s.feedbackOptIn, (v) =>
      save({ feedbackOptIn: v }),
    ),
    h('p', { style: 'font-size:13px;color:#777;margin-top:24px' }, `Ruleset version ${s.rulesetVersion}`),
  ]);
}

async function save(patch: Partial<Settings>): Promise<void> {
  await setSettings(patch);
  await main(); // re-render from the persisted state
}

function toggle(label: string, checked: boolean, onChange: (v: boolean) => void) {
  return h('label', { style: 'display:block;margin:12px 0;font-size:14px' }, [
    h('input', {
      type: 'checkbox',
      checked,
      onChange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
      style: 'margin-right:8px',
    }),
    label,
  ]);
}

void main();
