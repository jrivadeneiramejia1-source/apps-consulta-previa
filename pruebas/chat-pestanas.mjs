// Soporte (chat) con las otras apps abiertas en el mismo navegador, con los emuladores de Firebase y la caché activada.
// Equipos y Entregas comparten almacenamiento y UNA conexión de Firestore entre pestañas (la lleva la que se abrió primero).
// Si esa no tenía el inicio de sesión del chat, Soporte mostraba "Falta pegar las reglas" aunque las reglas estaban bien, y se quitaba solo
// al cerrar esa pestaña. Uso: npm run chat-real   (arranca los emuladores y corre esta prueba junto con chat-real)
import fs from 'node:fs';
import path from 'node:path';
import { lanzar, servir, pagina, huella, RAIZ, require } from './banco.mjs';
const esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const P = 'demo-consulta-previa', CLAVE = 'prueba-pestanas';
const FS = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080', AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const SDK_DIR = path.dirname(require.resolve('firebase/package.json'));
const VER = fs.readFileSync(path.join(RAIZ, 'nube.js'), 'utf8').match(/firebasejs\/([\d.]+)\//)[1];
const sdk = n => fs.readFileSync(path.join(SDK_DIR, n), 'utf8').replace(/firebasejs\/[\d.]+\//g, `firebasejs/${VER}/`);
const CONFIG = `window.FIREBASE_CONFIG = { apiKey: 'demo-key', authDomain: '${P}.firebaseapp.com', projectId: '${P}', appId: '1:1:web:1' };
window.FIREBASE_EMULADORES = { firestore: '${FS}', auth: 'http://${AUTH}', persistencia: true };
window.AVISOS = { url: 'http://127.0.0.1:9/sin-servidor', vapid: '' };`;
await fetch(`http://${FS}/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://${AUTH}/emulator/v1/projects/${P}/accounts`, { method: 'DELETE' });
const srv = await servir(8832), b = await lanzar(), err = [];
const estado = p => p.evaluate(() => window.ChatSoporte && ChatSoporte.estado);
const BASE = 'http://127.0.0.1:8832';

// Un navegador nuevo (con su nombre): se abre `primera` (la que lleva la conexión) y después Equipos con el chat.
async function navegador(nombre) {
  const semilla = {}; for (const app of ['equipos', 'entregas']) { semilla[`nube_${app}_espacio`] = huella(app, CLAVE); semilla[`nube_${app}_nombre`] = nombre; }
  const t = await pagina(b, { errores: err, semilla });
  await t.ctx.route(/\/config\.js/, r => r.fulfill({ body: CONFIG, contentType: 'text/javascript' }));
  await t.ctx.route(/\/firebasejs\//, r => r.fulfill({ body: sdk(r.request().url().split('/').pop()), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
  return t;
}
async function abrirEquipos(ctx) {
  const q = await ctx.newPage(); q.on('pageerror', e => err.push('js: ' + e.message));
  await q.goto(`${BASE}/equipos/`); await q.waitForSelector('#tabSo'); await q.click('#tabSo');
  await q.waitForFunction(() => window.ChatSoporte && ChatSoporte.estado !== 'cargando', null, { timeout: 20000 });
  await q.waitForFunction(() => ChatSoporte.estado === 'listo', null, { timeout: 8000 }).catch(() => {});
  return q;
}

for (const primera of ['entregas']) {
  console.log(`\n— ${primera} abierta primero (la que lleva la conexión)`);
  const { ctx, page } = await navegador(`Persona ${primera}`);   // un nombre por navegador: el mismo nombre en otro navegador pide vincular
  await page.goto(`${BASE}/${primera}/`); await page.waitForSelector('#conn'); await esp(2500);
  const q = await abrirEquipos(ctx);
  log(`${primera}: primera vez (todavía no hay sesión del chat), Soporte queda listo y sin aviso de reglas`, (await estado(q)) === 'listo' && !/Falta pegar/.test(await q.textContent('#soLista')), await estado(q));
  await q.click('#soLista [data-chat="todos"]'); await q.waitForSelector('#chatTexto');
  await q.fill('#chatTexto', `hola desde ${primera}`); await q.keyboard.press('Enter');
  log(`${primera}: se puede escribir en el chat de todos`, await q.waitForFunction(x => [...document.querySelectorAll('#chatLista .msg-burbuja')].some(e => e.textContent.includes(x)), `hola desde ${primera}`, { timeout: 8000 }).then(() => true, () => false));
  await page.close(); await esp(2500);
  log(`${primera}: al cerrarla, Soporte sigue listo`, (await estado(q)) === 'listo', await estado(q));
  await q.close();
  // Otra vez, ahora que la sesión ya existe en el navegador.
  const otra = await ctx.newPage(); await otra.goto(`${BASE}/${primera}/`); await otra.waitForSelector('#conn'); await esp(2000);
  const q2 = await abrirEquipos(ctx);
  log(`${primera}: con la sesión ya guardada, Soporte también queda listo`, (await estado(q2)) === 'listo' && !/Falta pegar/.test(await q2.textContent('#soLista')), await estado(q2));
  await ctx.close();
}
log('sin errores en la página', !err.filter(e => !/fonts|ERR_FAILED/.test(e)).length, err.join('\n      '));
await b.close(); srv.close();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
