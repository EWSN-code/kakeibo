/* Kakeibo v1.9.1: network-first documents, versioned offline assets */
const CACHE = 'kakeibo-shell-v191-brandfix1';
const ASSETS = [
  "./",
  "./index.html",
  "./planning.html",
  "./manifest.json?v=1.9.1",
  "./styles.css?v=1.9.1",
  "./ui-refresh.css?v=1.9.1",
  "./ui-refresh-analysis.css?v=1.9.1",
  "./ui-refresh-entry.css?v=1.9.1",
  "./config.js?v=1.9.1",
  "./model.js?v=1.9.1",
  "./cloud.js?v=1.9.1",
  "./app.js?v=1.9.1",
  "./ui-refresh.js?v=1.9.1",
  "./ui-refresh-entry.js?v=1.9.1-brandfix1",
  "./planning.html?v=1.9.1",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('kakeibo-shell-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const documentRequest = request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') || url.pathname.endsWith('/planning.html');
  if (documentRequest) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) (await caches.open(CACHE)).put(request, response.clone()).catch(() => {});
        return response;
      } catch (error) {
        const cache = await caches.open(CACHE);
        return (await cache.match(request, { ignoreSearch: true })) ||
          (request.mode === 'navigate' ? await cache.match('./index.html') : null) ||
          Response.error();
      }
    })());
  } else {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch (error) { return Response.error(); }
    })());
  }
});
