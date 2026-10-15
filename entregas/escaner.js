/* escaner.js — Escáner de documentos para la app de Entregas.
   Cámara en vivo con detección de la hoja, recorte con corrección de perspectiva,
   mejora tipo "documento" y varias páginas por escaneo. Usa OpenCV.js (se descarga la primera vez). */
(function () {
  'use strict';
  const CV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js';
  const DET = 480, OSCURO = 70;
  // Calidad de la toma: resolución que se le pide a la cámara, tamaño final de la hoja y compresión JPEG.
  const CALIDADES = {
    ahorro: { nombre: 'Ahorro', detalle: 'unos 200 KB por hoja · letra grande', cam: [1920, 1080], ancho: 1100, largo: 1600, jpeg: 0.7, foto: false, max: 3000 },
    normal: { nombre: 'Normal', detalle: 'unos 400 KB por hoja · recomendada', cam: [1920, 1080], ancho: 1700, largo: 2400, jpeg: 0.8, foto: true, max: 3000 },
    alta: { nombre: 'Alta', detalle: 'unos 800 KB por hoja · letra pequeña', cam: [3840, 2160], ancho: 2480, largo: 3508, jpeg: 0.9, foto: true, max: 4100 }
  };
  const FLASH = {
    no: 'Apagado',
    si: 'Al tomar la foto',
    auto: 'Automático (si hay poca luz)',
    fijo: 'Siempre encendido'
  };
  const leer = (k, d, ok) => { try { const v = localStorage.getItem(k); return v && ok[v] ? v : d; } catch (e) { return d; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  let calidad = leer('escaner.calidad', 'normal', CALIDADES), luz = leer('escaner.flash', 'no', FLASH);
  const perfil = () => CALIDADES[calidad];
  const $e = (tag, cls, html) => { const x = document.createElement(tag); if (cls) x.className = cls; if (html != null) x.innerHTML = html; return x; };
  // Aviso flotante propio (el de la app queda debajo del escáner).
  function avisar(m) {
    let t = document.getElementById('escAviso');
    if (!t) { t = $e('div'); t.id = 'escAviso'; t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(120px + env(safe-area-inset-bottom,0px));z-index:100;background:#1d2b25;color:#fff;border:1px solid #46c2a6;border-radius:12px;padding:10px 14px;font:600 .88rem system-ui;max-width:calc(100vw - 32px);text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.4)'; document.body.appendChild(t); }
    if (!document.querySelector('.esc')) { if (typeof window.toast === 'function') { window.toast(m); t.hidden = true; return; } }
    t.textContent = m; t.hidden = false; clearTimeout(avisar.t); avisar.t = setTimeout(() => { t.hidden = true; }, 3200);
  }
  function ocultarAviso() { const t = document.getElementById('escAviso'); if (t && !document.querySelector('.esc')) { t.hidden = true; clearTimeout(avisar.t); } }
  // Botón "atrás" del teléfono: cierra la pantalla del escáner que esté encima en vez de salir de la app.
  const pila = []; let ignorarAtras = 0;
  function apilar(f) { pila.push(f); try { history.pushState({ escaner: pila.length }, ''); } catch (e) {} }
  function desapilar(f, porAtras) {
    const i = pila.lastIndexOf(f); if (i < 0) return; pila.splice(i, 1);
    if (!porAtras) { ignorarAtras++; try { history.back(); } catch (e) { ignorarAtras--; } }
  }
  window.addEventListener('popstate', () => {
    if (ignorarAtras > 0) { ignorarAtras--; return; }
    const f = pila[pila.length - 1]; if (f) f();
  });

  /* ---------------- OpenCV ---------------- */
  let cvListo = null;
  function cargarCV() {
    if (cvListo) return cvListo;
    cvListo = new Promise((ok, mal) => {
      // Se entrega envuelto ({ cv }) porque el módulo de OpenCV tiene .then y una promesa se quedaría esperándolo.
      const listo = () => { if (window.cv && window.cv.Mat) { ok({ cv: window.cv }); return true; } return false; };
      if (listo()) return;
      const s = document.createElement('script'); s.src = CV_URL; s.async = true;
      s.onerror = () => { cvListo = null; mal(new Error('No se pudo descargar el detector. Revisa tu internet.')); };
      s.onload = () => {
        let c = window.cv;
        if (c && !c.Mat && typeof c.then === 'function') { c.then(m => { if (m && m.Mat) { window.cv = m; } }); }
        const t0 = Date.now();
        (function esperar() { if (listo()) return; if (Date.now() - t0 > 60000) { cvListo = null; mal(new Error('El detector tardó demasiado en cargar.')); return; } setTimeout(esperar, 80); })();
      };
      document.head.appendChild(s);
    });
    return cvListo;
  }

  /* ---------------- detección de la hoja ---------------- */
  function ordenar(p) {
    // arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda
    const s = p.map(q => q.x + q.y), d = p.map(q => q.y - q.x);
    return [p[s.indexOf(Math.min(...s))], p[d.indexOf(Math.min(...d))], p[s.indexOf(Math.max(...s))], p[d.indexOf(Math.max(...d))]];
  }
  function areaPoligono(p) { let a = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i].x * p[j].y - p[j].x * p[i].y; } return Math.abs(a) / 2; }
  // Busca el cuadrilátero más grande en una imagen (canvas). Devuelve 4 puntos en coordenadas de esa imagen, o null.
  function detectarEn(cv, canvas) {
    const src = cv.imread(canvas), gray = new cv.Mat(), blur = new cv.Mat(), bin = new cv.Mat(), edges = new cv.Mat();
    const area = canvas.width * canvas.height;
    let mejor = null, mejorArea = 0;
    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
      const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)), k3 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      // Dos intentos: hoja clara sobre fondo (umbral automático) y bordes (Canny).
      cv.threshold(blur, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k);
      cv.Canny(blur, edges, 40, 120);
      cv.dilate(edges, edges, k3);
      for (const img of [bin, edges]) {
        const cs = new cv.MatVector(), h = new cv.Mat();
        cv.findContours(img, cs, h, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        for (let i = 0; i < cs.size(); i++) {
          const c = cs.get(i), a = cv.contourArea(c);
          if (a > area * 0.18 && a > mejorArea) {
            const peri = cv.arcLength(c, true), ap = new cv.Mat();
            for (const f of [0.02, 0.03, 0.05]) {
              cv.approxPolyDP(c, ap, f * peri, true);
              if (ap.rows === 4 && cv.isContourConvex(ap)) {
                const pts = []; for (let j = 0; j < 4; j++) pts.push({ x: ap.data32S[j * 2], y: ap.data32S[j * 2 + 1] });
                // No aceptar el borde de la imagen completa como "hoja".
                const toca = pts.filter(q => q.x < 3 || q.y < 3 || q.x > canvas.width - 4 || q.y > canvas.height - 4).length;
                if (toca < 3) { mejor = ordenar(pts); mejorArea = a; }
                break;
              }
            }
            ap.delete();
          }
          c.delete();
        }
        cs.delete(); h.delete();
      }
      k.delete(); k3.delete();
    } finally { [src, gray, blur, bin, edges].forEach(m => m.delete()); }
    return mejor;
  }
  // Detecta sobre una copia pequeña y devuelve las esquinas en el tamaño original.
  function detectar(cv, canvas) {
    const k = Math.min(1, DET / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas'); c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    const q = detectarEn(cv, c);
    return q ? q.map(p => ({ x: p.x / k, y: p.y / k })) : null;
  }
  const esquinasPorDefecto = (w, h) => [{ x: w * 0.06, y: h * 0.06 }, { x: w * 0.94, y: h * 0.06 }, { x: w * 0.94, y: h * 0.94 }, { x: w * 0.06, y: h * 0.94 }];

  /* ---------------- recorte y mejora ---------------- */
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function procesar(cv, canvas, q, filtro, giro) {
    let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
    const pf = perfil(), k = Math.min(1, pf.ancho / Math.min(w, h), pf.largo / Math.max(w, h));
    w = Math.max(50, Math.round(w * k)); h = Math.max(50, Math.round(h * k));
    const src = cv.imread(canvas), dst = new cv.Mat();
    const a = cv.matFromArray(4, 1, cv.CV_32FC2, q.flatMap(p => [p.x, p.y]));
    const b = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
    const M = cv.getPerspectiveTransform(a, b);
    cv.warpPerspective(src, dst, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    let out = dst;
    if (filtro === 'doc' || filtro === 'gris') {
      const g = new cv.Mat(); cv.cvtColor(dst, g, cv.COLOR_RGBA2GRAY);
      if (filtro === 'doc') {
        // Quita sombras: divide por el fondo difuminado y estira el contraste (papel blanco, tinta oscura).
        // El fondo se calcula en pequeño (rápido) y se vuelve a agrandar.
        const sm = new cv.Mat(), bg = new cv.Mat(), ks = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
        cv.resize(g, sm, new cv.Size(Math.max(8, Math.round(w / 4)), Math.max(8, Math.round(h / 4))), 0, 0, cv.INTER_AREA);
        cv.dilate(sm, sm, ks); cv.medianBlur(sm, sm, 15); ks.delete();
        cv.resize(sm, bg, new cv.Size(w, h), 0, 0, cv.INTER_LINEAR); sm.delete();
        const n = new cv.Mat(); cv.divide(g, bg, n, 255);
        cv.normalize(n, n, 0, 255, cv.NORM_MINMAX);
        const lut = new cv.Mat(); n.convertTo(lut, -1, 1.25, -45);
        g.delete(); bg.delete(); n.delete();
        out = new cv.Mat(); cv.cvtColor(lut, out, cv.COLOR_GRAY2RGBA); lut.delete();
      } else { out = new cv.Mat(); cv.cvtColor(g, out, cv.COLOR_GRAY2RGBA); g.delete(); }
    }
    for (let i = 0; i < ((giro || 0) / 90) % 4; i++) { const t = new cv.Mat(); cv.rotate(out, t, cv.ROTATE_90_CLOCKWISE); if (out !== dst) out.delete(); out = t; }
    const c = document.createElement('canvas'); cv.imshow(c, out); c.calidadJpeg = pf.jpeg;
    [src, a, b, M, dst].forEach(m => m.delete()); if (out !== dst) out.delete();
    return c;
  }

  /* ---------------- estilos ---------------- */
  const css = `
  .esc { position: fixed; inset: 0; z-index: 95; background: #000; color: #fff; display: flex; flex-direction: column; font-family: var(--f-body, system-ui); }
  .esc-barra { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; padding-top: max(10px, env(safe-area-inset-top)); }
  .esc-barra b { font-size: 1rem; }
  .esc-escena { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; touch-action: none; }
  .esc-escena video, .esc-escena canvas.base { max-width: 100%; max-height: 100%; display: block; }
  .esc-escena canvas.capa { position: absolute; pointer-events: none; }
  .esc-estado { text-align: center; font-size: .85rem; padding: 6px 12px; min-height: 1.6em; }
  .esc-estado.ok { color: #7dffb0; }
  .esc-pie { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; padding-bottom: max(14px, env(safe-area-inset-bottom)); }
  .esc-btn { border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.08); color: #fff; border-radius: 12px; padding: 10px 14px; font-weight: 700; font-size: .9rem; }
  .esc-btn.si { background: #46c2a6; border-color: #46c2a6; color: #062019; }
  .esc-btn:disabled { opacity: .45; }
  .esc-disparo { width: 74px; height: 74px; border-radius: 50%; border: 5px solid #fff; background: rgba(255,255,255,.25); flex: 0 0 auto; }
  .esc-disparo:active { background: #fff; }
  .esc-auto { display: flex; align-items: center; gap: 6px; font-size: .8rem; }
  .esc-auto input { width: 18px; height: 18px; accent-color: #46c2a6; }
  .esc-tira { display: flex; gap: 6px; overflow-x: auto; padding: 0 14px; min-height: 0; }
  .esc-tira img { height: 54px; border-radius: 4px; border: 2px solid #46c2a6; background: #fff; flex: 0 0 auto; }
  .esc-mango { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; border: 3px solid #46c2a6; background: rgba(70,194,166,.25); touch-action: none; }
  .esc-filtros { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; padding: 4px 10px; }
  .esc-filtros button[aria-pressed="true"] { background: #fff; color: #000; }
  .esc-opc { display: flex; gap: 6px; }
  .esc-opc .esc-btn { padding: 8px 10px; font-size: .82rem; }
  .esc-panel { background: #111; border-bottom: 1px solid rgba(255,255,255,.15); padding: 8px 12px 10px; }
  .esc-panel .lista { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px; }
  .esc-panel button { text-align: left; }
  .esc-panel button[aria-pressed="true"] { background: #46c2a6; border-color: #46c2a6; color: #062019; }
  .esc-panel button small { display: block; font-weight: 500; opacity: .8; font-size: .75rem; margin-top: 2px; }
  .esc-panel .nota { font-size: .8rem; color: #ffd27a; margin-top: 8px; }
  .esc-panel .meta2 { font-size: .78rem; opacity: .75; margin-top: 8px; }
  .esc [hidden] { display: none !important; }`;
  let estiloPuesto = false;
  function ponerEstilo() { if (estiloPuesto) return; const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); estiloPuesto = true; }

  /* ---------------- editor de esquinas ---------------- */
  // Muestra la foto con 4 esquinas movibles y deja escoger el filtro. Devuelve el canvas final o null.
  function editar(cv, foto, esquinas, textoNo) {
    ponerEstilo();
    return new Promise(resolver => {
      const caja = $e('div', 'esc');
      caja.innerHTML = `<div class="esc-barra"><b>Ajusta las esquinas de la hoja</b><button class="esc-btn" data-a="cancelar" type="button">Cancelar</button></div>
        <div class="esc-escena"><canvas class="base"></canvas><canvas class="capa"></canvas></div>
        <div class="esc-estado">Arrastra los círculos hasta las esquinas del papel.</div>
        <div class="esc-filtros"><button class="esc-btn" data-f="doc" type="button" aria-pressed="true">Documento</button><button class="esc-btn" data-f="gris" type="button" aria-pressed="false">Gris</button><button class="esc-btn" data-f="color" type="button" aria-pressed="false">Color</button><button class="esc-btn" data-a="girar" type="button">Girar ⟳</button><button class="esc-btn" data-a="todo" type="button">Hoja completa</button></div>
        <div class="esc-pie"><button class="esc-btn" data-a="cancelar" type="button">${textoNo || 'Repetir'}</button><button class="esc-btn si" data-a="usar" type="button">Usar esta página</button></div>`;
      document.body.appendChild(caja);
      const escena = caja.querySelector('.esc-escena'), base = caja.querySelector('canvas.base'), capa = caja.querySelector('canvas.capa');
      base.width = foto.width; base.height = foto.height; base.getContext('2d').drawImage(foto, 0, 0);
      let q = (esquinas || esquinasPorDefecto(foto.width, foto.height)).map(p => ({ x: p.x, y: p.y })), filtro = 'doc', giro = 0;
      const mangos = q.map((_, i) => { const m = $e('div', 'esc-mango'); m.dataset.i = i; escena.appendChild(m); return m; });
      let escala = 1, ox = 0, oy = 0;
      function medir() {
        // La foto ocupa todo el espacio disponible (también si es pequeña), dejando margen para los círculos.
        const ee = escena.getBoundingClientRect(), k = Math.min((ee.width - 36) / foto.width, (ee.height - 36) / foto.height);
        if (k > 0) { base.style.width = Math.floor(foto.width * k) + 'px'; base.style.height = Math.floor(foto.height * k) + 'px'; }
        const r = base.getBoundingClientRect(), re = escena.getBoundingClientRect();
        escala = r.width / foto.width; ox = r.left - re.left; oy = r.top - re.top;
        capa.width = r.width; capa.height = r.height; capa.style.left = ox + 'px'; capa.style.top = oy + 'px';
        pintar();
      }
      function pintar() {
        q.forEach((p, i) => { mangos[i].style.left = (ox + p.x * escala) + 'px'; mangos[i].style.top = (oy + p.y * escala) + 'px'; });
        const x = capa.getContext('2d'); x.clearRect(0, 0, capa.width, capa.height);
        x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, capa.width, capa.height);
        x.globalCompositeOperation = 'destination-out'; x.beginPath(); q.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p.x * escala, p.y * escala)); x.closePath(); x.fill();
        x.globalCompositeOperation = 'source-over'; x.strokeStyle = '#46c2a6'; x.lineWidth = 3; x.stroke();
      }
      let arrastre = null;
      escena.addEventListener('pointerdown', ev => { const m = ev.target.closest('.esc-mango'); if (!m) return; arrastre = Number(m.dataset.i); m.setPointerCapture(ev.pointerId); ev.preventDefault(); });
      escena.addEventListener('pointermove', ev => {
        if (arrastre === null) return;
        const re = escena.getBoundingClientRect();
        q[arrastre] = { x: Math.max(0, Math.min(foto.width, (ev.clientX - re.left - ox) / escala)), y: Math.max(0, Math.min(foto.height, (ev.clientY - re.top - oy) / escala)) };
        pintar();
      });
      escena.addEventListener('pointerup', () => { arrastre = null; });
      escena.addEventListener('pointercancel', () => { arrastre = null; });
      let hecho = false;
      const fin = (val, porAtras) => { if (hecho) return; hecho = true; window.removeEventListener('resize', medir); caja.remove(); ocultarAviso(); desapilar(alAtras, porAtras); resolver(val); };
      const alAtras = () => fin(null, true);
      apilar(alAtras);
      caja.addEventListener('click', ev => {
        const f = ev.target.closest('[data-f]'), a = ev.target.closest('[data-a]');
        if (f) { filtro = f.dataset.f; caja.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-pressed', b === f)); }
        if (!a) return;
        if (a.dataset.a === 'cancelar') fin(null);
        if (a.dataset.a === 'girar') { giro = (giro + 90) % 360; a.textContent = giro ? `Girar ⟳ (${giro}°)` : 'Girar ⟳'; }
        if (a.dataset.a === 'todo') { q = [{ x: 0, y: 0 }, { x: foto.width, y: 0 }, { x: foto.width, y: foto.height }, { x: 0, y: foto.height }]; pintar(); }
        if (a.dataset.a === 'usar') {
          if (areaPoligono(q) < foto.width * foto.height * 0.04) { avisar('El recorte es muy pequeño: separa más las esquinas.'); return; }
          try { fin(procesar(cv, foto, ordenar(q), filtro, giro)); } catch (e) { avisar('No se pudo procesar la imagen: ' + (e.message || e)); }
        }
      });
      window.addEventListener('resize', medir);
      requestAnimationFrame(() => requestAnimationFrame(medir));
      editar._medir = medir;   // para pruebas
    });
  }

  /* ---------------- cámara en vivo ---------------- */
  // Convierte una foto (archivo o blob) en canvas, como máximo de 3000 px por lado.
  async function aCanvas(fuente) {
    const img = await createImageBitmap(fuente);
    const k = Math.min(1, perfil().max / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); if (img.close) img.close();
    return c;
  }
  // Foto a resolución completa si el teléfono lo permite; si no, el cuadro del video.
  // Con la luz encendida se usa el cuadro del video: tomar la foto aparte puede apagar la luz en algunos teléfonos.
  // pedirFlash: la linterna no se pudo encender aparte; se intenta el flash propio de la foto (fillLightMode).
  async function fotoDe(video, stream, conLuz, pedirFlash) {
    fotoDe.usoFlash = false;
    const cuadro = () => { const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight; c.getContext('2d').drawImage(video, 0, 0); return c; };
    const pista = stream && stream.getVideoTracks()[0];
    if (!pista || conLuz || (!pedirFlash && !perfil().foto) || typeof window.ImageCapture !== 'function') return cuadro();
    try {
      const ic = new window.ImageCapture(pista); let ajustes;
      try {
        const pc = await ic.getPhotoCapabilities(), modos = (pc && pc.fillLightMode) || [];
        if (pedirFlash && modos.includes('flash')) { ajustes = { fillLightMode: 'flash' }; fotoDe.usoFlash = true; }
        // Que el flash propio de la cámara no se dispare si el usuario lo dejó apagado.
        else if (modos.includes('off')) ajustes = { fillLightMode: 'off' };
      } catch (e) {}
      if (pedirFlash && !fotoDe.usoFlash) return cuadro();
      const blob = await Promise.race([ic.takePhoto(ajustes), new Promise((_, mal) => setTimeout(() => mal(new Error('tiempo')), 5000))]);
      const c = await aCanvas(blob);
      // Si la foto sale girada respecto a lo que se ve en pantalla, se usa el cuadro del video.
      if ((c.width > c.height) !== (video.videoWidth > video.videoHeight) || Math.max(c.width, c.height) < Math.max(video.videoWidth, video.videoHeight)) return cuadro();
      return c;
    } catch (e) { return cuadro(); }
  }

  // Prueba si una pista de video enciende la linterna, aunque el navegador no la anuncie en getCapabilities().
  async function sondearLinterna(p) {
    try { const c = p.getCapabilities ? p.getCapabilities() : {}; if (c && c.torch) return true; } catch (e) {}
    try {
      await p.applyConstraints({ advanced: [{ torch: true }] });
      const ok = !!(p.getSettings && p.getSettings().torch === true);
      try { await p.applyConstraints({ advanced: [{ torch: false }] }); } catch (e) {}
      return ok;
    } catch (e) { return false; }
  }
  const navegadorSinLinterna = () => {
    const u = navigator.userAgent || '';
    if (/Firefox|FxiOS/i.test(u)) return 'Firefox no deja encender el flash desde una página web. Abre la app en Chrome.';
    if (/iPhone|iPad|iPod/i.test(u)) return 'En iPhone el navegador no deja encender el flash desde una página web.';
    return '';
  };

  // Abre la cámara, detecta la hoja en vivo y devuelve la lista de páginas escaneadas (canvas).
  // opciones.max: cuántas páginas se pueden escanear como máximo.
  async function abrir(opciones) {
    ponerEstilo();
    calidad = leer('escaner.calidad', calidad, CALIDADES); luz = leer('escaner.flash', luz, FLASH);
    const max = Math.max(1, (opciones && opciones.max) || 40);
    const caja = $e('div', 'esc');
    caja.innerHTML = `<div class="esc-barra"><button class="esc-btn" data-a="cerrar" type="button">Cerrar</button>
        <div class="esc-opc"><button class="esc-btn" data-a="panelFlash" type="button" aria-expanded="false"></button><button class="esc-btn" data-a="panelCalidad" type="button" aria-expanded="false"></button></div></div>
      <div class="esc-panel" data-x="panel" hidden></div>
      <div class="esc-escena"><video playsinline muted autoplay></video><canvas class="capa"></canvas></div>
      <div class="esc-estado">Cargando el detector de hojas (la primera vez tarda un poco)…</div>
      <div class="esc-filtros" data-x="alterna" hidden><label class="esc-btn si">Tomar foto con la cámara del teléfono<input type="file" accept="image/*" capture="environment" data-a="archivo" hidden></label></div>
      <div class="esc-tira"></div>
      <div class="esc-pie"><label class="esc-auto"><input type="checkbox" data-a="auto"> Captura automática</label><button class="esc-disparo" data-a="foto" type="button" aria-label="Tomar foto" disabled></button><button class="esc-btn si" data-a="listo" type="button" disabled>Listo (0)</button></div>`;
    document.body.appendChild(caja);
    const video = caja.querySelector('video'), capa = caja.querySelector('canvas.capa'), estado = caja.querySelector('.esc-estado');
    const tira = caja.querySelector('.esc-tira'), disparo = caja.querySelector('[data-a=foto]'), btnListo = caja.querySelector('[data-a=listo]'), btnCerrar = caja.querySelector('[data-a=cerrar]');
    const btnFlash = caja.querySelector('[data-a=panelFlash]'), btnCalidad = caja.querySelector('[data-a=panelCalidad]'), panel = caja.querySelector('[data-x=panel]');
    const paginas = [];
    let stream = null, pista = null, cv = null, timer = null, ultima = null, estables = 0, ocupado = false, cerrado = false, auto = false, avisoCerrar = 0;
    let linternaOK = false, linternaOn = false, brillo = 255, panelAbierto = '', sinCamara = false, avisoSinFlash = false;
    const ponerEstado = (t, ok) => { estado.textContent = t; estado.className = 'esc-estado' + (ok ? ' ok' : ''); };
    const lleno = () => paginas.length >= max;
    const espera = ms => new Promise(ok => setTimeout(ok, ms));

    /* --- flash (linterna de la cámara) --- */
    function revisarLinterna() {
      try { const c = pista && pista.getCapabilities ? pista.getCapabilities() : {}; linternaOK = !!(c && c.torch); } catch (e) { linternaOK = false; }
      pintarBotones();
    }
    async function linterna(on) {
      if (!linternaOK || !pista) return false;
      if (linternaOn === on) return true;
      try { await pista.applyConstraints({ advanced: [{ torch: on }] }); linternaOn = on; return true; }
      catch (e) { if (on) linternaOK = false; pintarBotones(); return false; }
    }
    function pintarBotones() {
      btnFlash.textContent = '⚡ ' + (luz === 'no' ? 'Sin flash' : luz === 'si' ? 'Flash' : luz === 'auto' ? 'Flash auto' : 'Luz fija');
      btnFlash.hidden = sinCamara;
      btnCalidad.textContent = 'Calidad: ' + perfil().nombre;
      btnFlash.setAttribute('aria-expanded', panelAbierto === 'flash'); btnCalidad.setAttribute('aria-expanded', panelAbierto === 'calidad');
      if (panelAbierto) pintarPanel();
    }
    function resolucion() {
      if (!video.videoWidth) return '';
      return `Cámara: ${video.videoWidth}×${video.videoHeight}`;
    }
    function pintarPanel() {
      panel.hidden = !panelAbierto;
      if (panelAbierto === 'flash') {
        const nota = !stream ? '' : linternaOK ? '' : '<div class="nota">' + (navegadorSinLinterna() || 'Este teléfono o navegador no deja encender el flash desde la app.') + ' Busca más luz o apoya la hoja cerca de una lámpara.</div>';
        panel.innerHTML = `<div class="lista">${Object.keys(FLASH).map(k => `<button class="esc-btn" type="button" data-luz="${k}" aria-pressed="${k === luz}">${FLASH[k]}</button>`).join('')}</div>${nota}`;
      } else if (panelAbierto === 'calidad') {
        panel.innerHTML = `<div class="lista">${Object.keys(CALIDADES).map(k => `<button class="esc-btn" type="button" data-cal="${k}" aria-pressed="${k === calidad}">${CALIDADES[k].nombre}<small>${CALIDADES[k].detalle}</small></button>`).join('')}</div><div class="meta2">${resolucion()}</div>`;
      }
    }
    async function ponerLuz(k) {
      luz = k; guardar('escaner.flash', k);
      if (k === 'fijo') { if (!(await linterna(true)) && stream) avisar('Este teléfono no deja encender el flash desde la app.'); }
      else await linterna(false);
      pintarBotones();
    }
    async function ponerCalidad(k) {
      const antes = perfil(); calidad = k; guardar('escaner.calidad', k); pintarBotones();
      // Solo se reinicia la cámara si cambia la resolución que se le pide.
      if (stream && !sinCamara && (antes.cam[0] !== perfil().cam[0] || antes.cam[1] !== perfil().cam[1])) {
        ocupado = true; disparo.disabled = true; ponerEstado('Cambiando la calidad de la cámara…');
        try { await iniciarCamara(); } catch (e) { avisar('No se pudo cambiar la calidad: ' + (e.message || e)); }
        ocupado = false; disparo.disabled = lleno(); pintarBotones();
      }
      avisar(`Calidad ${perfil().nombre}${video.videoWidth ? ' · ' + resolucion() : ''}`);
    }
    // Si la cámara trasera por defecto no tiene linterna, prueba las demás cámaras traseras (hay teléfonos con varios lentes).
    async function buscarCamaraConLinterna() {
      if (!navigator.mediaDevices.enumerateDevices) return false;
      const actual = pista && pista.getSettings ? pista.getSettings().deviceId : '';
      let lista = []; try { lista = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && d.deviceId && d.deviceId !== actual && !/front|frontal|user|selfie|delantera/i.test(d.label)); } catch (e) {}
      const [w, h] = perfil().cam;
      for (const d of lista.slice(0, 4)) {
        let s = null;
        try {
          s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: d.deviceId }, width: { ideal: w }, height: { ideal: h } }, audio: false });
          if (cerrado) { s.getTracks().forEach(t => t.stop()); return false; }
          if (await sondearLinterna(s.getVideoTracks()[0])) {
            if (stream) stream.getTracks().forEach(t => t.stop());
            stream = s; pista = s.getVideoTracks()[0]; linternaOn = false; video.srcObject = s; await video.play();
            guardar('escaner.camLinterna', d.deviceId);
            return true;
          }
          s.getTracks().forEach(t => t.stop());
        } catch (e) { if (s) s.getTracks().forEach(t => t.stop()); }
      }
      return false;
    }
    let camarasProbadas = false;
    async function iniciarCamara() {
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null; pista = null; linternaOn = false;
      const [w, h] = perfil().cam;
      let guardada = ''; try { guardada = localStorage.getItem('escaner.camLinterna') || ''; } catch (e) {}
      const video0 = { facingMode: { ideal: 'environment' }, width: { ideal: w }, height: { ideal: h } };
      if (guardada) video0.deviceId = { ideal: guardada };
      const s = await navigator.mediaDevices.getUserMedia({ video: video0, audio: false });
      if (cerrado) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s; pista = s.getVideoTracks()[0];
      video.srcObject = s; await video.play();
      revisarLinterna();
      // Algunos navegadores tienen linterna pero no la anuncian: se prueba encenderla de verdad.
      if (!linternaOK && await sondearLinterna(pista)) { linternaOK = true; pintarBotones(); }
      if (!linternaOK && !camarasProbadas && !navegadorSinLinterna()) {
        camarasProbadas = true; ponerEstado('Buscando la cámara con flash…');
        if (await buscarCamaraConLinterna()) { linternaOK = true; pintarBotones(); }
      }
      // Algunos teléfonos avisan que tienen flash un momento después de abrir la cámara.
      if (!linternaOK) setTimeout(() => { if (!cerrado && pista && !linternaOK) { revisarLinterna(); if (luz === 'fijo') linterna(true); } }, 1200);
      if (luz === 'fijo') await linterna(true);
    }

    return new Promise(async resolver => {
      const terminar = (val, porAtras) => {
        if (cerrado) return;
        cerrado = true; clearTimeout(timer);
        if (stream) stream.getTracks().forEach(t => t.stop());
        caja.remove(); ocultarAviso(); desapilar(cerrarPorAtras, porAtras); resolver(val);
      };
      // El botón "atrás" del teléfono no cierra la app: termina el escaneo y conserva las páginas.
      const cerrarPorAtras = () => terminar(paginas.slice(), true);
      apilar(cerrarPorAtras);
      async function agregar(foto, q) {
        const cvE = cv || (await cargarCV().catch(() => ({ cv: null }))).cv;
        let res;
        if (!cvE) { res = foto; res.calidadJpeg = perfil().jpeg; }
        else res = await editar(cvE, foto, q);
        if (!res || cerrado) return;
        paginas.push(res);
        const im = new Image(); im.src = res.toDataURL('image/jpeg', 0.5); im.alt = 'Página ' + paginas.length; tira.appendChild(im);
        btnListo.disabled = false; btnListo.textContent = `Listo (${paginas.length})`;
        if (lleno()) { disparo.disabled = true; avisar(`Llegaste al máximo de ${max === 1 ? '1 página' : max + ' páginas'} por ahora. Toca Listo.`); }
        else avisar(cvE ? `Página ${paginas.length} lista. Escanea la siguiente o toca Listo.` : `Página ${paginas.length} guardada completa (sin el detector no se recorta).`);
      }
      caja.addEventListener('click', ev => {
        const l = ev.target.closest('[data-luz]'); if (l) { ponerLuz(l.dataset.luz); return; }
        const c = ev.target.closest('[data-cal]'); if (c) { if (c.dataset.cal !== calidad) ponerCalidad(c.dataset.cal); return; }
        const a = ev.target.closest('[data-a]'); if (!a) return;
        if (a.dataset.a === 'panelFlash' || a.dataset.a === 'panelCalidad') {
          const cual = a.dataset.a === 'panelFlash' ? 'flash' : 'calidad';
          panelAbierto = panelAbierto === cual ? '' : cual; pintarBotones(); if (!panelAbierto) panel.hidden = true;
          return;
        }
        if (a.dataset.a === 'cerrar') {
          if (paginas.length && Date.now() - avisoCerrar > 4000) {
            avisoCerrar = Date.now(); btnCerrar.textContent = `¿Descartar ${paginas.length}?`;
            avisar(`Toca otra vez para descartar ${paginas.length === 1 ? 'la página escaneada' : 'las ' + paginas.length + ' páginas escaneadas'}, o toca Listo para conservarlas.`);
            setTimeout(() => { btnCerrar.textContent = 'Cerrar'; }, 4000);
            return;
          }
          terminar([]);
        }
        if (a.dataset.a === 'listo') terminar(paginas.slice());
        if (a.dataset.a === 'foto') { if (panelAbierto) { panelAbierto = ''; pintarBotones(); panel.hidden = true; } capturar(); }
      });
      caja.querySelector('[data-a=auto]').addEventListener('change', e => { auto = e.target.checked; estables = 0; });
      caja.querySelector('[data-a=archivo]').addEventListener('change', async e => {
        const f = e.target.files[0]; e.target.value = ''; if (!f || ocupado || lleno()) return;
        ocupado = true;
        try { const foto = await aCanvas(f); let q = null; try { if (cv) q = detectar(cv, foto); } catch (er) {} await agregar(foto, q); }
        catch (er) { avisar('No se pudo abrir la foto.'); }
        ocupado = false;
      });
      const alterna = msg => { sinCamara = true; ponerEstado(msg); caja.querySelector('[data-x=alterna]').hidden = false; disparo.hidden = true; caja.querySelector('.esc-auto').hidden = true; video.hidden = true; pintarBotones(); };
      pintarBotones();
      try { cv = (await cargarCV()).cv; } catch (e) { ponerEstado(e.message); }
      if (cerrado) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alterna('Este navegador no deja ver la cámara aquí. Usa el botón para tomar la foto.'); return; }
      try { await iniciarCamara(); }
      catch (e) {
        alterna(e && e.name === 'NotAllowedError' ? 'No hay permiso para usar la cámara aquí. Actívalo en los permisos del sitio (Cámara: Permitir) o usa este botón para tomar la foto.' : 'No se pudo abrir la cámara. Usa el botón para tomar la foto.');
        return;
      }
      if (cerrado) return;
      disparo.disabled = false;
      ponerEstado(cv ? 'Apunta a la hoja. Se ve mejor sobre una mesa oscura.' : 'No se pudo descargar el detector (revisa el internet): la foto se guarda completa, sin recortar.');
      const peque = document.createElement('canvas');
      function medirBrillo(ctx) {
        // Promedio de luz del cuadro (0 = negro, 255 = blanco), para el flash automático.
        const d = ctx.getImageData(0, 0, peque.width, peque.height).data; let t = 0, n = 0;
        for (let i = 0; i < d.length; i += 64) { t += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; n++; }
        return n ? t / n : 255;
      }
      function ciclo() {
        if (cerrado) return;
        timer = setTimeout(ciclo, 300);
        if (ocupado || !video.videoWidth || lleno()) return;
        const k = Math.min(1, DET / Math.max(video.videoWidth, video.videoHeight));
        peque.width = Math.round(video.videoWidth * k); peque.height = Math.round(video.videoHeight * k);
        const pctx = peque.getContext('2d', { willReadFrequently: true }); pctx.drawImage(video, 0, 0, peque.width, peque.height);
        if (!linternaOn) { try { brillo = medirBrillo(pctx); } catch (e) {} }
        if (!cv) return;
        let q = null; try { q = detectarEn(cv, peque); } catch (e) {}
        // Dibuja el contorno encima del video.
        const r = video.getBoundingClientRect(), re = caja.querySelector('.esc-escena').getBoundingClientRect();
        capa.width = r.width; capa.height = r.height; capa.style.left = (r.left - re.left) + 'px'; capa.style.top = (r.top - re.top) + 'px';
        const x = capa.getContext('2d'); x.clearRect(0, 0, capa.width, capa.height);
        const oscuro = brillo < OSCURO && !linternaOn ? (linternaOK ? ' · poca luz, usa ⚡' : ' · poca luz') : '';
        if (q) {
          const s = r.width / peque.width;
          x.beginPath(); q.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p.x * s, p.y * s)); x.closePath();
          x.fillStyle = 'rgba(70,194,166,.18)'; x.fill(); x.strokeStyle = '#46c2a6'; x.lineWidth = 4; x.stroke();
          const mov = ultima ? Math.max(...q.map((p, i) => dist(p, ultima[i]))) / peque.width : 1;
          estables = mov < 0.03 ? estables + 1 : 0;
          ponerEstado((auto ? (estables >= 4 ? 'Capturando…' : 'Hoja detectada: mantén el teléfono quieto') : 'Hoja detectada: toca el botón blanco') + oscuro, true);
          if (auto && estables >= 4) { estables = 0; capturar(); }
        } else { estables = 0; ponerEstado('Buscando la hoja… que se vean las 4 esquinas; mejor sobre fondo oscuro.' + oscuro); }
        ultima = q;
      }
      async function capturar() {
        if (ocupado || !video.videoWidth || lleno()) return;
        ocupado = true; disparo.disabled = true; capa.getContext('2d').clearRect(0, 0, capa.width, capa.height);
        let encendida = false;
        try {
          // Flash: se enciende la luz un momento antes de la foto y se apaga después (menos en "Siempre encendido").
          const quiere = luz === 'si' || (luz === 'auto' && brillo < OSCURO);
          if (luz === 'fijo') encendida = linternaOn;
          else if (quiere) {
            if (linternaOK) { ponerEstado('Flash…', true); encendida = await linterna(true); if (encendida) await espera(900); }
          }
          ponerEstado('Tomando la foto…', true);
          // Sin linterna aparte, se intenta el flash propio de la foto.
          const foto = await fotoDe(video, stream, encendida, quiere && !linternaOK);
          if (quiere && !linternaOK && !fotoDe.usoFlash && !avisoSinFlash) { avisoSinFlash = true; avisar('Este teléfono no deja encender el flash desde la app: busca más luz.'); }
          if (encendida && luz !== 'fijo') await linterna(false);
          let q = null; try { if (cv) q = detectar(cv, foto); } catch (e) {}
          await agregar(foto, q);
        } catch (e) { avisar('No se pudo tomar la foto: ' + (e.message || e)); if (luz !== 'fijo') await linterna(false); }
        ultima = null; estables = 0; ocupado = false; disparo.disabled = lleno();
      }
      ciclo();
    });
  }

  // Para una foto ya tomada (por ejemplo, desde la galería): detecta, deja ajustar y devuelve el canvas final.
  async function recortar(canvas) {
    let cv; try { cv = (await cargarCV()).cv; } catch (e) { avisar(e.message); return null; }
    let q = null; try { q = detectar(cv, canvas); } catch (e) {}
    return editar(cv, canvas, q, 'Cancelar');
  }

  window.Escaner = { abrir, recortar, cargarCV, CALIDADES, _detectar: detectar, _procesar: procesar, _estado: () => ({ calidad, luz }) };
})();
