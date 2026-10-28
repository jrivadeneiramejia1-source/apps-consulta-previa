/* historial.js — Soporte → Historial de movimientos: quién hizo qué en Equipos y cuándo.
   Cada cambio (equipo, recibido o tarea) deja una línea en actividad/{id}; varios cambios del mismo equipo hechos en unos
   segundos se juntan en una sola (por ejemplo, «Dio Listo a X» con sus detalles). Todos las ven, con filtro por persona.
   Lo que hace otra persona suma en la insignia de Soporte; lo propio queda en la lista pero no avisa.
   Cada persona puede borrar sus propios movimientos (uno por uno o todos); los de otras personas no se pueden tocar ni editar.
   Se borran solas a los 30 días (cualquier teléfono que abra la app, máximo dos veces al día).
   La app lo arranca con Historial.iniciar({ nombre, toast, confirmar, insignia, abrirEquipo }) y le pasa cada cambio con Historial.registrar({ serial, prio, titulo, lineas }). */
(function () {
  'use strict';
  const DIA = 864e5, DIAS = 30, LIMPIAR_CADA = DIA / 2, JUNTAR = 2500, MAX_LINEAS = 12, MAX_LEIDAS = 300;
  const K_VISTO = 'eqcp_hist_visto', K_LIMPIEZA = 'eqcp_hist_limpieza';
  let o = null, S = null, yo = null, estado = 'cargando', detalle = '';
  let lista = null, sub = null, conocidas = null, abierta = false, filtro = '', vistoAlAbrir = 0, volverA = null, intentosPermiso = 0;
  const cola = new Map();   // serial → movimiento que espera unos segundos por si el mismo cambio trae más líneas
  let tCola = 0, esperas = 0;

  /* ---------- utilidades ---------- */
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const ico = n => (typeof window.ico === 'function' ? window.ico(n) : '');
  const ms = v => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : Date.parse(v) || 0);
  const claveDe = n => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const ref = (...p) => S.F.doc(S.fs, 'espacios', S.espacio, ...p);
  const col = (...p) => S.F.collection(S.fs, 'espacios', S.espacio, ...p);
  const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const recortar = (t, n) => { t = String(t ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const hora = t => t ? new Date(t).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : '';
  function dia(t) {
    const d = new Date(t), h = new Date(), ay = new Date(); ay.setDate(h.getDate() - 1);
    if (d.toDateString() === h.toDateString()) return 'Hoy';
    if (d.toDateString() === ay.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function razon(e) {
    const c = (e && e.code) || '';
    return /permission/.test(c) ? 'la base de datos no lo permitió (si usas otro teléfono con tu mismo nombre, vincúlalo en Soporte).' : /unavailable/.test(c) ? 'sin internet.' : (e && e.message) || 'error desconocido.';
  }
  // Un «permiso denegado» justo al arrancar suele ser pasajero (la sesión anónima todavía no llegó): se reintenta unas veces antes de culpar a las reglas.
  function fallo(e, reintentar) {
    const c = (e && (e.code || e.message)) || '';
    if (/permission/.test(c) && reintentar && intentosPermiso < 3) { intentosPermiso++; setTimeout(reintentar, 1500 * intentosPermiso); return; }
    estado = /permission/.test(c) ? 'sin-reglas' : /resource-exhausted|quota/.test(c) ? 'sin-cupo' : 'error'; detalle = c; pintar();
  }

  /* ---------- arranque ---------- */
  async function iniciar(opciones) {
    o = opciones; montarPantalla(); pintar();
    const nombre = String(o.nombre() || '').trim();
    if (!nombre || !claveDe(nombre)) { estado = 'sin-nombre'; return pintar(); }
    yo = { clave: claveDe(nombre), nombre };
    if (!window.nube || typeof window.nube.sesionChat !== 'function') { estado = 'sin-sesion'; return pintar(); }
    try { S = await window.nube.sesionChat(); }
    catch (e) { estado = 'sin-sesion'; detalle = (e && (e.code || e.message)) || ''; return pintar(); }   // el chat ya explica por qué
    if (lsGet(K_VISTO) === null) lsSet(K_VISTO, Date.now());   // lo de antes de la primera vez no cuenta como nuevo
    estado = 'listo'; escuchar(); pintar();
    setTimeout(limpiar, 12000);
  }
  function escuchar() {
    if (sub) sub();
    sub = S.F.onSnapshot(S.F.query(col('actividad'), S.F.orderBy('en', 'desc'), S.F.limit(MAX_LEIDAS)), { includeMetadataChanges: true }, s => {
      intentosPermiso = 0; if (estado !== 'listo') estado = 'listo';
      // Lo de más de 30 días ya no se muestra aunque todavía no lo haya borrado la limpieza.
      lista = s.docs.map(d => Object.assign({ id: d.id, pend: !!(d.metadata && d.metadata.hasPendingWrites) }, d.data({ serverTimestamps: 'estimate' })))
        .filter(m => Date.now() - ms(m.en) <= DIAS * DIA).sort((a, b) => ms(b.en) - ms(a.en));
      avisarNuevas(); pintar();
      if (abierta) { pintarPanel(); marcarVisto(); }
    }, e => fallo(e, escuchar));
  }

  /* ---------- anotar lo que alguien hace ---------- */
  // m = { serial, prio, titulo, lineas }. prio: 5 Listo, 4 hizo una tarea, 3 crear/borrar/programar, 2 actualizar, 1 editar.
  function juntar(a, b) {
    const gana = (b.prio || 0) > (a.prio || 0) ? b : a, pierde = gana === a ? b : a;
    const lineas = [].concat(a.lineas || [], b.lineas || []);
    if ((pierde.prio || 0) >= 3 && pierde.titulo !== gana.titulo) lineas.unshift(pierde.titulo);
    return { serial: a.serial, prio: gana.prio || 0, titulo: gana.titulo, lineas: [...new Set(lineas)].slice(0, MAX_LINEAS) };
  }
  function registrar(m) {
    if (!o || !m || !m.titulo || estado === 'sin-nombre' || estado === 'sin-sesion') return;
    const k = m.serial || '·', antes = cola.get(k);
    cola.set(k, antes ? juntar(antes, m) : { serial: m.serial || '', prio: m.prio || 0, titulo: m.titulo, lineas: (m.lineas || []).slice(0, MAX_LINEAS) });
    clearTimeout(tCola); tCola = setTimeout(vaciar, JUNTAR);
  }
  function vaciar() {
    tCola = 0;
    if (!cola.size) return;
    // Todavía sin sesión: se espera un rato. Si no hay sesión o faltan las reglas, el cambio ya quedó guardado; solo no sale en el historial.
    if (estado === 'cargando') { if (++esperas <= 20) tCola = setTimeout(vaciar, 3000); else cola.clear(); return; }
    if (estado !== 'listo') { cola.clear(); return; }
    const lote = [...cola.values()].slice(0, 40); cola.clear();
    lote.forEach(m => {
      const datos = { de: yo.clave, nombre: yo.nombre.slice(0, 60), en: S.F.serverTimestamp(), titulo: recortar(m.titulo, 200) };
      if (m.serial) datos.serial = String(m.serial).slice(0, 60);
      if (m.lineas && m.lineas.length) datos.lineas = m.lineas.slice(0, MAX_LINEAS).map(l => recortar(l, 200)).filter(Boolean);
      S.F.setDoc(ref('actividad', nuevoId()), datos).catch(e => fallo(e));
    });
  }

  /* ---------- limpieza: el plan gratis de Firebase no se llena ---------- */
  async function limpiar(forzar) {
    const ahora = Date.now();
    if (!S || (!forzar && ahora - (Number(lsGet(K_LIMPIEZA)) || 0) < LIMPIAR_CADA)) return 0;
    lsSet(K_LIMPIEZA, ahora);
    const s = await S.F.getDocs(S.F.query(col('actividad'), S.F.where('en', '<', new Date(ahora - DIAS * DIA)), S.F.limit(200))).catch(() => null);
    const viejos = s ? s.docs.filter(d => ahora - ms(d.data({ serverTimestamps: 'estimate' }).en) > DIAS * DIA) : [];
    await Promise.all(viejos.map(d => S.F.deleteDoc(d.ref).catch(() => {})));
    return viejos.length;
  }

  /* ---------- lo nuevo ---------- */
  const ajenas = () => (lista || []).filter(m => m.de !== yo.clave);
  const sinVer = () => { const v = Number(lsGet(K_VISTO)) || 0; return ajenas().filter(m => ms(m.en) > v).length; };
  function marcarVisto() {
    const u = (lista || [])[0];
    if (u && document.visibilityState === 'visible') lsSet(K_VISTO, Math.max(Number(lsGet(K_VISTO)) || 0, ms(u.en)));
  }
  // Aviso dentro de la app cuando otra persona hace algo y no estás mirando el historial.
  function avisarNuevas() {
    const vistos = conocidas, ids = new Set((lista || []).map(m => m.id));
    conocidas = ids;
    if (!vistos) return;   // primera carga: no se avisa lo viejo
    const nuevo = (lista || []).filter(m => !vistos.has(m.id) && m.de !== yo.clave).shift();
    if (!nuevo || (abierta && document.visibilityState === 'visible')) return;
    o.toast(`Historial · ${nuevo.nombre || nuevo.de}: ${nuevo.titulo}`.slice(0, 120));
  }

  /* ---------- fila en Soporte ---------- */
  function pintar() {
    const v = $('soHist'); if (!v) return;
    const n = estado === 'listo' && lista ? sinVer() : 0;
    o && o.insignia && o.insignia(n);
    const aviso = html => `<div class="aviso warn"><span>${html}</span></div>`;
    if (estado === 'sin-reglas') { v.innerHTML = aviso('Falta pegar en Firebase las reglas nuevas de Firestore (traen el Historial de movimientos). Quien administra la app las pega en <b>Firestore Database → Reglas</b>.'); return; }
    if (estado === 'sin-cupo') { v.innerHTML = aviso('Se acabó por hoy el cupo gratis de Firebase para el historial. Mañana vuelve a funcionar solo.'); return; }
    if (estado === 'error') { v.innerHTML = aviso('No se pudo abrir el historial. Vuelve a abrir la app.' + (detalle ? ` <span class="meta">(${esc(detalle)})</span>` : '')); return; }
    if (estado !== 'listo') { v.innerHTML = ''; return; }   // sin nombre o sin sesión: el chat de abajo ya lo explica
    const u = (lista || [])[0], mio = u && u.de === yo.clave;
    v.innerHTML = `<button type="button" class="card so-fila ${n ? 'nuevo' : ''}" data-hist="abrir">
      <span class="so-av so-grupo" aria-hidden="true">${ico('historial')}</span>
      <span class="so-txt"><span class="so-nombre">Historial de movimientos</span><span class="so-prev">${u ? `${mio ? 'Tú' : esc(String(u.nombre || u.de).split(' ')[0])}: ${esc(u.titulo)}` : 'Lo que cada persona hace en Equipos queda aquí.'}</span></span>
      <span class="so-lado">${u ? `<span class="so-hora">${esc(hora(ms(u.en)))}</span>` : ''}${n ? `<span class="so-n" aria-label="${n} sin ver">${n}</span>` : ''}</span>
    </button>`;
  }

  /* ---------- pantalla del historial ---------- */
  function montarPantalla() {
    if ($('histPantalla')) return;
    const d = document.createElement('div');
    d.className = 'chat-pantalla'; d.id = 'histPantalla'; d.hidden = true;
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'histTitulo');
    d.innerHTML = `<div class="chat-cab">
        <button class="btn ghost chat-atras" type="button" data-hi="cerrar" aria-label="Volver a Soporte">${ico('atras')}</button>
        <span class="so-av so-grupo" aria-hidden="true">${ico('historial')}</span>
        <div class="chat-quien"><h2 id="histTitulo">Historial de movimientos</h2><p class="meta" id="histSub"></p></div>
      </div>
      <div class="hist-chips" id="histChips" role="group" aria-label="Filtrar por persona"></div>
      <div class="hist-barra" id="histBarra" hidden></div>
      <div class="chat-lista" id="histLista" tabindex="0" aria-label="Movimientos"></div>`;
    document.body.appendChild(d);
    d.addEventListener('click', clicPantalla);
    // Escape: primero cierra lo que esté encima (la ficha de un equipo, una confirmación) y luego el historial.
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !abierta || (window.UI && UI.arriba && UI.arriba())) return;
      e.preventDefault(); e.stopPropagation(); cerrar();
    }, true);
    window.addEventListener('popstate', () => { if (abierta) cerrar(true); });
  }
  function abrir() {
    if (estado !== 'listo' || abierta) return;
    volverA = document.activeElement;
    abierta = true; filtro = ''; vistoAlAbrir = Number(lsGet(K_VISTO)) || 0;
    $('histPantalla').hidden = false; document.body.classList.add('con-chat');
    try { history.pushState({ historial: 1 }, ''); } catch (e) {}
    pintarPanel(); marcarVisto(); pintar();
    const b = $('histPantalla').querySelector('[data-hi="cerrar"]'); if (b) b.focus({ preventScroll: true });
  }
  function cerrar(porAtras) {
    if (!abierta) return;
    abierta = false;
    $('histPantalla').hidden = true; document.body.classList.remove('con-chat');
    if (!porAtras) try { history.back(); } catch (e) {}
    pintar();
    const fila = document.querySelector('#soHist [data-hist="abrir"]'), ir = fila || (volverA && volverA.isConnected ? volverA : null);
    if (ir) try { ir.focus({ preventScroll: true }); } catch (e) {}
  }
  function pintarPanel() {
    const l = $('histLista'); if (!l || !abierta) return;
    const todas = lista || [];
    $('histSub').textContent = `Últimos ${DIAS} días · lo ven todos`;
    // Chips: una por persona, con cuántos movimientos tiene.
    const personas = new Map();
    todas.forEach(m => { const p = personas.get(m.de) || { de: m.de, nombre: m.nombre || m.de, n: 0 }; p.n++; personas.set(m.de, p); });
    if (filtro && !personas.has(filtro)) filtro = '';
    const chip = (k, txt, n) => `<button type="button" class="chip" data-hi-f="${esc(k)}" aria-pressed="${filtro === k}">${txt} <span class="n">${n}</span></button>`;
    $('histChips').innerHTML = personas.size > 1 || filtro
      ? chip('', 'Todos', todas.length) + [...personas.values()].sort((a, b) => b.n - a.n).map(p => chip(p.de, p.de === yo.clave ? 'Tú' : esc(p.nombre), p.n)).join('')
      : '';
    $('histChips').hidden = !$('histChips').innerHTML;
    const mios = todas.filter(m => m.de === yo.clave).length;
    $('histBarra').innerHTML = mios ? `<button type="button" class="btn small" data-hi="borrar-mios">${ico('borrar')}Borrar mis movimientos (${mios})</button>` : '';
    $('histBarra').hidden = !mios;
    const ver = filtro ? todas.filter(m => m.de === filtro) : todas;
    if (!ver.length) { l.innerHTML = `<div class="chat-vacio">${ico('historial')}<p>Todavía no hay movimientos. Cuando alguien cree, edite o termine algo en Equipos, queda aquí con su nombre y la hora.</p></div>`; return; }
    let html = '', diaAnt = '';
    for (const m of ver) {
      const t = ms(m.en), d = dia(t), mio = m.de === yo.clave, nuevo = !mio && t > vistoAlAbrir;
      if (d !== diaAnt) { html += `${diaAnt ? '</ol>' : ''}<div class="chat-dia"><span>${esc(d)}</span></div><ol class="hist-lista">`; diaAnt = d; }
      const lineas = Array.isArray(m.lineas) ? m.lineas : [];
      html += `<li class="hist-item ${nuevo ? 'nuevo' : ''}">
        <span class="so-av" aria-hidden="true">${esc(iniciales(m.nombre))}</span>
        <div class="hist-cuerpo">
          <p class="hist-cab"><b>${esc(mio ? 'Tú' : m.nombre || m.de)}</b><span class="meta">${esc(hora(t))}</span>${nuevo ? '<span class="pill s-listo">Nuevo</span>' : ''}</p>
          <p class="hist-titulo">${esc(m.titulo)}</p>
          ${lineas.length ? `<ul class="hist-lineas">${lineas.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          ${m.serial || mio ? `<div class="hist-acciones">${m.serial ? `<button type="button" class="btn small" data-hi-eq="${esc(m.serial)}">${ico('equipos')}Ver ${esc(m.serial)}</button>` : ''}${mio ? `<button type="button" class="btn small ghost" data-hi-del="${esc(m.id)}" aria-label="Borrar este movimiento: ${esc(m.titulo)}">${ico('borrar')}Borrar</button>` : ''}</div>` : ''}
        </div></li>`;
    }
    l.innerHTML = html + '</ol>';
  }
  /* ---------- borrar lo propio ---------- */
  const enfocarLista = () => setTimeout(() => { const l = $('histLista'); if (abierta && l) l.focus({ preventScroll: true }); }, 80);
  function borrarUno(id) {
    const m = (lista || []).find(x => x.id === id);
    if (!m || m.de !== yo.clave) return;
    o.confirmar('¿Borrar este movimiento?', `«${m.titulo}» se borra del historial, para todos. No se puede deshacer.`, 'Borrar', () => {
      S.F.deleteDoc(ref('actividad', id)).catch(e => o.toast('No se borró: ' + razon(e)));
      enfocarLista();
    });
  }
  function borrarMios() {
    const n = (lista || []).filter(m => m.de === yo.clave).length;
    if (!n) return;
    o.confirmar('¿Borrar tus movimientos?', `Se borran tus ${n} ${n === 1 ? 'movimiento' : 'movimientos'} del historial, para todos. Los de otras personas no se tocan. No se puede deshacer.`, 'Borrar', async () => {
      const s = await S.F.getDocs(S.F.query(col('actividad'), S.F.where('de', '==', yo.clave), S.F.limit(400))).catch(e => { o.toast('No se borró: ' + razon(e)); return null; });
      if (!s) return;
      const mios = s.docs.filter(d => d.data().de === yo.clave);
      // De a 10 por lote: las reglas revisan que cada uno sea tuyo y Firestore limita cuánto pueden consultar por lote.
      const lotes = [];
      for (let i = 0; i < mios.length; i += 10) { const b = S.F.writeBatch(S.fs); mios.slice(i, i + 10).forEach(d => b.delete(d.ref)); lotes.push(b.commit()); }
      Promise.all(lotes).then(() => o.toast(`Se borraron ${mios.length === 1 ? 'tu movimiento' : 'tus ' + mios.length + ' movimientos'}`), e => o.toast('No se borró todo: ' + razon(e)));
      enfocarLista();
    });
  }
  function clicPantalla(e) {
    const b = e.target.closest('[data-hi],[data-hi-f],[data-hi-eq],[data-hi-del]'); if (!b) return;
    if (b.dataset.hi === 'cerrar') return cerrar();
    if (b.dataset.hi === 'borrar-mios') return borrarMios();
    if (b.dataset.hiDel) return borrarUno(b.dataset.hiDel);
    if (b.dataset.hiF !== undefined) { filtro = b.dataset.hiF; pintarPanel(); const c = $('histChips').querySelector(`[data-hi-f="${CSS.escape(filtro)}"]`); if (c) c.focus({ preventScroll: true }); return; }
    if (b.dataset.hiEq && o.abrirEquipo) o.abrirEquipo(b.dataset.hiEq);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('#soHist [data-hist]');
    if (b) abrir();
  });

  window.Historial = Object.freeze({ iniciar, registrar, pintar, limpiar: () => limpiar(true), get estado() { return estado; } });
})();
