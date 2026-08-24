// 앱 전역 상수 — 아두이노 / Unity 쪽 정의와 값을 맞춰서 관리한다.

/**
 * 차량별 최대 배터리 용량.
 * rail_controller 계열 스케치의 `Vehicle vehicles[]` 와 같은 값을 쓴다.
 * 단위: mW·s (= mJ)
 */
export const VEHICLES = [
  { id: 'A', name: 'Vehicle_A', label: 'A (기본)', maxCapacity_mWs: 1600 },
  { id: 'B', name: 'Vehicle_B', label: 'B',        maxCapacity_mWs: 1400 },
  { id: 'C', name: 'Vehicle_C', label: 'C',        maxCapacity_mWs: 1800 },
  { id: 'D', name: 'Vehicle_D', label: 'D',        maxCapacity_mWs: 2000 },
];

export const DEFAULT_VEHICLE_ID = 'A';

/** 주차 구역: A~C 열 × 1~6 행 = 18구역. 아두이노의 a1~c6 명령과 1:1 대응. */
export const ZONE_COLS = ['A', 'B', 'C'];
export const ZONE_ROWS = [1, 2, 3, 4, 5, 6];
export const ZONES = ZONE_COLS.flatMap((c) => ZONE_ROWS.map((r) => `${c}${r}`));

/** 차량 상태 */
export const STATUS = {
  WAITING:  'waiting',   // 입차 완료, 충전 대기
  CHARGING: 'charging',  // 레일 도착 + 충전 중
  DONE:     'done',      // 만충
  DEPARTED: 'departed',  // 출차
};

export const STATUS_META = {
  [STATUS.WAITING]:  { label: '대기',    tone: 'idle'   },
  [STATUS.CHARGING]: { label: '충전 중', tone: 'active' },
  [STATUS.DONE]:     { label: '완충',    tone: 'done'   },
  [STATUS.DEPARTED]: { label: '출차',    tone: 'muted'  },
};

/** 기본 주차 시간 (출차 시각 기본값 = 입차 + 이 값) */
export const DEFAULT_STAY_MINUTES = 120;

/** 설정 기본값 */
export const DEFAULT_SETTINGS = {
  // Supabase 프로젝트 주소 (예: https://xxxxxxxx.supabase.co)
  // 비워두면 로컬 모드 — 이 휴대폰 안에만 저장된다.
  supabaseUrl: '',
  // Supabase anon(publishable) key. 공개용 키이며 보호는 RLS 정책이 담당한다.
  supabaseKey: '',
  // 현황 화면 폴링 주기 (ms)
  pollIntervalMs: 1000,
  // 충전 소요 시간 추정에 쓰는 기준 전력 (mW). 실측값에 맞춰 조정.
  referencePowerMW: 250,
};

export const STORAGE_KEYS = {
  VEHICLES: 'han.vehicles.v1',
  SETTINGS: 'han.settings.v1',
  OUTBOX:   'han.outbox.v1',
};
