// 주차 현황 화면 — 등록된 차량 목록과 실시간 배터리 상태.

import { STATUS, STATUS_META } from '../config.js';
import { store } from '../store.js';
import {
  batteryTone, el, formatClock, formatDuration, formatEnergy, formatPct, mount,
} from '../util.js';

let root = null;

export function renderStatus(container) {
  root = container;
  paint();
}

/** store 가 바뀔 때마다 호출된다 (폴링으로 배터리가 오르면 여기서 다시 그린다). */
export function refreshStatus() {
  if (root && root.isConnected) paint();
}

function paint() {
  const cars = store.active();
  const departed = store.all().filter((e) => e.status === STATUS.DEPARTED);

  mount(root,
    el('div', { class: 'status-head' }, [
      el('div', { class: 'status-count' }, [
        el('strong', {}, String(cars.length)),
        el('span', {}, ' / 18 구역 사용 중'),
      ]),
      cars.length > 0
        ? el('span', { class: 'status-sub' }, `충전 중 ${cars.filter((c) => c.status === STATUS.CHARGING).length}대`)
        : null,
    ]),

    cars.length === 0 ? emptyState() : el('div', { class: 'card-list' }, cars.map(card)),

    departed.length > 0
      ? el('div', { class: 'departed-block' }, [
          el('div', { class: 'departed-head' }, [
            el('span', {}, `출차 기록 ${departed.length}건`),
            el('button', {
              type: 'button', class: 'btn btn-ghost btn-sm',
              onclick: () => store.clearDeparted(),
            }, '기록 지우기'),
          ]),
          el('ul', { class: 'departed-list' }, departed.slice(-8).reverse().map((e) =>
            el('li', {}, `${e.carNumber} · ${e.zone ?? '구역 미지정'} · ${formatClock(e.departedAt)}`),
          )),
        ])
      : null,
  );
}

function emptyState() {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'empty-icon' }, '🅿️'),
    el('p', { class: 'empty-title' }, '주차된 차량이 없습니다'),
    el('p', { class: 'empty-sub' }, '“입차” 탭에서 차량을 등록하세요.'),
  ]);
}

// ── 차량 카드 ───────────────────────────────────────────────────

function card(car) {
  const meta = STATUS_META[car.status] ?? STATUS_META[STATUS.WAITING];
  const now = Date.now();
  const exitMs = new Date(car.exitAt) - now;
  const isCharging = car.status === STATUS.CHARGING;

  return el('article', { class: `car-card${isCharging ? ' is-charging' : ''}` }, [
    el('header', { class: 'car-head' }, [
      el('div', { class: 'car-ident' }, [
        el('span', { class: 'car-number' }, car.carNumber),
        el('span', { class: 'car-model' }, `${car.vehicleName} · ${formatEnergy(car.maxCapacity_mWs)}`),
      ]),
      el('span', { class: `badge badge-${meta.tone}` }, [
        isCharging ? el('span', { class: 'pulse' }) : null,
        meta.label,
      ]),
    ]),

    el('div', { class: 'car-battery' }, [
      el('div', { class: 'gauge gauge-lg' }, [
        el('div', {
          class: 'gauge-fill',
          dataset: { tone: batteryTone(car.batteryPct) },
          style: `width:${car.batteryPct}%`,
        }),
      ]),
      el('div', { class: 'battery-meta' }, [
        el('span', { class: 'battery-pct' }, formatPct(car.batteryPct)),
        el('span', { class: 'battery-energy' },
          `${Math.round(car.current_mWs).toLocaleString('ko-KR')} / ${car.maxCapacity_mWs.toLocaleString('ko-KR')} mW·s`),
      ]),
    ]),

    el('dl', { class: 'car-facts' }, [
      fact('구역', car.zone ?? '미배정'),
      fact('입차', formatClock(car.entryAt)),
      fact('출차 예정', formatClock(car.exitAt)),
      fact(exitMs >= 0 ? '남은 시간' : '초과',
        formatDuration(Math.abs(exitMs)),
        exitMs < 0 ? 'warn' : null),
      isCharging && car.powerMW > 0 ? fact('충전 전력', `${car.powerMW.toFixed(1)} mW`, 'active') : null,
      car.needed_mWs > 0 ? fact('남은 충전량', formatEnergy(Math.round(car.needed_mWs))) : null,
    ].filter(Boolean)),

    el('div', { class: 'car-actions' }, [
      el('button', {
        type: 'button', class: 'btn btn-danger btn-sm',
        onclick: () => onDepart(car),
      }, '출차 처리'),
    ]),
  ]);
}

function fact(label, value, tone) {
  return el('div', { class: `fact${tone ? ` is-${tone}` : ''}` }, [
    el('dt', {}, label),
    el('dd', {}, value),
  ]);
}

function onDepart(car) {
  const ok = confirm(`${car.carNumber} 를 출차 처리할까요?`);
  if (!ok) return;
  store.departEntry(car.id);
  document.dispatchEvent(new CustomEvent('app:toast', {
    detail: { message: `${car.carNumber} 출차 처리됨`, tone: 'ok' },
  }));
}
