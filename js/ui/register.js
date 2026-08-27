// 입차 등록 화면 — 앱의 메인 입력 폼.

import {
  DEFAULT_STAY_MINUTES, DEFAULT_VEHICLE_ID, VEHICLES, ZONE_COLS, ZONE_ROWS,
} from '../config.js';
import { store, vehicleSpec } from '../store.js';
import {
  $, clamp, el, formatDuration, formatEnergy, fromLocalInputValue,
  isValidCarNumber, normalizeCarNumber, toLocalInputValue,
} from '../util.js';

/** 폼이 들고 있는 임시 값 (제출 전까지 store 에 넣지 않는다) */
const draft = {
  carNumber: '',
  vehicleId: DEFAULT_VEHICLE_ID,
  batteryPct: 30,
  entryAt: null,   // null 이면 "지금"
  exitAt: null,
  zone: null,
};

let root = null;

export function renderRegister(container) {
  root = container;
  resetTimes();
  container.replaceChildren(buildForm());
  refreshDerived();
  refreshZones();
}

function resetTimes() {
  const now = new Date();
  draft.entryAt = toLocalInputValue(now);
  draft.exitAt  = toLocalInputValue(new Date(now.getTime() + DEFAULT_STAY_MINUTES * 60_000));
}

// ── 폼 조립 ──────────────────────────────────────────────────────

function buildForm() {
  return el('form', { class: 'form', id: 'register-form', onsubmit: onSubmit, novalidate: true }, [
    field('차 번호', [
      el('input', {
        class: 'input', id: 'f-car-number', type: 'text', inputmode: 'text',
        placeholder: '12가 3456', autocomplete: 'off', value: draft.carNumber,
        oninput: (e) => { draft.carNumber = e.target.value; clearError(); },
      }),
    ], '미니어처 차량이면 식별용 이름을 그대로 써도 됩니다.'),

    field('차량 종류 · 배터리 총 용량', [
      el('div', { class: 'seg', id: 'f-vehicle' },
        VEHICLES.map((v) =>
          el('button', {
            type: 'button', class: `seg-item${v.id === draft.vehicleId ? ' is-active' : ''}`,
            dataset: { vehicle: v.id },
            onclick: () => selectVehicle(v.id),
          }, [
            el('span', { class: 'seg-title' }, v.label),
            el('span', { class: 'seg-sub' }, `${v.maxCapacity_mWs.toLocaleString('ko-KR')}`),
          ]),
        ),
      ),
    ], '아래 숫자는 최대 용량 (mW·s = mJ)'),

    field('현재 배터리 잔량', [
      el('div', { class: 'battery-row' }, [
        el('input', {
          class: 'range', id: 'f-battery-range', type: 'range',
          min: '0', max: '100', step: '1', value: String(draft.batteryPct),
          oninput: (e) => setBattery(e.target.value, 'range'),
        }),
        el('div', { class: 'battery-num' }, [
          el('input', {
            class: 'input input-num', id: 'f-battery-num', type: 'number',
            min: '0', max: '100', step: '0.1', inputmode: 'decimal',
            value: String(draft.batteryPct),
            oninput: (e) => setBattery(e.target.value, 'num'),
          }),
          el('span', { class: 'unit' }, '%'),
        ]),
      ]),
      el('div', { class: 'gauge' }, [el('div', { class: 'gauge-fill', id: 'f-gauge' })]),
    ]),

    field('입차 시간', [
      el('div', { class: 'time-row' }, [
        el('input', {
          class: 'input', id: 'f-entry', type: 'datetime-local', value: draft.entryAt,
          oninput: (e) => { draft.entryAt = e.target.value; refreshDerived(); clearError(); },
        }),
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: setEntryNow }, '지금'),
      ]),
    ], '기본값은 현재 시각입니다.'),

    field('출차 시간', [
      el('div', { class: 'time-row' }, [
        el('input', {
          class: 'input', id: 'f-exit', type: 'datetime-local', value: draft.exitAt,
          oninput: (e) => { draft.exitAt = e.target.value; refreshDerived(); clearError(); },
        }),
      ]),
      el('div', { class: 'quick-row' },
        [30, 60, 120, 240].map((min) =>
          el('button', {
            type: 'button', class: 'chip', onclick: () => setStay(min),
          }, min >= 60 ? `+${min / 60}시간` : `+${min}분`),
        ),
      ),
    ]),

    field('주차 구역', [
      el('div', { class: 'zone-grid', id: 'f-zones' }, buildZoneCells()),
      el('p', { class: 'hint', id: 'f-zone-hint' }, '선택하지 않으면 Unity 쪽에서 배정합니다.'),
    ]),

    el('section', { class: 'summary', id: 'f-summary' }),
    el('p', { class: 'form-error', id: 'f-error', role: 'alert', hidden: true }),

    el('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, '입차 등록'),
  ]);
}

function field(label, children, hint) {
  return el('div', { class: 'field' }, [
    el('label', { class: 'field-label' }, label),
    ...children,
    hint ? el('p', { class: 'hint' }, hint) : null,
  ]);
}

function buildZoneCells() {
  const cells = [];
  for (const col of ZONE_COLS) {
    for (const row of ZONE_ROWS) {
      const id = `${col}${row}`;
      cells.push(el('button', {
        type: 'button', class: 'zone', dataset: { zone: id },
        onclick: () => selectZone(id),
      }, id));
    }
  }
  return cells;
}

// ── 입력 핸들러 ──────────────────────────────────────────────────

