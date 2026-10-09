const CACHE = 'ashs-player-v12';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './online.js', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './providers/types.js', './providers/config.js', './providers/searchCache.js', './providers/youtube.js', './providers/audius.js', './providers/archive.js', './providers/jamendo.js', './providers/ccmixter.js', './providers/radio.js', './providers/index.js', './providers/player.js'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
// Endpoints that must never be served from cache: streams, now-playing metadata
// and provider search APIs all go stale (or are infinite) when cached.
const NEVER_CACHE = ['soundhelix', 'radioparadise', 'archive.org', 'audius', 'jamendo', 'ccmixter', 'invidious', 'yewtu', 'nerdvpn', 'chocolatemoo', 'lrclib', 'piped', 'ytimg', 'youtube', 'googlevideo', 'googleapis'];
// CDNs the app needs for offline tag reading; safe to cache-first.
const CACHE_FIRST = ['cdnjs', 'fonts.gstatic', 'fonts.googleapis'];
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // <audio>/<video> requests must go straight to the network. Caching a live
  // radio stream would buffer forever, and caching range requests breaks seeking.
  if (e.request.destination === 'audio' || e.request.destination === 'video') return;
  const url = new URL(e.request.url);
  if (NEVER_CACHE.some((h) => url.hostname.includes(h))) return;
  if (CACHE_FIRST.some((h) => url.hostname.includes(h))) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    })));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
