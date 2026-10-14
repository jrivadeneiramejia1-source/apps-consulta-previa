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
  let F = null, fs = null, enVuelo = 0, errorFirebase = '';
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

  /* ---------- Firebase ---------- */
  async function conectar() {
    if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.projectId) throw new Error('Falta la configuración de Firebase (config.js).');
    const [A, FF] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-firestore.js')]);
    F = FF;
    const app = A.initializeApp(window.FIREBASE_CONFIG);
    try { fs = F.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
    catch (e) { try { fs = F.initializeFirestore(app, { ignoreUndefinedProperties: true }); } catch (e2) { fs = F.getFirestore(app); } }
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
  .nube-pantalla { position: fixed; inset: 0; z-index: 90; background: var(--bg); display: flex; align-items: center; justify-content: center; padding: 20px 16px; overflow-y: auto; }
  .nube-caja { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 14px; }
  .nube-logo { width: 64px; height: 64px; border-radius: 18px; }
  .nube-caja h2 { font-family: var(--f-display); font-weight: 800; font-size: 1.5rem; margin: 0; }
  .nube-caja p { margin: 0; color: var(--muted); font-size: .9rem; }
  .nube-ver { display: flex; align-items: center; gap: 8px; font-size: .85rem; color: var(--muted); }
  .nube-ver input { width: 18px; height: 18px; accent-color: var(--accent); }
  .nube-barra { position: sticky; top: 0; z-index: 25; font-size: .8rem; font-weight: 700; text-align: center; padding: 6px 12px; }
  .nube-barra.off { background: var(--warn-bg); color: var(--warn); }
  .nube-barra.env { background: var(--listo-bg); color: var(--listo); }
  .nube-instalar { display: flex; align-items: center; gap: 10px; justify-content: space-between; background: var(--accent-soft); color: var(--fg); border-radius: 12px; padding: 10px 12px; font-size: .85rem; }
  .nube-instalar .row { flex-wrap: nowrap; }
  .nube-card { gap: 10px; }`;
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

  /* ---------- botón de instalar ---------- */
  let promptInstalar = null;
  const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar = e; pintarInstalar(); });
  window.addEventListener('appinstalled', () => { promptInstalar = null; guardar('instalada', '1'); pintarInstalar(); });
  function pintarInstalar() {
    const main = document.querySelector('main'); if (!main) return;
    let box = document.getElementById('nubeInstalar');
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const mostrar = !instalada() && !leer('noInstalar') && (promptInstalar || ios);
    if (!mostrar) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.id = 'nubeInstalar'; box.className = 'nube-instalar'; main.prepend(box); }
    box.innerHTML = promptInstalar
      ? `<span><b>Instala la app</b> en este teléfono: abre con un toque, sin navegador.</span><span class="row"><button class="btn small primary" type="button" id="nubeInstBtn">Instalar</button><button class="btn small ghost" type="button" id="nubeInstNo" aria-label="Ocultar">✕</button></span>`
      : `<span><b>Para instalarla en iPhone:</b> toca Compartir <b>⬆︎</b> y luego <b>Agregar a inicio</b>.</span><span class="row"><button class="btn small ghost" type="button" id="nubeInstNo" aria-label="Ocultar">✕</button></span>`;
    const b = document.getElementById('nubeInstBtn');
    if (b) b.onclick = async () => { const p = promptInstalar; promptInstalar = null; p.prompt(); try { await p.userChoice; } catch (e) {} pintarInstalar(); };
    document.getElementById('nubeInstNo').onclick = () => { guardar('noInstalar', '1'); pintarInstalar(); };
  }

  /* ---------- pantalla de clave ---------- */
  function pantallaClave(msg) {
    return new Promise(resolver => {
      const div = document.createElement('div');
      div.className = 'nube-pantalla'; div.id = 'nubeClave';
      div.innerHTML = `<form class="nube-caja" novalidate autocomplete="off">
        <img class="nube-logo" src="${escH(APP.icono)}" alt="">
        <h2>${escH(APP.nombre)}</h2>
        <p>Escribe la clave de acceso que te dieron y tu nombre. Solo se pide una vez en este teléfono.</p>
        <div class="field"><label for="nubeK">Clave de acceso</label><input id="nubeK" type="password" autocomplete="current-password" required></div>
        <label class="nube-ver"><input type="checkbox" id="nubeVer"> Mostrar la clave</label>
        <div class="field"><label for="nubeN">Tu nombre</label><input id="nubeN" type="text" autocomplete="name" placeholder="Así se verá quién hizo cada cambio" value="${escH(nombre)}"></div>
        <div class="err" id="nubeErr" ${msg ? '' : 'hidden'}>${escH(msg || '')}</div>
        <div class="note" id="nubeVacio" hidden></div>
        <button class="btn primary big" type="submit" id="nubeEntrar">Entrar</button>
        <button class="btn" type="button" id="nubeNueva" hidden>Sí, empezar con esta clave nueva</button>
      </form>`;
      document.body.appendChild(div);
      const f = div.querySelector('form'), $k = div.querySelector('#nubeK'), $n = div.querySelector('#nubeN');
      const $e = div.querySelector('#nubeErr'), $v = div.querySelector('#nubeVacio'), $b = div.querySelector('#nubeEntrar'), $nueva = div.querySelector('#nubeNueva');
      div.querySelector('#nubeVer').onchange = e => { $k.type = e.target.checked ? 'text' : 'password'; };
      let candidato = null;
      const fallo = t => { $e.textContent = t; $e.hidden = false; };
      const terminar = () => { espacio = candidato; nombre = $n.value.trim().replace(/\s+/g, ' '); guardar('espacio', espacio); guardar('nombre', nombre); div.remove(); resolver(); };
      $k.oninput = () => { $v.hidden = true; $nueva.hidden = true; candidato = null; };
      $nueva.onclick = terminar;
      f.onsubmit = async ev => {
        ev.preventDefault(); $e.hidden = true;
        const clave = $k.value.trim(); claveTmp = clave;
        if (clave.length < 6) return fallo('La clave debe tener al menos 6 caracteres.');
        if (!$n.value.trim()) return fallo('Escribe tu nombre.');
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
      setTimeout(() => $k.focus(), 50);
    });
  }

  /* ---------- copia de seguridad ---------- */
  async function leerTodo() {
    const out = {};
    for (const col of APP.colecciones) {
      const s = await F.getDocs(F.collection(fs, ...ruta(col)));
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
  const nube = {
    enlace(id) { const h = leer('enlace_' + id); return h && fs ? crearDb(h) : null; },
    async enlazar(id) {
      const en = enlaceCfg(id); if (!en || !fs) return toast('La base de datos no está abierta.');
      const clave = prompt(`Escribe la clave de acceso de la app de ${en.nombre}:`);
      if (clave == null) return;
      if (clave.trim().length < 6) return toast('La clave debe tener al menos 6 caracteres.');
      try {
        if (await probarEnlace(en, clave.trim())) { toast(`Conectada con ${en.nombre}`); setTimeout(() => location.reload(), 700); }
        else toast(`Con esa clave no hay datos de ${en.nombre}. Revisa la clave.`);
      } catch (e) { toast('No se pudo comprobar la clave: revisa tu internet.'); }
    },
    desenlazar(id) {
      const en = enlaceCfg(id); if (!en) return;
      const hacer = () => { guardar('enlace_' + id, null); location.reload(); };
      if (typeof window.confirmar === 'function') window.confirmar(`Desconectar de ${en.nombre}`, `Las hojas que guardes ya no cambiarán nada en ${en.nombre}. Lo que ya se envió no se borra.`, 'Desconectar', hacer);
      else if (confirm('¿Desconectar?')) hacer();
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
          for (let i = 0; i < ops.length; i += 400) {
            const b = F.writeBatch(fs);
            ops.slice(i, i + 400).forEach(([col, id, d]) => { if (actualizar) b.set(F.doc(fs, ...ruta(col), id), d, { merge: true }); else b.set(F.doc(fs, ...ruta(col), id), d); });
            await Promise.race([b.commit(), new Promise(r => setTimeout(r, 4000))]);
            toast(`Importando… ${Math.min(i + 400, ops.length)} de ${ops.length}`);
          }
          toast(`Copia importada: ${ops.length} registros`);
        } catch (e) { toast('No se pudo importar: ' + (mapError(e).code === 'permission_denied' ? 'la base de datos lo rechazó.' : e.message)); }
      };
      const texto = actualizar
        ? `Se actualizan ${resumen} con los datos del archivo "${file.name}". Solo cambian las columnas que trae el archivo; lo demás (correo, observaciones, etc.) se conserva. Los que no existan se crean. Esto no se puede deshacer. Recomendado: descarga primero una copia de lo actual.`
        : `Se cargan ${resumen} del archivo "${file.name}". Los registros con el mismo código se reemplazan por los de la copia, para todos. Esto no se puede deshacer. Recomendado: descarga primero una copia de lo actual.`;
      if (typeof window.confirmar === 'function') window.confirmar(actualizar ? 'Actualizar datos' : 'Importar copia', texto, actualizar ? 'Actualizar' : 'Importar', hacer, 'ok');
      else if (confirm('¿Importar la copia? Reemplaza los registros con el mismo código.')) hacer();
    },
    cambiarNombre() {
      const n = prompt('Tu nombre (así se verá quién hizo cada cambio):', nombre);
      if (n == null) return;
      const v = n.trim().replace(/\s+/g, ' ');
      if (!v) return toast('El nombre no puede quedar vacío.');
      guardar('nombre', v); location.reload();
    },
    salir() {
      const hacer = () => { guardar('espacio', null); (APP.enlaces || []).forEach(en => guardar('enlace_' + en.id, null)); location.reload(); };
      if (typeof window.confirmar === 'function') window.confirmar('Salir de este teléfono', 'Se olvida la clave en este teléfono. Para volver a entrar tendrás que escribirla otra vez. Los datos no se borran.', 'Salir', hacer);
      else if (confirm('¿Salir de este teléfono?')) hacer();
    },
    get nombre() { return nombre; }
  };
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
