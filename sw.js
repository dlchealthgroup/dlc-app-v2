/* DLC OS 2.0 · Service worker: cachea la app, nunca los datos. */
const CACHE = 'dlc-os-2.3.0';
const FILES = ['./', './index.html', './app.js?v=2.3.0', './config.js', './manifest.webmanifest',
               './logo.png', './dlc-icon-192.png', './dlc-icon-512.png', './dlc-apple-touch-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;              // datos y CDN: siempre a la red
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
