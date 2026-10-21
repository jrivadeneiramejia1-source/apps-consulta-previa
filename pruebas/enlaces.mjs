// Revisa que no haya enlaces rotos: páginas, íconos, scripts y archivos que guarda cada sw.js.
// Uso: npm run enlaces   (EXTERNOS=1 también revisa las librerías de internet)
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, require } from './banco.mjs';
const { LinkChecker } = require('linkinator');
let ok = 0, mal = 0; const t = (n, c, x) => { c ? ok++ : mal++; console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (c ? '' : ' ' + (x || ''))); };

// 1) Lo que guarda cada service worker para usar sin internet tiene que existir (si falta, se pierde en silencio).
for (const sw of ['sw.js', 'equipos/sw.js', 'entregas/sw.js', 'evidencias/sw.js']) {
  const f = path.join(RAIZ, sw);
  if (!fs.existsSync(f)) continue;
  const lista = (fs.readFileSync(f, 'utf8').match(/const BASICOS = \[([^\]]*)\]/) || [])[1];
  if (!lista) { t(`${sw}: no guarda archivos (solo se borra)`, fs.readFileSync(f, 'utf8').indexOf('BASICOS') < 0); continue; }
  const faltan = [...lista.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(u => {
    const p = path.resolve(path.dirname(f), u.split('?')[0]);
    return !(fs.existsSync(p) && (fs.statSync(p).isFile() || fs.existsSync(path.join(p, 'index.html'))));
  });
  t(`${sw}: existen los ${[...lista.matchAll(/'/g)].length / 2} archivos que guarda`, !faltan.length, faltan.join(', '));
  // El lector de códigos va en un cajón aparte (CODIGOS_ARCH): también tiene que existir.
  const cod = (fs.readFileSync(f, 'utf8').match(/const CODIGOS_ARCH = \[([^\]]*)\]/) || [])[1];
  if (cod) {
    const faltanCod = [...cod.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(u => !fs.existsSync(path.resolve(path.dirname(f), u)));
    t(`${sw}: existe el lector de códigos que guarda`, !faltanCod.length, faltanCod.join(', '));
  }
}

// 2) Enlaces de las páginas (linkinator sirve la carpeta y sigue los enlaces internos).
const externos = process.env.EXTERNOS === '1';
const saltar = [
  'fonts.googleapis.com', 'fonts.gstatic.com',        // preconnect: la raíz responde 404 y es normal
  'firestore.googleapis.com', 'workers.dev', 'docs.google.com', 'drive.google.com', 'wa.me', 'mailto:', 'tel:'
].map(x => x.replace(/\./g, '\\.'));
if (!externos) saltar.push('^https?://(?!127\\.0\\.0\\.1|localhost)');
const rotos = [];
const lc = new LinkChecker();
lc.on('link', l => { if (l.state === 'BROKEN') rotos.push(`${l.url} (${l.status}) en ${l.parent}`); });
const r = await lc.check({ path: ['index.html', 'equipos/index.html', 'entregas/index.html', 'evidencias/index.html'], recurse: true, linksToSkip: saltar, timeout: 15000, retry: true, concurrency: 20, serverRoot: RAIZ, directoryListing: false });
const revisados = r.links.filter(l => l.state !== 'SKIPPED').length;
t(`páginas: ${revisados} enlaces revisados${externos ? ' (con los de internet)' : ''}, ninguno roto`, r.passed && !rotos.length, '\n  ' + rotos.join('\n  '));
t('revisó las tres apps', ['equipos/', 'entregas/', 'evidencias/'].every(a => r.links.some(l => l.url.includes(a))));
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
