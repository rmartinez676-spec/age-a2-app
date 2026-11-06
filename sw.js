// OpoGestión A2 service worker: offline-capable app shell + asset caching.
const CACHE_NAME = 'opogestion-v7';
const PRECACHE_URLS = ['/', '/index.html', '/manifest.json', '/icon.svg', '/racket-avatar.jpg', '/pdf.worker.min.mjs'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache AI endpoints, Drive proxy, or other dynamic APIs
  if (url.pathname.startsWith('/api/')) return;

  // Static and hashed assets: network first to ensure latest updates, fallback to cache
  if (url.pathname.startsWith('/assets/') || url.pathname.includes('index-') || url.pathname.startsWith('/pdf.worker') || url.pathname.startsWith('/racket-avatar') || url.pathname.startsWith('/icon')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Navigation requests: network first, fall back to cached shell when offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
  }
});
