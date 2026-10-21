/* nube.js — Conecta las apps con Firebase (Firestore) sin cuentas.
   Da a la app la misma forma de trabajo que tenía dentro de Claude:
   window.claude.use('db' | 'user' | 'downloads').
   Acceso: una clave compartida. Los datos quedan en espacios/<huella de la clave>/<colección>. */
(function () {
  'use strict';
  const APP = window.APP;
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const K = k => 'nube_' + APP.id + '_' + k;
  const leer = k => { try { return localStorage.getItem(K(k)); } catch (e) { return null; } };
  const guardar = (k, v) => { try { v == null ? localStorage.removeItem(K(k)) : localStorage.setItem(K(k), v); } catch (e) {} };

  let espacio = leer('espacio');
  let claveTmp = null;
  let nombre = leer('nombre') || '';
  let F = null, fs = null, appFb = null, enVuelo = 0, errorFirebase = '';
  let avisar = () => {};
  let soltar; const listo = new Promise(r => { soltar = r; });

  /* ---------- utilidades ---------- */
  async function huella(t) {
    const datos = new TextEncoder().encode(t);
    let b;
    if (window.crypto && crypto.subtle) b = new Uint8Array(await crypto.subtle.digest('SHA-256', datos));
    else throw new Error('Este navegador no permite claves seguras. Ábrela con https.');
    return [...b].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 40);
  }
  const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const toast = m => { if (typeof window.toast === 'function') window.toast(m); else console.log(m); };
  const escH = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function mapError(e) {
    const c = (e && e.code) || '';
    const tabla = { 'not-found': 'invalid_argument', 'permission-denied': 'permission_denied', 'unavailable': 'unavailable', 'resource-exhausted': 'resource_exhausted', 'deadline-exceeded': 'unavailable' };
    return { code: tabla[c] || c || 'unavailable', message: (e && e.message) || String(e) };
  }

  /* ---------- registro de errores ---------- */
  // Los errores que pasan en los teléfonos se mandan al Worker (avisos-equipos), que los publica en Slack.
  // Solo va: app, versión, mensaje, dónde pasó, nombre de la persona y navegador. Nunca la clave, la huella ni los datos.
  // Solo se envía desde GitHub Pages (en pruebas se usa window.ERRORES_URL). Sin internet quedan en cola para después.
  const ERR = { max: 5, enviados: new Set(), vistos: new Map(), timer: 0 };
  const errDestino = () => window.ERRORES_URL || (/\.github\.io$/.test(location.hostname) && window.AVISOS && window.AVISOS.url ? String(window.AVISOS.url).replace(/\/+$/, '') + '/errores' : '');
  const RUIDO = /ResizeObserver loop|^Script error\.?$|Failed to fetch|NetworkError|Load failed|network ?error|ERR_INTERNET|ERR_NETWORK|AbortError|The operation was aborted|QuotaExceeded|unavailable|offline|Could not reach Cloud Firestore|chrome-extension:|moz-extension:|safari-extension:/i;
  const limpiarErr = (s, n) => String(s == null ? '' : s)
    .replace(/[a-f0-9]{40}/gi, '…')                       // huella del espacio (da acceso a los datos)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '…@…')           // correos
    .replace(/https?:\/\/[^\s)]+/g, u => { try { const x = new URL(u); return x.origin === location.origin ? x.pathname : x.host + x.pathname; } catch (e) { return '…'; } })
    .slice(0, n);
  function navegadorCorto() {
    const u = navigator.userAgent || '';
    const so = /Android/.test(u) ? 'Android' : /iPhone|iPad|iPod/.test(u) ? 'iPhone' : /Windows/.test(u) ? 'Windows' : /Mac OS/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'otro';
    const nav = /Edg\//.test(u) ? 'Edge' : /SamsungBrowser/.test(u) ? 'Samsung' : /Firefox\/|FxiOS/.test(u) ? 'Firefox' : /Chrome\/|CriOS/.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'otro';
    const m = u.match(/(?:Chrome|CriOS|Firefox|FxiOS|Version)\/(\d+)/);
    return `${so} · ${nav}${m ? ' ' + m[1] : ''}${matchMedia('(display-mode: standalone)').matches ? ' · instalada' : ''}`;
  }
  const colaErr = () => { try { return JSON.parse(leer('errores') || '[]'); } catch (e) { return []; } };
  async function enviarErrores() {
    ERR.timer = 0;
    const url = errDestino(), lista = colaErr();
    if (!url || !lista.length || !navigator.onLine) return;
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ errores: lista }), keepalive: true });
      if (r.ok || r.status === 202 || r.status === 400) guardar('errores', null);   // 400: el Worker no lo acepta, no se reintenta
    } catch (e) {}
  }
  function reportarError(error, donde) {
    try {
      const e = error && error.reason !== undefined ? error.reason : error;
      const mensaje = limpiarErr(e && e.message ? (e.name && !String(e.message).startsWith(e.name) ? e.name + ': ' : '') + e.message : e, 300);
      if (!mensaje || RUIDO.test(mensaje) || !navigator.onLine) return;
      const sitio = limpiarErr(donde || location.pathname, 120);
      const llave = mensaje + '|' + sitio, veces = (ERR.vistos.get(llave) || 0) + 1;
      ERR.vistos.set(llave, veces);
      if (ERR.enviados.has(llave)) {
        // Ya se avisó: solo se actualiza cuántas veces pasó si sigue en la cola.
        const cola = colaErr(), x = cola.find(c => c.mensaje === mensaje && c.donde === sitio);
        if (x) { x.veces = veces; guardar('errores', JSON.stringify(cola)); }
        return;
      }
      if (ERR.enviados.size >= ERR.max) return;
      ERR.enviados.add(llave);
      const cola = colaErr().slice(-9);
      cola.push({ app: APP.nombre || APP.id, version: APP.v || '?', mensaje, detalle: limpiarErr(e && e.stack, 1200), donde: sitio, nombre: limpiarErr(nombre, 40), navegador: navegadorCorto(), veces, hora: new Date().toISOString() });
      guardar('errores', JSON.stringify(cola));
      clearTimeout(ERR.timer); ERR.timer = setTimeout(enviarErrores, 3000);
    } catch (x) {}
  }
  window.addEventListener('error', ev => {
    if (!ev.error && !ev.message) return;   // falla al cargar una imagen o un script: no es un error del código
    reportarError(ev.error || { message: ev.message }, `${location.pathname}${ev.filename ? ' · ' + ev.filename.split('/').pop().split('?')[0] + ':' + ev.lineno + ':' + ev.colno : ''}`);
  });
  window.addEventListener('unhandledrejection', ev => {
    const r = ev.reason;
    if (r && (r.code === 'unavailable' || r.code === 'permission_denied' || r.code === 'permission-denied')) return;   // sin señal o clave: ya se le avisa a la persona
    let texto = typeof r === 'string' ? r : r && r.message;
    if (!texto && !(r instanceof Error)) { try { texto = JSON.stringify(r); } catch (x) { texto = String(r); } }
    reportarError(r instanceof Error ? r : { message: texto }, location.pathname + ' · promesa');
  });
  window.addEventListener('online', () => { if (!ERR.timer) ERR.timer = setTimeout(enviarErrores, 3000); });
  setTimeout(enviarErrores, 5000);   // lo que quedó en cola la última vez

  /* ---------- Firebase ---------- */
  async function conectar() {
    if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.projectId) throw new Error('Falta la configuración de Firebase (config.js).');
    const [A, FF] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-firestore.js')]);
    F = FF;
    const app = appFb = A.initializeApp(window.FIREBASE_CONFIG);
    // Pruebas con los emuladores de Firebase: window.FIREBASE_EMULADORES = { firestore: '127.0.0.1:8080', auth: 'http://127.0.0.1:9099' }.
    const emu = window.FIREBASE_EMULADORES;
    try { fs = F.initializeFirestore(app, Object.assign({ ignoreUndefinedProperties: true }, emu ? {} : { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) })); }
    catch (e) { try { fs = F.initializeFirestore(app, { ignoreUndefinedProperties: true }); } catch (e2) { fs = F.getFirestore(app); } }
    if (emu && emu.firestore && F.connectFirestoreEmulator) { const [h, p] = emu.firestore.split(':'); F.connectFirestoreEmulator(fs, h, Number(p)); }
  }
  const ruta = col => ['espacios', espacio, col];

  // Con la caché del teléfono, una escritura queda guardada al instante y se envía cuando hay señal.
  // La promesa de Firebase solo termina cuando el servidor confirma, así que no se espera más de 1,5 s.
  function esperar(p) {
    enVuelo++; pintarEstado();
    return new Promise((ok, mal) => {
      let fin = false;
      const t = setTimeout(() => { if (!fin) { fin = true; ok(); } }, 1500);
      p.then(() => { enVuelo--; pintarEstado(); if (!fin) { fin = true; clearTimeout(t); ok(); } },
        e => {
          enVuelo--; pintarEstado(); const err = mapError(e);
          if (!fin) { fin = true; clearTimeout(t); mal(err); }
          else avisar('No se pudo guardar un cambio: ' + (err.code === 'permission_denied' ? 'la base de datos lo rechazó (revisa la clave).' : err.message));
        });
    });
  }
  function crearDb(esp) {
    return Object.freeze({
      collection(col) {
        const ref = F.collection(fs, 'espacios', esp, col);
        const obj = {
          limit() { return obj; },
          onSnapshot(next, err) {
            let primero = true;
            return F.onSnapshot(ref, { includeMetadataChanges: true }, s => {
              pintarEstado(s.metadata);
              if (!primero && !s.docChanges().length) return;
              primero = false;
              next({ size: s.size, docs: s.docs.map(d => ({ id: d.id, data: () => d.data() })) });
            }, e => { if (err) err(mapError(e)); });
          },
          doc(id) {
            const d = F.doc(fs, 'espacios', esp, col, id);
            return {
              set: data => esperar(F.setDoc(d, data)),
              update: data => esperar(F.updateDoc(d, data)),
              delete: () => esperar(F.deleteDoc(d)),
              get: async () => { try { const x = await F.getDoc(d); return x.exists() ? x.data() : null; } catch (e) { throw mapError(e); } }
            };
          }
        };
        return obj;
      }
    });
  }
  const USER = Object.freeze({
    id: async () => nombre,
    can: async () => true,
    profiles: async ids => Object.fromEntries([].concat(ids).filter(i => i && !/^u_/.test(i)).map(i => [i, { id: i, name: i }]))
  });
  const DL = Object.freeze({
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename; a.rel = 'noopener';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
      return { status: 'saved' };
    }
  });
  let DB = null;
  window.claude = Object.freeze({
    use: async n => {
      await listo;
      if (n === 'db') return DB;
      if (n === 'user') return DB ? USER : null;
      if (n === 'downloads') return DL;
      return null;
    }
  });

  /* ---------- estilos de lo que agrega este archivo ---------- */
  const css = `
  .nube-pantalla { position: fixed; inset: 0; z-index: 90; background: var(--bg); background: radial-gradient(120% 55% at 50% 0%, var(--accent-soft), transparent 70%), var(--bg); display: flex; align-items: center; justify-content: center; padding: 24px 18px; overflow-y: auto; }
  .nube-caja { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 14px; }
  .nube-logo { width: 72px; height: 72px; border-radius: 20px; box-shadow: 0 10px 24px rgba(0,0,0,.14); }
  .nube-caja h2 { font-family: var(--f-display); font-weight: 780; font-size: 1.7rem; letter-spacing: -.02em; line-height: 1.1; margin: 4px 0 0; }
  .nube-caja p { margin: 0; color: var(--muted); font-size: .95rem; }
  .nube-ver { display: flex; align-items: center; gap: 10px; min-height: 40px; font-size: .9rem; color: var(--muted); cursor: pointer; }
  .nube-ver input { width: 20px; height: 20px; margin: 0; accent-color: var(--accent); }
  .nube-barra { position: sticky; top: 0; z-index: 25; font-size: .82rem; font-weight: 700; text-align: center; padding: 7px 12px; }
  .nube-barra.off { background: var(--warn-bg); color: var(--warn); }
  .nube-barra.env { background: var(--listo-bg); color: var(--listo); }
  .nube-instalar { display: flex; align-items: center; gap: 10px; justify-content: space-between; background: var(--accent-soft); color: var(--fg); border-radius: 14px; padding: 10px 12px; font-size: .88rem; }
  .nube-instalar .row { flex-wrap: nowrap; flex: none; }
  .nube-inst-ico { flex: none; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: var(--surface); color: var(--accent-txt, var(--accent)); }
  .nube-inst-ico svg { width: 20px; height: 20px; }
  .nube-inst-txt { flex: 1; min-width: 0; }
  .nube-inst-clave { margin-top: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 44px; border: 0; background: none; color: var(--accent-txt, var(--accent)); font: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .nube-inst-clave svg, .nube-inst-bloque .btn svg { width: 18px; height: 18px; }
  .nube-inst-bloque { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid var(--line); }
  .nube-inst-bloque .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .nube-dlg { z-index: 95; }
  .nube-x { width: 18px; height: 18px; display: block; }
  .nube-card { gap: 10px; }
  .nube-dlg .sheet { gap: 12px; }
  .nube-dlg .nube-p { margin: 0; white-space: pre-line; }
  .nube-dlg .nube-acc { justify-content: flex-end; }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- barra de estado: sin internet / enviando ---------- */
  let barra = null, ultimaMeta = null, tEnv = null;
  function pintarEstado(meta) {
    if (meta) ultimaMeta = meta;
    if (!barra) return;
    const off = !navigator.onLine;
    const pend = enVuelo > 0 || (ultimaMeta && ultimaMeta.hasPendingWrites);
    clearTimeout(tEnv);
    if (off) { barra.className = 'nube-barra off'; barra.textContent = pend ? 'Sin internet · tus cambios quedaron guardados en este teléfono y se envían solos cuando vuelva la señal' : 'Sin internet · estás viendo lo último guardado en este teléfono'; barra.hidden = false; return; }
    if (pend) { tEnv = setTimeout(() => { barra.className = 'nube-barra env'; barra.textContent = 'Enviando cambios…'; barra.hidden = false; }, 1500); return; }
    barra.hidden = true;
  }
  window.addEventListener('online', () => pintarEstado());
  window.addEventListener('offline', () => pintarEstado());

  /* ---------- instalar la app en el teléfono ----------
     Tres lugares: una franja arriba (se puede cerrar por 7 días), un botón en la pantalla de la clave
     (lo primero que ve quien abre el enlace) y un bloque fijo en "Copia de seguridad y acceso".
     Android y computador: el aviso propio del navegador. iPhone (y Android sin aviso): pasos para hacerlo a mano. */
  let promptInstalar = null;
  const UA = navigator.userAgent || '';
  const esIOS = /iphone|ipad|ipod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const esAndroid = /android/i.test(UA);
  const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const SIETE_DIAS = 7 * 864e5;
  const icoN = n => (typeof window.ico === 'function' ? window.ico(n) : '');
  const X = '<svg class="nube-x" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z"/></svg>';
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar = e; pintarInstalar(); });
  window.addEventListener('appinstalled', () => { promptInstalar = null; guardar('instalada', '1'); pintarInstalar(); toast('App instalada: ábrela desde el ícono en la pantalla de inicio.'); });
  function pasosInstalar() {
    const n = APP.nombre || 'la app';
    if (esIOS) return { titulo: 'Instalar en iPhone', texto: `1. Abre este enlace en Safari. Si lo abriste desde WhatsApp u otra app, toca el botón de Safari (la brújula) o los tres puntos y elige “Abrir en Safari”.\n2. Toca Compartir: el cuadro con la flecha hacia arriba (abajo o arriba de la pantalla).\n3. Baja y toca “Agregar a inicio” (en inglés “Add to Home Screen”).\n4. Toca Agregar. ${n} queda con su ícono en la pantalla de inicio.` };
    if (esAndroid) return { titulo: 'Instalar en Android', texto: `1. Abre este enlace en Chrome. Si lo abriste desde WhatsApp u otra app, toca los tres puntos (⋮) y elige “Abrir en Chrome”.\n2. Toca el menú ⋮, arriba a la derecha.\n3. Toca “Instalar aplicación” o “Agregar a pantalla principal”.\n4. Confirma con Instalar. ${n} queda con su ícono en la pantalla de inicio.` };
    return { titulo: 'Instalar en el computador', texto: `En Chrome o Edge: toca el ícono de instalar que aparece a la derecha de la barra de direcciones (una pantalla con una flecha), o el menú ⋮ → “Transmitir, guardar y compartir” → “Instalar página como app”.\nEn Firefox no se puede instalar: ábrela en Chrome o Edge.` };
  }
  async function instalarApp() {
    if (promptInstalar) {
      const p = promptInstalar; promptInstalar = null;
      try { await p.prompt(); const r = await p.userChoice; if (r && r.outcome === 'accepted') guardar('instalada', '1'); } catch (e) {}
      pintarInstalar(); return;
    }
    const pasos = pasosInstalar();
    await pedir({ titulo: pasos.titulo, texto: pasos.texto, boton: 'Entendido', sinCancelar: true });
  }
  function pintarInstalar() {
    const ya = instalada(), yaEnEste = !ya && leer('instalada') === '1';
    // 1) franja arriba de la app
    const main = document.querySelector('main');
    let box = document.getElementById('nubeInstalar');
    const cerrada = Date.now() - Number(leer('noInstalar') || 0) < SIETE_DIAS;
    const franja = main && !ya && !yaEnEste && !cerrada && (promptInstalar || esIOS || esAndroid);
    if (!franja) { if (box) box.remove(); }
    else {
      if (!box) { box = document.createElement('div'); box.id = 'nubeInstalar'; box.className = 'nube-instalar'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Instalar la app'); main.prepend(box); }
      box.innerHTML = `<span class="nube-inst-ico" aria-hidden="true">${icoN('cel')}</span><span class="nube-inst-txt"><b>Instala la app</b> y ábrela con un toque desde la pantalla de inicio.</span><span class="row"><button class="btn small primary" type="button" id="nubeInstBtn">${promptInstalar ? 'Instalar' : 'Cómo instalar'}</button><button class="btn small ghost" type="button" id="nubeInstNo" aria-label="Ocultar por 7 días" title="Ocultar por 7 días">${X}</button></span>`;
      box.querySelector('#nubeInstBtn').onclick = instalarApp;
      box.querySelector('#nubeInstNo').onclick = () => { guardar('noInstalar', String(Date.now())); pintarInstalar(); };
    }
    // 2) botón en la pantalla de la clave
    const bc = document.getElementById('nubeInstClave');
    if (bc) bc.hidden = ya || yaEnEste;
    // 3) bloque fijo en "Copia de seguridad y acceso"
    const info = document.getElementById('nubeInfo');
    if (info) {
      let bl = document.getElementById('nubeInstBloque');
      if (!bl) { bl = document.createElement('div'); bl.id = 'nubeInstBloque'; bl.className = 'nube-inst-bloque'; info.after(bl); }
      bl.innerHTML = `<b>Instalar en este teléfono</b><div class="meta">${ya ? 'Estás usando la app instalada. ✓' : yaEnEste ? 'Ya la instalaste en este teléfono: ábrela desde el ícono en la pantalla de inicio.' : 'Queda con su ícono en la pantalla de inicio, abre sin navegador y funciona sin internet.'}</div>${ya ? '' : `<div class="row"><button class="btn small" type="button" id="nubeInstBloqueBtn">${icoN('instalar')}${promptInstalar ? 'Instalar la app' : yaEnEste ? 'Cómo abrirla o instalarla otra vez' : 'Cómo instalar la app'}</button></div>`}`;
      const b = bl.querySelector('#nubeInstBloqueBtn'); if (b) b.onclick = instalarApp;
    }
  }

  /* ---------- diálogo propio (reemplaza prompt y confirm del navegador) ---------- */
  // pedir({ titulo, texto, etiqueta, valor, clave, boton, peligro, validar }) → texto escrito, true (sin campo) o null si se cancela.
  // validar(v) puede ser async y devolver un mensaje de error para mostrarlo sin cerrar.
  function pedir(o) {
    return new Promise(resolver => {
      const id = 'nubeP' + Math.random().toString(36).slice(2, 7), conCampo = o.etiqueta != null;
      const b = document.createElement('div'); b.className = 'backdrop confirm nube-dlg';
      b.setAttribute('role', 'dialog'); b.setAttribute('aria-modal', 'true'); b.setAttribute('aria-labelledby', id + 't');
      b.innerHTML = `<form class="sheet" novalidate tabindex="-1">
        <h2 id="${id}t">${escH(o.titulo)}</h2>${o.texto ? `<p class="nube-p">${escH(o.texto)}</p>` : ''}
        ${conCampo ? `<div class="field"><label for="${id}i">${escH(o.etiqueta)}</label><input id="${id}i" type="${o.clave ? 'password' : 'text'}" autocomplete="${o.clave ? 'current-password' : 'off'}" autocapitalize="off" spellcheck="false" value="${escH(o.valor || '')}"></div>` : ''}
        ${conCampo && o.clave ? '<label class="nube-ver"><input type="checkbox"> Mostrar la clave</label>' : ''}
        <div class="err" role="alert" hidden></div>
        <div class="row nube-acc">${o.sinCancelar ? '' : '<button class="btn" type="button" data-no>Cancelar</button>'}<button class="btn ${o.peligro ? 'danger' : 'primary'}" type="submit">${escH(o.boton || 'Aceptar')}</button></div>
      </form>`;
      document.body.appendChild(b);
      const f = b.querySelector('form'), inp = b.querySelector('input:not([type=checkbox])'), err = b.querySelector('.err'), ok = f.querySelector('[type=submit]');
      const antes = document.activeElement;
      let fin = false;
      const cerrar = v => { if (fin) return; fin = true; b.remove(); if (antes && antes.isConnected) try { antes.focus({ preventScroll: true }); } catch (e) {} resolver(v); };
      const ver = b.querySelector('.nube-ver input'); if (ver) ver.onchange = () => { inp.type = ver.checked ? 'text' : 'password'; };
      if (b.querySelector('[data-no]')) b.querySelector('[data-no]').onclick = () => cerrar(null);
      b.addEventListener('click', e => { if (e.target === b) cerrar(null); });
      f.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(null); } });
      if (inp) inp.oninput = () => { err.hidden = true; inp.removeAttribute('aria-invalid'); };
      f.onsubmit = async e => {
        e.preventDefault();
        const v = conCampo ? inp.value.trim() : true;
        if (o.validar) {
          const t0 = ok.textContent; ok.disabled = true; ok.textContent = o.revisando || t0;
          let m; try { m = await o.validar(v); } catch (x) { m = x && x.message || String(x); }
          ok.disabled = false; ok.textContent = t0;
          if (m) { err.textContent = m; err.hidden = false; if (inp) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); } return; }
        }
        cerrar(v);
      };
      if (inp) { inp.focus(); inp.select(); } else ok.focus();
    });
  }
  const preguntar = (titulo, texto, boton, peligro) => pedir({ titulo, texto, boton, peligro });

  /* ---------- pantalla de clave ---------- */
  function pantallaClave(msg) {
    return new Promise(resolver => {
      const div = document.createElement('div');
      div.className = 'nube-pantalla'; div.id = 'nubeClave';
      div.setAttribute('role', 'dialog'); div.setAttribute('aria-modal', 'true'); div.setAttribute('aria-labelledby', 'nubeClaveT');
      div.innerHTML = `<form class="nube-caja" novalidate autocomplete="off">
        <img class="nube-logo" src="${escH(APP.icono)}" alt="" width="72" height="72">
        <h2 id="nubeClaveT">${escH(APP.nombre)}</h2>
        <p>Escribe la clave de acceso que te dieron y tu nombre. Solo se pide una vez en este teléfono.</p>
        <div class="field"><label for="nubeK">Clave de acceso</label><input id="nubeK" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" required></div>
        <label class="nube-ver"><input type="checkbox" id="nubeVer"> Mostrar la clave</label>
        <div class="field"><label for="nubeN">Tu nombre</label><input id="nubeN" type="text" autocomplete="name" placeholder="Así se verá quién hizo cada cambio" value="${escH(nombre)}"></div>
        <div class="err" id="nubeErr" role="alert" ${msg ? '' : 'hidden'}>${escH(msg || '')}</div>
        <div class="note" id="nubeVacio" role="status" hidden></div>
        <button class="btn primary big" type="submit" id="nubeEntrar">Entrar</button>
        <button class="btn" type="button" id="nubeNueva" hidden>Sí, empezar con esta clave nueva</button>
        <button class="nube-inst-clave" type="button" id="nubeInstClave">${icoN('instalar')}Instalar la app en este teléfono</button>
      </form>`;
      document.body.appendChild(div);
      const f = div.querySelector('form'), $k = div.querySelector('#nubeK'), $n = div.querySelector('#nubeN');
      const $e = div.querySelector('#nubeErr'), $v = div.querySelector('#nubeVacio'), $b = div.querySelector('#nubeEntrar'), $nueva = div.querySelector('#nubeNueva');
      div.querySelector('#nubeVer').onchange = e => { $k.type = e.target.checked ? 'text' : 'password'; };
      div.querySelector('#nubeInstClave').onclick = instalarApp; pintarInstalar();
      let candidato = null;
      const fallo = t => { $e.textContent = t; $e.hidden = false; };
      const terminar = () => { espacio = candidato; nombre = $n.value.trim().replace(/\s+/g, ' '); guardar('espacio', espacio); guardar('nombre', nombre); div.remove(); resolver(); };
      $k.oninput = () => { $v.hidden = true; $nueva.hidden = true; candidato = null; };
      $nueva.onclick = terminar;
      f.onsubmit = async ev => {
        ev.preventDefault(); $e.hidden = true;
        const clave = $k.value.trim(); claveTmp = clave;
        if (clave.length < 6) { $k.focus(); return fallo('La clave tiene al menos 6 caracteres. Revísala.'); }
        if (!$n.value.trim()) { $n.focus(); return fallo('Escribe tu nombre.'); }
        $b.disabled = true; $b.textContent = 'Revisando…';
        try {
          candidato = await huella(APP.id + ':' + clave);
          let vacio = false;
          if (fs && navigator.onLine) {
            try {
              const q = F.query(F.collection(fs, 'espacios', candidato, APP.colecciones[0]), F.limit(1));
              const s = await Promise.race([F.getDocsFromServer ? F.getDocsFromServer(q) : F.getDocs(q), new Promise((_, m) => setTimeout(() => m(new Error('tiempo')), 8000))]);
              vacio = s.empty;
            } catch (e) {
              if (e && e.code === 'permission-denied') { $b.disabled = false; $b.textContent = 'Entrar'; return fallo('Firebase rechazó el acceso. Revisa que las reglas estén publicadas.'); }
            }
          }
          if (vacio) {
            $v.innerHTML = '<b>Con esa clave no hay datos.</b> Si la escribiste mal, corrígela y toca Entrar otra vez. Si es una clave nueva (la primera vez que usan la app), toca el botón de abajo.';
            $v.hidden = false; $nueva.hidden = false; $b.disabled = false; $b.textContent = 'Entrar';
            return;
          }
          terminar();
        } catch (e) { $b.disabled = false; $b.textContent = 'Entrar'; fallo(e.message || String(e)); }
      };
      // Foco en la clave, salvo que la persona ya esté escribiendo en otro campo (si no, lo que escribe cae en la clave).
      setTimeout(() => { if (!div.contains(document.activeElement)) $k.focus(); }, 50);
    });
  }

  /* ---------- sesión del chat (inicio anónimo de Firebase) ---------- */
  // Cada teléfono recibe una identidad anónima propia. Con ella las reglas dejan leer un chat privado
  // solo a las dos personas que lo tienen. Si en el teléfono entra otra persona, la identidad se cambia.
  let AU = null, auth = null, sesionP = null;
  const alSalir = [];
  function sesionChat() {
    sesionP = sesionP || (async () => {
      await listo;
      if (!fs || !espacio) throw Object.assign(new Error('La base de datos no está abierta.'), { code: 'sin-db' });
      AU = AU || await import(SDK + 'firebase-auth.js');
      auth = auth || AU.getAuth(appFb);
      const emu = window.FIREBASE_EMULADORES;
      if (emu && emu.auth && !auth.__emu) { AU.connectAuthEmulator(auth, emu.auth, { disableWarnings: true }); auth.__emu = true; }
      if (auth.authStateReady) await auth.authStateReady();
      const dueno = leer('chat_dueno'), yo = sinTildesN(nombre);
      if (auth.currentUser && dueno && dueno !== yo) await AU.signOut(auth);   // el teléfono cambió de persona
      const u = auth.currentUser || (await AU.signInAnonymously(auth)).user;
      guardar('chat_dueno', yo);
      return { uid: u.uid, F, fs, espacio };
    })().catch(e => { sesionP = null; throw e; });
    return sesionP;
  }
  const sinTildesN = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  /* ---------- copia de seguridad ---------- */
  async function leerTodo() {
    const out = {};
    for (const col of APP.colecciones) {
      // Si las reglas todavía no permiten una colección nueva (por ejemplo "tareas"), la copia sigue con las demás.
      let s; try { s = await F.getDocs(F.collection(fs, ...ruta(col))); } catch (e) { if (e && e.code === 'permission-denied') continue; throw e; }
      out[col] = {}; s.docs.forEach(d => { out[col][d.id] = d.data(); });
    }
    return out;
  }
  async function probarEnlace(en, clave) {
    const h = await huella(en.id + ':' + clave);
    const q = F.query(F.collection(fs, 'espacios', h, en.col), F.limit(1));
    const snap = await Promise.race([F.getDocsFromServer ? F.getDocsFromServer(q) : F.getDocs(q), new Promise((_, m) => setTimeout(() => m(new Error('tiempo')), 8000))]);
    if (snap.empty) return false;
    guardar('enlace_' + en.id, h); return true;
  }
  const enlaceCfg = id => (APP.enlaces || []).find(e => e.id === id);
  const LOTE_MAX = 400, LOTE_BYTES = 7e6;   // límites de cada lote al importar una copia
  const nube = {
    enlace(id) { const h = leer('enlace_' + id); return h && fs ? crearDb(h) : null; },
    async enlazar(id) {
      const en = enlaceCfg(id); if (!en || !fs) return toast('La base de datos no está abierta. Revisa tu internet y vuelve a abrir la app.');
      const v = await pedir({
        titulo: `Conectar con ${en.nombre}`, texto: `Escribe la clave de acceso de la app de ${en.nombre}. Es la misma que usan en esa app.`,
        etiqueta: 'Clave de acceso', clave: true, boton: 'Conectar', revisando: 'Comprobando…',
        validar: async c => {
          if (c.length < 6) return 'La clave tiene al menos 6 caracteres. Revísala.';
          try { return (await probarEnlace(en, c)) ? '' : `Con esa clave no hay datos de ${en.nombre}. Revisa la clave.`; }
          catch (e) { return 'No se pudo comprobar la clave. Revisa tu internet e inténtalo otra vez.'; }
        }
      });
      if (v == null) return;
      toast(`Conectada con ${en.nombre}`); setTimeout(() => location.reload(), 700);
    },
    desenlazar(id) {
      const en = enlaceCfg(id); if (!en) return;
      const hacer = () => { guardar('enlace_' + id, null); location.reload(); };
      if (typeof window.confirmar === 'function') window.confirmar(`Desconectar de ${en.nombre}`, `Esta app ya no cambiará nada en ${en.nombre}. Lo que ya se hizo no se borra.`, 'Desconectar', hacer);
      else preguntar(`Desconectar de ${en.nombre}`, `Esta app ya no cambiará nada en ${en.nombre}. Lo que ya se hizo no se borra.`, 'Desconectar', true).then(ok => { if (ok) hacer(); });
    },
    async exportar() {
      if (!fs || !espacio) return toast('La base de datos no está abierta.');
      try {
        const colecciones = await leerTodo();
        const n = Object.values(colecciones).reduce((a, c) => a + Object.keys(c).length, 0);
        await DL.save({ filename: `Copia ${APP.nombre} ${hoy()}.json`, data: JSON.stringify({ app: APP.id, fecha: new Date().toISOString(), colecciones }, null, 1) });
        toast(`Copia descargada (${n} registros)`);
      } catch (e) { toast('No se pudo hacer la copia: ' + (e.message || e)); }
    },
    async importar(input) {
      const file = input.files && input.files[0]; input.value = '';
      if (!file) return;
      if (!fs || !espacio) return toast('La base de datos no está abierta.');
      let datos;
      try { datos = JSON.parse(await file.text()); } catch (e) { return toast('Ese archivo no es una copia válida.'); }
      if (!datos || datos.app !== APP.id || typeof datos.colecciones !== 'object') return toast(`Ese archivo no es una copia de ${APP.nombre}.`);
      const ops = [];
      APP.colecciones.forEach(col => Object.entries(datos.colecciones[col] || {}).forEach(([id, d]) => { if (id && !id.includes('/') && d && typeof d === 'object') ops.push([col, id, d]); }));
      if (!ops.length) return toast('La copia no tiene registros.');
      const actualizar = datos.modo === 'actualizar';
      const resumen = APP.colecciones.filter(c => !actualizar || Object.keys(datos.colecciones[c] || {}).length).map(c => `${Object.keys(datos.colecciones[c] || {}).length} ${c}`).join(' y ');
      const hacer = async () => {
        try {
          // Firestore rechaza un lote de más de 10 MB o 500 escrituras. En Entregas cada trozo de "archivos"
          // pesa hasta 700 KB, así que los lotes se arman por tamaño: máximo unos 7 MB (unos 10 trozos) o 400 registros.
          const lotes = [], te = new TextEncoder(); let actual = [], peso = 0;
          for (const op of ops) {
            const p = te.encode(JSON.stringify(op[2])).length + 200;   // bytes reales (una tilde o una ñ pesan 2)
            if (actual.length && (actual.length >= LOTE_MAX || peso + p > LOTE_BYTES)) { lotes.push(actual); actual = []; peso = 0; }
            actual.push(op); peso += p;
          }
          if (actual.length) lotes.push(actual);
          let hechos = 0;
          for (const lote of lotes) {
            const b = F.writeBatch(fs);
            lote.forEach(([col, id, d]) => { if (actualizar) b.set(F.doc(fs, ...ruta(col), id), d, { merge: true }); else b.set(F.doc(fs, ...ruta(col), id), d); });
            await Promise.race([b.commit(), new Promise(r => setTimeout(r, 8000))]);
            hechos += lote.length;
            toast(`Importando… ${hechos} de ${ops.length}`);
          }
          toast(`Copia importada: ${ops.length} registros`);
        } catch (e) { toast('No se pudo importar: ' + (mapError(e).code === 'permission_denied' ? 'la base de datos lo rechazó.' : e.message)); }
      };
      const texto = actualizar
        ? `Se actualizan ${resumen} con los datos del archivo "${file.name}". Solo cambian las columnas que trae el archivo; lo demás (correo, observaciones, etc.) se conserva. Los que no existan se crean. Esto no se puede deshacer. Recomendado: descarga primero una copia de lo actual.`
        : `Se cargan ${resumen} del archivo "${file.name}". Los registros con el mismo código se reemplazan por los de la copia, para todos. Esto no se puede deshacer. Recomendado: descarga primero una copia de lo actual.`;
      if (typeof window.confirmar === 'function') window.confirmar(actualizar ? 'Actualizar datos' : 'Importar copia', texto, actualizar ? 'Actualizar' : 'Importar', hacer, 'ok');
      else preguntar(actualizar ? 'Actualizar datos' : 'Importar copia', texto, actualizar ? 'Actualizar' : 'Importar').then(ok => { if (ok) hacer(); });
    },
    async cambiarNombre() {
      const n = await pedir({ titulo: 'Cambiar mi nombre', texto: 'Así se verá quién hizo cada cambio.', etiqueta: 'Tu nombre', valor: nombre, boton: 'Guardar',
        validar: v => v ? '' : 'Escribe tu nombre.' });
      if (n == null) return;
      guardar('nombre', n.replace(/\s+/g, ' ')); location.reload();
    },
    salir() {
      const hacer = async () => {
        // El chat quita este teléfono de la persona antes de cerrar la identidad anónima.
        for (const f of alSalir) { try { await Promise.race([f(), new Promise(r => setTimeout(r, 4000))]); } catch (e) {} }
        try { if (auth && AU) await AU.signOut(auth); } catch (e) {}
        guardar('chat_dueno', null);
        guardar('espacio', null); (APP.enlaces || []).forEach(en => guardar('enlace_' + en.id, null)); location.reload();
      };
      if (typeof window.confirmar === 'function') window.confirmar('Salir de este teléfono', 'Se olvida la clave en este teléfono. Para volver a entrar tendrás que escribirla otra vez. Los datos no se borran.', 'Salir', hacer);
      else preguntar('Salir de este teléfono', 'Se olvida la clave en este teléfono. Los datos no se borran.', 'Salir', true).then(ok => { if (ok) hacer(); });
    },
    get nombre() { return nombre; }
  };
  nube.sesionChat = sesionChat;
  nube.alSalir = f => { if (typeof f === 'function') alSalir.push(f); };
  nube.reportarError = reportarError;
  window.nube = nube;

  /* ---------- versión nueva ---------- */
  // Si en GitHub hay una versión más nueva que la que está abierta, recarga con ella (una sola vez por versión).
  async function revisarVersion() {
    if (!APP.v || !/^https?:$/.test(location.protocol)) return;
    try {
      const r = await fetch('../version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const { v } = await r.json();
      if (!v || v === APP.v) return;
      if (typeof window.hayCambiosSinGuardar === 'function' && window.hayCambiosSinGuardar()) { toast('Hay una versión nueva de la app: guarda y vuelve a abrirla.'); return; }
      const k = 'nube_recarga_' + APP.id + '_' + v;
      try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (e) {}
      location.replace(location.pathname + '?v=' + encodeURIComponent(v));
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisarVersion(); });

  /* ---------- arranque ---------- */
  async function arrancar() {
    barra = document.createElement('div'); barra.className = 'nube-barra'; barra.hidden = true; barra.setAttribute('role', 'status');
    const top = document.querySelector('header.top');
    if (top) top.after(barra); else document.body.prepend(barra);
    avisar = m => { barra.className = 'nube-barra off'; barra.textContent = m; barra.hidden = false; setTimeout(() => pintarEstado(), 8000); };
    pintarEstado(); pintarInstalar(); revisarVersion();
    const conexion = conectar().catch(e => { errorFirebase = e.message || String(e); });
    if (!espacio) { await conexion; await pantallaClave(errorFirebase && !navigator.onLine ? 'Sin internet: la primera vez necesitas conexión.' : ''); }
    await conexion;
    if (fs && espacio) DB = crearDb(espacio);
    // Si la misma clave abre otra app enlazada (por ejemplo Equipos), se conecta sola.
    if (fs && claveTmp && Array.isArray(APP.enlaces) && navigator.onLine) {
      for (const en of APP.enlaces) { if (!leer('enlace_' + en.id)) { try { await probarEnlace(en, claveTmp); } catch (e) {} } }
    }
    claveTmp = null;
    if (!DB && errorFirebase) console.warn('Firebase:', errorFirebase);
    const info = document.getElementById('nubeInfo');
    if (info) info.textContent = (DB ? `Estás como ${nombre || 'sin nombre'}. Los datos se guardan en Firebase y se ven en todos los teléfonos que usen la misma clave.` : 'No se pudo conectar con la base de datos.') + ` Versión ${APP.v || '?'}.`;
    soltar();
  }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {}); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
})();
