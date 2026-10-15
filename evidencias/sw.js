/* Guarda la app en el teléfono para que abra rápido y sin internet.
   Páginas propias: primero internet (para recibir actualizaciones) y si no hay, la copia guardada.
   Librerías y fuentes externas: primero la copia guardada. Firestore no pasa por aquí. */
const VERSION = 'evidencias-v15';
const BASICOS = ['./', './index.html', './manifest.webmanifest', '../nube.js', '../config.js', '../iconos/evidencias-192.png', '../iconos/evidencias-512.png'];
const EXTERNOS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(BASICOS.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('evidencias-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./'))));
    return;
  }
  if (EXTERNOS.includes(url.hostname) && !url.pathname.includes('/google.firestore')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === 'opaque') { const copia = r.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return r;
    })));
  }
});
