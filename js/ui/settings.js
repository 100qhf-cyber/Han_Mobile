// 설정 화면 — Supabase 연결, 폴링 주기, 기준 전력, 데이터 관리.

import { isConfigured, syncOnce, testConnection } from '../backend.js';
import { BAKED_CONNECTION, HAS_BAKED_CONNECTION, STORAGE_KEYS } from '../config.js';
import { store } from '../store.js';
import { $, el, mount } from '../util.js';

let root = null;

export function renderSettings(container) {
  root = container;
  paint();
}

/** 설정 탭에서 직접 지정한 접속 정보를 쓰고 있는가 */
const usesOverride = () => store.connection().source === 'settings';

/** 연결 정보가 어디서 왔는지 알려주는 안내문 */
function connectionNotice() {
  if (usesOverride()) {
    return el('p', { class: 'notice is-info' },
      '이 휴대폰에 직접 입력한 주소로 연결합니다. 아래 두 칸을 비우고 저장하면 기본 연결로 돌아갑니다.');
  }
  if (HAS_BAKED_CONNECTION) {
    return el('p', { class: 'notice is-ok' },
      `앱에 내장된 주소로 자동 연결됩니다 (${safeHost(BAKED_CONNECTION.url)}). ` +
      '다른 프로젝트에 붙일 때만 아래에 입력하세요.');
  }
  return el('p', { class: 'notice' },
    '연결 정보가 없어 로컬 모드로 동작합니다 — 입력은 이 휴대폰 안에만 저장되고 Unity 로 넘어가지 않습니다.');
}

function safeHost(url) {
  try { return new URL(url).host; } catch { return url; }
}

function paint() {
  const s = store.settings;

  mount(root,
    el('section', { class: 'settings-block' }, [
      el('h2', { class: 'settings-title' }, 'Supabase 연결'),
      connectionNotice(),

      el('label', { class: 'field-label', for: 's-url' }, 'Project URL'),
      el('input', {
        class: 'input', id: 's-url', type: 'url', inputmode: 'url',
        placeholder: HAS_BAKED_CONNECTION
          ? `기본값: ${safeHost(BAKED_CONNECTION.url)}`
          : 'https://xxxxxxxxxxxx.supabase.co',
        autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
        value: s.supabaseUrl,
      }),

      el('label', { class: 'field-label', for: 's-key' }, 'anon (publishable) key'),
      el('textarea', {
        class: 'input input-key', id: 's-key', rows: '3',
        placeholder: HAS_BAKED_CONNECTION ? '기본값 사용 중 — 비워두세요' : 'eyJhbGciOi...',
        autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
      }, s.supabaseKey),
      el('p', { class: 'hint' },
        'anon key 는 클라이언트에 노출되도록 만들어진 공개 키입니다. 데이터 보호는 Supabase 의 RLS 정책이 담당합니다. service_role key 는 절대 여기에 넣지 마세요.'),

      el('div', { class: 'btn-row' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', id: 's-test', onclick: onTest }, '연결 테스트'),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: onSave }, '저장'),
      ]),
      usesOverride()
        ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: onUseBaked },
            '기본 연결로 되돌리기')
        : null,
      el('p', { class: 'test-result', id: 's-test-result', hidden: true }),
    ]),

    el('section', { class: 'settings-block' }, [
      el('h2', { class: 'settings-title' }, '동작'),

      el('label', { class: 'field-label', for: 's-poll' }, '갱신 주기 (초)'),
      el('input', {
        class: 'input', id: 's-poll', type: 'number', min: '0.5', max: '30', step: '0.5',
        inputmode: 'decimal', value: String((s.pollIntervalMs / 1000).toFixed(1)),
      }),
      el('p', { class: 'hint' }, '충전 중 배터리 잔량을 이 주기로 다시 읽어옵니다.'),

      el('label', { class: 'field-label', for: 's-power' }, '기준 충전 전력 (mW)'),
      el('input', {
        class: 'input', id: 's-power', type: 'number', min: '1', max: '10000', step: '1',
        inputmode: 'numeric', value: String(s.referencePowerMW),
      }),
      el('p', { class: 'hint' }, '입차 화면의 “예상 충전 시간” 계산에만 쓰입니다. 실측 전력에 맞춰 조정하세요.'),

      el('div', { class: 'btn-row' }, [
        el('button', { type: 'button', class: 'btn btn-primary', onclick: onSave }, '저장'),
      ]),
    ]),

    el('section', { class: 'settings-block' }, [
      el('h2', { class: 'settings-title' }, '데이터'),
      el('div', { class: 'stat-row' }, [
        stat('저장된 차량', String(store.all().length)),
        stat('전송 대기', String(store.outbox.length)),
        stat('연결', isConfigured() ? (usesOverride() ? '직접 지정' : '자동') : '로컬'),
      ]),
      el('div', { class: 'btn-row' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: onExport }, 'JSON 내보내기'),
        el('button', { type: 'button', class: 'btn btn-danger', onclick: onReset }, '전체 초기화'),
      ]),
    ]),

    el('p', { class: 'version-note' }, `Han Mobile · ${document.documentElement.dataset.appVersion ?? ''}`),
  );
}

function stat(label, value) {
  return el('div', { class: 'stat' }, [
    el('span', { class: 'stat-value' }, value),
    el('span', { class: 'stat-label' }, label),
  ]);
}

// ── 액션 ────────────────────────────────────────────────────────

function readForm() {
  return {
    supabaseUrl: $('#s-url', root).value.trim().replace(/\/+$/, ''),
    supabaseKey: $('#s-key', root).value.trim(),
    pollIntervalMs: Math.round((Number($('#s-poll', root).value) || 1) * 1000),
    referencePowerMW: Number($('#s-power', root).value) || 250,
  };
}

function onSave() {
  store.updateSettings(readForm());
  syncOnce();
  paint();
  toast('설정을 저장했습니다', 'ok');
}

/** 직접 입력한 접속 정보를 지우고 앱에 내장된 기본 연결로 되돌린다. */
function onUseBaked() {
  store.updateSettings({ supabaseUrl: '', supabaseKey: '' });
  syncOnce();
  paint();
  toast('기본 연결로 되돌렸습니다', 'ok');
}

async function onTest() {
  const btn = $('#s-test', root);
  const result = $('#s-test-result', root);

  // 칸이 비어 있으면 실제로 쓰이게 될 연결(내장값)을 테스트한다.
  const form = readForm();
  const effective = store.connection();
  const supabaseUrl = form.supabaseUrl || effective.url;
  const supabaseKey = form.supabaseKey || effective.key;

  btn.disabled = true;
  btn.textContent = '확인 중...';
  result.hidden = false;
  result.className = 'test-result';
  result.textContent = 'Supabase 에 연결하는 중...';

  const res = await testConnection(supabaseUrl, supabaseKey);

  btn.disabled = false;
  btn.textContent = '연결 테스트';
  result.className = `test-result ${res.ok ? 'is-ok' : 'is-fail'}`;
  result.textContent = res.message;
}

function onExport() {
  const payload = {
    exportedAt: new Date().toISOString(),
    vehicles: store.all(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `han-mobile-${Date.now()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function onReset() {
  if (!confirm('이 휴대폰에 저장된 차량 기록을 모두 지웁니다. 계속할까요?')) return;
  store.entries = [];
  store.outbox = [];
  store.persistEntries();
  localStorage.removeItem(STORAGE_KEYS.OUTBOX);
  store.emit();
  toast('로컬 기록을 초기화했습니다', 'ok');
}

function toast(message, tone) {
  document.dispatchEvent(new CustomEvent('app:toast', { detail: { message, tone } }));
}
