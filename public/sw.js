const CACHE_PREFIX = 'vop-shell-';
const CACHE_VERSION = 'v3';
const SHELL = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/assets/vop_logo_2.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_PREFIX + CACHE_VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_PREFIX + CACHE_VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      void caches.open(CACHE_PREFIX + CACHE_VERSION).then(cache => cache.put('/index.html', copy));
      return response;
    }).catch(() => caches.match('/index.html').then(response => response || caches.match('/offline.html'))));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => {
    const network = fetch(event.request).then(response => {
      if (response.ok && (response.type === 'basic' || response.type === 'default')) {
        const copy = response.clone();
        void caches.open(CACHE_PREFIX + CACHE_VERSION).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});
