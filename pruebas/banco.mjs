// Banco de pruebas: sirve el repo, cambia Firebase por uno falso y bloquea internet.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire('/home/claude/construir/');
export const { chromium } = require('playwright');
export const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
export function servir(puerto = 8811) {
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(RAIZ, p); if (!f.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(ok => srv.listen(puerto, '127.0.0.1', () => ok(srv)));
}
export const huella = (app, clave) => crypto.createHash('sha256').update(app + ':' + clave).digest('hex').slice(0, 40);
const LIBS = {
  'xlsx.full.min.js': '/home/claude/construir/node_modules/xlsx/dist/xlsx.full.min.js',
};
export async function pagina(browser, { tema = 'light', ancho = 390, alto = 844, semilla = null, errores = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, colorScheme: tema, locale: 'es-CO', deviceScaleFactor: 2 });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async r => {
    const u = r.request().url();
    if (u.includes('/firebasejs/')) return r.fulfill({ path: path.join(RAIZ, 'pruebas', u.includes('firestore') ? 'firebase-firestore.js' : 'firebase-app.js'), contentType: 'text/javascript' });
    const lib = Object.keys(LIBS).find(k => u.endsWith(k) && fs.existsSync(LIBS[k]));
    if (lib) return r.fulfill({ path: LIBS[lib], contentType: 'text/javascript' });
    errores.push('externo: ' + u); return r.abort();
  });
  if (semilla) await ctx.addInitScript(s => { if (!localStorage.getItem('__sembrado')) { Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))); localStorage.setItem('__sembrado', '1'); } }, semilla);
  const page = await ctx.newPage();
  page.on('pageerror', e => errores.push('js: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  page.on('dialog', d => { errores.push('dialogo nativo: ' + d.type() + ' ' + d.message()); d.dismiss(); });
  return { ctx, page };
}
// Datos de ejemplo
export function semillaEquipos(clave = 'prueba123') {
  const h = huella('equipos', clave), b = `espacios/${h}`;
  const hoy = new Date(), iso = d => d.toISOString().slice(0, 10), dias = n => iso(new Date(hoy - n * 864e5));
  const eqs = [
    ['5CD1234ABC', 'PC Portátil', 'HP', 'ProBook 440 G8', 'Ana Gómez', dias(40)],
    ['PF2XYZ01', 'PC Portátil', 'Lenovo', 'ThinkPad E14', 'Bodega', dias(300)],
    ['GPS778812', 'GPS', 'Garmin', 'eTrex 32x', 'Luis Pérez', ''],
    ['R58N90AB', 'Celular', 'Samsung', 'Galaxy A54', 'María Epieyú', dias(20)],
    ['TAB55001', 'Tablet', 'Samsung', 'Galaxy Tab A8', 'Bodega', dias(220)],
    ['X4E01234', 'Impresora', 'Epson', 'L3250', 'Oficina Riohacha', dias(90)],
    ['VB009911', 'Video beam', 'Epson', 'PowerLite X49', 'Bodega', dias(400)],
    ['STL00042', 'Antena', 'Starlink', 'Estándar', 'Campo Uribia', dias(15)]
  ];
  const s = { };
  eqs.forEach(([serial, tipo, marca, modelo, asignado, fechaMtto], n) => {
    s[`${b}/equipos/${serial}`] = { serial, tipo, marca, modelo, asignado, mail: '', cliente: 'Petrobras', proyecto: 'Consulta Previa', departamento: 'Guajira', municipio: 'Riohacha', fechaMtto, obs: '', n: n + 1, actualizado: new Date().toISOString(), por: 'Jeiler' };
  });
  const rec = [
    ['r-1', '5CD1234ABC', 'PC Portátil', 'HP', 'ProBook 440 G8', 'Ana Gómez', dias(5), 'pend', 'pend', ['Cargador', 'Mouse'], 'No enciende la pantalla'],
    ['r-2', 'R58N90AB', 'Celular', 'Samsung', 'Galaxy A54', 'María Epieyú', dias(1), 'hecho', 'pend', [], ''],
    ['r-3', 'NUEVO7788', 'PC Portátil', 'Dell', 'Latitude 3420', 'Carlos Ipuana', dias(0), 'pend', 'pend', ['Cargador'], ''],
  ];
  rec.forEach(([id, serial, tipo, marca, modelo, persona, fechaIngreso, mtto, backup, acc, obs]) => {
    s[`${b}/recibidos/${id}`] = { serial, tipo, marca, modelo, persona, proyecto: 'Consulta Previa', fechaIngreso, mtto, mttoFecha: mtto === 'hecho' ? dias(0) : '', backup, backupFecha: '', acc, obs, cerrado: false, cerradoEn: '' };
  });
  return { __fs_falso: s, nube_equipos_espacio: h, nube_equipos_nombre: 'Jeiler' };
}
