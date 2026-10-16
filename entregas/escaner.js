/* escaner.js — Escáner de hojas para la app de Entregas.
   La foto la saca la cámara normal del teléfono (con su flash, su enfoque y su resolución completa).
   Después la app busca la hoja, la recorta, la endereza y la deja como documento.
   El recortador usa OpenCV.js: se descarga la primera vez (unos 10 MB) y queda guardado en el teléfono. */
(function () {
  'use strict';
  const CV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js';
  // Calidad: tamaño final de la hoja, compresión JPEG y tamaño máximo con que se abre la foto.
  // techo y piso: en Documento y Gris, si la hoja pasa del techo se baja la compresión de a poco, sin bajar del piso
  // (nunca se reduce la resolución, así la letra pequeña y las firmas siguen nítidas).
  const CALIDADES = {
    ahorro: { nombre: 'Ahorro', detalle: 'hasta unos 90 KB por hoja · letra grande', ancho: 1100, largo: 1600, jpeg: 0.7, max: 2400, techo: 90e3, piso: 0.55 },
    normal: { nombre: 'Normal', detalle: 'hasta unos 160 KB por hoja · recomendada', ancho: 1700, largo: 2400, jpeg: 0.8, max: 3200, techo: 160e3, piso: 0.6 },
    alta: { nombre: 'Alta', detalle: 'hasta unos 320 KB por hoja · letra pequeña', ancho: 2480, largo: 3508, jpeg: 0.9, max: 4200, techo: 320e3, piso: 0.7 }
  };
  const FILTROS = { doc: 'Documento', mejor: 'Mejorado', gris: 'Gris', color: 'Color' };
  const leer = (k, d, ok) => { try { const v = localStorage.getItem(k); return v && ok[v] ? v : d; } catch (e) { return d; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  let calidad = leer('escaner.calidad', 'normal', CALIDADES), filtroPref = leer('escaner.filtro', 'doc', FILTROS);
  const perfil = () => CALIDADES[calidad];
  const $e = (tag, cls, html) => { const x = document.createElement(tag); if (cls) x.className = cls; if (html != null) x.innerHTML = html; return x; };
  const icono = n => (window.ico ? window.ico(n) : '');
  const respirar = () => new Promise(ok => requestAnimationFrame(() => setTimeout(ok, 0)));   // deja pintar la pantalla antes de un trabajo pesado

  // Aviso flotante propio (el de la app queda debajo del escáner).
  function avisar(m) {
    if (!document.querySelector('.esc') && typeof window.toast === 'function') { window.toast(m); return; }
    let t = document.getElementById('escAviso');
    if (!t) { t = $e('div', 'esc-aviso'); t.id = 'escAviso'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = m; t.hidden = false; clearTimeout(avisar.t); avisar.t = setTimeout(() => { t.hidden = true; }, Math.min(6000, 2600 + m.length * 30));
  }
  function ocultarAviso() { const t = document.getElementById('escAviso'); if (t) { t.hidden = true; clearTimeout(avisar.t); } }

  // Botón "atrás" del teléfono: cierra la pantalla del escáner que esté encima en vez de salir de la app.
  // Se usa una sola entrada en el historial mientras haya pantallas abiertas: abrir y cerrar seguido no lo desordena.
  const pila = []; let entrada = false, ignorarAtras = 0;
  function apilar(f) { pila.push(f); if (!entrada) { entrada = true; try { history.pushState({ escaner: 1 }, ''); } catch (e) {} } }
  function desapilar(f, porAtras) {
    const i = pila.lastIndexOf(f); if (i < 0) return; pila.splice(i, 1);
    if (porAtras || pila.length) return;
    // Se cerró la última con un botón: se quita la entrada, salvo que en seguida se abra otra pantalla.
    setTimeout(() => { if (pila.length || !entrada) return; entrada = false; ignorarAtras++; try { history.back(); } catch (e) { ignorarAtras--; } }, 0);
  }
  window.addEventListener('popstate', () => {
    if (ignorarAtras > 0) { ignorarAtras--; return; }
    if (!entrada) return;
    entrada = false;
    const f = pila[pila.length - 1]; if (f) f();
    if (pila.length) { entrada = true; try { history.pushState({ escaner: 1 }, ''); } catch (e) {} }
  });

  /* ---------------- OpenCV ---------------- */
  let cvListo = null, cvYa = false;
  function cargarCV() {
    if (cvListo) return cvListo;
    cvListo = new Promise((ok, mal) => {
      // Se entrega envuelto ({ cv }) porque el módulo de OpenCV tiene .then y una promesa se quedaría esperándolo.
      const listo = () => { if (window.cv && window.cv.Mat) { cvYa = true; ok({ cv: window.cv }); return true; } return false; };
      if (listo()) return;
      const s = document.createElement('script'); s.src = CV_URL; s.async = true;
      s.onerror = () => { cvListo = null; s.remove(); mal(new Error('No se pudo descargar el recortador. Revisa tu internet.')); };
      s.onload = () => {
        const c = window.cv;
        if (c && !c.Mat && typeof c.then === 'function') { c.then(m => { if (m && m.Mat) { window.cv = m; } }); }
        const t0 = Date.now();
        (function esperar() { if (listo()) return; if (Date.now() - t0 > 60000) { cvListo = null; mal(new Error('El recortador tardó demasiado en cargar.')); return; } setTimeout(esperar, 80); })();
      };
      document.head.appendChild(s);
    });
    return cvListo;
  }

  /* ---------------- detección de la hoja ---------------- */
  const DET = 640;
  // Orden de las esquinas: arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda (sentido del reloj).
  function ordenar(p) {
    const c = { x: (p[0].x + p[1].x + p[2].x + p[3].x) / 4, y: (p[0].y + p[1].y + p[2].y + p[3].y) / 4 };
    const s = p.slice().sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
    let k = 0; s.forEach((q, i) => { if (q.x + q.y < s[k].x + s[k].y) k = i; });
    return [0, 1, 2, 3].map(i => s[(k + i) % 4]);
  }
  function areaPoligono(p) { let a = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i].x * p[j].y - p[j].x * p[i].y; } return Math.abs(a) / 2; }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function cruce(a, b, c, d) {
    // Punto donde se cruzan la recta a-b y la recta c-d (null si son casi paralelas).
    const x1 = b.x - a.x, y1 = b.y - a.y, x2 = d.x - c.x, y2 = d.y - c.y, den = x1 * y2 - y1 * x2;
    if (Math.abs(den) < 1e-9 * (Math.hypot(x1, y1) * Math.hypot(x2, y2) + 1)) return null;
    const t = ((c.x - a.x) * y2 - (c.y - a.y) * x2) / den;
    return { x: a.x + t * x1, y: a.y + t * y1 };
  }
  const puntosDe = m => { const r = []; for (let j = 0; j < m.rows; j++) r.push({ x: m.data32S[j * 2], y: m.data32S[j * 2 + 1] }); return r; };
  function convexo(q) {
    let signo = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4], z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(z) < 1e-6) return false; const s = Math.sign(z); if (signo && s !== signo) return false; signo = s;
    }
    return true;
  }
  // Polígono de 5 a 8 lados (hoja con una esquina tapada o fuera de la foto): se quedan los 4 lados más largos.
  function cuatroLados(P, W, H) {
    const n = P.length, lados = P.map((p, i) => ({ i, a: p, b: P[(i + 1) % n], l: dist(p, P[(i + 1) % n]) }));
    const top = lados.slice().sort((x, y) => y.l - x.l).slice(0, 4).sort((x, y) => x.i - y.i);
    const q = [];
    for (let k = 0; k < 4; k++) {
      const s1 = top[k], s2 = top[(k + 1) % 4], p = cruce(s1.a, s1.b, s2.a, s2.b);
      if (!p || p.x < -0.25 * W || p.x > 1.25 * W || p.y < -0.25 * H || p.y > 1.25 * H) return null;
      q.push(p);
    }
    return q;
  }

  // Busca cuadriláteros candidatos en una imagen pequeña y escoge el que más parece una hoja.
  function detectarEn(cv, canvas, depurar) {
    const W = canvas.width, H = canvas.height, A = W * H, mats = [];
    const M = () => { const m = new cv.Mat(); mats.push(m); return m; };
    const k3 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)), k5 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)); mats.push(k3, k5);
    const cands = [];
    try {
      const src = cv.imread(canvas); mats.push(src);
      const rgb = M(); cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
      const gray = M(); cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
      const blur = M(); cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
      const hsv = M(); cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
      const ch = new cv.MatVector(); cv.split(hsv, ch);
      const S = ch.get(1), V = ch.get(2); mats.push(S, V); ch.delete();
      // "Blancura": claro y sin color, como el papel. Separa la hoja de mesas de madera, manteles o la mano.
      const blanco = M(); cv.subtract(V, S, blanco); cv.GaussianBlur(blanco, blanco, new cv.Size(5, 5), 0);
      // Mapa de bordes para comprobar cada lado del candidato.
      const bordes = M(), b2 = M(); cv.Canny(blur, bordes, 18, 54); cv.Canny(blanco, b2, 18, 54); cv.bitwise_or(bordes, b2, bordes);
      const apoyo = M(), k7 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7)); mats.push(k7); cv.dilate(bordes, apoyo, k7);  // ±3 px de tolerancia
      const ap = apoyo.data, bl = blanco.data;
      // Mapas donde buscar contornos: umbral automático (hoja clara) y bordes, sobre gris y sobre blancura.
      const mapas = [];
      for (const base of [blur, blanco]) {
        const t = M(); cv.threshold(base, t, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU); cv.morphologyEx(t, t, cv.MORPH_CLOSE, k5); mapas.push([t, cv.RETR_EXTERNAL]);
        for (const [lo, hi] of [[30, 90], [12, 36]]) { const e = M(); cv.Canny(base, e, lo, hi); cv.dilate(e, e, k3); cv.morphologyEx(e, e, cv.MORPH_CLOSE, k5); mapas.push([e, cv.RETR_LIST]); }
      }
      const vistos = [];
      const agregar = (q, origen) => {
        if (!q) return;
        q = ordenar(q);
        if (!convexo(q)) return;
        const a = areaPoligono(q) / A; if (a < 0.08 || a > 1.2) return;
        if (vistos.some(v => q.every((p, i) => dist(p, v[i]) < 4))) return;
        vistos.push(q); cands.push({ q, origen });
      };
      for (const [mapa, modo] of mapas) {
        const cs = new cv.MatVector(), h = new cv.Mat();
        cv.findContours(mapa, cs, h, modo, cv.CHAIN_APPROX_SIMPLE);
        const lista = [];
        for (let i = 0; i < cs.size(); i++) { const c = cs.get(i), a = cv.contourArea(c); if (a > A * 0.07) lista.push([a, c]); else c.delete(); }
        lista.sort((x, y) => y[0] - x[0]);
        lista.forEach(([, c], n) => {
          if (n < 8) {
            const hull = new cv.Mat(), apx = new cv.Mat(); cv.convexHull(c, hull, false, true);
            const peri = cv.arcLength(hull, true);
            for (const f of [0.012, 0.02, 0.035, 0.05, 0.07]) {
              cv.approxPolyDP(hull, apx, f * peri, true);
              if (apx.rows === 4) { agregar(puntosDe(apx), 'ap' + f); break; }
              if (apx.rows < 4) break;
              if (apx.rows <= 8 && f >= 0.02) agregar(cuatroLados(puntosDe(apx), W, H), 'l4');
            }
            hull.delete(); apx.delete();
          }
          c.delete();
        });
        cs.delete(); h.delete();
      }
      // Puntaje: bordes a lo largo de cada lado y que adentro sea más claro que afuera.
      const off = Math.max(5, Math.round(Math.hypot(W, H) * 0.011));
      const val = (d, x, y) => { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= W || y >= H ? -1 : d[y * W + x]; };
      for (const c of cands) {
        const q = c.q.map(p => ({ x: Math.min(W - 1, Math.max(0, p.x)), y: Math.min(H - 1, Math.max(0, p.y)) }));
        const a = areaPoligono(q) / A; if (a > 0.985) { c.puntos = 0; continue; }
        let malo = false; const ang = [];
        for (let i = 0; i < 4; i++) {
          const p0 = q[(i + 3) % 4], p1 = q[i], p2 = q[(i + 1) % 4];
          const v1 = { x: p0.x - p1.x, y: p0.y - p1.y }, v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
          const g = Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) + 1e-9)))) * 180 / Math.PI;
          ang.push(g); if (g < 40 || g > 140) malo = true;
        }
        const L = [0, 1, 2, 3].map(i => dist(q[i], q[(i + 1) % 4]));
        if (Math.min(L[0], L[2]) / Math.max(L[0], L[2]) < 0.4 || Math.min(L[1], L[3]) / Math.max(L[1], L[3]) < 0.4) malo = true;
        if (malo) { c.puntos = 0; continue; }
        const ctr = { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
        const lados = [];
        for (let i = 0; i < 4; i++) {
          const p = q[i], r = q[(i + 1) % 4], len = dist(p, r);
          let nx = (r.y - p.y) / len, ny = -(r.x - p.x) / len;
          const mx = (p.x + r.x) / 2, my = (p.y + r.y) / 2; if ((ctr.x - mx) * nx + (ctr.y - my) * ny < 0) { nx = -nx; ny = -ny; }  // normal hacia adentro
          const enBorde = [p, r].every(s => s.x < 2) || [p, r].every(s => s.y < 2) || [p, r].every(s => s.x > W - 3) || [p, r].every(s => s.y > H - 3);
          const n = Math.max(24, Math.round(len / 3)); let hits = 0, pol = 0, m = 0;
          for (let j = 0; j < n; j++) {
            const t = 0.06 + 0.88 * j / (n - 1), x = p.x + (r.x - p.x) * t, y = p.y + (r.y - p.y) * t;
            if (val(ap, x, y) > 0) hits++;
            const vi = val(bl, x + nx * off, y + ny * off), vo = val(bl, x - nx * off, y - ny * off);
            if (vi >= 0 && vo >= 0) { m++; if (vi - vo > 6) pol++; }
          }
          lados.push({ enBorde, apoyo: hits / n, pol: m ? pol / m : 0 });
        }
        const libres = lados.filter(l => !l.enBorde);
        if (libres.length < 3) { c.puntos = 0; continue; }
        const lado = libres.map(l => l.apoyo * (0.35 + 0.65 * l.pol));
        const medio = lado.reduce((s, v) => s + v, 0) / lado.length, peor = Math.min(...lado);
        c.lados = lados; c.medio = medio; c.peor = peor; c.area = a;
        const pol = libres.reduce((t, l) => t + l.pol, 0) / libres.length;
        // Una hoja es más clara que lo que la rodea en casi todos sus lados (descarta recuadros impresos dentro de la hoja).
        c.puntos = peor < 0.12 || medio < 0.3 || pol < 0.2 ? 0 : Math.pow(a, 0.5) * medio * (0.6 + 0.4 * peor);
      }
    } finally { mats.forEach(m => { try { m.delete(); } catch (e) {} }); }
    cands.sort((x, y) => y.puntos - x.puntos);
    if (depurar) return cands;
    const mejor = cands[0];
    return mejor && mejor.puntos > 0 ? mejor.q.map(p => ({ x: Math.min(W, Math.max(0, p.x)), y: Math.min(H, Math.max(0, p.y)) })) : null;
  }

  // Ajuste fino: con la foto más grande, pega cada lado al borde real del papel (recta por mínimos cuadrados).
  function afinar(cv, canvas, q) {
    const W = canvas.width, H = canvas.height, src = cv.imread(canvas), g = new cv.Mat(), e = new cv.Mat();
    let res;
    try {
      cv.cvtColor(src, g, cv.COLOR_RGBA2GRAY); cv.GaussianBlur(g, g, new cv.Size(5, 5), 0); cv.Canny(g, e, 15, 45);
      const d = e.data, R = Math.max(4, Math.round(Math.hypot(W, H) * 0.006)), rectas = [];
      const ctr = { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
      for (let i = 0; i < 4; i++) {
        const p = q[i], r = q[(i + 1) % 4], len = dist(p, r), ux = (r.x - p.x) / len, uy = (r.y - p.y) / len;
        let nx = uy, ny = -ux; const mx = (p.x + r.x) / 2, my = (p.y + r.y) / 2; if ((ctr.x - mx) * nx + (ctr.y - my) * ny < 0) { nx = -nx; ny = -ny; }
        const pts = [], n = Math.max(30, Math.round(len / 6));
        for (let j = 0; j < n; j++) {
          const t = 0.08 + 0.84 * j / (n - 1), x0 = p.x + (r.x - p.x) * t, y0 = p.y + (r.y - p.y) * t;
          // el borde más cercano a la línea, buscando primero hacia afuera (el papel termina ahí)
          for (let k = 0; k <= R; k++) {
            let hit = null;
            for (const s of k ? [-k, k] : [0]) {
              const x = Math.round(x0 + nx * s), y = Math.round(y0 + ny * s);
              if (x >= 0 && y >= 0 && x < W && y < H && d[y * W + x]) { hit = { x, y }; break; }
            }
            if (hit) { pts.push(hit); break; }
          }
        }
        rectas.push(pts.length >= n * 0.35 ? ajustarRecta(pts) : null);
      }
      const nq = [];
      for (let i = 0; i < 4; i++) {
        const r1 = rectas[(i + 3) % 4], r2 = rectas[i];
        if (!r1 || !r2) { nq.push(q[i]); continue; }
        const p = cruce(r1.a, r1.b, r2.a, r2.b);
        nq.push(p && dist(p, q[i]) < R * 2.5 ? p : q[i]);
      }
      res = nq;
    } catch (er) { res = q; }
    finally { src.delete(); g.delete(); e.delete(); }
    return res;
  }
  function ajustarRecta(pts) {
    // Recta que mejor pasa por los puntos, descartando los que se alejan (letras, sombras).
    let usar = pts;
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      const n = usar.length; if (n < 6) return null;
      let mx = 0, my = 0; usar.forEach(p => { mx += p.x; my += p.y; }); mx /= n; my /= n;
      let sxx = 0, syy = 0, sxy = 0; usar.forEach(p => { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), dx = Math.cos(th), dy = Math.sin(th);
      const res = usar.map(p => Math.abs(-(p.x - mx) * dy + (p.y - my) * dx));
      const lim = Math.max(1.5, [...res].sort((a, b) => a - b)[Math.floor(n * 0.7)] * 2);
      const r = { a: { x: mx, y: my }, b: { x: mx + dx * 100, y: my + dy * 100 } };
      const quedan = usar.filter((p, i) => res[i] <= lim);
      if (vuelta === 2 || quedan.length === usar.length) return r;
      usar = quedan;
    }
    return null;
  }
  // Detecta sobre una copia pequeña, afina en una mediana y devuelve las esquinas en el tamaño original.
  function detectar(cv, canvas) {
    const copia = lado => {
      const k = Math.min(1, lado / Math.max(canvas.width, canvas.height)), c = document.createElement('canvas');
      c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height); return [c, k];
    };
    const [c1, k1] = copia(DET), q = detectarEn(cv, c1);
    if (!q) return null;
    const [c2, k2] = copia(1600);
    const f = afinar(cv, c2, q.map(p => ({ x: p.x / k1 * k2, y: p.y / k1 * k2 })));
    return f.map(p => ({ x: Math.min(canvas.width, Math.max(0, p.x / k2)), y: Math.min(canvas.height, Math.max(0, p.y / k2)) }));
  }

  // Proporción real de la hoja (alto/ancho) a partir de la perspectiva (Zhang y He, 2007).
  // q en orden: arriba-izq, arriba-der, abajo-der, abajo-izq; W y H: tamaño de la foto (el centro óptico es el centro de la foto).
  function proporcion(q, W, H) {
    const ingenua = () => (dist(q[0], q[3]) + dist(q[1], q[2])) / (dist(q[0], q[1]) + dist(q[3], q[2]));
    if (!q) return null;
    const m = [q[0], q[1], q[3], q[2]].map(p => [p.x - W / 2, p.y - H / 2, 1]);
    const X = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const P = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const [m1, m2, m3, m4] = m;
    const k2 = P(X(m1, m4), m3) / P(X(m2, m4), m3), k3 = P(X(m1, m4), m2) / P(X(m3, m4), m2);
    const n2 = m2.map((v, i) => k2 * v - m1[i]), n3 = m3.map((v, i) => k3 * v - m1[i]);
    const base = ingenua();
    let r = base;
    if (Math.abs(n2[2] * n3[2]) > 1e-12) {
      const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
      const lado = Math.max(W, H);
      if (f2 > 0 && Math.sqrt(f2) > 0.4 * lado && Math.sqrt(f2) < 3 * lado) {
        const ancho = Math.sqrt((n2[0] * n2[0] + n2[1] * n2[1]) / f2 + n2[2] * n2[2]), alto = Math.sqrt((n3[0] * n3[0] + n3[1] * n3[1]) / f2 + n3[2] * n3[2]);
        const est = alto / ancho;
        if (isFinite(est) && est / base > 0.7 && est / base < 1.43) r = est;
      }
    }
    // Si queda muy cerca de un tamaño de papel conocido (carta, A4, oficio, legal), se usa ese.
    for (const t of [279 / 216, 297 / 210, 330 / 216, 356 / 216]) {
      for (const v of [t, 1 / t]) if (Math.abs(r / v - 1) < 0.035) return v;
    }
    return r;
  }

  /* ---------------- recorte, mejora y giro ---------------- */
  const esquinasPorDefecto = (w, h) => [{ x: w * 0.06, y: h * 0.06 }, { x: w * 0.94, y: h * 0.06 }, { x: w * 0.94, y: h * 0.94 }, { x: w * 0.06, y: h * 0.94 }];
  // Endereza la hoja: corrige la perspectiva y le da su proporción real (carta, oficio, A4…).
  function enderezar(cv, foto, q) {
    q = ordenar(q);
    const r = proporcion(q, foto.width, foto.height);
    let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
    // Se conserva la nitidez del lado que más se ve y el otro sale de la proporción.
    if (h / r > w) w = h / r; else h = w * r;
    const pf = perfil(), k = Math.min(1, pf.ancho / Math.min(w, h), pf.largo / Math.max(w, h));
    w = Math.max(50, Math.round(w * k)); h = Math.max(50, Math.round(h * k));
    const src = cv.imread(foto), dst = new cv.Mat();
    const a = cv.matFromArray(4, 1, cv.CV_32FC2, q.flatMap(p => [p.x, p.y]));
    const b = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
    const M = cv.getPerspectiveTransform(a, b);
    try {
      cv.warpPerspective(src, dst, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
      const c = document.createElement('canvas'); cv.imshow(c, dst); return c;
    } finally { [src, dst, a, b, M].forEach(m => m.delete()); }
  }
  // Quita las sombras de un canal (gris o un color): el fondo (papel sin letras) se calcula en pequeño, se agranda
  // y se divide. Después estira entre lo y hi: lo que pase de hi queda blanco y la tinta se ve fuerte.
  function sinSombras(cv, canal, lo, hi) {
    const w = canal.cols, h = canal.rows, sm = new cv.Mat(), bg = new cv.Mat(), n = new cv.Mat(), ks = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    try {
      cv.resize(canal, sm, new cv.Size(Math.max(8, Math.round(w / 4)), Math.max(8, Math.round(h / 4))), 0, 0, cv.INTER_AREA);
      cv.dilate(sm, sm, ks); cv.medianBlur(sm, sm, 15);
      // Un bloque grande y oscuro (logo, recuadro relleno) no es sombra: el fondo no puede bajar de 55 % del papel.
      const d = sm.data, hist = new Uint32Array(256); for (let i = 0; i < d.length; i++) hist[d[i]]++;
      let acum = 0, p80 = 255; for (let v = 0; v < 256; v++) { acum += hist[v]; if (acum >= d.length * 0.8) { p80 = v; break; } }
      const piso = Math.round(p80 * 0.55); for (let i = 0; i < d.length; i++) if (d[i] < piso) d[i] = piso;
      cv.resize(sm, bg, new cv.Size(w, h), 0, 0, cv.INTER_LINEAR);
      cv.divide(canal, bg, n, 255);
      const al = 255 / (hi - lo); n.convertTo(canal, -1, al, -lo * al);
    } finally { [sm, bg, n, ks].forEach(m => m.delete()); }
  }
  // Nitidez (máscara de desenfoque): bordes de las letras más definidos, para leer y para el OCR.
  function enfocar(cv, m, fuerza) {
    const b = new cv.Mat();
    try { cv.GaussianBlur(m, b, new cv.Size(0, 0), 1.1); cv.addWeighted(m, 1 + fuerza, b, -fuerza, 0, m); } finally { b.delete(); }
  }
  // Documento: quita sombras y deja el papel blanco y la tinta oscura, con nitidez.
  // Mejorado: igual, pero conserva los colores (firma en azul, sellos, resaltador) y corrige el tono de la luz.
  // Gris: solo sin color. Color: como salió.
  function filtrar(cv, color, filtro) {
    if (filtro === 'mejor') {
      const src = cv.imread(color), rgb = new cv.Mat(), hsv = new cv.Mat(), out = new cv.Mat(), ch = new cv.MatVector(), hs = new cv.MatVector(), mats = [src, rgb, hsv, out, ch, hs];
      try {
        cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
        // Cada canal con su propio fondo: el papel queda blanco aunque la luz sea amarilla o azulada.
        cv.split(rgb, ch);
        for (let i = 0; i < 3; i++) { const c = ch.get(i); mats.push(c); sinSombras(cv, c, 25, 240); }
        cv.merge(ch, rgb);
        // Colores un poco más vivos para que la firma y los sellos se distingan de la letra impresa.
        cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
        cv.split(hsv, hs);
        const s = hs.get(1); mats.push(s); s.convertTo(s, -1, 1.35, 0); cv.merge(hs, hsv);
        cv.cvtColor(hsv, rgb, cv.COLOR_HSV2RGB);
        enfocar(cv, rgb, 0.5);
        cv.cvtColor(rgb, out, cv.COLOR_RGB2RGBA);
        const c = document.createElement('canvas'); cv.imshow(c, out); return c;
      } finally { mats.forEach(m => { try { m.delete(); } catch (e) {} }); }
    }
    if (filtro !== 'doc' && filtro !== 'gris') return color;
    const src = cv.imread(color), g = new cv.Mat(), out = new cv.Mat();
    try {
      cv.cvtColor(src, g, cv.COLOR_RGBA2GRAY);
      if (filtro === 'doc') { sinSombras(cv, g, 60, 235); enfocar(cv, g, 0.6); }
      cv.cvtColor(g, out, cv.COLOR_GRAY2RGBA);
      const c = document.createElement('canvas'); cv.imshow(c, out); return c;
    } finally { [src, g, out].forEach(m => m.delete()); }
  }
  // ¿Salió borrosa u oscura? Se mide en la hoja ya enderezada, a 1000 puntos de ancho:
  // - Nitidez: en el 1 % de los bordes más fuertes (letras, líneas), |Laplaciano| / gradiente. Un borde nítido es
  //   angosto y da un valor alto; uno movido o desenfocado se ensancha y el valor baja. No depende de cuánto texto
  //   tenga la hoja (la varianza del Laplaciano sí: una hoja con poco texto parecía borrosa).
  //   Medido con las fotos de prueba: nítidas 0,034 a 0,118; con 2 px de desenfoque 0,018 a 0,025. Corte: 0,026.
  // - Luz: brillo medio del papel; las hojas bien tomadas dan 225 a 250. Corte: 140.
  // Con pocos bordes (hoja casi en blanco) no se juzga la nitidez.
  const BORROSA = 0.026, OSCURA = 140;
  function calidadHoja(cv, c) {
    const k = Math.min(1, 1000 / c.width), s = document.createElement('canvas');
    s.width = Math.max(1, Math.round(c.width * k)); s.height = Math.max(1, Math.round(c.height * k));
    const sx = s.getContext('2d'); sx.imageSmoothingQuality = 'high'; sx.drawImage(c, 0, 0, s.width, s.height);
    const m = cv.imread(s), g = new cv.Mat(), l = new cv.Mat(), gx = new cv.Mat(), gy = new cv.Mat();
    try {
      cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY);
      cv.Laplacian(g, l, cv.CV_32F, 1); cv.Sobel(g, gx, cv.CV_32F, 1, 0, 3); cv.Sobel(g, gy, cv.CV_32F, 0, 1, 3);
      const L = l.data32F, X = gx.data32F, Y = gy.data32F, n = L.length, mag = new Float32Array(n), hist = new Uint32Array(2048);
      for (let i = 0; i < n; i++) { const v = Math.sqrt(X[i] * X[i] + Y[i] * Y[i]); mag[i] = v; hist[Math.min(2047, v | 0)]++; }
      let acum = 0, corte = 2047; for (let v = 2047; v >= 0; v--) { acum += hist[v]; if (acum >= n * 0.01) { corte = v; break; } }
      let sl = 0, sg = 0, bordes = 0;
      for (let i = 0; i < n; i++) if (mag[i] >= corte && mag[i] > 20) { sl += Math.abs(L[i]); sg += mag[i]; bordes++; }
      const nitidez = bordes ? sl / sg : 1, brillo = cv.mean(g)[0];
      return { nitidez, brillo, bordes, borrosa: bordes >= 500 && nitidez < BORROSA, oscura: brillo < OSCURA };
    } finally { [m, g, l, gx, gy].forEach(x => x.delete()); s.width = 0; }
  }
  function avisoCalidad(cal, conRepetir) {
    if (!cal) return '';
    const p = [];
    if (cal.borrosa) p.push(conRepetir ? 'La foto salió borrosa: toca Repetir y sostén el teléfono quieto hasta que se tome.' : 'La foto está borrosa: si puedes, tómala otra vez.');
    if (cal.oscura) p.push('Poca luz: acércate a una ventana o usa el flash.');
    return p.join(' ');
  }
  function girar(c, grados) {
    if (!grados) return c;
    const o = document.createElement('canvas'), de = grados % 180 !== 0;
    o.width = de ? c.height : c.width; o.height = de ? c.width : c.height;
    const x = o.getContext('2d'); x.translate(o.width / 2, o.height / 2); x.rotate(grados * Math.PI / 180); x.drawImage(c, -c.width / 2, -c.height / 2);
    return o;
  }
  // Sin recortador (no hubo internet la primera vez): la foto completa, al tamaño de la calidad escogida.
  function completa(foto) {
    const pf = perfil(), k = Math.min(1, pf.ancho / Math.min(foto.width, foto.height), pf.largo / Math.max(foto.width, foto.height));
    const c = document.createElement('canvas'); c.width = Math.round(foto.width * k); c.height = Math.round(foto.height * k);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(foto, 0, 0, c.width, c.height); return c;
  }
  // Gris: gris real (los tres canales iguales) y el fondo limpio, para que el JPEG guarde el papel casi sin bytes.
  // (Documento no lo necesita: su filtro ya deja el papel en blanco puro y la tinta oscura; ahí la rampa a veces pesaba más.)
  // Lo casi negro (≤ 35) queda negro y lo casi blanco (≥ 230) blanco puro; entre 200 y 230 se aclara poco a poco.
  // Se midió con las fotos de prueba: un corte duro en 242 hace puntitos donde el papel ronda ese valor y pesa MÁS;
  // la rampa suave baja el peso de Gris entre 35 y 45 % sin tocar la tinta (lo más oscuro que 200 no cambia).
  // También se probó WebP: pesa menos, pero el iPhone no lo crea desde un canvas (sale PNG, mucho más pesado)
  // y el PDF (pdf-lib) solo acepta JPEG; por eso se queda en JPEG.
  const RAMPA = Uint8ClampedArray.from({ length: 256 }, (_, g) => g >= 230 ? 255 : g >= 200 ? Math.round(g + (255 - g) * (g - 200) / 30) : g <= 35 ? 0 : g);
  function limpiarFondo(c) {
    const x = c.getContext('2d', { willReadFrequently: true }), im = x.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = RAMPA[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8];
      d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
  }
  const aBlob = (c, q) => new Promise(ok => c.toBlob(ok, 'image/jpeg', q));
  // Comprime la hoja final. Devuelve { blob, q }.
  async function comprimir(c, filtro, cal) {
    const pf = CALIDADES[cal] || perfil(), gris = filtro === 'doc' || filtro === 'gris';
    if (filtro === 'gris') limpiarFondo(c);
    let q = pf.jpeg, blob = await aBlob(c, q);
    if (gris) while (blob && blob.size > pf.techo && q - 0.05 >= pf.piso - 1e-9) { q = Math.round((q - 0.05) * 100) / 100; blob = await aBlob(c, q); }
    if (!blob) throw new Error('No se pudo guardar la página.');
    return { blob, q };
  }
  function miniatura(c, lado) {
    const k = Math.min(1, lado / Math.max(c.width, c.height)), m = document.createElement('canvas');
    m.width = Math.max(1, Math.round(c.width * k)); m.height = Math.max(1, Math.round(c.height * k));
    m.getContext('2d').drawImage(c, 0, 0, m.width, m.height); return m.toDataURL('image/jpeg', 0.7);
  }
  // Abre la foto (archivo de la cámara o de la galería) derecha, como se ve en el teléfono, y sin pasar del tamaño máximo.
  function imagenDe(blob) {
    return new Promise((ok, mal) => {
      const u = URL.createObjectURL(blob), im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); mal(new Error('No se pudo abrir la foto.')); };
      im.src = u;
    });
  }
  async function aCanvas(fuente) {
    let img;
    try { img = await createImageBitmap(fuente, { imageOrientation: 'from-image' }); }
    catch (e) { try { img = await createImageBitmap(fuente); } catch (e2) { img = await imagenDe(fuente); } }
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const k = Math.min(1, perfil().max / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
    if (img.close) img.close();
    return c;
  }

  /* ---------------- estilos ---------------- */
  const css = `
  body.con-esc { overflow: hidden; }
  .esc { position: fixed; inset: 0; z-index: 95; background: #0b100f; color: #f1f5f4; display: flex; flex-direction: column; font-family: var(--f-body, system-ui, sans-serif); }
  .esc-barra { display: grid; grid-template-columns: minmax(0, auto) 1fr minmax(0, auto); align-items: center; gap: 8px; padding: 8px 12px; padding-top: max(8px, env(safe-area-inset-top)); }
  .esc-titulo { text-align: center; font-size: 1rem; font-weight: 700; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .esc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; border: 1px solid rgba(255,255,255,.3); background: rgba(255,255,255,.08); color: #fff; border-radius: 12px; padding: 8px 12px; font: inherit; font-weight: 700; font-size: .9rem; line-height: 1.15; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .esc-btn .ph { width: 20px; height: 20px; flex: 0 0 auto; }
  .esc-btn.si { background: #46c2a6; border-color: #46c2a6; color: #062019; }
  .esc-btn:disabled { opacity: .4; cursor: default; }
  .esc-btn:active:not(:disabled) { transform: scale(.97); }
  .esc button:focus-visible { outline: 3px solid #ffd27a; outline-offset: 2px; }
  .esc-escena { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; touch-action: none; }
  .esc-escena canvas.base { display: block; }
  .esc-escena canvas.res { display: block; max-width: calc(100% - 24px); max-height: calc(100% - 16px); background: #fff; box-shadow: 0 6px 28px rgba(0,0,0,.55); border-radius: 2px; }
  .esc-escena canvas.capa { position: absolute; pointer-events: none; }
  .esc-estado { text-align: center; font-size: .88rem; padding: 6px 14px; min-height: 1.6em; color: #d5ebe5; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .esc-estado.alerta { color: #ffd27a; font-weight: 700; }
  .esc-estado.ocupado::before { content: ""; width: 16px; height: 16px; flex: 0 0 auto; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); border-top-color: #46c2a6; animation: esc-gira .8s linear infinite; }
  @keyframes esc-gira { to { transform: rotate(360deg); } }
  .esc-filtros { display: flex; gap: 6px; justify-content: center; padding: 2px 12px 4px; flex-wrap: wrap; }
  .esc-filtros .esc-btn { flex: 1 1 0; min-width: 0; max-width: 120px; padding: 8px 2px; font-size: .8rem; letter-spacing: -.01em; }
  .esc-filtros .esc-btn[aria-pressed="true"] { background: #fff; color: #0b100f; border-color: #fff; }
  .esc-pie { display: flex; align-items: stretch; gap: 8px; padding: 8px 12px; padding-bottom: max(12px, env(safe-area-inset-bottom)); }
  .esc-pie .esc-btn { flex: 1 1 0; min-width: 0; }
  .esc-pie .esc-grande { flex: 1.5 1 0; min-height: 56px; font-size: 1rem; }
  .esc-pie .esc-grande .ph { width: 24px; height: 24px; }
  .esc-pie.tres .esc-btn { flex-direction: column; gap: 3px; min-height: 60px; padding: 6px 4px; font-size: .82rem; }
  .esc-pie.tres .esc-btn .ph { width: 22px; height: 22px; }
  .esc-pie.tres .esc-grande { font-size: .92rem; }
  .esc-pie.tres .esc-grande .ph { width: 26px; height: 26px; }
  .esc-hueco { min-width: 44px; }
  .esc-cal { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: .85rem; color: #c9dcd6; max-width: 440px; margin: 0 auto 10px; }
  .esc-cal b { color: #fff; }
  .esc-cal .esc-btn { padding: 6px 14px; font-size: .85rem; flex: 0 0 auto; }
  .esc-cuerpo { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 14px 10px; }
  .esc-guia { max-width: 440px; margin: 2vh auto 0; }
  .esc-guia h3 { font-size: 1.05rem; margin: 0 0 12px; text-align: center; }
  .esc-guia ol { list-style: none; counter-reset: paso; padding: 0; margin: 0; display: grid; gap: 10px; }
  .esc-guia li { counter-increment: paso; display: grid; grid-template-columns: 30px 1fr; gap: 12px; align-items: start; background: rgba(255,255,255,.07); border-radius: 14px; padding: 12px 14px; line-height: 1.45; font-size: .92rem; }
  .esc-guia li::before { content: counter(paso); width: 30px; height: 30px; border-radius: 50%; background: #46c2a6; color: #062019; font-weight: 800; display: grid; place-items: center; }
  .esc-guia b { color: #fff; }
  .esc-paginas { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; }
  .esc-pag { position: relative; aspect-ratio: 3 / 4; background: #1b2422; border-radius: 10px; overflow: hidden; display: grid; place-items: center; animation: esc-entra .25s ease-out; }
  .esc-pag img { max-width: 100%; max-height: 100%; display: block; background: #fff; }
  .esc-num { position: absolute; left: 6px; bottom: 6px; background: rgba(0,0,0,.75); color: #fff; border-radius: 999px; padding: 2px 9px; font-size: .8rem; font-weight: 700; }
  .esc-quitar { position: absolute; right: 0; top: 0; width: 44px; height: 44px; padding: 0; border: 0; background: none; display: grid; place-items: center; cursor: pointer; }
  .esc-quitar span { width: 30px; height: 30px; border-radius: 50%; background: rgba(0,0,0,.72); color: #fff; display: grid; place-items: center; }
  .esc-quitar .ph { width: 16px; height: 16px; }
  @keyframes esc-entra { from { transform: scale(.9); } to { transform: none; } }
  .esc-mango { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; padding: 0; border-radius: 50%; border: 3px solid #46c2a6; background: rgba(70,194,166,.2); touch-action: none; cursor: grab; }
  .esc-mango::after { content: ""; position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: #fff; }
  .esc-mango.activo { background: rgba(70,194,166,.05); border-color: #ffd27a; }
  .esc-lupa { position: absolute; top: 10px; left: 10px; width: 136px; height: 136px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 6px 18px rgba(0,0,0,.6); pointer-events: none; background: #000; }
  .esc-lupa.der { left: auto; right: 10px; }
  .esc-panel { background: #121a18; border: 1px solid rgba(255,255,255,.14); border-radius: 14px; padding: 10px; max-width: 440px; margin: 0 auto 12px; }
  .esc-panel .lista { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 6px; }
  .esc-panel .esc-btn { justify-content: flex-start; text-align: left; flex-direction: column; align-items: flex-start; gap: 2px; }
  .esc-panel .esc-btn[aria-pressed="true"] { background: #46c2a6; border-color: #46c2a6; color: #062019; }
  .esc-panel small { font-weight: 500; font-size: .76rem; opacity: .85; }
  .esc-oculto { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
  .esc-aviso { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(96px + env(safe-area-inset-bottom, 0px)); z-index: 100; background: #1d2b27; color: #fff; border: 1px solid #46c2a6; border-radius: 12px; padding: 10px 14px; font: 600 .88rem var(--f-body, system-ui, sans-serif); width: max-content; max-width: calc(100vw - 32px); text-align: center; box-shadow: 0 6px 20px rgba(0,0,0,.45); }
  .esc [hidden], .esc-aviso[hidden] { display: none !important; }
  @media (prefers-reduced-motion: reduce) { .esc-estado.ocupado::before { animation-duration: 2.4s; } .esc-pag { animation: none; } .esc-btn:active:not(:disabled) { transform: none; } }`;
  let estiloPuesto = false;
  function ponerEstilo() { if (estiloPuesto) return; const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); estiloPuesto = true; }

  /* ---------------- pantallas ---------------- */
  // Pantalla completa accesible: foco adentro, Tab no se sale, Escape y "atrás" la cancelan, el foco vuelve al cerrar.
  function pantalla(etiqueta, html, alCancelar) {
    ponerEstilo();
    const caja = $e('div', 'esc', html);
    caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-modal', 'true'); caja.setAttribute('aria-label', etiqueta);
    const volver = document.activeElement;
    document.body.appendChild(caja); document.body.classList.add('con-esc');
    caja.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); alCancelar(false); return; }
      if (ev.key !== 'Tab') return;
      const f = [...caja.querySelectorAll('button:not([disabled])')].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && (i === f.length - 1 || i < 0)) { ev.preventDefault(); f[0].focus(); }
    });
    const alAtras = () => alCancelar(true);
    apilar(alAtras);
    let cerrada = false;
    return {
      caja,
      cerrar(porAtras) {
        if (cerrada) return; cerrada = true;
        caja.remove(); desapilar(alAtras, porAtras);
        if (!document.querySelector('.esc')) { document.body.classList.remove('con-esc'); ocultarAviso(); }
        if (volver && volver.isConnected) { try { volver.focus({ preventScroll: true }); } catch (e) {} }
      },
      enfocar(sel) { requestAnimationFrame(() => { const b = caja.querySelector(sel); if (b && !b.disabled) b.focus({ preventScroll: true }); }); }
    };
  }

  /* ---------------- editor de esquinas ---------------- */
  // Foto con 4 esquinas que se arrastran (con lupa) o se mueven con las flechas. Devuelve las esquinas o null.
  const NOMBRES = ['de arriba a la izquierda', 'de arriba a la derecha', 'de abajo a la derecha', 'de abajo a la izquierda'];
  function editar(foto, esquinas, opc) {
    opc = opc || {};
    return new Promise(resolver => {
      const p = pantalla('Ajustar las esquinas de la hoja', `
        <div class="esc-barra"><button class="esc-btn" data-a="cancelar" type="button">${icono('x')}<span>Cancelar</span></button><h2 class="esc-titulo">Ajusta las esquinas</h2><span></span></div>
        <div class="esc-escena"><canvas class="base" aria-hidden="true"></canvas><canvas class="capa" aria-hidden="true"></canvas><canvas class="esc-lupa" aria-hidden="true" hidden></canvas>
          ${NOMBRES.map((n, i) => `<button class="esc-mango" type="button" data-i="${i}" aria-label="Esquina ${n}. Muévela con las flechas del teclado."></button>`).join('')}</div>
        <div class="esc-estado" role="status">${opc.aviso || 'Arrastra cada círculo hasta una esquina del papel.'}</div>
        <div class="esc-pie"><button class="esc-btn" data-a="todo" type="button">${icono('todo')}<span>Toda la foto</span></button><button class="esc-btn si" data-a="listo" type="button">${icono('check')}<span>Listo</span></button></div>`, porAtras => fin(null, porAtras));
      const caja = p.caja, escena = caja.querySelector('.esc-escena'), base = caja.querySelector('canvas.base'), capa = caja.querySelector('canvas.capa'), lupa = caja.querySelector('.esc-lupa');
      const mangos = [...caja.querySelectorAll('.esc-mango')];
      let q = ordenar((esquinas || esquinasPorDefecto(foto.width, foto.height)).map(e => ({ x: e.x, y: e.y })));
      let escala = 1, ox = 0, oy = 0, dpr = 1, arrastre = null, hecho = false;
      function medir() {
        dpr = Math.min(3, window.devicePixelRatio || 1);
        const ee = escena.getBoundingClientRect(), k = Math.min((ee.width - 48) / foto.width, (ee.height - 48) / foto.height);
        if (!(k > 0)) return;
        const bw = Math.floor(foto.width * k), bh = Math.floor(foto.height * k);
        base.style.width = bw + 'px'; base.style.height = bh + 'px'; base.width = Math.round(bw * dpr); base.height = Math.round(bh * dpr);
        const bx = base.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(foto, 0, 0, base.width, base.height);
        const r = base.getBoundingClientRect();
        escala = r.width / foto.width; ox = r.left - ee.left; oy = r.top - ee.top;
        capa.style.width = r.width + 'px'; capa.style.height = r.height + 'px'; capa.width = Math.round(r.width * dpr); capa.height = Math.round(r.height * dpr);
        capa.style.left = ox + 'px'; capa.style.top = oy + 'px';
        lupa.width = lupa.height = Math.round(136 * dpr);
        pintar();
      }
      function pintar() {
        q.forEach((e, i) => { mangos[i].style.left = (ox + e.x * escala) + 'px'; mangos[i].style.top = (oy + e.y * escala) + 'px'; });
        const x = capa.getContext('2d'), s = escala * dpr; x.clearRect(0, 0, capa.width, capa.height);
        x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 0, capa.width, capa.height);
        x.globalCompositeOperation = 'destination-out'; x.beginPath(); q.forEach((e, i) => x[i ? 'lineTo' : 'moveTo'](e.x * s, e.y * s)); x.closePath(); x.fill();
        x.globalCompositeOperation = 'source-over'; x.strokeStyle = '#46c2a6'; x.lineWidth = 2.5 * dpr; x.stroke();
        if (arrastre) pintarLupa();
      }
      function pintarLupa() {
        const i = arrastre.i, e = q[i], L = lupa.width, Z = 3, lado = 136 / (escala * Z);   // lado: cuánto de la foto se ve en la lupa
        const sx = e.x - lado / 2, sy = e.y - lado / 2, x = lupa.getContext('2d');
        x.save(); x.fillStyle = '#000'; x.fillRect(0, 0, L, L); x.beginPath(); x.arc(L / 2, L / 2, L / 2, 0, Math.PI * 2); x.clip();
        x.imageSmoothingEnabled = true; x.drawImage(foto, sx, sy, lado, lado, 0, 0, L, L);
        const aL = v => ({ x: (v.x - sx) / lado * L, y: (v.y - sy) / lado * L });
        x.strokeStyle = '#46c2a6'; x.lineWidth = 2 * dpr; x.beginPath();
        const c = aL(e), a = aL(q[(i + 3) % 4]), b = aL(q[(i + 1) % 4]); x.moveTo(a.x, a.y); x.lineTo(c.x, c.y); x.lineTo(b.x, b.y); x.stroke();
        x.strokeStyle = '#ffd27a'; x.lineWidth = 1.5 * dpr; x.beginPath(); x.moveTo(L / 2 - 12 * dpr, L / 2); x.lineTo(L / 2 + 12 * dpr, L / 2); x.moveTo(L / 2, L / 2 - 12 * dpr); x.lineTo(L / 2, L / 2 + 12 * dpr); x.stroke();
        x.restore();
        // La lupa se pone en la esquina de arriba que esté más lejos del dedo.
        lupa.classList.toggle('der', ox + e.x * escala < escena.clientWidth / 2 && oy + e.y * escala < 190);
        lupa.hidden = false;
      }
      const limitar = e => ({ x: Math.max(0, Math.min(foto.width, e.x)), y: Math.max(0, Math.min(foto.height, e.y)) });
      escena.addEventListener('pointerdown', ev => {
        const re = escena.getBoundingClientRect(), px = ev.clientX - re.left, py = ev.clientY - re.top;
        let mejor = -1, md = Infinity;
        q.forEach((e, i) => { const d = Math.hypot(ox + e.x * escala - px, oy + e.y * escala - py); if (d < md) { md = d; mejor = i; } });
        if (md > 64) return;
        // Se guarda la distancia al dedo para que la esquina no salte debajo de él y se pueda ver.
        arrastre = { i: mejor, dx: ox + q[mejor].x * escala - px, dy: oy + q[mejor].y * escala - py, id: ev.pointerId };
        try { escena.setPointerCapture(ev.pointerId); } catch (e) {}
        mangos[mejor].classList.add('activo'); ev.preventDefault(); pintar();
      });
      escena.addEventListener('pointermove', ev => {
        if (!arrastre || ev.pointerId !== arrastre.id) return;
        const re = escena.getBoundingClientRect();
        q[arrastre.i] = limitar({ x: (ev.clientX - re.left + arrastre.dx - ox) / escala, y: (ev.clientY - re.top + arrastre.dy - oy) / escala });
        pintar();
      });
      const soltar = () => { if (!arrastre) return; mangos[arrastre.i].classList.remove('activo'); arrastre = null; lupa.hidden = true; pintar(); };
      escena.addEventListener('pointerup', soltar); escena.addEventListener('pointercancel', soltar);
      escena.addEventListener('keydown', ev => {
        const m = ev.target.closest('.esc-mango'); if (!m) return;
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key]; if (!d) return;
        ev.preventDefault();
        const i = Number(m.dataset.i), paso = Math.max(foto.width, foto.height) * (ev.shiftKey ? 0.02 : 0.004);
        q[i] = limitar({ x: q[i].x + d[0] * paso, y: q[i].y + d[1] * paso }); pintar();
      });
      function fin(val, porAtras) { if (hecho) return; hecho = true; window.removeEventListener('resize', medir); p.cerrar(porAtras); resolver(val); }
      caja.addEventListener('click', ev => {
        const a = ev.target.closest('[data-a]'); if (!a) return;
        if (a.dataset.a === 'cancelar') fin(null);
        if (a.dataset.a === 'todo') { q = [{ x: 0, y: 0 }, { x: foto.width, y: 0 }, { x: foto.width, y: foto.height }, { x: 0, y: foto.height }]; pintar(); }
        if (a.dataset.a === 'listo') {
          const o = ordenar(q);
          if (areaPoligono(o) < foto.width * foto.height * 0.04) { avisar('El recorte quedó muy pequeño: separa más las esquinas.'); return; }
          if (!convexo(o)) { avisar('Las esquinas quedaron cruzadas: ponlas en las 4 puntas del papel.'); return; }
          fin(o);
        }
      });
      window.addEventListener('resize', medir);
      requestAnimationFrame(() => requestAnimationFrame(medir));
      p.enfocar('[data-a=listo]');
      editar._medir = medir;   // para pruebas
    });
  }

  /* ---------------- revisar la página ---------------- */
  // Muestra la hoja ya recortada y enderezada, con filtros y giro.
  // Devuelve { accion: 'usar' | 'esquinas' | 'repetir' | 'cancelar', canvas, filtro, giro }.
  function revisar(cv, foto, q, opc) {
    return new Promise(resolver => {
      const conCV = !!cv;
      let filtro = opc.filtro || filtroPref, giro = opc.giro || 0, color = null, ver = null, hecho = false, ocupado = false, cal = null;
      const p = pantalla(opc.titulo || 'Revisar la página', `
        <div class="esc-barra"><button class="esc-btn" data-a="cancelar" type="button">${icono('x')}<span>Descartar</span></button><h2 class="esc-titulo">${opc.titulo || 'Revisar la página'}</h2><button class="esc-btn" data-a="girar" type="button" aria-label="Girar la página">${icono('girar')}<span>Girar</span></button></div>
        <div class="esc-escena"></div>
        <div class="esc-estado" role="status"></div>
        <div class="esc-filtros" role="group" aria-label="Cómo se ve la hoja"${conCV ? '' : ' hidden'}>${Object.keys(FILTROS).map(k => `<button class="esc-btn" type="button" data-f="${k}" aria-pressed="${k === filtro}">${FILTROS[k]}</button>`).join('')}</div>
        <div class="esc-pie tres">
          ${conCV ? `<button class="esc-btn" data-a="esquinas" type="button">${icono('recortar')}<span>Esquinas</span></button>` : ''}
          ${opc.repetir ? `<button class="esc-btn" data-a="repetir" type="button">${icono('repetir')}<span>Repetir</span></button>` : ''}
          <button class="esc-btn si esc-grande" data-a="usar" type="button">${icono('check')}<span>${opc.textoUsar || 'Usar'}</span></button>
        </div>`, porAtras => fin({ accion: 'cancelar' }, porAtras));
      const caja = p.caja, escena = caja.querySelector('.esc-escena'), estado = caja.querySelector('.esc-estado');
      const ponerEstado = (t, cargando, alerta) => { estado.textContent = t; estado.classList.toggle('ocupado', !!cargando); estado.classList.toggle('alerta', !!alerta); };
      async function mostrar() {
        ocupado = true; caja.querySelectorAll('button').forEach(b => { b.dataset.antes = b.disabled; if (b.dataset.a !== 'cancelar') b.disabled = true; });
        ponerEstado(color ? 'Aplicando…' : 'Enderezando la hoja…', true); await respirar();
        try {
          if (!color) {
            color = conCV ? enderezar(cv, foto, q) : completa(foto);
            if (conCV) { try { cal = calidadHoja(cv, color); } catch (e) { cal = null; } }
          }
          const f = conCV ? filtrar(cv, color, filtro) : color, g = girar(f, giro);
          if (f !== color && f !== g) f.width = 0;
          if (ver && ver !== color) ver.width = 0;
          ver = g; ver.className = 'res'; ver.setAttribute('role', 'img'); ver.setAttribute('aria-label', 'Vista previa de la hoja');
          escena.replaceChildren(ver);
          const alerta = avisoCalidad(cal, !!opc.repetir);
          ponerEstado(alerta || opc.estado || '', false, !!alerta);
          // Con la foto borrosa u oscura, Repetir queda como la acción principal.
          const rb = caja.querySelector('[data-a=repetir]'); if (rb) rb.classList.toggle('si', !!(cal && (cal.borrosa || cal.oscura)));
        } catch (e) { ponerEstado('No se pudo procesar la foto: ' + (e.message || e)); }
        caja.querySelectorAll('button').forEach(b => { b.disabled = b.dataset.antes === 'true'; delete b.dataset.antes; });
        ocupado = false;
        if (!caja.contains(document.activeElement)) { const u = caja.querySelector('[data-a=usar]'); if (u) u.focus({ preventScroll: true }); }
      }
      function fin(r, porAtras) {
        if (hecho) return; hecho = true;
        p.cerrar(porAtras);
        if (r.accion !== 'usar') { if (ver && ver !== color) ver.width = 0; if (color) color.width = 0; }
        else if (color && color !== r.canvas) color.width = 0;
        resolver(Object.assign({ filtro, giro }, r));
      }
      caja.addEventListener('click', ev => {
        const f = ev.target.closest('[data-f]');
        if (f && !ocupado) { filtro = f.dataset.f; caja.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-pressed', b === f)); mostrar(); return; }
        const a = ev.target.closest('[data-a]'); if (!a || (ocupado && a.dataset.a !== 'cancelar')) return;
        if (a.dataset.a === 'cancelar') fin({ accion: 'cancelar' });
        if (a.dataset.a === 'girar') { giro = (giro + 90) % 360; mostrar(); }
        if (a.dataset.a === 'esquinas') fin({ accion: 'esquinas' });
        // La cámara se abre aquí mismo, dentro del toque (el navegador solo la deja abrir así).
        if (a.dataset.a === 'repetir') { opc.repetir(); fin({ accion: 'repetir' }); }
        if (a.dataset.a === 'usar') { if (conCV) { filtroPref = filtro; guardar('escaner.filtro', filtro); } fin({ accion: 'usar', canvas: ver }); }
      });
      mostrar();
      p.enfocar('[data-a=usar]');
    });
  }

  // Foto → hoja lista: busca la hoja sola; si no la encuentra, se ajustan las esquinas a mano. Devuelve lo de revisar() o null.
  async function revisarFoto(cv, foto, opc) {
    let q = null, estado;
    if (cv) { try { q = detectar(cv, foto); } catch (e) { q = null; } }
    let filtro = filtroPref, giro = 0;
    if (cv && q) estado = 'Hoja encontrada y enderezada. Revisa que no le falte nada.';
    else if (cv) {
      q = await editar(foto, null, { aviso: 'No encontré bien los bordes. Mueve los círculos a las 4 esquinas del papel.' });
      if (!q) return null;
      estado = 'Recorte ajustado a mano.';
    } else estado = 'Sin internet no se pudo cargar el recortador: la foto se usa completa.';
    for (;;) {
      const r = await revisar(cv, foto, q, Object.assign({}, opc, { estado, filtro, giro }));
      if (r.accion !== 'esquinas') return r;
      filtro = r.filtro; giro = r.giro;
      const q2 = await editar(foto, q);
      if (q2) { q = q2; estado = 'Recorte ajustado a mano.'; }
    }
  }

  /* ---------------- escanear varias hojas ---------------- */
  // Abre la cámara del teléfono y devuelve la lista de páginas: [{ blob, width, height }].
  // opciones.max: cuántas páginas como máximo. opciones.camara === false: no abrir la cámara de una vez.
  function abrir(opciones) {
    opciones = opciones || {};
    calidad = leer('escaner.calidad', calidad, CALIDADES); filtroPref = leer('escaner.filtro', filtroPref, FILTROS);
    const max = Math.max(1, opciones.max || 100), paginas = [];
    let ocupado = false, cerrado = false, avisoCerrar = 0, panelAbierto = false, resolver = null;
    const p = pantalla('Escanear hojas', `
      <div class="esc-barra"><button class="esc-btn" data-a="cerrar" type="button">${icono('x')}<span>Cerrar</span></button><h2 class="esc-titulo">Escanear hojas</h2><span class="esc-hueco"></span></div>
      <div class="esc-cuerpo">
        <div class="esc-cal"><span data-x="cal"></span><button class="esc-btn" data-a="calidad" type="button" aria-expanded="false">Cambiar</button></div>
        <div class="esc-panel" data-x="panel" role="group" aria-label="Calidad de las hojas" hidden></div>
        <div class="esc-guia" data-x="guia"><h3>Para que salga bien</h3><ol>
          <li><span>Pon la hoja <b>sobre una mesa oscura o de color</b>, con buena luz y que se vean las 4 esquinas.</span></li>
          <li><span>Toca <b>Tomar foto</b>: se abre la cámara del teléfono. Ahí puedes usar el <b>flash</b> y tocar la hoja para enfocar. Sostén el teléfono <b>quieto</b> hasta que se tome.</span></li>
          <li><span>La app <b>recorta y endereza</b> la hoja sola. Revisa y toca <b>Usar</b>.</span></li></ol></div>
        <ol class="esc-paginas" data-x="lista" aria-label="Páginas escaneadas"></ol>
      </div>
      <div class="esc-estado" role="status"></div>
      <div class="esc-pie tres">
        <button class="esc-btn" data-a="galeria" type="button">${icono('galeria')}<span>Galería</span></button>
        <button class="esc-btn si esc-grande" data-a="camara" type="button">${icono('camara')}<span>Tomar foto</span></button>
        <button class="esc-btn" data-a="listo" type="button">${icono('check')}<span data-x="listo">Listo</span></button>
      </div>
      <input class="esc-oculto" type="file" accept="image/*" capture="environment" data-x="cam" tabindex="-1" aria-hidden="true">
      <input class="esc-oculto" type="file" accept="image/*" multiple data-x="gal" tabindex="-1" aria-hidden="true">`, porAtras => {
        // Escape primero cierra el panel de calidad; "atrás" o Escape terminan y conservan las páginas.
        if (!porAtras && panelAbierto) { panelAbierto = false; pintar(); p.enfocar('[data-a=calidad]'); return; }
        terminar(paginas.slice(), porAtras);
      });
    const caja = p.caja, $x = n => caja.querySelector(`[data-x=${n}]`), estado = caja.querySelector('.esc-estado');
    const inCam = $x('cam'), inGal = $x('gal'), lista = $x('lista'), panel = $x('panel');
    const ponerEstado = (t, cargando) => { estado.textContent = t; estado.classList.toggle('ocupado', !!cargando); };
    const lleno = () => paginas.length >= max;
    function pintar() {
      $x('guia').hidden = paginas.length > 0;
      lista.innerHTML = paginas.map((g, i) => `<li class="esc-pag"><img src="${g.mini}" alt="Página ${i + 1}"><span class="esc-num" aria-hidden="true">${i + 1}</span><button class="esc-quitar" type="button" data-quitar="${i}" aria-label="Quitar la página ${i + 1}"><span>${icono('x')}</span></button></li>`).join('');
      caja.querySelector('[data-a=camara]').disabled = ocupado || lleno();
      caja.querySelector('[data-a=galeria]').disabled = ocupado || lleno();
      caja.querySelector('[data-a=listo]').disabled = ocupado || !paginas.length;
      $x('listo').textContent = paginas.length ? `Listo · ${paginas.length}` : 'Listo';
      $x('cal').innerHTML = `Calidad: <b>${perfil().nombre}</b> · ${perfil().detalle.split(' · ')[0]}`;
      const bc = caja.querySelector('[data-a=calidad]'); bc.textContent = panelAbierto ? 'Cerrar' : 'Cambiar'; bc.setAttribute('aria-expanded', panelAbierto); bc.setAttribute('aria-label', panelAbierto ? 'Cerrar las calidades' : 'Cambiar la calidad');
      panel.hidden = !panelAbierto;
      if (!panelAbierto) panel.innerHTML = '';
      else panel.innerHTML = `<div class="lista">${Object.keys(CALIDADES).map(k => `<button class="esc-btn" type="button" data-cal="${k}" aria-pressed="${k === calidad}">${CALIDADES[k].nombre}<small>${CALIDADES[k].detalle}</small></button>`).join('')}</div>`;
    }
    // La cámara y la galería solo se pueden abrir dentro de un toque: por eso se llaman directo, sin esperas antes.
    function abrirCamara(forzar) { if ((ocupado && !forzar) || lleno() || cerrado) return; inCam.value = ''; try { inCam.click(); } catch (e) {} }
    function abrirGaleria() { if (ocupado || lleno() || cerrado) return; inGal.value = ''; try { inGal.click(); } catch (e) {} }
    async function guardarPagina(c, filtro) {
      const { blob, q } = await comprimir(c, filtro);
      paginas.push({ blob, width: c.width, height: c.height, calidadJpeg: q, mini: miniatura(c, 240) });
      c.width = 0;   // libera la memoria de la imagen grande
    }
    async function procesar(archivos, desdeCamara) {
      if (ocupado || cerrado || !archivos.length) return;
      ocupado = true; panelAbierto = false; pintar();
      try {
        for (let i = 0; i < archivos.length && !cerrado; i++) {
          if (lleno()) { avisar(`Llegaste al máximo de ${max === 1 ? '1 página' : max + ' páginas'} por ahora.`); break; }
          const varias = archivos.length > 1 ? ` (${i + 1} de ${archivos.length})` : '';
          ponerEstado('Abriendo la foto' + varias + '…', true); await respirar();
          let foto;
          try { foto = await aCanvas(archivos[i]); } catch (e) { avisar('No se pudo abrir la foto' + varias + '.'); continue; }
          if (!cvYa) ponerEstado('Preparando el recortador (solo la primera vez)…', true);
          // Ojo: el módulo de OpenCV tiene .then; si se devuelve dentro de una promesa, la página se queda colgada.
          const cvR = await cargarCV().catch(() => null), cv = cvR ? cvR.cv : null;
          if (cerrado) return;
          ponerEstado('Buscando la hoja' + varias + '…', true); await respirar();
          const r = await revisarFoto(cv, foto, { titulo: `Página ${paginas.length + 1}${varias}`, repetir: desdeCamara ? () => abrirCamara(true) : null });
          foto.width = 0;
          if (cerrado) return;
          if (r && r.accion === 'usar' && r.canvas) {
            await guardarPagina(r.canvas, cv ? r.filtro : 'color');
            avisar(lleno() ? `Página ${paginas.length} lista. Llegaste al máximo: toca Listo.` : `Página ${paginas.length} lista.${desdeCamara ? ' Toma la siguiente o toca Listo.' : ''}`);
          }
          if (r && r.accion === 'repetir') break;
        }
      } catch (e) { avisar('No se pudo procesar la foto: ' + (e.message || e)); }
      finally { ocupado = false; ponerEstado(''); if (!cerrado) { pintar(); p.enfocar(lleno() ? '[data-a=listo]' : '[data-a=camara]'); } }
    }
    function terminar(val, porAtras) {
      if (cerrado) return; cerrado = true;
      p.cerrar(porAtras);
      resolver(val.map(g => ({ blob: g.blob, width: g.width, height: g.height, calidadJpeg: g.calidadJpeg })));
    }
    inCam.addEventListener('change', () => { const f = [...inCam.files]; inCam.value = ''; if (ocupado) { avisar('Espera a que termine la foto anterior.'); return; } procesar(f.slice(0, 1), true); });
    inGal.addEventListener('change', () => { const f = [...inGal.files].filter(x => !x.type || x.type.startsWith('image/')); inGal.value = ''; if (ocupado) return; procesar(f.slice(0, max - paginas.length), false); });
    caja.addEventListener('click', ev => {
      const c = ev.target.closest('[data-cal]');
      if (c) { calidad = c.dataset.cal; guardar('escaner.calidad', calidad); panelAbierto = false; pintar(); avisar(`Calidad ${perfil().nombre}: ${perfil().detalle}.`); p.enfocar('[data-a=calidad]'); return; }
      const qt = ev.target.closest('[data-quitar]');
      if (qt && !ocupado) { const i = Number(qt.dataset.quitar); paginas.splice(i, 1); pintar(); avisar(`Página ${i + 1} quitada.`); p.enfocar(paginas.length ? '.esc-quitar' : '[data-a=camara]'); return; }
      const a = ev.target.closest('[data-a]'); if (!a || a.disabled) return;
      if (a.dataset.a === 'camara') abrirCamara();
      if (a.dataset.a === 'galeria') abrirGaleria();
      if (a.dataset.a === 'calidad') { panelAbierto = !panelAbierto; pintar(); }
      if (a.dataset.a === 'listo') terminar(paginas.slice());
      if (a.dataset.a === 'cerrar') {
        if (paginas.length && Date.now() - avisoCerrar > 4000) {
          avisoCerrar = Date.now(); a.querySelector('span').textContent = `¿Descartar ${paginas.length}?`;
          avisar(`Toca otra vez para descartar ${paginas.length === 1 ? 'la página escaneada' : 'las ' + paginas.length + ' páginas escaneadas'}, o toca Listo para guardarlas.`);
          setTimeout(() => { const s = a.querySelector('span'); if (s) s.textContent = 'Cerrar'; }, 4000);
          return;
        }
        terminar([]);
      }
    });
    pintar();
    cargarCV().catch(() => {});            // el recortador se va descargando mientras se toma la foto
    p.enfocar('[data-a=camara]');
    if (opciones.camara !== false) abrirCamara();
    return new Promise(ok => { resolver = ok; });
  }

  // Para una página ya cargada (foto de la galería o PDF): busca la hoja, deja revisar y devuelve el canvas final o null.
  async function recortar(canvas) {
    let cv; try { cv = (await cargarCV()).cv; } catch (e) { avisar(e.message); return null; }
    const r = await revisarFoto(cv, canvas, { titulo: 'Recortar la página', textoUsar: 'Aplicar' });
    if (!r || r.accion !== 'usar' || !r.canvas) return null;
    const { blob, q } = await comprimir(r.canvas, r.filtro), w = r.canvas.width, h = r.canvas.height;
    r.canvas.width = 0;
    return { blob, width: w, height: h, calidadJpeg: q };
  }

  window.Escaner = { abrir, recortar, cargarCV, CALIDADES, _detectar: detectar, _detectarEn: detectarEn, _proporcion: proporcion, _ordenar: ordenar, _enderezar: enderezar, _filtrar: filtrar, _comprimir: comprimir, _limpiarFondo: limpiarFondo, _calidadHoja: calidadHoja, _estado: () => ({ calidad, filtro: filtroPref }) };
})();
