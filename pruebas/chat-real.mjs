// Soporte (chat) de Equipos contra los emuladores de Firebase (Firestore + inicio anónimo), con el SDK de verdad
// y las reglas de firestore.rules. Tres personas y un segundo teléfono que se vincula.
// Uso: npm run chat-real   (arranca los emuladores, corre esta prueba y los apaga; necesita Java)
import fs from 'node:fs';
import path from 'node:path';
import { lanzar, servir, pagina, huella, RAIZ, SALIDA, require } from './banco.mjs';
const URL = 'http://127.0.0.1:8830/equipos/', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const PROYECTO = 'demo-consulta-previa', CLAVE = 'prueba-real', H = huella('equipos', CLAVE);
const FS = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080', AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

// El SDK instalado (node_modules/firebase) en lugar del de gstatic; la versión de los import se cambia a la que pide la app
// para que todo use una sola copia de firebase-app.
const SDK_DIR = path.dirname(require.resolve('firebase/package.json'));
const VERSION_APP = fs.readFileSync(path.join(RAIZ, 'nube.js'), 'utf8').match(/firebasejs\/([\d.]+)\//)[1];
const sdk = n => fs.readFileSync(path.join(SDK_DIR, n), 'utf8').replace(/firebasejs\/[\d.]+\//g, `firebasejs/${VERSION_APP}/`);
const CONFIG = `window.FIREBASE_CONFIG = { apiKey: 'demo-key', authDomain: '${PROYECTO}.firebaseapp.com', projectId: '${PROYECTO}', appId: '1:1:web:1' };
window.FIREBASE_EMULADORES = { firestore: '${FS}', auth: 'http://${AUTH}' };
window.AVISOS = { url: 'http://127.0.0.1:9/sin-servidor', vapid: '' };`;

async function telefono(b, nombre, extra = {}) {
  const errores = [];
  const t = await pagina(b, Object.assign({ errores, semilla: { nube_equipos_espacio: H, nube_equipos_nombre: nombre } }, extra));
  await t.ctx.route(/\/config\.js/, r => r.fulfill({ body: CONFIG, contentType: 'text/javascript' }));
  await t.ctx.route(/\/firebasejs\//, r => {
    const n = r.request().url().split('/').pop();
    return r.fulfill({ body: sdk(n), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  t.errores = errores; t.nombre = nombre;
  return t;
}
const abrirSoporte = async (t, q = '') => {
  await t.page.goto(URL + q); await t.page.waitForSelector('#tabSo');
  await t.page.click('#tabSo');
  await t.page.waitForFunction(() => window.ChatSoporte && ['listo', 'vincular'].includes(ChatSoporte.estado), null, { timeout: 20000 });
};
const fila = (t, c) => t.page.locator(`#soLista [data-chat="${c}"]`);
const textoDe = (t, sel) => t.page.textContent(sel).catch(() => '');
const hasta = (t, fn, arg, ms = 8000) => t.page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const enviar = async (t, texto) => { await t.page.fill('#chatTexto', texto); await t.page.keyboard.press('Enter'); };
const enChat = (t, texto) => hasta(t, x => [...document.querySelectorAll('#chatLista .msg-burbuja')].some(e => e.textContent.includes(x)), texto);
// Intenta leer una conversación privada directamente con el SDK de la página (como haría alguien curioso).
const leerConv = (t, conv) => t.page.evaluate(async ([conv]) => {
  const S = await nube.sesionChat();
  try { const r = await S.F.getDocs(S.F.collection(S.fs, 'espacios', S.espacio, 'privados', conv, 'mensajes')); return 'leyó ' + r.size; }
  catch (e) { return e.code || String(e); }
}, [conv]);

// Datos limpios en los emuladores.
await fetch(`http://${FS}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://${AUTH}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });

const srv = await servir(8830);
const b = await lanzar();
try {
  console.log('Tres personas entran a Soporte');
  const jeiler = await telefono(b, 'Jeiler'), ana = await telefono(b, 'Ana Gómez'), luis = await telefono(b, 'Luis');
  await abrirSoporte(jeiler); await abrirSoporte(ana); await abrirSoporte(luis);
  log('las tres quedan listas con su sesión anónima', [jeiler, ana, luis].every(Boolean) && (await jeiler.page.evaluate(() => ChatSoporte.estado)) === 'listo');
  log('Jeiler ve a Ana y a Luis en la lista', await hasta(jeiler, () => document.querySelector('#soLista [data-chat="ana-gomez"]') && document.querySelector('#soLista [data-chat="luis"]')));
  log('Ana sale conectada', (await fila(jeiler, 'ana-gomez').locator('.so-punto.si').count()) === 1);

  console.log('Chat de todos');
  await jeiler.page.click('#soLista [data-chat="todos"]'); await jeiler.page.waitForSelector('#chatPantalla:not([hidden])');
  await enviar(jeiler, 'Buenos días, equipo: hoy hay mantenimiento');
  log('el mensaje de Jeiler queda guardado (sin «Enviando»)', await hasta(jeiler, () => document.querySelector('#chatLista .msg.mia') && !document.querySelector('#chatLista .msg.mia .msg-env')));
  log('a Luis le llega con insignia en la pestaña', await hasta(luis, () => { const x = document.querySelector('#badgeSo'); return x && !x.hidden && x.textContent.trim() === '1'; }));
  await ana.page.click('#soLista [data-chat="todos"]'); await ana.page.waitForSelector('#chatPantalla:not([hidden])');
  log('Ana lo lee con el nombre de Jeiler', await enChat(ana, 'hoy hay mantenimiento') && /Jeiler/.test(await textoDe(ana, '#chatLista')));
  await ana.page.click('#chatLista .msg-burbuja >> nth=0'); await ana.page.click('[data-acc="responder"]');
  await enviar(ana, '¿A qué hora?');
  log('la respuesta de Ana le llega a Jeiler con la cita', await enChat(jeiler, 'A qué hora') && (await jeiler.page.locator('#chatLista .msg-cita').count()) === 1);
  log('Luis no puede borrar lo de Jeiler (ni con el SDK)', await luis.page.evaluate(async () => {
    const S = await nube.sesionChat(), q = await S.F.getDocs(S.F.collection(S.fs, 'espacios', S.espacio, 'chat'));
    const d = q.docs.find(x => x.data().de === 'jeiler');
    try { await S.F.deleteDoc(d.ref); return false; } catch (e) { return e.code === 'permission-denied'; }
  }));
  await ana.page.keyboard.press('Escape');

  console.log('Privado Ana ↔ Jeiler');
  await ana.page.click('#soLista [data-chat="jeiler"]'); await ana.page.waitForSelector('#chatPantalla:not([hidden])');
  await enviar(ana, 'Jeiler, el portátil de María no enciende');
  log('Ana ve «Enviado»', await hasta(ana, () => /Enviado/.test(document.querySelector('#chatLista .msg.mia')?.textContent || '')));
  await jeiler.page.keyboard.press('Escape');
  log('Jeiler ve el privado sin leer en la fila de Ana', await hasta(jeiler, () => /portátil de María/.test(document.querySelector('#soLista [data-chat="ana-gomez"]')?.textContent || '') && document.querySelector('#soLista [data-chat="ana-gomez"] .so-n')));
  await jeiler.page.click('#soLista [data-chat="ana-gomez"]'); await jeiler.page.waitForSelector('#chatPantalla:not([hidden])');
  log('Jeiler lo abre y lo lee', await enChat(jeiler, 'portátil de María'));
  log('a Ana le cambia a «Visto»', await hasta(ana, () => /Visto/.test(document.querySelector('#chatLista .msg.mia')?.textContent || '')));
  await enviar(jeiler, 'Ya voy para allá');
  log('la respuesta de Jeiler le llega a Ana', await enChat(ana, 'Ya voy para allá'));
  log('Luis no ve esa conversación en su lista', !/portátil de María|Ya voy para allá/.test(await textoDe(luis, '#soLista')));
  log('Luis no puede leerla ni con el SDK (permiso negado)', (await leerConv(luis, 'ana-gomez__jeiler')) === 'permission-denied', await leerConv(luis, 'ana-gomez__jeiler'));
  log('Luis no puede escribir en ella', await luis.page.evaluate(async () => {
    const S = await nube.sesionChat();
    try { await S.F.addDoc(S.F.collection(S.fs, 'espacios', S.espacio, 'privados', 'ana-gomez__jeiler', 'mensajes'), { de: 'luis', texto: 'hola', en: S.F.serverTimestamp(), leido: false }); return false; }
    catch (e) { return e.code === 'permission-denied'; }
  }));

  console.log('Segundo teléfono de Jeiler');
  const jeiler2 = await telefono(b, 'Jeiler', { tema: 'dark' });
  await abrirSoporte(jeiler2, '?chat=ana-gomez');
  log('el teléfono nuevo pide vincular', (await jeiler2.page.evaluate(() => ChatSoporte.estado)) === 'vincular');
  await jeiler2.page.waitForFunction(() => /\d{3} \d{3}/.test(document.querySelector('.so-codigo')?.textContent || ''), null, { timeout: 8000 });
  const codigo = (await textoDe(jeiler2, '.so-codigo')).replace(/\D/g, '');
  log('muestra un código de 6 números', codigo.length === 6);
  log('antes de vincularlo no puede leer los privados de Jeiler', (await leerConv(jeiler2, 'ana-gomez__jeiler')) === 'permission-denied');
  await jeiler2.page.screenshot({ path: `${SALIDA}/chat-real-vincular.png` });
  await jeiler.page.keyboard.press('Escape');
  await jeiler.page.click('#soLista [data-so="vincular"]'); await jeiler.page.waitForSelector('#chVinc');
  await jeiler.page.fill('#chVinc', codigo); await jeiler.page.click('#cfYes');
  log('el primer teléfono dice que quedó vinculado', await hasta(jeiler, () => /vinculado/.test(document.querySelector('#toast')?.textContent || '')));
  log('el segundo entra solo y abre el chat que pedía', await hasta(jeiler2, () => !document.querySelector('#chatPantalla')?.hidden && document.querySelector('#chatTitulo')?.textContent === 'Ana Gómez', null, 12000));
  log('…y ve la conversación con Ana', await enChat(jeiler2, 'portátil de María'));
  log('el código usado se borró', await jeiler.page.evaluate(async c => {
    const S = await nube.sesionChat();
    try { return !(await S.F.getDoc(S.F.doc(S.fs, 'espacios', S.espacio, 'vinculos', c))).exists(); } catch (e) { return e.code; }
  }, codigo));
  await jeiler2.page.screenshot({ path: `${SALIDA}/chat-real-privado.png` });

  console.log('Salir en el segundo teléfono');
  await jeiler2.page.evaluate(() => nube.salir()); await jeiler2.page.waitForSelector('#cfSheet:not([hidden])'); await jeiler2.page.click('#cfYes');
  log('al salir, ese teléfono se quita de Jeiler (el primero sigue)', await ana.page.evaluate(async () => {
    const S = await nube.sesionChat();
    for (let i = 0; i < 20; i++) {
      const d = (await S.F.getDoc(S.F.doc(S.fs, 'espacios', S.espacio, 'gente', 'jeiler'))).data();
      if (d.uids.length === 1) return true;
      await new Promise(r => setTimeout(r, 300));
    }
    return false;
  }));

  for (const t of [jeiler, ana, luis, jeiler2]) {
    const e = t.errores.filter(x => !/externo:|sin-servidor|ERR_CONNECTION_REFUSED|Failed to load resource/.test(x));
    log(`sin errores en la página (${t.nombre}${t === jeiler2 ? ', teléfono 2' : ''})`, !e.length, e.slice(0, 4).join('\n      '));
  }
} catch (e) {
  mal++; console.log('FALLA la prueba se detuvo: ' + (e && e.stack || e));
} finally {
  await b.close(); srv.close();
}
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
