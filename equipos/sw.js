/* Guarda la app en el teléfono para que abra rápido y sin internet.
   Páginas propias: primero internet (para recibir actualizaciones) y si no hay, la copia guardada.
   Librerías y fuentes externas: primero la copia guardada. Firestore no pasa por aquí. */
const VERSION = 'equipos-v21';
const BASICOS = ['./', './index.html', './manifest.webmanifest', '../comun.css', '../comun.js', '../iconos.js', '../lib/confetti.js', '../fuentes/bricolage.woff2', '../fuentes/jetbrains-mono-500.woff2', '../nube.js', '../config.js', '../iconos/equipos-192.png', '../iconos/equipos-512.png'];
const EXTERNOS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(BASICOS.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('equipos-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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

/* Notificaciones: llegan aunque la app esté cerrada (las envía el Worker avisos-equipos). */
self.addEventListener('push', e => {
  let d;
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { cuerpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Equipos', {
    body: d.cuerpo || '', icon: '../iconos/equipos-192.png', tag: d.etiqueta || undefined, renotify: !!d.etiqueta,
    lang: 'es', data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (w.url.startsWith(self.registration.scope)) { if (w.navigate) w.navigate(url).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
