// 앱 상태 저장소.
//
// 휴대폰의 localStorage 가 항상 1차 저장소다. Supabase 에 연결되면
// 서버가 돌려준 상태를 반영하되, 아직 전송 못 한 입/출차는 아웃박스에 남겨
// 연결이 돌아왔을 때 다시 보낸다. (지하주차장에서 신호가 끊겨도 입력은 남는다)

import { DEFAULT_SETTINGS, STORAGE_KEYS, STATUS, VEHICLES } from './config.js';
import { clamp, uid } from './util.js';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[store] 저장 실패', err);
  }
}

export const vehicleSpec = (vehicleId) =>
  VEHICLES.find((v) => v.id === vehicleId) ?? VEHICLES[0];

/** 저장 레코드에서 화면에 필요한 값들을 계산해 붙인다. */
export function derive(entry) {
  const spec = vehicleSpec(entry.vehicleId);
  const maxCapacity = entry.maxCapacity_mWs ?? spec.maxCapacity_mWs;
  const pct = clamp(Number(entry.batteryPct) || 0, 0, 100);
  const current = (maxCapacity * pct) / 100;
  return {
    ...entry,
    vehicleName: spec.name,
    maxCapacity_mWs: maxCapacity,
    batteryPct: pct,
    current_mWs: current,
    needed_mWs: Math.max(0, maxCapacity - current),
  };
}

class Store extends EventTarget {
  constructor() {
    super();
    this.entries  = readJSON(STORAGE_KEYS.VEHICLES, []);
    this.settings = { ...DEFAULT_SETTINGS, ...readJSON(STORAGE_KEYS.SETTINGS, {}) };
    this.outbox   = readJSON(STORAGE_KEYS.OUTBOX, []);
    /** 브릿지 연결 상태: 'local' | 'connected' | 'error' */
    this.link = { mode: 'local', message: '로컬 모드', lastSyncAt: null };
  }

  emit() {
    this.dispatchEvent(new CustomEvent('change'));
  }

  // ── 조회 ──────────────────────────────────────────────────────

  /** 출차하지 않은 차량만, 입차 시각 순 */
  active() {
    return this.entries
      .filter((e) => e.status !== STATUS.DEPARTED)
      .map(derive)
      .sort((a, b) => new Date(a.entryAt) - new Date(b.entryAt));
  }

  all() {
    return this.entries.map(derive);
  }

  byId(id) {
    const found = this.entries.find((e) => e.id === id);
    return found ? derive(found) : null;
  }

  occupiedZones() {
    return new Set(
      this.entries.filter((e) => e.status !== STATUS.DEPARTED && e.zone).map((e) => e.zone),
    );
  }

  // ── 변경 ──────────────────────────────────────────────────────

  /** 입차 등록. 저장 후 아웃박스에도 넣어 브릿지 전송을 예약한다. */
  addEntry(input) {
    const spec = vehicleSpec(input.vehicleId);
    const entry = {
      id: uid(),
      carNumber: input.carNumber,
      vehicleId: spec.id,
      maxCapacity_mWs: spec.maxCapacity_mWs,
      batteryPct: clamp(Number(input.batteryPct) || 0, 0, 100),
      entryAt: input.entryAt,
      exitAt: input.exitAt,
      zone: input.zone || null,
      status: STATUS.WAITING,
      powerMW: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.entries.push(entry);
    this.persistEntries();
    this.queue({ type: 'park', entry });
    this.emit();
    return derive(entry);
  }

  /** 출차 처리 */
  departEntry(id) {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return null;
    entry.status = STATUS.DEPARTED;
    entry.departedAt = new Date().toISOString();
    entry.updatedAt = entry.departedAt;
    this.persistEntries();
    this.queue({
      type: 'depart',
      id: entry.id,
      carNumber: entry.carNumber,
      zone: entry.zone,
      departedAt: entry.departedAt,
    });
    this.emit();
    return derive(entry);
  }

  /** 출차한 기록 정리 */
  clearDeparted() {
    this.entries = this.entries.filter((e) => e.status !== STATUS.DEPARTED);
    this.persistEntries();
    this.emit();
  }

  /**
   * 브릿지가 돌려준 차량 상태를 반영한다.
   * id 가 같으면 실시간 필드(잔량 / 상태 / 전력 / 구역)만 갱신하고,
   * 브릿지에만 있는 차량(=Unity 나 다른 기기에서 등록)은 새로 추가한다.
   */
  mergeRemote(remoteEntries) {
    if (!Array.isArray(remoteEntries)) return false;
    let changed = false;

    for (const remote of remoteEntries) {
      if (!remote?.id) continue;
      const local = this.entries.find((e) => e.id === remote.id);
      if (!local) {
        this.entries.push({ ...remote, updatedAt: new Date().toISOString() });
        changed = true;
        continue;
      }
      // 아직 전송 못 한 로컬 변경이 있으면 그 차량은 건드리지 않는다.
      if (this.outbox.some((job) => job.entry?.id === local.id || job.id === local.id)) continue;

      let touched = false;
      for (const field of ['batteryPct', 'status', 'powerMW', 'zone', 'exitAt']) {
        if (remote[field] !== undefined && remote[field] !== local[field]) {
          local[field] = remote[field];
          touched = true;
        }
      }
      if (touched) {
        local.updatedAt = new Date().toISOString();
        changed = true;
      }
    }

    if (changed) this.persistEntries();
    return changed;
  }

  persistEntries() {
    writeJSON(STORAGE_KEYS.VEHICLES, this.entries);
  }

  // ── 설정 ──────────────────────────────────────────────────────

  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    writeJSON(STORAGE_KEYS.SETTINGS, this.settings);
    this.emit();
  }

  // ── 아웃박스 ──────────────────────────────────────────────────

  queue(job) {
    this.outbox.push({ ...job, jobId: uid(), queuedAt: new Date().toISOString() });
    writeJSON(STORAGE_KEYS.OUTBOX, this.outbox);
  }

  dequeue(jobId) {
    this.outbox = this.outbox.filter((j) => j.jobId !== jobId);
    writeJSON(STORAGE_KEYS.OUTBOX, this.outbox);
  }

  setLink(mode, message) {
    const lastSyncAt = mode === 'connected' ? new Date().toISOString() : this.link.lastSyncAt;
    this.link = { mode, message, lastSyncAt };
    this.emit();
  }
}

export const store = new Store();
