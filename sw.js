const CACHE = 'ashs-player-v8';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './ytbgr.js', './online.js', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './providers/types.js', './providers/config.js', './providers/searchCache.js', './providers/youtube.js', './providers/audius.js', './providers/archive.js', './providers/index.js', './providers/player.js'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('soundhelix') || url.hostname.includes('cdnjs') || url.hostname.includes('lrclib.net') || url.hostname.includes('audius') || url.hostname.includes('piped') || url.hostname.includes('ytimg') || url.hostname.includes('youtube') || url.hostname.includes('googlevideo') || url.hostname.includes('googleapis') || url.hostname.includes('archive.org')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
