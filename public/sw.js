const CACHE_PREFIX = 'vop-shell-';
const CACHE_NAME = CACHE_PREFIX + 'v2';
const APP_SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async response => {
          if (response.ok && response.type === 'basic') {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('/', response.clone());
          }
          return response;
        })
        .catch(async () =>
          (await caches.match(request))
          || (await caches.match('/'))
          || (await caches.match('/offline.html')),
        ),
    );
    return;
  }

  // Cache only immutable build assets and the explicit public shell. Never
  // cache account data, Firestore/API responses, or arbitrary same-origin URLs.
  if (!url.pathname.startsWith('/assets/') && !APP_SHELL.includes(url.pathname)) return;

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())));
      }
      return response;
    })),
  );
});
