// 서비스워커 — 앱 셸을 캐시해서 오프라인에서도 열리게 한다.
//
// Supabase 요청은 절대 캐시하지 않는다. 지난 배터리 값을 보여주는 것보다
// 연결 실패를 그대로 드러내는 편이 낫다 (앱은 로컬 모드로 계속 동작한다).

const CACHE = 'han-mobile-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/config.js',
  './js/store.js',
  './js/backend.js',
  './js/util.js',
  './js/ui/register.js',
  './js/ui/status.js',
  './js/ui/settings.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 외부 호스트(Supabase 등)는 서비스워커가 관여하지 않는다.
  if (url.origin !== self.location.origin) return;

  // 네비게이션은 네트워크 우선, 실패하면 캐시된 셸.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  // 정적 자원은 캐시 우선 + 백그라운드 갱신.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});
