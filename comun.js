/* comun.js — Ayudas de interfaz compartidas por Equipos y Entregas.
   - Hojas (.backdrop) y visor como diálogos accesibles: foco al abrir, foco atrapado y devuelto al cerrar, sin desplazar el fondo.
   - vacio(), esqueleto() y foto() para estados vacíos, cargas y cambios sin guardar.
   - antes() para que las tarjetas se deslicen a su nuevo puesto, celebrar() (confeti) y vibrar(). */
(function () {
  'use strict';
  const BASE = document.currentScript && document.currentScript.src ? new URL('.', document.currentScript.src) : new URL('../', location.href);
  const FOCO = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const esH = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ico = n => (window.ico ? window.ico(n) : '');
  const abiertos = [];   // pila de diálogos abiertos: { el, volver }
  const visible = el => !el.hidden && el.isConnected;

  function preparar(el) {
    if (el.dataset.dialogo) return;
    el.dataset.dialogo = '1';
    const caja = el.classList.contains('backdrop') ? el.querySelector('.sheet') : el;
    if (!caja) return;
    if (!caja.hasAttribute('tabindex')) caja.setAttribute('tabindex', '-1');
    // Si la caja ya es un diálogo (o un formulario, que no admite ese papel), el papel lo lleva el fondo.
    const quien = caja.getAttribute('role') ? caja : (caja.tagName === 'FORM' ? el : caja);
    if (!quien.getAttribute('role')) quien.setAttribute('role', 'dialog');
    quien.setAttribute('aria-modal', 'true');
    if (caja !== quien) caja.removeAttribute('aria-labelledby');
    if (!quien.getAttribute('aria-labelledby') && !quien.getAttribute('aria-label')) {
      const t = caja.querySelector('h2, h3, [data-titulo]');
      if (t) { if (!t.id) t.id = 'dlg-t-' + Math.random().toString(36).slice(2, 7); quien.setAttribute('aria-labelledby', t.id); }
    }
  }
  function cajaDe(el) { return el.classList.contains('backdrop') ? el.querySelector('.sheet') : el; }
  function alAbrir(el) {
    if (abiertos.some(a => a.el === el)) return;
    abiertos.push({ el, volver: document.activeElement });
    document.body.classList.add('con-hoja');
    // El foco va a la hoja (no a un campo) para que el teclado del teléfono no tape el contenido.
    requestAnimationFrame(() => {
      if (!visible(el)) return;
      const caja = cajaDe(el), activo = document.activeElement;
      if (caja && !caja.contains(activo)) { caja.focus({ preventScroll: true }); caja.scrollTop = 0; }
    });
  }
  function alCerrar(el) {
    const i = abiertos.findIndex(a => a.el === el); if (i < 0) return;
    const [a] = abiertos.splice(i, 1);
    if (!abiertos.length) document.body.classList.remove('con-hoja');
    const destino = a.volver && a.volver.isConnected && !a.volver.closest('[hidden]') ? a.volver : null;
    if (destino && (!document.activeElement || document.activeElement === document.body || el.contains(document.activeElement))) {
      try { destino.focus({ preventScroll: true }); } catch (e) {}
    }
  }
  function vigilar(el) {
    preparar(el);
    new MutationObserver(() => { visible(el) ? alAbrir(el) : alCerrar(el); }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    if (visible(el)) alAbrir(el);
  }
  // Tab y Mayús+Tab no salen del diálogo de arriba.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !abiertos.length) return;
    const top = abiertos[abiertos.length - 1].el; if (!visible(top)) return;
    const f = [...top.querySelectorAll(FOCO)].filter(x => x.offsetParent !== null || x === document.activeElement);
    if (!f.length) { e.preventDefault(); return; }
    const primero = f[0], ultimo = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === primero || !top.contains(document.activeElement))) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && (document.activeElement === ultimo || !top.contains(document.activeElement))) { e.preventDefault(); primero.focus(); }
  });
  function iniciar() {
    document.querySelectorAll('.backdrop, .visor').forEach(vigilar);
    // Las hojas que se crean después (por ejemplo, las de nube.js) también se vigilan.
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType === 1 && (n.matches('.backdrop, .visor'))) vigilar(n);
    }))).observe(document.body, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  /* ---------- tema: automático (el del teléfono), claro u oscuro ---------- */
  // Se guarda en el teléfono y lo comparten Equipos y Entregas. En <head> hay una línea que lo aplica antes de pintar.
  const TEMAS = [
    { k: 'auto', n: 'automático, igual que el teléfono', ico: 'temaAuto' },
    { k: 'light', n: 'claro', ico: 'temaSol' },
    { k: 'dark', n: 'oscuro', ico: 'temaLuna' }
  ];
  const HERO = { light: '#0A5A4E', dark: '#0D3B37' };
  const leerTema = () => { try { const t = localStorage.getItem('cp_tema'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch (e) { return 'auto'; } };
  function ponerTema(t, avisar) {
    const raiz = document.documentElement;
    if (t === 'auto') raiz.removeAttribute('data-theme'); else raiz.dataset.theme = t;
    try { t === 'auto' ? localStorage.removeItem('cp_tema') : localStorage.setItem('cp_tema', t); } catch (e) {}
    // La barra del teléfono toma el color del encabezado del tema que se ve.
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
      const media = (m.getAttribute('media') || '').includes('dark') ? 'dark' : 'light';
      m.setAttribute('content', HERO[t === 'auto' ? media : t]);
    });
    const b = document.getElementById('btnTema'), d = TEMAS.find(x => x.k === t);
    if (b) {
      const sig = TEMAS[(TEMAS.indexOf(d) + 1) % TEMAS.length];
      b.innerHTML = ico(d.ico);
      b.setAttribute('aria-label', `Tema ${d.n}. Toca para cambiar a ${sig.k === 'auto' ? 'automático' : sig.n}`);
      b.title = `Tema ${d.k === 'auto' ? 'automático' : d.n}`;
    }
    if (avisar && typeof window.toast === 'function') window.toast(`Tema ${d.n}`);
  }
  function iniciarTema() {
    ponerTema(leerTema(), false);
    const b = document.getElementById('btnTema');
    if (b) b.onclick = () => { const i = TEMAS.findIndex(x => x.k === leerTema()); ponerTema(TEMAS[(i + 1) % TEMAS.length].k, true); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarTema); else iniciarTema();

  const quieto = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const previos = new Map();
  // Las cifras del tablero suben o bajan contando hasta su valor nuevo.
  function contar(raiz) {
    if (!raiz) return;
    raiz.querySelectorAll('.num[data-k]').forEach(el => {
      const k = el.dataset.k, fin = Number(el.textContent) || 0, ini = previos.has(k) ? previos.get(k) : 0;
      previos.set(k, fin);
      if (ini === fin || quieto() || !Number.isFinite(fin)) return;
      const t0 = performance.now(), dur = Math.min(650, 250 + Math.abs(fin - ini) * 40);
      el.textContent = ini;
      const paso = t => {
        if (!el.isConnected) return;
        const x = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - x, 3);
        el.textContent = Math.round(ini + (fin - ini) * e);
        if (x < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    });
  }
  /* ---------- movimiento ---------- */
  // Vibración corta (solo después de que la persona tocó la pantalla; en iPhone no existe y no pasa nada).
  const vibrar = p => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch (e) {} };
  // Tarjetas que se deslizan (FLIP): se mide dónde estaba cada tarjeta antes de pintar la lista y después se anima
  // desde ahí hasta su puesto nuevo. Las que aparecen entran suave. Uso: const mover = UI.antes(lista); lista.innerHTML = …; mover();
  const CLAVES = ['data-key', 'data-rec', 'data-eq', 'data-en', 'data-t', 'data-eq-abrir'];
  const SEL_CLAVE = CLAVES.map(c => `[${c}]`).join(',');
  function claveDe(el) {
    const d = CLAVES.some(c => el.hasAttribute(c)) ? el : el.querySelector(SEL_CLAVE);
    if (d) { const c = CLAVES.find(x => d.hasAttribute(x)); return c + '=' + d.getAttribute(c); }
    if (el.matches('.grupo, .month')) return 'txt=' + ((el.querySelector('.cab') || el).textContent || '').trim();
    return '';
  }
  function antes(cont) {
    const nada = () => {};
    if (!cont || quieto() || document.hidden || !cont.children.length || typeof cont.animate !== 'function' || !cont.getClientRects().length) return nada;
    const r0 = new Map();
    for (const el of cont.children) { const k = claveDe(el); if (k && !r0.has(k)) { const r = el.getBoundingClientRect(); if (r.width) r0.set(k, r); } }
    if (!r0.size) return nada;
    return () => {
      const alto = innerHeight; let nuevos = 0;
      for (const el of cont.children) {
        const k = claveDe(el); if (!k) continue;
        const r1 = el.getBoundingClientRect();
        if (r1.bottom < -40 || r1.top > alto + 40) continue;   // fuera de la pantalla: no se anima
        const p = r0.get(k), dx = p ? p.left - r1.left : 0, dy = p ? p.top - r1.top : 0;
        if (!p || Math.abs(dy) > alto) {
          if (++nuevos <= 6) el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: (nuevos - 1) * 30, easing: 'ease-out', fill: 'backwards' });
          continue;
        }
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: Math.round(Math.min(420, 230 + Math.abs(dy) * 0.2)), easing: 'cubic-bezier(.2, .9, .3, 1)' });
      }
    };
  }
  // Confeti al terminar algo importante. La librería (lib/confetti.js, 11 KB) se carga solo la primera vez.
  let confeti = null, toque = null;
  document.addEventListener('pointerdown', e => { toque = { x: e.clientX, y: e.clientY, t: Date.now() }; }, { capture: true, passive: true });
  const cargarConfeti = () => confeti || (confeti = new Promise((ok, mal) => {
    if (typeof window.confetti === 'function') return ok(window.confetti);
    const s = document.createElement('script'); s.src = new URL('lib/confetti.js', BASE).href; s.async = true;
    s.onload = () => (typeof window.confetti === 'function' ? ok(window.confetti) : mal(new Error('confeti')));
    s.onerror = () => { confeti = null; mal(new Error('No se pudo cargar el confeti')); };
    document.head.append(s);
  }));
  function celebrar() {
    vibrar([14, 60, 22]);
    if (quieto()) return Promise.resolve(false);
    const t = toque && Date.now() - toque.t < 15000 ? toque : null;
    const origen = { x: t ? t.x / innerWidth : 0.5, y: t ? Math.min(0.9, t.y / innerHeight) : 0.65 };
    const css = getComputedStyle(document.documentElement), colores = ['--accent', '--disco', '--warn', '--org', '--accent-soft'].map(v => css.getPropertyValue(v).trim()).filter(c => /^#[0-9a-f]{3,8}$/i.test(c));
    return cargarConfeti().then(c => {
      // Lienzo propio, oculto para los lectores de pantalla, que se quita al terminar.
      const lienzo = document.createElement('canvas');
      lienzo.className = 'confeti'; lienzo.setAttribute('aria-hidden', 'true');
      document.body.append(lienzo);
      const disparar = c.create(lienzo, { resize: true, disableForReducedMotion: true });
      const fin = disparar({ particleCount: 70, spread: 75, startVelocity: 34, gravity: 1.05, ticks: 170, scalar: 0.9, origin: origen, colors: colores.length ? colores : undefined });
      Promise.resolve(fin).catch(() => {}).then(() => { try { disparar.reset(); } catch (e) {} lienzo.remove(); });
      return true;
    }).catch(() => false);
  }

  const MAL = /^(no |sin conexi|la base de datos|solo lectura|ya hay|falta|ese |esa |todav[ií]a no|el escáner|hay una versi|primero|la fecha|tu cuenta|se cort|el nombre no)/i;
  const BIEN = /(guardad|marcad|registrad|agregad|eliminad|listo|conectada|descargad|importad|recortad|escanead|archivo listo|^equipos:|actualizad)/i;
  window.UI = Object.freeze({
    contar,
    /** Una cifra del tablero. Con filtro, es un botón que filtra la lista al tocarlo. */
    cifra: ({ k, n, lbl, icono, tono, filtro, activo }) => {
      const dentro = `<span class="sum-ico" aria-hidden="true">${ico(icono)}</span><span class="num" data-k="${esH(k)}">${Number(n) || 0}</span><span class="sum-lbl">${esH(lbl)}</span>`;
      const cls = `sum ${tono ? 't-' + tono : ''} ${Number(n) ? '' : 'cero'}`;
      return filtro != null
        ? `<button type="button" class="${cls}" data-filtro="${esH(filtro)}" aria-pressed="${!!activo}">${dentro}</button>`
        : `<div class="${cls}">${dentro}</div>`;
    },
    /** Aviso corto con icono según sea bueno, malo o informativo. */
    tostada: (el, msg) => {
      const m = String(msg || ''), tipo = MAL.test(m) ? 'mal' : BIEN.test(m) ? 'bien' : 'info';
      el.className = 'toast ' + tipo;
      el.innerHTML = ico(tipo === 'mal' ? 'aviso' : tipo === 'bien' ? 'checkCirculo' : 'info') + `<span>${esH(m)}</span>`;
      el.hidden = false;
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      if (tipo === 'bien') vibrar(12); else if (tipo === 'mal') vibrar([30, 60, 30]);
    },
    antes,
    celebrar,
    vibrar,
    /** Animación de entrada al cambiar de sección. */
    entrar: vista => {
      if (!vista || quieto()) return;
      vista.classList.remove('entrando'); void vista.offsetWidth; vista.classList.add('entrando');
      clearTimeout(vista._tEntrar); vista._tEntrar = setTimeout(() => vista.classList.remove('entrando'), 700);
    },
    /** Número en una insignia; salta un poco cuando cambia. */
    insignia: (el, n) => {
      if (!el) return;
      const antes = el.textContent; el.hidden = !n; el.textContent = n;
      if (n && antes !== String(n)) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    },
    /** ¿Cuál es el diálogo abierto de más arriba? */
    arriba: () => { const a = abiertos.filter(x => visible(x.el)); return a.length ? a[a.length - 1].el : null; },
    /** Estado vacío con icono, título y texto (el texto puede traer <b> ya escapado). */
    vacio: (icono, titulo, textoHtml, clase) => `<div class="empty-state ${clase || ''}"><span class="vacio-ico">${ico(icono)}</span><span class="vacio-t">${esH(titulo)}</span>${textoHtml ? `<p>${textoHtml}</p>` : ''}</div>`,
    /** Tarjetas fantasma con la forma de la lista mientras carga la base de datos. */
    esqueleto: (n, conIcono) => `<p class="sr" role="status">Cargando la base de datos…</p>` + Array.from({ length: n || 3 }, (_, i) => `<div class="card esq" aria-hidden="true">
        <div class="esq-cab">${conIcono === false ? '' : '<b></b>'}<span><i style="width:${46 + (i * 17) % 30}%"></i><i style="width:${62 + (i * 11) % 25}%"></i></span></div>
        <i style="width:${34 + (i * 23) % 40}%"></i></div>`).join(''),
    /** Huella de lo escrito en un formulario, para saber si hay cambios sin guardar. */
    foto: raiz => raiz ? JSON.stringify([...raiz.querySelectorAll('input, select, textarea, [aria-pressed]')].map(x =>
      x.matches('[aria-pressed]') && !x.matches('input, select, textarea') ? x.getAttribute('aria-pressed') : x.type === 'checkbox' ? x.checked : x.value)) : ''
  });
})();
