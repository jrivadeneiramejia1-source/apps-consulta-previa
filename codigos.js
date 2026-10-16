/* codigos.js — Lee con la cámara el código de barras o QR del serial de un equipo (Equipos y Entregas).
   Usa el lector que trae el navegador (BarcodeDetector: Chrome en Android) y, si no lo tiene (iPhone, Windows),
   el mismo lector hecho con ZXing (paquete barcode-detector, se descarga la primera vez, unos 1,5 MB, y queda guardado).
   Si no hay permiso para la cámara, se puede tomar una foto del código.
   Uso: const serial = await Codigos.leer({ titulo, conocidos: [seriales] }) → texto o null si se cancela. */
(function () {
  'use strict';
  const POLY = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/dist/iife/ponyfill.js';
  const WASM = 'https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.3/dist/reader/';
  const FORMATOS = ['code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e', 'qr_code', 'data_matrix', 'pdf417'];
  const icono = n => (window.ico ? window.ico(n) : '');
  const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Lo que trae el código → serial: sin espacios raros, sin "S/N:" adelante y, si es un enlace (Dell, Lenovo), el serial que lleva.
  function limpiar(v) {
    let t = String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (/^https?:\/\//i.test(t)) {
      try {
        const u = new URL(t);
        for (const k of ['servicetag', 'st', 'serial', 'serialnumber', 'sn', 's', 'tag']) { const x = u.searchParams.get(k); if (x) return x.trim().toUpperCase(); }
        const ult = u.pathname.split('/').filter(Boolean).pop() || ''; if (/^[A-Z0-9-]{5,30}$/i.test(ult)) return ult.toUpperCase();
      } catch (e) {}
      return t;
    }
    t = t.replace(/^(s\/?n|serial(\s*(no|number|n°|nº))?|n[°º]\s*de\s*serie)\s*[:#.]?\s*/i, '');
    return t.replace(/\s+/g, ' ').toUpperCase();
  }

  /* ---------------- lector ---------------- */
  let detector = null, cargando = null;
  function cargarScript(src) {
    return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = () => { s.remove(); mal(new Error('No se pudo descargar el lector de códigos. Revisa tu internet.')); }; document.head.appendChild(s); });
  }
  function obtener() {
    if (detector) return Promise.resolve(detector);
    if (!cargando) cargando = (async () => {
      if ('BarcodeDetector' in window && !window.__codigosSinNativo) {
        try {
          const sop = await window.BarcodeDetector.getSupportedFormats(), f = FORMATOS.filter(x => sop.includes(x));
          if (f.includes('code_128') && f.includes('qr_code')) return new window.BarcodeDetector({ formats: f });
        } catch (e) {}
      }
      if (!window.BarcodeDetectionAPI) await cargarScript(POLY);
      const api = window.BarcodeDetectionAPI;
      api.setZXingModuleOverrides({ locateFile: (p, pre) => (p.endsWith('.wasm') ? WASM : pre) + p });
      return new api.BarcodeDetector({ formats: FORMATOS });
    })().then(d => (detector = d), e => { cargando = null; throw e; });
    return cargando;
  }
  // Busca códigos en una foto (archivo o Blob). Devuelve los textos ya limpios, sin repetir.
  async function leerImagen(blob) {
    const det = await obtener();
    const bm = await createImageBitmap(blob);
    try { return [...new Set((await det.detect(bm)).map(r => limpiar(r.rawValue)).filter(Boolean))]; }
    finally { if (bm.close) bm.close(); }
  }

  /* ---------------- pantalla ---------------- */
  const css = `
  body.con-cod { overflow: hidden; }
  .cod { position: fixed; inset: 0; z-index: 96; background: #0b100f; color: #f1f5f4; display: flex; flex-direction: column; font-family: var(--f-body, system-ui, sans-serif); }
  .cod-barra { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; padding: 8px 12px; padding-top: max(8px, env(safe-area-inset-top)); }
  .cod-barra h2 { margin: 0; text-align: center; font-size: 1rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cod-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; min-width: 44px; border: 1px solid rgba(255,255,255,.3); background: rgba(255,255,255,.08); color: #fff; border-radius: 12px; padding: 8px 12px; font: inherit; font-weight: 700; font-size: .9rem; cursor: pointer; }
  .cod-btn .ph { width: 20px; height: 20px; flex: none; }
  .cod-btn.si { background: #46c2a6; border-color: #46c2a6; color: #062019; }
  .cod-btn[aria-pressed="true"] { background: #ffd27a; border-color: #ffd27a; color: #2b1d00; }
  .cod button:focus-visible { outline: 3px solid #ffd27a; outline-offset: 2px; }
  .cod-escena { position: relative; flex: 1; min-height: 0; overflow: hidden; display: grid; place-items: center; background: #000; }
  .cod-escena video { width: 100%; height: 100%; object-fit: cover; }
  .cod-marco { position: absolute; left: 8%; right: 8%; top: 34%; height: 32%; border: 3px solid #46c2a6; border-radius: 16px; box-shadow: 0 0 0 9999px rgba(0,0,0,.45); pointer-events: none; }
  .cod-marco::after { content: ""; position: absolute; left: 6%; right: 6%; top: 50%; height: 2px; background: #ff6b5a; opacity: .85; animation: cod-linea 1.8s ease-in-out infinite alternate; }
  @keyframes cod-linea { from { transform: translateY(-40px); } to { transform: translateY(40px); } }
  .cod-sin { padding: 24px; max-width: 420px; text-align: center; line-height: 1.5; }
  .cod-estado { text-align: center; font-size: .9rem; padding: 8px 14px; min-height: 1.6em; color: #d5ebe5; }
  .cod-elegir { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; padding: 0 12px 6px; }
  .cod-elegir .cod-btn { font-family: var(--f-mono, ui-monospace, monospace); }
  .cod-pie { display: flex; gap: 8px; padding: 8px 12px; padding-bottom: max(12px, env(safe-area-inset-bottom)); }
  .cod-pie .cod-btn { flex: 1 1 0; min-width: 0; }
  .cod-oculto { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
  .cod [hidden] { display: none !important; }
  @media (prefers-reduced-motion: reduce) { .cod-marco::after { animation: none; } }`;
  let estilo = false;
  function ponerEstilo() { if (estilo) return; const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); estilo = true; }

  function leer(opc) {
    opc = opc || {};
    ponerEstilo();
    const conocidos = new Map((opc.conocidos || []).filter(Boolean).map(s => [norm(s), String(s)]));
    return new Promise(resolver => {
      const antes = document.activeElement;
      const caja = document.createElement('div');
      caja.className = 'cod'; caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-modal', 'true'); caja.setAttribute('aria-labelledby', 'codTit');
      caja.innerHTML = `<div class="cod-barra"><button class="cod-btn" type="button" data-a="cancelar">${icono('x')}<span>Cancelar</span></button><h2 id="codTit">${esc(opc.titulo || 'Escanear el código')}</h2><button class="cod-btn" type="button" data-a="linterna" aria-pressed="false" aria-label="Linterna" hidden>${icono('linterna')}</button></div>
        <div class="cod-escena"><video playsinline muted aria-hidden="true"></video><div class="cod-marco" aria-hidden="true"></div><div class="cod-sin" hidden></div></div>
        <div class="cod-estado" role="status" aria-live="polite">Abriendo la cámara…</div>
        <div class="cod-elegir" role="group" aria-label="Códigos encontrados" hidden></div>
        <div class="cod-pie"><button class="cod-btn" type="button" data-a="foto">${icono('camara')}<span>Tomar foto</span></button><button class="cod-btn" type="button" data-a="escribir">${icono('lapiz')}<span>Escribir a mano</span></button></div>
        <input class="cod-oculto" type="file" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true">`;
      document.body.appendChild(caja); document.body.classList.add('con-cod');
      const $ = s => caja.querySelector(s), video = $('video'), estado = $('.cod-estado'), elegir = $('.cod-elegir'), sin = $('.cod-sin'), inFoto = $('input[type=file]');
      let flujo = null, fin = false, vistos = new Map(), timer = 0, empujado = false, linterna = false;
      const ponerEstado = t => { estado.textContent = t; };
      function cerrar(v) {
        if (fin) return; fin = true;
        clearTimeout(timer);
        if (flujo) flujo.getTracks().forEach(t => t.stop());
        window.removeEventListener('popstate', alAtras);
        caja.remove(); document.body.classList.remove('con-cod');
        if (empujado) { empujado = false; try { history.back(); } catch (e) {} }
        if (antes && antes.isConnected) try { antes.focus({ preventScroll: true }); } catch (e) {}
        resolver(v);
      }
      const alAtras = () => { empujado = false; cerrar(null); };
      try { history.pushState({ codigos: 1 }, ''); empujado = true; window.addEventListener('popstate', alAtras); } catch (e) {}
      // Varios códigos en la etiqueta (serial, número de producto…): la persona escoge. Uno solo que se lee dos veces seguidas: se usa.
      function revisar(valores) {
        const conocido = valores.find(v => conocidos.has(norm(v)));
        if (conocido) return cerrar(conocidos.get(norm(conocido)));
        valores.forEach(v => vistos.set(v, (vistos.get(v) || 0) + 1));
        const firmes = [...vistos.entries()].filter(([, n]) => n >= 2).map(([v]) => v);
        if (valores.length === 1 && firmes.includes(valores[0]) && vistos.size === 1) return cerrar(valores[0]);
        if (firmes.length) {
          elegir.hidden = false;
          elegir.innerHTML = firmes.slice(0, 6).map(v => `<button class="cod-btn" type="button" data-usar="${esc(v)}">${esc(v)}</button>`).join('');
          ponerEstado(firmes.length > 1 ? 'Hay varios códigos: toca el del serial.' : 'Toca el código para usarlo, o sigue apuntando al serial.');
        }
      }
      async function ciclo() {
        if (fin) return;
        try { if (video.readyState >= 2) { const r = await detector.detect(video); if (r.length) revisar([...new Set(r.map(x => limpiar(x.rawValue)).filter(Boolean))]); } } catch (e) {}
        if (!fin) timer = setTimeout(ciclo, 180);
      }
      function sinCamara(texto) {
        video.hidden = true; $('.cod-marco').hidden = true; sin.hidden = false;
        sin.textContent = texto; ponerEstado('');
        $('[data-a=foto]').classList.add('si');
      }
      async function arrancar() {
        try { await obtener(); } catch (e) { sinCamara(e.message); $('[data-a=foto]').hidden = true; return; }
        if (fin) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return sinCamara('Este navegador no deja usar la cámara en vivo. Toca “Tomar foto” y saca una foto clara del código.');
        try { flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
        catch (e) { return sinCamara(e && e.name === 'NotAllowedError' ? 'No diste permiso para la cámara. Puedes darlo en los ajustes del navegador, o tocar “Tomar foto”.' : 'No se pudo abrir la cámara en vivo. Toca “Tomar foto” y saca una foto clara del código.'); }
        if (fin) { flujo.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = flujo;
        try { await video.play(); } catch (e) {}
        const pista = flujo.getVideoTracks()[0], cap = pista && pista.getCapabilities ? pista.getCapabilities() : {};
        if (cap && cap.torch) $('[data-a=linterna]').hidden = false;
        ponerEstado('Apunta al código de barras o QR del serial, dentro del recuadro.');
        ciclo();
      }
      caja.addEventListener('click', async ev => {
        const u = ev.target.closest('[data-usar]'); if (u) return cerrar(u.dataset.usar);
        const a = ev.target.closest('[data-a]'); if (!a) return;
        if (a.dataset.a === 'cancelar' || a.dataset.a === 'escribir') cerrar(null);
        if (a.dataset.a === 'foto') { inFoto.value = ''; try { inFoto.click(); } catch (e) {} }
        if (a.dataset.a === 'linterna' && flujo) {
          linterna = !linterna;
          try { await flujo.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: linterna }] }); a.setAttribute('aria-pressed', linterna); } catch (e) { linterna = false; }
        }
      });
      inFoto.addEventListener('change', async () => {
        const f = inFoto.files && inFoto.files[0]; inFoto.value = ''; if (!f) return;
        ponerEstado('Buscando el código en la foto…');
        try {
          const v = await leerImagen(f);
          if (!v.length) { ponerEstado('No encontré un código en la foto. Acércate más, con buena luz y sin reflejos.'); return; }
          vistos = new Map(v.map(x => [x, 2]));
          if (v.length === 1) return cerrar(conocidos.get(norm(v[0])) || v[0]);
          revisar(v);
        } catch (e) { ponerEstado('No se pudo leer la foto: ' + (e.message || e)); }
      });
      caja.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cerrar(null); return; }
        if (ev.key !== 'Tab') return;
        const f = [...caja.querySelectorAll('button')].filter(b => !b.hidden && b.offsetParent !== null);
        if (!f.length) return;
        if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
        else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
      });
      $('[data-a=cancelar]').focus();
      arrancar();
    });
  }

  window.Codigos = { leer, leerImagen, limpiar, cargar: obtener };
})();
