/* DLC OS 2.0 · Service worker: la app se pide primero a la red (siempre la última versión)
   y solo se usa la copia guardada si no hay conexión. Nunca guarda datos. */
const CACHE = 'dlc-os-2.30.0';
const FILES = ['./', './index.html', './app.js?v=2.30.0', './config.js', './manifest.webmanifest',
               './logo.png', './dlc-icon-192.png', './dlc-icon-512.png', './dlc-apple-touch-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // datos y CDN: siempre a la red
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r && r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
