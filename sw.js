/* sw.js ― Service Worker（PWA: ホーム画面追加＋アプリ殻のキャッシュ）
 * v1: アプリ本体(HTML/CSS/JS/アイコン)のみキャッシュ。データはオンライン。
 * オフライン拡張時は fetch ハンドラでデータのキュー処理を足す予定。
 */
const CACHE = 'kakeibo-shell-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './model.js',
  './config.js',
  './cloud.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Supabase等の外部API・POSTはキャッシュしない（常にネットワーク）
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // アプリ殻: cache-first（更新は次回反映）
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
