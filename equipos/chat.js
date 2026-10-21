/* chat.js — Soporte: chat de todos y chats privados entre las personas que usan Equipos.
   Cada teléfono entra con una identidad anónima de Firebase (nube.sesionChat). Una persona es gente/{clave}
   (su nombre sin tildes) con los teléfonos (uids) que hablan por ella; un segundo teléfono se vincula con un código.
   Los privados van en privados/{claveA__claveB}/mensajes y las reglas solo dejan leerlos a esas dos personas.
   La app lo arranca con ChatSoporte.iniciar({ nombre, toast, confirmar, avisar, insignia }). */
(function () {
  'use strict';
  const LATIDO = 2 * 60e3, VIVO = 5 * 60e3, MAX = 2000;
  const K_VISTO = 'eqcp_chat_visto_todos';
  let o = null, S = null, yo = null, estado = 'cargando', detalle = '';
  let gente = new Map(), todos = null;
  const privados = new Map(), subsPriv = new Map(), reintentos = new Map(), conocidos = new Map(), subs = [];
  let abierto = null, cita = null, sel = null, pendiente = null, codigoMio = '', tLatido = 0, creando = false, volverA = null, miaPendiente = false;

  /* ---------- utilidades ---------- */
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const ico = n => (typeof window.ico === 'function' ? window.ico(n) : '');
  const ms = v => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : Date.parse(v) || 0);
  const claveDe = n => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const convCon = c => [yo.clave, c].sort().join('__');
  const otroDe = conv => conv.split('__').find(x => x !== yo.clave) || '';
  const ref = (...p) => S.F.doc(S.fs, 'espacios', S.espacio, ...p);
  const col = (...p) => S.F.collection(S.fs, 'espacios', S.espacio, ...p);
  const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const nombreDe = c => (gente.get(c) || {}).nombre || c;
  const enLinea = p => !!p && Date.now() - ms(p.visto) < VIVO;
  const quieto = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const hora = t => t ? new Date(t).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : '';
  function dia(t) {
    const d = new Date(t), h = new Date(), ay = new Date(); ay.setDate(h.getDate() - 1);
    if (d.toDateString() === h.toDateString()) return 'Hoy';
    if (d.toDateString() === ay.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function haceCuanto(t) {
    const m = (Date.now() - t) / 6e4;
    return !t ? 'todavía no ha entrado' : m < 5 ? 'conectado ahora' : m < 60 ? `visto hace ${Math.round(m)} min` : m < 1440 ? `visto hace ${Math.round(m / 60)} h` : m < 2880 ? 'visto ayer' : `visto hace ${Math.round(m / 1440)} días`;
  }
  // Enlaces en el texto (ya escapado): se pueden tocar.
  const conEnlaces = t => t.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  function razon(e) {
    const c = (e && e.code) || '';
    return /permission/.test(c) ? 'la base de datos no lo permitió.' : /unavailable/.test(c) ? 'sin internet: se envía al volver la señal.' : (e && e.message) || 'error desconocido.';
  }
  function fallo(e) {
    const c = (e && (e.code || e.message)) || '';
    estado = /permission/.test(c) ? 'sin-reglas' : 'error'; detalle = c; pintar();
  }

  /* ---------- arranque e identidad ---------- */
  async function iniciar(opciones) {
    o = opciones; montarPantalla(); pintar();
    const nombre = String(o.nombre() || '').trim();
    if (!nombre || !claveDe(nombre)) { estado = 'sin-nombre'; return pintar(); }
    yo = { clave: claveDe(nombre), nombre };
    if (!window.nube || typeof window.nube.sesionChat !== 'function') { estado = 'sin-db'; return pintar(); }
    try { S = await window.nube.sesionChat(); }
    catch (e) {
      const c = (e && (e.code || e.message)) || '';
      estado = /operation-not-allowed|admin-restricted|configuration-not-found/.test(c) ? 'sin-anonimo' : e && e.code === 'sin-db' ? 'sin-db' : /network/.test(c) ? 'sin-red' : 'error';
      detalle = c; return pintar();
    }
    window.nube.alSalir(quitarEsteTelefono);
    subs.push(S.F.onSnapshot(col('gente'), { includeMetadataChanges: true }, s => {
      gente = new Map(s.docs.map(d => [d.id, d.data({ serverTimestamps: 'estimate' })]));
      const d = s.docs.find(x => x.id === yo.clave);
      miaPendiente = !!(d && d.metadata && d.metadata.hasPendingWrites);
      revisarIdentidad(); if (estado === 'listo') escucharPrivados(); pintar();
      if (abierto && abierto !== 'todos') pintarCabeza();
    }, fallo));
  }
  async function revisarIdentidad() {
    const mia = gente.get(yo.clave);
    if (!mia) {
      if (creando) return; creando = true;
      // Si dos teléfonos con el mismo nombre se anotan a la vez, uno gana y el otro pasa a «vincular».
      try { await S.F.setDoc(ref('gente', yo.clave), { nombre: yo.nombre, uids: [S.uid], visto: S.F.serverTimestamp(), creado: S.F.serverTimestamp() }); } catch (e) { /* lo decide la siguiente lectura */ }
      creando = false; return;
    }
    // Hasta que el servidor confirme que estoy anotado, las reglas no me dejan leer los privados.
    if ((mia.uids || []).includes(S.uid)) { if (estado !== 'listo' && !miaPendiente) listo(); return; }
    if (estado !== 'vincular') pedirVinculo();
  }
  function listo() {
    estado = 'listo';
    latir(); clearInterval(tLatido); tLatido = setInterval(latir, LATIDO);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') latir(); });
    if (codigoMio) { S.F.deleteDoc(ref('vinculos', codigoMio)).catch(() => {}); codigoMio = ''; }
    escucharTodos(); escucharPrivados(); pintar();
    if (pendiente) { const p = pendiente; pendiente = null; abrir(p); }
  }
  function latir() { if (estado === 'listo' && document.visibilityState === 'visible') S.F.updateDoc(ref('gente', yo.clave), { visto: S.F.serverTimestamp() }).catch(() => {}); }

  /* ---------- vincular otro teléfono de la misma persona ---------- */
  async function pedirVinculo() {
    estado = 'vincular'; pintar();
    if (codigoMio) return;
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000;
    codigoMio = String(n);
    try { await S.F.setDoc(ref('vinculos', codigoMio), { uid: S.uid, clave: yo.clave, creado: S.F.serverTimestamp() }); }
    catch (e) { codigoMio = ''; fallo(e); return; }
    pintar();
  }
  async function vincular(codigo) {
    try {
      const s = await S.F.getDoc(ref('vinculos', codigo));
      const v = s.exists() ? s.data() : null;
      if (!v) return o.toast('Ese código no existe o ya se usó. Revisa el número en el otro teléfono.');
      if (v.clave !== yo.clave) return o.toast(`Ese código es de ${nombreDe(v.clave)}: solo puedes vincular tus propios teléfonos.`);
      if ((gente.get(yo.clave).uids || []).length >= 10) return o.toast('Ya tienes 10 teléfonos vinculados: quita uno saliendo de la app en ese teléfono.');
      await S.F.updateDoc(ref('gente', yo.clave), { uids: S.F.arrayUnion(v.uid) });
      S.F.deleteDoc(ref('vinculos', codigo)).catch(() => {});
      o.toast('Teléfono vinculado: ya ve tus chats');
    } catch (e) { o.toast('No se pudo vincular: ' + razon(e)); }
  }
  function pedirCodigo() {
    o.confirmar('Vincular otro teléfono', 'En tu otro teléfono abre Equipos → Soporte. Ahí sale un código de 6 números: escríbelo aquí.', 'Vincular', () => {
      const c = ($('chVinc').value || '').replace(/\D/g, '');
      if (c.length !== 6) { $('chVinc').focus(); o.toast('El código tiene 6 números.'); return false; }
      vincular(c);
    }, 'ok', '<div class="field"><label for="chVinc">Código del otro teléfono</label><input id="chVinc" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000"></div>');
    setTimeout(() => { const i = $('chVinc'); if (i) i.focus(); }, 60);
  }
  // Al salir de la app en este teléfono: deja de hablar por esta persona (si tiene otro teléfono vinculado).
  async function quitarEsteTelefono() {
    if (!S || !yo) return;
    if (codigoMio) await S.F.deleteDoc(ref('vinculos', codigoMio)).catch(() => {});
    const mia = gente.get(yo.clave);
    if (mia && (mia.uids || []).includes(S.uid) && mia.uids.length > 1) await S.F.updateDoc(ref('gente', yo.clave), { uids: S.F.arrayRemove(S.uid) }).catch(() => {});
  }

  /* ---------- mensajes ---------- */
  const leer = s => s.docs.map(d => Object.assign({ id: d.id, pend: !!(d.metadata && d.metadata.hasPendingWrites) }, d.data({ serverTimestamps: 'estimate' })))
    .sort((a, b) => ms(a.en) - ms(b.en));
  function escucharTodos() {
    subs.push(S.F.onSnapshot(S.F.query(col('chat'), S.F.orderBy('en', 'desc'), S.F.limit(300)), { includeMetadataChanges: true }, s => {
      todos = leer(s); avisarNuevos('todos', todos); pintar(); if (abierto === 'todos') { pintarChat(); marcarVistoTodos(); }
    }, fallo));
  }
  function escucharPrivados() {
    for (const c of gente.keys()) {
      if (c === yo.clave) continue;
      const conv = convCon(c);
      if (subsPriv.has(conv)) continue;
      subsPriv.set(conv, S.F.onSnapshot(S.F.query(col('privados', conv, 'mensajes'), S.F.orderBy('en', 'desc'), S.F.limit(200)), { includeMetadataChanges: true }, s => {
        privados.set(conv, leer(s)); avisarNuevos(conv, privados.get(conv)); pintar();
        if (abierto === conv) { pintarChat(); marcarLeidos(conv); }
      }, () => {
        // Si se cae (p. ej. la persona aún no estaba confirmada), se vuelve a intentar unas veces.
        subsPriv.delete(conv); const n = (reintentos.get(conv) || 0) + 1; reintentos.set(conv, n);
        if (n <= 6) setTimeout(() => { if (estado === 'listo') escucharPrivados(); }, 1500 * n);
      }));
    }
  }
  // Aviso dentro de la app cuando llega un mensaje y no estás mirando ese chat.
  function avisarNuevos(chat, lista) {
    const vistos = conocidos.get(chat), ids = new Set(lista.map(m => m.id));
    conocidos.set(chat, ids);
    if (!vistos) return;   // primera carga: no se avisa lo viejo
    const nuevo = lista.filter(m => !vistos.has(m.id) && m.de !== yo.clave).pop();
    if (!nuevo || (abierto === chat && document.visibilityState === 'visible')) return;
    o.toast(`${chat === 'todos' ? 'Soporte · ' : ''}${nombreDe(nuevo.de)}: ${nuevo.texto.slice(0, 90)}`);
    if (navigator.vibrate) try { navigator.vibrate([40, 30, 40]); } catch (e) {}
  }
  const sinLeerTodos = () => { const v = Number(lsGet(K_VISTO)) || 0; return (todos || []).filter(m => m.de !== yo.clave && ms(m.en) > v).length; };
  const sinLeerConv = conv => (privados.get(conv) || []).filter(m => m.de !== yo.clave && !m.leido).length;
  function marcarVistoTodos() { const u = (todos || [])[todos.length - 1]; if (u && document.visibilityState === 'visible') lsSet(K_VISTO, Math.max(Number(lsGet(K_VISTO)) || 0, ms(u.en))); }
  function marcarLeidos(conv) {
    if (document.visibilityState !== 'visible') return;
    const nuevos = (privados.get(conv) || []).filter(m => m.de !== yo.clave && !m.leido && !m.pend);
    if (!nuevos.length) return;
    const b = S.F.writeBatch(S.fs);
    nuevos.slice(0, 400).forEach(m => b.update(ref('privados', conv, 'mensajes', m.id), { leido: true }));
    b.commit().catch(() => {});
  }
  function enviar(texto) {
    texto = String(texto || '').trim().slice(0, MAX);
    if (!texto || !abierto) return;
    const base = { de: yo.clave, texto, en: S.F.serverTimestamp() };
    if (cita) base.cita = { id: cita.id, texto: String(cita.texto || '').slice(0, 200), nombre: nombreDe(cita.de).slice(0, 60) };
    const chat = abierto, id = nuevoId();
    const p = chat === 'todos' ? S.F.setDoc(ref('chat', id), Object.assign({ nombre: yo.nombre.slice(0, 60) }, base))
      : S.F.setDoc(ref('privados', chat, 'mensajes', id), Object.assign({ leido: false }, base));
    p.catch(e => o.toast('No se envió: ' + razon(e)));
    cita = null; pintarCita();
    // Notificación push (si la persona activó los avisos en su teléfono).
    const corto = texto.length > 140 ? texto.slice(0, 137) + '…' : texto;
    if (chat === 'todos') [...gente.entries()].filter(([c]) => c !== yo.clave).forEach(([, g]) => o.avisar(g.nombre, { titulo: `${yo.nombre} en Soporte`, cuerpo: corto, url: './?chat=todos', etiqueta: 'chat-todos' }));
    else o.avisar(nombreDe(otroDe(chat)), { titulo: `${yo.nombre} te escribió`, cuerpo: corto, url: './?chat=' + encodeURIComponent(yo.clave), etiqueta: 'chat-' + yo.clave });
  }
  function borrar(m) {
    o.confirmar('¿Borrar el mensaje?', abierto === 'todos' ? 'Se borra para todos. No se puede deshacer.' : 'Se borra para los dos. No se puede deshacer.', 'Borrar', () => {
      const r = abierto === 'todos' ? ref('chat', m.id) : ref('privados', abierto, 'mensajes', m.id);
      S.F.deleteDoc(r).catch(e => o.toast('No se borró: ' + razon(e)));
    });
  }

  /* ---------- lista de Soporte ---------- */
  function pintar() {
    const v = $('soLista'); if (!v) return;
    const total = estado === 'listo' ? sinLeerTodos() + [...privados.keys()].reduce((n, c) => n + sinLeerConv(c), 0) : 0;
    o && o.insignia && o.insignia(total);
    const aviso = (tono, html, btn) => `<div class="aviso ${tono}"><span>${html}</span>${btn || ''}</div>`;
    if (estado === 'cargando') { v.innerHTML = window.UI ? UI.esqueleto(3) : ''; return; }
    if (estado === 'sin-nombre') { v.innerHTML = aviso('warn', 'Para usar el chat escribe tu nombre: <b>Base de datos → Cambiar mi nombre</b>.'); return; }
    if (estado === 'sin-db' || estado === 'sin-red') { v.innerHTML = aviso('warn', 'El chat necesita internet la primera vez. Revisa la señal y vuelve a abrir la app.'); return; }
    if (estado === 'sin-anonimo') { v.innerHTML = aviso('warn', 'El chat necesita un paso en Firebase, una sola vez, de quien administra la app: <b>Authentication → Método de acceso (Sign-in method) → Anónimo (Anonymous) → Habilitar</b>.'); return; }
    if (estado === 'sin-reglas') { v.innerHTML = aviso('warn', 'Falta pegar en Firebase las reglas nuevas de Firestore (traen el chat). Quien administra la app las pega en <b>Firestore Database → Reglas</b>.'); return; }
    if (estado === 'error') { v.innerHTML = aviso('warn', 'No se pudo abrir el chat. Vuelve a abrir la app.' + (detalle ? ` <span class="meta">(${esc(detalle)})</span>` : '')); return; }
    if (estado === 'vincular') {
      v.innerHTML = `<div class="card so-vincular" role="region" aria-label="Vincular este teléfono">
        <h3 class="card-title">${ico('vincular')}Vincula este teléfono</h3>
        <p class="meta">El nombre <b>${esc(yo.nombre)}</b> ya usa el chat en otro teléfono. Para ver aquí tus chats privados, en ese teléfono abre <b>Equipos → Soporte → Vincular otro teléfono</b> y escribe este código:</p>
        <p class="so-codigo" aria-label="Código ${esc(codigoMio.split('').join(' '))}">${codigoMio ? esc(codigoMio.slice(0, 3) + ' ' + codigoMio.slice(3)) : '······'}</p>
        <p class="meta">Si no eres ${esc(yo.nombre)}, o ya no tienes ese teléfono, entra con otro nombre (por ejemplo, con tu apellido).</p>
        <div class="row"><button class="btn" type="button" data-so="nombre">${ico('persona')}Usar otro nombre</button></div></div>`;
      return;
    }
    const otros = [...gente.entries()].filter(([c]) => c !== yo.clave).map(([c, g]) => {
      const conv = convCon(c), l = privados.get(conv) || [], u = l[l.length - 1];
      return { c, g, conv, u, n: sinLeerConv(conv), en: enLinea(g) };
    }).sort((a, b) => (b.n > 0) - (a.n > 0) || ms(b.u && b.u.en) - ms(a.u && a.u.en) || b.en - a.en || a.g.nombre.localeCompare(b.g.nombre, 'es'));
    const ult = todos && todos[todos.length - 1], nT = sinLeerTodos(), conectados = otros.filter(x => x.en).length;
    const prev = m => m ? `${m.de === yo.clave ? 'Tú' : esc(nombreDe(m.de).split(' ')[0])}: ${esc(m.texto)}` : '';
    v.innerHTML = `<p class="meta so-estado">${conectados ? `${conectados} ${conectados === 1 ? 'persona conectada' : 'personas conectadas'} ahora` : 'Nadie más conectado en este momento'} · tú eres <b>${esc(yo.nombre)}</b></p>
      <button type="button" class="card so-fila ${nT ? 'nuevo' : ''}" data-chat="todos">
        <span class="so-av so-grupo" aria-hidden="true">${ico('grupo')}</span>
        <span class="so-txt"><span class="so-nombre">Soporte · Todos</span><span class="so-prev">${ult ? prev(ult) : 'Chat de todo el equipo: pide indicaciones o avisa algo.'}</span></span>
        <span class="so-lado">${ult ? `<span class="so-hora">${hora(ms(ult.en))}</span>` : ''}${nT ? `<span class="so-n" aria-label="${nT} sin leer">${nT}</span>` : ''}</span>
      </button>
      <div class="section-label">Personas</div>
      ${otros.length ? otros.map(x => `<button type="button" class="card so-fila ${x.n ? 'nuevo' : ''}" data-chat="${esc(x.c)}">
        <span class="so-av" aria-hidden="true">${esc(iniciales(x.g.nombre))}<i class="so-punto ${x.en ? 'si' : ''}"></i></span>
        <span class="so-txt"><span class="so-nombre">${esc(x.g.nombre)}</span><span class="so-prev">${x.u ? prev(x.u) : esc(haceCuanto(ms(x.g.visto)))}</span></span>
        <span class="so-lado">${x.u ? `<span class="so-hora">${hora(ms(x.u.en))}</span>` : ''}${x.n ? `<span class="so-n" aria-label="${x.n} sin leer">${x.n}</span>` : `<span class="so-est">${x.en ? 'conectado' : ''}</span>`}</span>
      </button>`).join('') : (window.UI ? UI.vacio('grupo', 'Todavía no hay nadie más', 'Cada persona aparece aquí cuando abre Equipos con la clave. Mientras, puedes escribir en <b>Soporte · Todos</b>.') : '')}
      <div class="note so-nota">${ico('candado')}<span>Los chats privados solo los ven las dos personas. ¿Usas Equipos en otro teléfono? <button type="button" class="btn small" data-so="vincular">${ico('vincular')}Vincular otro teléfono</button></span></div>`;
  }

  /* ---------- pantalla de un chat ---------- */
  function montarPantalla() {
    if ($('chatPantalla')) return;
    const d = document.createElement('div');
    d.className = 'chat-pantalla'; d.id = 'chatPantalla'; d.hidden = true;
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'chatTitulo');
    d.innerHTML = `<div class="chat-cab">
        <button class="btn ghost chat-atras" type="button" data-ch="cerrar" aria-label="Volver a Soporte">${ico('atras')}</button>
        <span class="so-av" id="chatAv" aria-hidden="true"></span>
        <div class="chat-quien"><h2 id="chatTitulo"></h2><p class="meta" id="chatSub"></p></div>
      </div>
      <div class="chat-lista" id="chatLista" role="log" aria-live="polite" aria-relevant="additions" tabindex="0" aria-label="Mensajes"></div>
      <button class="btn small primary chat-nuevos" type="button" id="chatNuevos" data-ch="abajo" hidden>${ico('abajo')}Mensajes nuevos</button>
      <form class="chat-pie" id="chatForm" novalidate>
        <div class="chat-cita" id="chatCita" hidden></div>
        <div class="chat-fila">
          <textarea id="chatTexto" rows="1" maxlength="${MAX}" aria-label="Escribe un mensaje" placeholder="Escribe un mensaje"></textarea>
          <button class="btn primary chat-enviar" type="submit" id="chatEnviar" aria-label="Enviar" disabled>${ico('enviar')}</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    const t = $('chatTexto');
    const ajustar = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; $('chatEnviar').disabled = !t.value.trim(); };
    t.addEventListener('input', ajustar);
    t.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('chatForm').requestSubmit(); } });
    $('chatForm').addEventListener('submit', e => { e.preventDefault(); enviar(t.value); t.value = ''; ajustar(); abajo(true); });
    $('chatLista').addEventListener('scroll', () => { if (cerca()) $('chatNuevos').hidden = true; }, { passive: true });
    d.addEventListener('click', clicPantalla);
    // Escape: primero cierra lo que esté encima (la confirmación), luego el menú del mensaje y luego el chat.
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !abierto || (window.UI && UI.arriba && UI.arriba())) return;
      e.preventDefault(); e.stopPropagation();
      if (sel) { const id = sel; sel = null; pintarChat(); enfocar(`[data-mas="${CSS.escape(id)}"]`); } else cerrar();
    }, true);
    window.addEventListener('popstate', () => { if (abierto) cerrar(true); });
  }
  function abrir(chat) {
    if (estado !== 'listo') { pendiente = chat; return; }
    if (chat !== 'todos') {
      const c = gente.has(chat) ? chat : '';
      if (!c || c === yo.clave) return o.toast('Esa persona ya no está en el chat.');
      chat = convCon(c);
    }
    volverA = document.activeElement;
    const yaAbierto = !!abierto;
    abierto = chat; sel = null; cita = null; pintarCita();
    const p = $('chatPantalla'); p.hidden = false; document.body.classList.add('con-chat');
    if (!yaAbierto) try { history.pushState({ chat: chat }, ''); } catch (e) {}
    pintarCabeza(); pintarChat(true);
    if (chat === 'todos') marcarVistoTodos(); else marcarLeidos(chat);
    pintar();
    $('chatTexto').focus({ preventScroll: true });
  }
  function cerrar(porAtras) {
    if (!abierto) return;
    const era = abierto;
    abierto = null; sel = null;
    $('chatPantalla').hidden = true; document.body.classList.remove('con-chat');
    if (!porAtras) try { history.back(); } catch (e) {}
    pintar();
    // La lista se vuelve a pintar: el foco va a la fila del chat que se cerró.
    const fila = $('soLista').querySelector(`[data-chat="${CSS.escape(era === 'todos' ? 'todos' : otroDe(era))}"]`);
    const ir = fila || (volverA && volverA.isConnected ? volverA : null);
    if (ir) try { ir.focus({ preventScroll: true }); } catch (e) {}
  }
  function pintarCabeza() {
    if (!abierto) return;
    const av = $('chatAv');
    if (abierto === 'todos') {
      $('chatTitulo').textContent = 'Soporte · Todos';
      const n = gente.size; $('chatSub').textContent = `${n} ${n === 1 ? 'persona' : 'personas'} · lo ve todo el equipo`;
      av.className = 'so-av so-grupo'; av.innerHTML = ico('grupo');
    } else {
      const c = otroDe(abierto), g = gente.get(c) || { nombre: c };
      $('chatTitulo').textContent = g.nombre;
      $('chatSub').textContent = (enLinea(g) ? 'Conectado ahora' : haceCuanto(ms(g.visto)).replace(/^./, x => x.toUpperCase())) + ' · privado';
      av.className = 'so-av'; av.innerHTML = esc(iniciales(g.nombre)) + `<i class="so-punto ${enLinea(g) ? 'si' : ''}"></i>`;
    }
  }
  const lista = () => (abierto === 'todos' ? todos || [] : privados.get(abierto) || []);
  const cerca = () => { const l = $('chatLista'); return l.scrollHeight - l.scrollTop - l.clientHeight < 120; };
  function abajo(suave) { const l = $('chatLista'); l.scrollTo({ top: l.scrollHeight, behavior: suave && !quieto() ? 'smooth' : 'auto' }); $('chatNuevos').hidden = true; }
  function pintarChat(inicio) {
    const l = $('chatLista'); if (!l || !abierto) return;
    const estabaAbajo = inicio || cerca(), ms0 = lista(), grupo = abierto === 'todos';
    const antes = l.dataset.n ? Number(l.dataset.n) : 0, ultimo = ms0[ms0.length - 1];
    let html = '', diaAnt = '', prev = null;
    if (!ms0.length) html = `<div class="chat-vacio">${ico(grupo ? 'grupo' : 'chat')}<p>${grupo ? 'Aquí escribe todo el equipo. Pide indicaciones o avisa algo.' : `Escríbele a ${esc(nombreDe(otroDe(abierto)))}. Solo ustedes dos ven este chat.`}</p></div>`;
    for (const m of ms0) {
      const t = ms(m.en), d = dia(t);
      if (d !== diaAnt) { html += `<div class="chat-dia"><span>${esc(d)}</span></div>`; diaAnt = d; prev = null; }
      const pegado = prev && prev.de === m.de && t - ms(prev.en) < 5 * 60e3;
      html += burbuja(m, pegado, grupo); prev = m;
    }
    l.innerHTML = html; l.dataset.n = ms0.length;
    if (estabaAbajo) abajo(false);
    else if (ms0.length > antes && ultimo && ultimo.de !== yo.clave) $('chatNuevos').hidden = false;
  }
  function burbuja(m, pegado, grupo) {
    const mia = m.de === yo.clave, abiertoMenu = sel === m.id;
    const estadoMio = mia ? (m.pend ? `<span class="msg-env" title="Enviando">${ico('reloj')}<span class="sr">Enviando</span></span>` : !grupo ? (m.leido ? ' · Visto' : ' · Enviado') : '') : '';
    return `<div class="msg ${mia ? 'mia' : ''} ${pegado ? 'pegado' : ''}" id="m-${esc(m.id)}">
      <div class="msg-col">
        <div class="msg-burbuja" data-msg="${esc(m.id)}">
          ${!mia && grupo && !pegado ? `<b class="msg-quien">${esc(nombreDe(m.de))}</b>` : ''}
          ${m.cita ? `<button type="button" class="msg-cita" data-ir="${esc(m.cita.id)}"><b>${esc(m.cita.nombre === yo.nombre ? 'Tú' : m.cita.nombre)}</b><span>${esc(m.cita.texto)}</span></button>` : ''}
          <p class="msg-texto">${conEnlaces(esc(m.texto))}</p>
          <span class="msg-hora">${hora(ms(m.en))}${estadoMio}</span>
        </div>
        ${abiertoMenu ? `<div class="msg-acc">
          <button type="button" class="btn small" data-acc="responder" data-id="${esc(m.id)}">${ico('responder')}Responder</button>
          <button type="button" class="btn small" data-acc="copiar" data-id="${esc(m.id)}">${ico('copiar')}Copiar</button>
          ${mia ? `<button type="button" class="btn small danger" data-acc="borrar" data-id="${esc(m.id)}">${ico('borrar')}Borrar</button>` : ''}
        </div>` : ''}
      </div>
      <button type="button" class="msg-mas" data-mas="${esc(m.id)}" aria-label="Opciones del mensaje" aria-expanded="${abiertoMenu}">${ico('opciones')}</button>
    </div>`;
  }
  // Al redibujar la lista el foco se pierde: se devuelve al botón que corresponde.
  function enfocar(selector) { const el = $('chatLista').querySelector(selector); if (el) el.focus({ preventScroll: true }); }
  function pintarCita() {
    const c = $('chatCita'); if (!c) return;
    c.hidden = !cita;
    c.innerHTML = cita ? `<div><b>Respondiendo a ${esc(cita.de === yo.clave ? 'tu mensaje' : nombreDe(cita.de))}</b><span>${esc(cita.texto)}</span></div><button type="button" class="btn ghost small" data-ch="sin-cita" aria-label="Cancelar la respuesta">${ico('x')}</button>` : '';
  }
  function clicPantalla(e) {
    const b = e.target.closest('[data-ch],[data-acc],[data-mas],[data-ir],[data-msg]');
    if (!b || e.target.closest('a')) return;
    if (b.dataset.ch === 'cerrar') return cerrar();
    if (b.dataset.ch === 'abajo') return abajo(true);
    if (b.dataset.ch === 'sin-cita') { cita = null; pintarCita(); $('chatTexto').focus(); return; }
    if (b.dataset.ir) {
      const el = $('m-' + b.dataset.ir);
      if (!el) return o.toast('Ese mensaje ya no está en el chat.');
      el.scrollIntoView({ block: 'center', behavior: quieto() ? 'auto' : 'smooth' });
      el.classList.remove('brilla'); void el.offsetWidth; el.classList.add('brilla'); return;
    }
    const id = b.dataset.mas || b.dataset.msg || b.dataset.id, m = lista().find(x => x.id === id);
    if (!m) return;
    if (b.dataset.mas || b.dataset.msg) { sel = sel === id ? null : id; pintarChat(); enfocar(sel ? '.msg-acc .btn' : `[data-mas="${CSS.escape(id)}"]`); return; }
    sel = null;
    if (b.dataset.acc === 'responder') { cita = m; pintarCita(); pintarChat(); $('chatTexto').focus(); }
    if (b.dataset.acc === 'copiar') { (navigator.clipboard ? navigator.clipboard.writeText(m.texto) : Promise.reject()).then(() => o.toast('Mensaje copiado'), () => o.toast('No se pudo copiar.')); pintarChat(); }
    if (b.dataset.acc === 'borrar') { pintarChat(); borrar(m); }
  }

  /* ---------- clics en la lista de Soporte ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('#soLista [data-chat], #soLista [data-so]');
    if (!b) return;
    if (b.dataset.chat) return abrir(b.dataset.chat);
    if (b.dataset.so === 'vincular') return pedirCodigo();
    if (b.dataset.so === 'nombre') return window.nube && window.nube.cambiarNombre();
  });

  window.ChatSoporte = Object.freeze({ iniciar, abrir, pintar, get estado() { return estado; } });
})();
