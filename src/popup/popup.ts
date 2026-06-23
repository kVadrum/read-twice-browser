import { h, render } from 'preact';

// Toolbar popup — current-page status + a settings shortcut (architecture §4.3).
// SCAFFOLD: minimal status surface. Full visual pass goes through frontend-design.

function Popup() {
  return h('main', { style: 'padding:16px' }, [
    h('h1', { style: 'font-size:15px;margin:0 0 8px' }, 'Read Twice'),
    h(
      'p',
      { style: 'font-size:13px;color:#555;margin:0 0 12px;line-height:1.4' },
      'A calm second eye. If this page looks off, a banner appears at the top.',
    ),
    h('a', { href: '#', style: 'font-size:13px', onClick: openOptions }, 'Settings'),
  ]);
}

function openOptions(e: Event): void {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
}

const root = document.getElementById('app');
if (root) render(h(Popup, null), root);
