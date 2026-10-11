const CACHE_NAME = 'vop-shell-v2';
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(APP_SHELL))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('vop-shell-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const navigation = request.mode === 'navigate';
  const publicShell = APP_SHELL.includes(url.pathname) && !url.search;
  const versionedAsset = url.pathname.startsWith('/assets/') &&
    /\.(?:js|css|woff2?|svg|png|webp|ico)$/.test(url.pathname) &&
    !url.search;
  if (!navigation && !publicShell && !versionedAsset) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && (publicShell || versionedAsset)) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cached = (publicShell || versionedAsset) ? await caches.match(request) : null;
        if (cached) return cached;
        if (navigation) {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
