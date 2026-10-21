/* Guarda la app en el teléfono para que abra rápido y sin internet.
   Páginas propias: primero internet (para recibir actualizaciones) y si no hay, la copia guardada.
   Librerías y fuentes externas: primero la copia guardada. Firestore no pasa por aquí. */
const VERSION = 'entregas-v28';
const BASICOS = ['./', './index.html', './manifest.webmanifest', './escaner.js', './lector.js', '../comun.css', '../comun.js', '../iconos.js', '../codigos.js', '../lib/confetti.js', '../fuentes/bricolage.woff2', '../fuentes/jetbrains-mono-500.woff2', '../nube.js', '../config.js', '../iconos/entregas-192.png', '../iconos/entregas-512.png'];
const EXTERNOS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];
// Las librerías van en un cajón aparte que no se borra al actualizar la app (el detector pesa unos 10 MB).
const LIBS = 'entregas-libs';

// Lector de códigos (1,1 MB): cajón propio que no se borra con cada versión de la app; cambia solo si cambia la librería.
const CODIGOS = 'codigos-3.2.2';
const CODIGOS_ARCH = ['../lib/codigos/ponyfill.js', '../lib/codigos/zxing_reader.wasm'];

self.addEventListener('install', e => {
  e.waitUntil(Promise.all([
    caches.open(VERSION).then(c => Promise.all(BASICOS.map(u => c.add(u).catch(() => {})))),
    caches.open(CODIGOS).then(c => Promise.all(CODIGOS_ARCH.map(u => c.match(u).then(h => h || c.add(u)).catch(() => {}))))
  ]));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith('codigos-') && k !== CODIGOS) || k.startsWith('entregas-v') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* Compartir → Entregas: Android manda aquí las fotos o PDF que se comparten desde WhatsApp, el escáner, Archivos…
   (manifest.webmanifest → share_target). GitHub Pages no puede recibir archivos, así que este sw.js los guarda en el
   teléfono (IndexedDB "entregas-compartidos") y abre la app, que los pone en Subir. */
const COMP_DB = 'entregas-compartidos', COMP_ST = 'archivos';
function guardarCompartidos(archivos) {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(COMP_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(COMP_ST);
    r.onerror = () => mal(r.error);
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction(COMP_ST, 'readwrite'), st = tx.objectStore(COMP_ST), q = st.get('pendiente');
      // Si se comparte otra vez antes de abrir la app, se suman.
      q.onsuccess = () => st.put({ archivos: ((q.result && q.result.archivos) || []).concat(archivos), t: Date.now() }, 'pendiente');
      tx.oncomplete = () => { db.close(); ok(); }; tx.onerror = () => { db.close(); mal(tx.error); };
    };
  });
}
async function recibirCompartido(req) {
  try {
    const datos = await req.formData();
    const archivos = datos.getAll('archivos').filter(f => f && typeof f === 'object' && f.size > 0);
    if (archivos.length) await guardarCompartidos(archivos);
  } catch (e) {}
  return Response.redirect(new URL('./?compartido=1', self.registration.scope).href, 303);
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/entregas/compartir')) { e.respondWith(recibirCompartido(req)); return; }
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.includes('/lib/codigos/')) {
    e.respondWith(caches.open(CODIGOS).then(c => c.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }))));
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./'))));
    return;
  }
  if (EXTERNOS.includes(url.hostname) && !url.pathname.includes('/google.firestore')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === 'opaque') { const copia = r.clone(); caches.open(LIBS).then(c => c.put(req, copia)); }
      return r;
    })));
  }
});
