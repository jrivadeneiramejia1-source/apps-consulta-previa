/* lector.js — Lee el texto impreso de una hoja (OCR con Tesseract.js, en español) y saca los datos para el formulario:
   cédula, fecha, tipo de hoja (entrega o devolución), seriales y nombre. Solo propone: la persona revisa antes de guardar.
   El lector se descarga la primera vez (unos 6 MB) y queda guardado en el teléfono. La letra a mano casi nunca se lee. */
(function () {
  'use strict';
  const CDN = 'https://cdn.jsdelivr.net/npm/';
  const TESS_URL = CDN + 'tesseract.js@7.0.0/dist/tesseract.min.js';
  const RUTAS = {
    workerPath: CDN + 'tesseract.js@7.0.0/dist/worker.min.js',
    corePath: CDN + 'tesseract.js-core@7.0.0',
    langPath: CDN + '@tesseract.js-data/spa@1.0.0/4.0.0_best_int'
  };
  const LIBERAR_MS = 120000;   // sin uso por 2 minutos se apaga el lector para liberar memoria

  /* ---------------- leer el texto ---------------- */
  let tess = null, trabajador = null, alProgreso = null, apagar = 0, cola = Promise.resolve();
  function cargarTess() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tess) return tess;
    tess = new Promise((ok, mal) => {
      const s = document.createElement('script'); s.src = TESS_URL; s.async = true;
      s.onload = () => (window.Tesseract ? ok(window.Tesseract) : mal(new Error('El lector no cargó.')));
      s.onerror = () => { tess = null; s.remove(); mal(new Error('No se pudo descargar el lector. Revisa tu internet.')); };
      document.head.appendChild(s);
    });
    return tess;
  }
  const ETAPAS = { 'loading tesseract core': 'Descargando el lector', 'loading language traineddata': 'Descargando el español', 'initializing api': 'Preparando el lector', 'recognizing text': 'Leyendo la hoja' };
  async function obtenerTrabajador() {
    if (trabajador) return trabajador;
    const T = await cargarTess();
    trabajador = T.createWorker('spa', 1, Object.assign({
      logger: m => { if (alProgreso && ETAPAS[m.status]) alProgreso(ETAPAS[m.status], Math.round((m.progress || 0) * 100)); },
      errorHandler: () => {}
    }, RUTAS)).then(async w => { await w.setParameters({ preserve_interword_spaces: '1' }); return w; })
      .catch(e => { trabajador = null; throw new Error('No se pudo preparar el lector: ' + (e && e.message || e)); });
    return trabajador;
  }
  // imagen: Blob, canvas o imagen. alAvanzar(texto, porcentaje) muestra cómo va. Devuelve { texto, confianza }.
  function leer(imagen, alAvanzar) {
    const tarea = cola.then(async () => {
      clearTimeout(apagar); alProgreso = alAvanzar || null;
      try {
        const w = await obtenerTrabajador();
        const r = await w.recognize(imagen);
        return { texto: r.data.text || '', confianza: Math.round(r.data.confidence || 0) };
      } finally {
        alProgreso = null;
        apagar = setTimeout(() => { const t = trabajador; trabajador = null; if (t) t.then(w => w.terminate()).catch(() => {}); }, LIBERAR_MS);
      }
    });
    cola = tarea.catch(() => {});
    return tarea;
  }

  /* ---------------- sacar los datos del texto ---------------- */
  const plano = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  // El OCR confunde letras con números (O y 0, I y 1, S y 5, B y 8…): para comparar seriales se igualan.
  const PARECIDOS = { O: '0', Q: '0', D: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6' };
  const doblar = t => plano(t).replace(/[^A-Z0-9]/g, '').replace(/[OQDILSBZG]/g, c => PARECIDOS[c]);
  const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

  function fechaValida(d, m, a) {
    d = Number(d); m = Number(m); a = Number(a);
    if (a < 100) a += 2000;
    const hoy = new Date();
    if (a < 2000 || a > hoy.getFullYear() + 1 || m < 1 || m > 12 || d < 1) return null;
    const f = new Date(Date.UTC(a, m - 1, d));
    if (f.getUTCDate() !== d) return null;
    return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function buscarFecha(t) {
    const set = MESES.join('|').replace('SEPTIEMBRE', 'SEP?TIEMBRE');
    const formas = [
      [/\b(20\d{2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\b/g, m => fechaValida(m[3], m[2], m[1])],
      [/\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})\b/g, m => fechaValida(m[1], m[2], m[3])],   // día/mes/año, como en Colombia
      [new RegExp(`\\b(\\d{1,2})\\s+(?:DE\\s+)?(${set})\\s+(?:DE[L]?\\s+)?(\\d{4})\\b`, 'g'), m => fechaValida(m[1], m[2].startsWith('SET') ? 9 : MESES.findIndex(x => m[2].startsWith(x.slice(0, 3))) + 1, m[3])]
    ];
    const todas = [];
    for (const [rx, f] of formas) for (const m of t.matchAll(rx)) { const v = f(m); if (v) todas.push({ v, i: m.index }); }
    if (!todas.length) return '';
    // La que esté justo después de la palabra FECHA; si no, la primera de la hoja.
    const etiq = [...t.matchAll(/FECHA/g)].map(m => m.index);
    const cerca = todas.filter(f => etiq.some(e => f.i > e && f.i - e < 60)).sort((a, b) => a.i - b.i);
    return (cerca[0] || todas.sort((a, b) => a.i - b.i)[0]).v;
  }
  function buscarCedula(t) {
    const rx = /(?:\bC\s*\.?\s*C\b\.?|CEDULA(?:\s+DE\s+CIUDADANIA)?|DOCUMENTO\s+DE\s+IDENTIDAD|IDENTIFICACION|\bT\s*\.?\s*I\b\.?)\s*(?:N[O0°º]?\s*\.?|#)?\s*[:.-]?\s*((?:\d[ .,]?){6,10})/g;
    for (const m of t.matchAll(rx)) { const n = m[1].replace(/\D/g, ''); if (n.length >= 6 && n.length <= 10) return n; }
    return '';
  }
  function buscarTipo(t) {
    const dev = t.search(/DEVOLUCI[O0]N|\bDEVUELVE|\bREINTEGRO/), ent = t.search(/\bENTREGA\b|ASIGNACI[O0]N/);
    if (dev < 0 && ent < 0) return '';
    if (dev < 0) return 'entrega';
    if (ent < 0) return 'devolucion';
    return dev < ent ? 'devolucion' : 'entrega';   // el título va arriba
  }
  // Cuántas letras hay que cambiar, poner o quitar para que "a" aparezca dentro de "b" (0 = está tal cual).
  function distanciaDentro(a, b, tope) {
    let prev = new Array(b.length + 1).fill(0), cur = new Array(b.length + 1);
    for (let i = 1; i <= a.length; i++) {
      cur[0] = i; let menor = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < menor) menor = cur[j];
      }
      if (menor > tope) return tope + 1;
      [prev, cur] = [cur, prev];
    }
    return Math.min(...prev);
  }
  function buscarSeriales(texto, conocidos) {
    const t = plano(texto), lineas = t.split('\n').map(doblar).filter(Boolean), hallados = new Map();
    // 1. Seriales que ya están en Equipos y aparecen en la hoja (aunque el OCR cambie una O por un 0
    //    o lea mal una o dos letras: 1 de cada 5).
    for (const s of conocidos) {
      const d = doblar(s);
      if (d.length < 5 || !/\d/.test(d)) continue;
      const tope = Math.floor(d.length / 5);
      if (lineas.some(l => l.includes(d)) || (tope && lineas.some(l => distanciaDentro(d, l, tope) <= tope))) hallados.set(d, { serial: s, conocido: true });
    }
    // 2. Lo que esté escrito después de "Serial", "Serie" o "S/N".
    const rx = /(?:\bSERIAL(?:ES)?|\bSERIE|\bS\s*\/\s*N|\bSN\b|\bNO\.?\s+DE\s+SERIE)\s*(?:N[°º]|NO\.|N\.|NO(?=\s))?\s*[:.#-]?\s*([A-Z0-9][A-Z0-9-]{4,24})/g;
    for (const m of t.matchAll(rx)) {
      const s = m[1].replace(/-+$/, ''), d = doblar(s);
      if (!/\d/.test(s) || !/[A-Z0-9]{5}/.test(s.replace(/-/g, '')) || [...hallados.keys()].some(k => d.includes(k) || distanciaDentro(k, d, Math.floor(k.length / 5)) <= Math.floor(k.length / 5))) continue;
      hallados.set(d, { serial: s, conocido: false });
    }
    return [...hallados.values()];
  }
  const PARADAS = new Set(['CEDULA', 'CC', 'C', 'DOCUMENTO', 'IDENTIFICACION', 'FIRMA', 'CARGO', 'FECHA', 'TEL', 'TELEFONO', 'CELULAR', 'NO', 'N', 'DE', 'DEL', 'Y', 'PROYECTO', 'SERIAL', 'EQUIPO', 'CIUDAD', 'MUNICIPIO', 'COMUNIDAD']);
  const titulo = s => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (a, e, l) => e + l.toUpperCase());
  function buscarNombre(texto, conocidos) {
    const t = plano(texto), palabras = new Set(t.split(/[^A-Z]+/).filter(Boolean));
    // 1. Un nombre que ya está en la app (hojas anteriores o Equipos) y está completo en la hoja.
    const hallados = conocidos.filter(n => { const p = plano(n).split(/[^A-Z]+/).filter(x => x.length > 1); return p.length >= 2 && p.every(x => palabras.has(x)); });
    if (hallados.length === 1) return hallados[0];
    // 2. Lo escrito después de "Nombre:" (hasta la siguiente palabra que ya no es nombre).
    const may = String(texto).toUpperCase();
    const m = may.match(/\bNOMBRES?(?:\s+Y\s+APELLIDOS?|\s+COMPLETO)?\s*[:.-]?[ \t]*([A-ZÁÉÍÓÚÜÑ]+(?:[ \t]+[A-ZÁÉÍÓÚÜÑ]+){1,5})/);
    if (m) {
      const ps = [];
      for (const p of m[1].split(/\s+/)) { if (PARADAS.has(plano(p))) break; ps.push(p); }
      if (ps.length >= 2 && ps.length <= 5 && ps.every(p => p.length > 1)) return titulo(ps.join(' '));
    }
    return hallados.length ? hallados.sort((a, b) => b.length - a.length)[0] : '';
  }
  // texto: lo que leyó el OCR. conocidos: { seriales: [], nombres: [] } que ya tiene la app.
  // Devuelve { nombre, cedula, fecha, tipo, seriales: [{ serial, conocido }] }; lo que no encuentra queda vacío.
  function extraer(texto, conocidos) {
    conocidos = conocidos || {};
    const t = plano(texto);
    return {
      nombre: buscarNombre(texto, (conocidos.nombres || []).filter(Boolean)),
      cedula: buscarCedula(t),
      fecha: buscarFecha(t),
      tipo: buscarTipo(t),
      seriales: buscarSeriales(texto, (conocidos.seriales || []).filter(Boolean))
    };
  }

  window.Lector = { leer, extraer, cargarTess, _doblar: doblar };
})();
