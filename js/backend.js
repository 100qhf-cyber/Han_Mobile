// 백엔드 어댑터 — Supabase(PostgREST) 또는 로컬 전용.
//
// Supabase URL / anon key 가 설정돼 있으면 원격 동기화, 없으면 로컬 모드로 동작한다.
// 라이브러리 없이 REST 만 쓴다 (PostgREST). 실시간 반영은 폴링으로 처리하며,
// 나중에 supabase-js 의 Realtime 으로 바꿔도 이 파일만 고치면 된다.
//
// anon key 는 공개용 키다. 데이터 보호는 Supabase 쪽 RLS 정책으로 한다
// (supabase/schema.sql 참고).

import { store } from './store.js';

const TIMEOUT_MS = 6000;
const TABLE = 'vehicles';

export function isConfigured() {
  const { supabaseUrl, supabaseKey } = store.settings;
  return Boolean((supabaseUrl || '').trim() && (supabaseKey || '').trim());
}

function endpoint(path) {
  const base = (store.settings.supabaseUrl || '').trim().replace(/\/+$/, '');
  return `${base}/rest/v1${path}`;
}

function headers(extra = {}) {
  const key = (store.settings.supabaseKey || '').trim();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint(path), {
      ...options,
      signal: controller.signal,
      headers: headers(options.headers),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(describeError(res.status, body));
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('응답 없음 (시간 초과)');
    if (err instanceof TypeError) throw new Error('네트워크 연결 실패');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function describeError(status, body) {
  let message = '';
  try { message = JSON.parse(body)?.message || ''; } catch { message = ''; }
  if (status === 401 || status === 403) {
    return `인증 거부 (${status}) — anon key 또는 RLS 정책을 확인하세요`;
  }
  if (status === 404) {
    return `테이블을 찾을 수 없음 (404) — schema.sql 을 실행했는지 확인하세요`;
  }
  return message ? `HTTP ${status}: ${message}` : `HTTP ${status}`;
}

// ── 레코드 매핑 (앱은 camelCase, DB 는 snake_case) ────────────────

function toRow(entry) {
  return {
    id: entry.id,
    car_number: entry.carNumber,
    vehicle_id: entry.vehicleId,
    max_capacity_mws: entry.maxCapacity_mWs,
    battery_pct: entry.batteryPct,
    power_mw: entry.powerMW ?? 0,
    zone: entry.zone,
    status: entry.status,
    entry_at: entry.entryAt,
    exit_at: entry.exitAt,
    departed_at: entry.departedAt ?? null,
  };
}

function fromRow(row) {
  return {
    id: row.id,
    carNumber: row.car_number,
    vehicleId: row.vehicle_id,
    maxCapacity_mWs: Number(row.max_capacity_mws),
    batteryPct: Number(row.battery_pct),
    powerMW: Number(row.power_mw ?? 0),
    zone: row.zone,
    status: row.status,
    entryAt: row.entry_at,
    exitAt: row.exit_at,
    departedAt: row.departed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── 아웃박스 전송 ────────────────────────────────────────────────

async function flushOutbox() {
  for (const job of [...store.outbox]) {
    if (job.type === 'park') {
      // 재전송이 중복 행을 만들지 않도록 id 기준 upsert
      await rest(`/${TABLE}`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(toRow(job.entry)),
      });
    } else if (job.type === 'depart') {
      await rest(`/${TABLE}?id=eq.${encodeURIComponent(job.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'departed',
          departed_at: job.departedAt ?? new Date().toISOString(),
        }),
      });
    }
    store.dequeue(job.jobId);
  }
}

// ── 동기화 ──────────────────────────────────────────────────────

/** 한 번 동기화. 성공 여부를 반환하고 store 의 링크 상태를 갱신한다. */
export async function syncOnce() {
  if (!isConfigured()) {
    const pending = store.outbox.length;
    store.setLink('local',
      `로컬 모드 — 이 휴대폰에만 저장됩니다${pending ? ` · 전송 대기 ${pending}건` : ''}`);
    return false;
  }

  try {
    await flushOutbox();
    const rows = await rest(
      `/${TABLE}?select=*&status=neq.departed&order=entry_at.asc`,
      { method: 'GET' },
    );
    const changed = store.mergeRemote((rows ?? []).map(fromRow));
    const host = safeHost(store.settings.supabaseUrl);
    store.setLink('connected', `Supabase 연결됨 · ${host}`);
    if (changed) store.emit();
    return true;
  } catch (err) {
    const pending = store.outbox.length;
    store.setLink('error',
      `동기화 실패: ${err.message}${pending ? ` · 전송 대기 ${pending}건` : ''}`);
    return false;
  }
}

function safeHost(url) {
  try { return new URL(url).host; } catch { return url; }
}

/** 설정 화면의 "연결 테스트" — 테이블을 실제로 읽어본다. */
export async function testConnection(url, key) {
  const trimmedUrl = (url || '').trim().replace(/\/+$/, '');
  const trimmedKey = (key || '').trim();
  if (!trimmedUrl || !trimmedKey) return { ok: false, message: 'URL 과 anon key 를 모두 입력하세요' };
  if (!/^https?:\/\//.test(trimmedUrl)) {
    return { ok: false, message: 'URL 은 https:// 로 시작해야 합니다' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${trimmedUrl}/rest/v1/${TABLE}?select=id&limit=1`, {
      signal: controller.signal,
      headers: { apikey: trimmedKey, Authorization: `Bearer ${trimmedKey}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, message: describeError(res.status, body) };
    }
    return { ok: true, message: `연결 성공 · ${safeHost(trimmedUrl)}` };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, message: '응답 없음 (시간 초과)' };
    return { ok: false, message: `네트워크 오류: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

// ── 폴링 ────────────────────────────────────────────────────────

let pollTimer = null;

export function startPolling() {
  stopPolling();
  const tick = async () => {
    if (document.visibilityState === 'visible') await syncOnce();
    pollTimer = setTimeout(tick, Math.max(500, Number(store.settings.pollIntervalMs) || 1000));
  };
  tick();
}

export function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncOnce();
});
