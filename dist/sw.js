/* 衣橱 PWA Service Worker
 * - 仅缓存同源静态壳资源
 * - 导航/HTML/JS/CSS：network-first，避免长期卡在旧版
 * - 不拦截跨域 API（Cloudflare Worker）
 * - CACHE 名在 vite build 时会被打上时间戳，保证每次发布 sw.js 字节变化
 */
/* build:20260813152029 */
const CACHE = 'wardrobe-shell-20260813152029';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event && event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isSameOrigin(url) {
  try {
    return url.origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

function isApiRequest(url) {
  return url.hostname.indexOf('workers.dev') >= 0 || url.pathname.indexOf('/api/') === 0;
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.ok && isSameOrigin(new URL(request.url))) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return response;
    })
    .catch(() =>
      caches.match(request).then((cached) => cached || caches.match('/index.html'))
    );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }

  // 云端 API / 跨域资源：不经过 SW，避免脏缓存
  if (!isSameOrigin(url) || isApiRequest(url)) return;

  // sw.js 自身不走自定义缓存策略，交给浏览器 update 算法
  if (url.pathname === '/sw.js') return;

  const accept = request.headers.get('accept') || '';
  const isNavigate = request.mode === 'navigate' || accept.indexOf('text/html') >= 0;

  if (isNavigate) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 同源静态资源：优先网络，离线回退缓存
  event.respondWith(networkFirst(request));
});
