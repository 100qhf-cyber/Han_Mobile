// 앱 진입점 — 탭 전환, 연결 상태 표시, 토스트, 서비스워커 등록.

import { startPolling, syncOnce } from './backend.js';
import { store } from './store.js';
import { $, el } from './util.js';
import { renderRegister } from './ui/register.js';
import { refreshStatus, renderStatus } from './ui/status.js';
import { renderSettings } from './ui/settings.js';

const TABS = {
  register: { label: '입차',  icon: '⊕', render: renderRegister },
  status:   { label: '현황',  icon: '▤', render: renderStatus   },
  settings: { label: '설정',  icon: '⚙', render: renderSettings },
};

let activeTab = 'register';
const view = $('#view');

function switchTab(name, { force = false } = {}) {
  if (!TABS[name]) return;
  if (name === activeTab && !force) return;
  activeTab = name;

  for (const btn of document.querySelectorAll('[data-tab]')) {
    const isActive = btn.dataset.tab === name;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  }

  $('#view-title').textContent = { register: '입차 등록', status: '주차 현황', settings: '설정' }[name];
  view.scrollTop = 0;
  TABS[name].render(view);
}

// ── 연결 상태 배너 ───────────────────────────────────────────────

function paintLink() {
  const bar = $('#link-bar');
  const { mode, message } = store.link;
  bar.dataset.mode = mode;
  bar.textContent = message;
}

// ── 토스트 ──────────────────────────────────────────────────────

let toastTimer = null;

document.addEventListener('app:toast', (event) => {
  const { message, tone = 'ok' } = event.detail ?? {};
  const host = $('#toast');
  host.replaceChildren(el('div', { class: `toast-body is-${tone}` }, message));
  host.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.hidden = true; }, 2600);
});

// ── store 구독 ──────────────────────────────────────────────────

store.addEventListener('change', () => {
  paintLink();
  if (activeTab === 'status') refreshStatus();
});

// ── 시작 ────────────────────────────────────────────────────────

for (const [name, tab] of Object.entries(TABS)) {
  $('#tabbar').append(
    el('button', {
      type: 'button', class: 'tab', role: 'tab', dataset: { tab: name },
      'aria-selected': 'false', onclick: () => switchTab(name),
    }, [
      el('span', { class: 'tab-icon' }, tab.icon),
      el('span', { class: 'tab-label' }, tab.label),
    ]),
  );
}

switchTab('register', { force: true });
paintLink();
syncOnce().then(startPolling);

// 현황 화면의 "남은 시간"이 흘러가도록 주기적으로 다시 그린다.
setInterval(() => { if (activeTab === 'status') refreshStatus(); }, 30_000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[sw] 등록 실패', err);
    });
  });
}
