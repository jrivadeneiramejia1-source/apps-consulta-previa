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
  // El centro de una imagen o del video, agrandado: un código pequeño queda con más puntos por barra y se lee mejor.
  // partW y partH: qué fracción del ancho y del alto se toma. Se agranda hasta 3 veces o hasta maxW puntos de ancho.
  function centro(fuente, w, h, partW, partH, lienzo, maxW) {
    const cw = Math.max(1, Math.round(w * partW)), ch = Math.max(1, Math.round(h * partH));
    const k = Math.max(1, Math.min(3, (maxW || 2400) / cw));
    const c = lienzo || document.createElement('canvas');
    c.width = Math.round(cw * k); c.height = Math.round(ch * k);
    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high';
    x.drawImage(fuente, Math.round((w - cw) / 2), Math.round((h - ch) / 2), cw, ch, 0, 0, c.width, c.height);
    return c;
  }
  const textos = r => [...new Set(r.map(x => limpiar(x.rawValue)).filter(Boolean))];
  // Busca códigos en una foto (archivo o Blob). Si no encuentra en la foto completa, prueba con el centro agrandado
  // (código pequeño en una foto grande). Devuelve los textos ya limpios, sin repetir.
  async function leerImagen(blob) {
    const det = await obtener();
    const bm = await createImageBitmap(blob);
    try {
      let r = await det.detect(bm);
      for (const f of [0.5, 0.3]) { if (r.length) break; r = await det.detect(centro(bm, bm.width, bm.height, f, f)); }
      return textos(r);
    } finally { if (bm.close) bm.close(); }
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
  .cod-ctrl { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; padding: 6px 12px 0; }
  .cod-zoom { display: inline-flex; gap: 4px; background: rgba(255,255,255,.08); border-radius: 14px; padding: 4px; }
  .cod-zoom .cod-btn { min-width: 52px; padding: 6px 10px; border-color: transparent; background: transparent; }
  .cod-zoom .cod-btn[aria-pressed="true"] { background: #fff; border-color: #fff; color: #0b100f; }
  .cod-ayuda { text-align: center; font-size: .84rem; color: #c9dcd6; padding: 0 16px 4px; line-height: 1.45; }
  .cod-ayuda b { color: #fff; }
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
        <div class="cod-ctrl" hidden><div class="cod-zoom" role="group" aria-label="Acercar la imagen" hidden></div><button class="cod-btn" type="button" data-a="cerca" aria-pressed="false" hidden>${icono('lupaMas')}<span>Enfocar de cerca</span></button><button class="cod-btn" type="button" data-a="otra" hidden>${icono('girar')}<span>Cambiar cámara</span></button></div>
        <div class="cod-estado" role="status" aria-live="polite">Abriendo la cámara…</div>
        <p class="cod-ayuda" hidden></p>
        <div class="cod-elegir" role="group" aria-label="Códigos encontrados" hidden></div>
        <div class="cod-pie"><button class="cod-btn" type="button" data-a="foto">${icono('camara')}<span>Tomar foto</span></button><button class="cod-btn" type="button" data-a="escribir">${icono('lapiz')}<span>Escribir a mano</span></button></div>
        <input class="cod-oculto" type="file" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true">`;
      document.body.appendChild(caja); document.body.classList.add('con-cod');
      const $ = s => caja.querySelector(s), video = $('video'), estado = $('.cod-estado'), elegir = $('.cod-elegir'), sin = $('.cod-sin'), inFoto = $('input[type=file]');
      let flujo = null, fin = false, vistos = new Map(), timer = 0, empujado = false, linterna = false;
      let pista = null, cap = {}, cerca = false, vueltas = 0, tAyuda = 0, traseras = [], camActual = '';
      const lienzo = document.createElement('canvas');
      const ponerEstado = t => { estado.textContent = t; };
      function cerrar(v) {
        if (fin) return; fin = true;
        clearTimeout(timer); clearTimeout(tAyuda);
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
      // Se turnan tres vistas: la imagen completa, el centro agrandado (el recuadro) y el centro muy agrandado.
      // Con un código pequeño la imagen completa casi nunca alcanza; agrandado 2,5 a 3 veces sí se lee (se midió con un
      // código de 230 puntos de ancho en un video de 1280).
      const VISTAS = [null, [0.6, 0.35], [0.35, 0.25]];
      async function ciclo() {
        if (fin) return;
        try {
          if (video.readyState >= 2 && video.videoWidth) {
            const v = VISTAS[vueltas++ % VISTAS.length];
            const fuente = v ? centro(video, video.videoWidth, video.videoHeight, v[0], v[1], lienzo) : video;
            const r = await detector.detect(fuente); if (r.length) revisar(textos(r));
          }
        } catch (e) {}
        if (!fin) timer = setTimeout(ciclo, 120);
      }
      /* ---- enfoque, zoom y cámara: para códigos pequeños ----
         La cámara principal no enfoca a menos de 10 o 15 cm: con zoom 2× o 3× el teléfono queda más lejos (donde sí enfoca)
         y el código se ve grande. Cada opción aparece solo si el teléfono la permite. */
      const ajustar = c => (pista && pista.applyConstraints ? pista.applyConstraints({ advanced: [c] }) : Promise.reject()).catch(() => false);
      const modos = () => cap.focusMode || [];
      function ponerZoom(z) {
        ajustar({ zoom: z });
        $('.cod-zoom').querySelectorAll('[data-zoom]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.zoom) === z));
      }
      async function configurar() {
        pista = flujo.getVideoTracks()[0];
        cap = pista && pista.getCapabilities ? pista.getCapabilities() || {} : {};
        if (cap.torch) $('[data-a=linterna]').hidden = false;
        if (modos().includes('continuous')) await ajustar({ focusMode: 'continuous' });
        const zz = cap.zoom && typeof cap.zoom.max === 'number' ? cap.zoom : null;
        const niveles = zz ? [1, 2, 3, 4].filter(z => z >= (zz.min || 1) && z <= zz.max) : [];
        const caja2 = $('.cod-zoom');
        if (niveles.length > 1) {
          caja2.innerHTML = niveles.map(z => `<button class="cod-btn" type="button" data-zoom="${z}" aria-pressed="false" aria-label="Zoom ${z} veces">${z}×</button>`).join('');
          caja2.hidden = false; ponerZoom(niveles.includes(2) ? 2 : niveles[0]);
        } else { caja2.hidden = true; caja2.innerHTML = ''; }
        cerca = false; $('[data-a=cerca]').setAttribute('aria-pressed', 'false');
        $('[data-a=cerca]').hidden = !(modos().includes('manual') && cap.focusDistance && typeof cap.focusDistance.min === 'number');
        try {
          traseras = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && !/front|frontal|user|delantera|selfie/i.test(d.label || ''));
        } catch (e) { traseras = []; }
        const ajustes = pista && pista.getSettings ? pista.getSettings() : {};
        camActual = ajustes.deviceId || camActual;
        $('[data-a=otra]').hidden = traseras.length < 2;
        $('.cod-ctrl').hidden = caja2.hidden && $('[data-a=cerca]').hidden && $('[data-a=otra]').hidden;
      }
      const LS_CAM = 'codigos.camara';
      const camGuardada = () => { try { return localStorage.getItem(LS_CAM) || ''; } catch (e) { return ''; } };
      function pedirCamara(id) {
        const v = { width: { ideal: 1920 }, height: { ideal: 1080 } };
        if (id) v.deviceId = { exact: id }; else v.facingMode = { ideal: 'environment' };
        try { if (navigator.mediaDevices.getSupportedConstraints && navigator.mediaDevices.getSupportedConstraints().zoom) v.zoom = true; } catch (e) {}
        return navigator.mediaDevices.getUserMedia({ video: v, audio: false });
      }
      async function usarCamara(id) {
        const nuevo = await pedirCamara(id);
        if (fin) { nuevo.getTracks().forEach(t => t.stop()); return; }
        if (flujo) flujo.getTracks().forEach(t => t.stop());
        flujo = nuevo; video.srcObject = flujo;
        try { await video.play(); } catch (e) {}
        await configurar();
      }
      function mostrarAyuda() {
        const a = $('.cod-ayuda');
        const zoom = !$('.cod-zoom').hidden ? ' Aleja un poco el teléfono y usa <b>2×</b> o <b>3×</b>.' : ' Aleja un poco el teléfono hasta que se vea nítido.';
        a.innerHTML = `¿No lo lee? Si el código es pequeño:${zoom}${!$('[data-a=cerca]').hidden ? ' Prueba <b>Enfocar de cerca</b>.' : ''} O toca <b>Tomar foto</b>: la cámara del teléfono enfoca de cerca.`;
        a.hidden = false;
      }
      // Tocar la imagen enfoca en ese punto (si el teléfono lo permite).
      video.addEventListener('click', ev => {
        if (!modos().includes('single-shot')) return;
        const r = video.getBoundingClientRect(), punto = { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
        ponerEstado('Enfocando…');
        ajustar({ focusMode: 'single-shot', pointsOfInterest: [punto] }).then(() => setTimeout(() => {
          if (!fin && !cerca && modos().includes('continuous')) ajustar({ focusMode: 'continuous' });
          if (!fin) ponerEstado('Apunta al código de barras o QR del serial, dentro del recuadro.');
        }, 1800));
      });
      function sinCamara(texto) {
        video.hidden = true; $('.cod-marco').hidden = true; sin.hidden = false;
        sin.textContent = texto; ponerEstado('');
        $('[data-a=foto]').classList.add('si');
      }
      async function arrancar() {
        try { await obtener(); } catch (e) { sinCamara(e.message); $('[data-a=foto]').hidden = true; return; }
        if (fin) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return sinCamara('Este navegador no deja usar la cámara en vivo. Toca “Tomar foto” y saca una foto clara del código.');
        // La cámara que se escogió la última vez (si ya no existe, la trasera que dé el navegador).
        try { await usarCamara(camGuardada()); }
        catch (e0) {
          try { await usarCamara(''); }
          catch (e) { return sinCamara(e && e.name === 'NotAllowedError' ? 'No diste permiso para la cámara. Puedes darlo en los ajustes del navegador, o tocar “Tomar foto”.' : 'No se pudo abrir la cámara en vivo. Toca “Tomar foto” y saca una foto clara del código.'); }
        }
        if (fin) return;
        ponerEstado('Apunta al código de barras o QR del serial, dentro del recuadro.');
        tAyuda = setTimeout(() => { if (!fin) mostrarAyuda(); }, 6000);
        ciclo();
      }
      caja.addEventListener('click', async ev => {
        const u = ev.target.closest('[data-usar]'); if (u) return cerrar(u.dataset.usar);
        const zb = ev.target.closest('[data-zoom]'); if (zb) return ponerZoom(Number(zb.dataset.zoom));
        const a = ev.target.closest('[data-a]'); if (!a) return;
        if (a.dataset.a === 'cancelar' || a.dataset.a === 'escribir') cerrar(null);
        if (a.dataset.a === 'foto') { inFoto.value = ''; try { inFoto.click(); } catch (e) {} }
        if (a.dataset.a === 'cerca' && pista) {
          cerca = !cerca;
          const ok = cerca ? await ajustar({ focusMode: 'manual', focusDistance: cap.focusDistance.min }) : await ajustar({ focusMode: modos().includes('continuous') ? 'continuous' : 'single-shot' });
          if (ok === false) { cerca = false; ponerEstado('Este teléfono no dejó cambiar el enfoque. Usa el zoom o Tomar foto.'); }
          a.setAttribute('aria-pressed', cerca);
          if (cerca) ponerEstado('Enfoque de cerca: acerca el código a unos 8 a 12 cm.');
        }
        if (a.dataset.a === 'otra' && traseras.length > 1) {
          const i = traseras.findIndex(d => d.deviceId === camActual), sig = traseras[(i + 1) % traseras.length];
          a.disabled = true;
          try { await usarCamara(sig.deviceId); try { localStorage.setItem(LS_CAM, sig.deviceId); } catch (e) {} ponerEstado(`Cámara ${traseras.indexOf(sig) + 1} de ${traseras.length}. Usa la que enfoque mejor.`); }
          catch (e) { ponerEstado('No se pudo cambiar de cámara.'); }
          a.disabled = false;
        }
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
