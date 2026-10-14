/* Versión anterior: este archivo solo se borra a sí mismo. Cada app ahora tiene su propio sw.js en su carpeta. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('cp-')).map(k => caches.delete(k))))
    .then(() => self.registration.unregister()));
});
