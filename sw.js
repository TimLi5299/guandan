// v1.5 PWA Service Worker
// 策略：network-first + cache fallback —— 在线时永远拿最新代码（开发/更新友好），
// 离线时回退到缓存（单机掼蛋本来就不需要网络）。
const CACHE = 'guandan-v2.1.0';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './css/style.css',
  './js/app.js',
  './js/ui/cardRenderer.js',
  './js/ui/gameUI.js',
  './js/ui/soundManager.js',
  './js/network/loopback.js',
  './js/network/websocket.js',
  './server-runtime/index.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE).catch(() => {}))  // 个别资源失败不阻塞安装
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 跨域请求不拦截

  event.respondWith(
    // v2.1 修复：no-cache 强制带条件验证回源——纯 fetch(req) 会吃浏览器 HTTP 启发式
    // 缓存（python http.server 无 Cache-Control 头），代码更新后页面长期跑旧 JS
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        // 在线：更新缓存副本
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        // 离线：回退缓存；导航请求兜底 index.html
        caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
      )
  );
});
