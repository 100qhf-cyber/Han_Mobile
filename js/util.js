// 작은 헬퍼 모음 — 포맷팅, DOM, 시간 계산.

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 태그명 + 속성 + 자식으로 엘리먼트 생성 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/**
 * 컨테이너 내용을 교체한다.
 * replaceChildren 은 null 을 "null" 텍스트로 넣어버리므로 조건부 자식을 걸러낸다.
 */
export function mount(container, ...children) {
  container.replaceChildren(...children.filter((c) => c !== null && c !== undefined && c !== false));
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ── 시간 ────────────────────────────────────────────────────────

/** Date → `<input type="datetime-local">` 가 받는 로컬 시간 문자열 */
export function toLocalInputValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 값 → ISO 문자열 (빈 값이면 null) */
export function fromLocalInputValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatClock(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return sameDay ? time : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

/** 밀리초 간격을 "2시간 15분" / "12분" / "45초" 형태로 */
export function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '—';
  const neg = ms < 0;
  const total = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  let text;
  if (h > 0)      text = m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  else if (m > 0) text = `${m}분`;
  else            text = `${s}초`;
  return neg ? `${text} 초과` : text;
}

// ── 숫자 ────────────────────────────────────────────────────────

export const formatEnergy = (mWs) =>
  `${Number(mWs).toLocaleString('ko-KR', { maximumFractionDigits: 0 })} mW·s`;

export const formatPct = (pct) => `${Number(pct).toFixed(1)}%`;

/** 잔량(%)에 따른 색 토큰 이름 */
export function batteryTone(pct) {
  if (pct >= 80) return 'full';
  if (pct >= 40) return 'mid';
  if (pct >= 15) return 'low';
  return 'critical';
}

// ── 차 번호 ─────────────────────────────────────────────────────

/** 한국 번호판 흔한 형태들. 미니어처 실험용 임의 표기도 막지 않도록 느슨하게 검사한다. */
export function normalizeCarNumber(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function isValidCarNumber(value) {
  const v = normalizeCarNumber(value);
  return v.length >= 2 && v.length <= 20;
}