function selectVehicle(id) {
  draft.vehicleId = id;
  for (const btn of root.querySelectorAll('[data-vehicle]')) {
    btn.classList.toggle('is-active', btn.dataset.vehicle === id);
  }
  refreshDerived();
}

function setBattery(raw, source) {
  const pct = clamp(Number(raw) || 0, 0, 100);
  draft.batteryPct = pct;
  if (source !== 'range') $('#f-battery-range', root).value = String(pct);
  if (source !== 'num')   $('#f-battery-num', root).value = String(pct);
  refreshDerived();
}

function setEntryNow() {
  const now = new Date();
  draft.entryAt = toLocalInputValue(now);
  $('#f-entry', root).value = draft.entryAt;
  refreshDerived();
  clearError();
}

function setStay(minutes) {
  const base = draft.entryAt ? new Date(draft.entryAt) : new Date();
  draft.exitAt = toLocalInputValue(new Date(base.getTime() + minutes * 60_000));
  $('#f-exit', root).value = draft.exitAt;
  refreshDerived();
  clearError();
}

function selectZone(id) {
  draft.zone = draft.zone === id ? null : id;
  refreshZones();
  clearError();
}

// ── 파생 표시 ────────────────────────────────────────────────────

function refreshZones() {
  const occupied = store.occupiedZones();
  for (const cell of root.querySelectorAll('[data-zone]')) {
    const id = cell.dataset.zone;
    const isOccupied = occupied.has(id);
    cell.classList.toggle('is-occupied', isOccupied);
    cell.classList.toggle('is-selected', draft.zone === id);
    cell.disabled = isOccupied;
  }
  const hint = $('#f-zone-hint', root);
  if (hint) {
    hint.textContent = draft.zone
      ? `${draft.zone} 선택됨 — 다시 누르면 해제됩니다.`
      : '선택하지 않으면 Unity 쪽에서 배정합니다. (빨간 칸은 사용 중)';
  }
}

function refreshDerived() {
  const spec = vehicleSpec(draft.vehicleId);
  const current = (spec.maxCapacity_mWs * draft.batteryPct) / 100;
  const needed  = Math.max(0, spec.maxCapacity_mWs - current);

  const gauge = $('#f-gauge', root);
  if (gauge) {
    gauge.style.width = `${draft.batteryPct}%`;
    gauge.dataset.tone = draft.batteryPct >= 80 ? 'full'
      : draft.batteryPct >= 40 ? 'mid'
      : draft.batteryPct >= 15 ? 'low' : 'critical';
  }

  const entry = draft.entryAt ? new Date(draft.entryAt) : null;
  const exit  = draft.exitAt  ? new Date(draft.exitAt)  : null;
  const stayMs = entry && exit ? exit - entry : NaN;

  const summary = $('#f-summary', root);
  if (!summary) return;
  summary.replaceChildren(
    summaryRow('현재 저장 에너지', formatEnergy(current)),
    summaryRow('충전 필요량', formatEnergy(needed)),
    summaryRow('주차 예정 시간',
      Number.isFinite(stayMs)
        ? (stayMs <= 0 ? '⚠ 출차가 입차보다 빠릅니다' : formatDuration(stayMs))
        : '—',
      Number.isFinite(stayMs) && stayMs <= 0 ? 'warn' : null),
  );
}

function summaryRow(label, value, tone) {
  return el('div', { class: `summary-row${tone ? ` is-${tone}` : ''}` }, [
    el('span', { class: 'summary-label' }, label),
    el('span', { class: 'summary-value' }, value),
  ]);
}

// ── 제출 ────────────────────────────────────────────────────────

function showError(message) {
  const node = $('#f-error', root);
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  node.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function clearError() {
  const node = $('#f-error', root);
  if (node) node.hidden = true;
}

function onSubmit(event) {
  event.preventDefault();

  const carNumber = normalizeCarNumber(draft.carNumber);
  if (!isValidCarNumber(carNumber)) {
    showError('차 번호를 입력하세요.');
    return;
  }

  const duplicate = store.active().find((e) => e.carNumber === carNumber);
  if (duplicate) {
    showError(`${carNumber} 는 이미 주차 중입니다. 먼저 출차 처리하세요.`);
    return;
  }

  const entryAt = fromLocalInputValue(draft.entryAt);
  const exitAt  = fromLocalInputValue(draft.exitAt);
  if (!entryAt) { showError('입차 시간을 확인하세요.'); return; }
  if (!exitAt)  { showError('출차 시간을 확인하세요.'); return; }
  if (new Date(exitAt) <= new Date(entryAt)) {
    showError('출차 시간은 입차 시간보다 뒤여야 합니다.');
    return;
  }

  if (draft.zone && store.occupiedZones().has(draft.zone)) {
    showError(`${draft.zone} 구역은 이미 사용 중입니다.`);
    return;
  }

  const saved = store.addEntry({
    carNumber,
    vehicleId: draft.vehicleId,
    batteryPct: draft.batteryPct,
    entryAt,
    exitAt,
    zone: draft.zone,
  });

  // 다음 입력을 위해 폼 초기화 (차종·잔량은 유지하면 연속 입력이 편하다)
  draft.carNumber = '';
  draft.zone = null;
  resetTimes();
  renderRegister(root);

  document.dispatchEvent(new CustomEvent('app:toast', {
    detail: { message: `${saved.carNumber} 입차 등록 완료`, tone: 'ok' },
  }));
}
