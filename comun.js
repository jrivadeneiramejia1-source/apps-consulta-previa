/* comun.js — Ayudas de interfaz compartidas por Equipos y Entregas.
   - Hojas (.backdrop) y visor como diálogos accesibles: foco al abrir, foco atrapado y devuelto al cerrar, sin desplazar el fondo.
   - vacio(), esqueleto() y foto() para estados vacíos, cargas y cambios sin guardar. */
(function () {
  'use strict';
  const FOCO = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const esH = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  const ico = n => (window.ico ? window.ico(n) : '');
  window.UI = Object.freeze({
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
