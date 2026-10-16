// Compartir → Entregas: fotos o PDF que se comparten desde WhatsApp, el escáner o Archivos llegan a Subir.
// Android manda los archivos con un POST a entregas/compartir (manifest.webmanifest → share_target); aquí se hace
// ese mismo envío con un formulario, con el sw.js de Entregas activo. Uso: node pruebas/compartir.mjs
import { lanzar, servir, pagina, semillaEquipos, huella, FOTOS } from './banco.mjs';
const URL = 'http://127.0.0.1:8824', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const srv = await servir(8824); const br = await lanzar();
const sem = Object.assign(semillaEquipos(), { nube_entregas_espacio: huella('entregas', 'prueba123'), nube_entregas_nombre: 'Jeiler' });
const err = [];
const { page } = await pagina(br, { semilla: sem, errores: err });
const toastTxt = () => page.locator('#toast').textContent().catch(() => '');

// El manifiesto declara que Entregas recibe fotos y PDF
const man = await (await fetch(URL + '/entregas/manifest.webmanifest')).json();
const st = man.share_target || {};
log('1. el manifiesto pone a Entregas en la lista de Compartir (fotos y PDF)', st.action === './compartir' && st.method === 'POST' && st.enctype === 'multipart/form-data' && st.params.files[0].name === 'archivos' && st.params.files[0].accept.includes('image/*') && st.params.files[0].accept.includes('application/pdf'), JSON.stringify(st));

// La app instalada tiene su sw.js activo (nube.js lo registra en https; el servidor de prueba es 127.0.0.1)
await page.goto(URL + '/entregas/'); await page.waitForSelector('#entList .empty-state, #entList .card');
await page.evaluate(() => navigator.serviceWorker.register('sw.js', { scope: './' }).then(() => navigator.serviceWorker.ready));
await page.reload(); await page.waitForSelector('#entList .empty-state, #entList .card');
log('2. el sw.js de Entregas controla la página', await page.evaluate(() => !!navigator.serviceWorker.controller));

// Compartir 2 fotos (así llega desde WhatsApp)
async function compartir(archivos) {
  await page.evaluate(() => {
    const f = document.createElement('form'); f.method = 'post'; f.enctype = 'multipart/form-data'; f.action = 'compartir'; f.id = 'fComp';
    f.innerHTML = '<input type="file" name="archivos" multiple><input name="texto" value="Te envío la hoja">'; document.body.appendChild(f);
  });
  await page.setInputFiles('#fComp input[type=file]', archivos);
  await Promise.all([page.waitForNavigation(), page.evaluate(() => document.getElementById('fComp').submit())]);
}
await compartir([`${FOTOS}/hoja1.jpg`, `${FOTOS}/hoja2.jpg`]);
await page.waitForSelector('#subList .card.pag >> nth=1', { timeout: 15000 }).catch(() => {});
log('3. abre la app en Subir con las 2 páginas', await page.locator('#subList .card.pag').count() === 2 && await page.getAttribute('#tabSub', 'aria-current') === 'page');
await page.waitForFunction(() => /desde Compartir/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 }).catch(() => {});
log('4. avisa que llegaron desde Compartir', /Llegaron 2 páginas desde Compartir/.test(await toastTxt()), await toastTxt());
log('5. la dirección queda limpia (sin ?compartido=1)', !page.url().includes('compartido'), page.url());
log('6. las páginas traen el nombre del archivo', (await page.textContent('#subList [data-i="0"] .pag-cab .meta')) === 'hoja1.jpg');

// Al volver a abrir no se repiten (se sacan una sola vez; quedan como páginas sin guardar)
await esp(900);
await page.goto(URL + '/entregas/'); await page.waitForSelector('#entList .empty-state, #entList .card'); await esp(1200);
await page.click('#tabSub'); await page.waitForSelector('#subList .card.pag');
log('7. al volver a abrir no se repiten: siguen 2 páginas', await page.locator('#subList .card.pag').count() === 2);

// Compartir otra vez: se suman a las que ya había. Al irse a WhatsApp la app queda oculta y guarda las páginas en el teléfono.
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await esp(400);
await compartir([`${FOTOS}/galeria-1.jpg`]);
await page.waitForSelector('#subList .card.pag >> nth=2', { timeout: 15000 }).catch(() => {});
log('8. compartir otra foto la suma a las que ya había', await page.locator('#subList .card.pag').count() === 3);

// Se guardan como cualquier hoja
await page.fill('#l0n', 'Ana Gómez'); await page.fill('#l1n', 'Luis Pérez'); await page.fill('#l2n', 'Carlos Ipuana');
await page.click('#subGuardar'); await page.waitForSelector('#entList .card.hoja >> nth=2', { timeout: 20000 }).catch(() => {});
log('9. se guardan como hojas normales', await page.locator('#entList .card.hoja').count() === 3);

const raros = err.filter(x => !/externo:/.test(x));
log('10. sin errores en la página', !raros.length, raros.join(' | '));
await br.close(); srv.close();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
