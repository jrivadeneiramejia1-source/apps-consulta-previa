// Entregas: las páginas sin guardar se recuperan si la app se cierra o se recarga. Uso: node pruebas/lote.mjs
import { lanzar, servir, pagina, semillaEquipos, huella, FOTOS } from './banco.mjs';
const URL = 'http://127.0.0.1:8820', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const srv = await servir(8820); const br = await lanzar();
const HE = huella('entregas', 'prueba123'), BE = `espacios/${HE}`;
const sem = Object.assign(semillaEquipos(), { nube_entregas_espacio: HE, nube_entregas_nombre: 'Jeiler' });
const err = [];
const { page } = await pagina(br, { semilla: sem, errores: err });
const enIDB = () => page.evaluate(() => new Promise(ok => {
  const r = indexedDB.open('entregas-lote', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('lote');
  r.onsuccess = () => { const q = r.result.transaction('lote').objectStore('lote').get('actual'); q.onsuccess = () => { ok(q.result ? q.result.paginas.length : 0); r.result.close(); }; };
  r.onerror = () => ok(-1);
}));
const abrir = async () => { await page.goto(URL + '/entregas/'); await page.waitForSelector('#entList .empty-state, #entList .card'); await esp(400); };
const hojas = async () => Object.entries(await page.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso')))).filter(([k]) => k.startsWith(BE + '/entregas/')).map(([, v]) => v);
const toastTxt = () => page.locator('#toast').textContent().catch(() => '');

await abrir();
await page.click('#tabSub');
await page.setInputFiles('#archivo', [`${FOTOS}/hoja1.jpg`, `${FOTOS}/hoja2.jpg`]);
await page.waitForSelector('#subList .card.pag >> nth=1');
await page.fill('#l0n', 'Ana Gómez'); await page.fill('#l0f', '2026-10-14');
await page.fill('#l1n', 'Luis Pérez'); await page.selectOption('#l1t', 'otro');
await page.locator('#subList [data-i="0"] [data-eq-k="serial"]').fill('ABC123');
await esp(800);
log('1. las páginas quedan guardadas en el teléfono', await enIDB() === 2);

await abrir();
await page.waitForFunction(() => /recuperaron 2 páginas/.test(document.querySelector('#toast') && document.querySelector('#toast').textContent), null, { timeout: 8000 }).catch(() => {});
log('2. al volver a abrir avisa que se recuperaron', /Se recuperaron 2 páginas/.test(await toastTxt()), await toastTxt());
log('3. la insignia de Subir muestra 2', (await page.textContent('#badgeSub')) === '2' && await page.locator('#badgeSub').isVisible());
await page.click('#tabSub'); await page.waitForSelector('#subList .card.pag >> nth=1');
const datos = await page.evaluate(() => ({ n: document.querySelectorAll('#subList .card.pag').length, a: document.querySelector('#l0n').value, f: document.querySelector('#l0f').value, b: document.querySelector('#l1n').value, t: document.querySelector('#l1t').value, s: document.querySelector('#subList [data-i="0"] [data-eq-k="serial"]').value, img: document.querySelector('#subList .pag-img').src.slice(0, 15) }));
log('4. vuelven con todo lo escrito (nombre, fecha, tipo, serial) y la imagen', datos.n === 2 && datos.a === 'Ana Gómez' && datos.f === '2026-10-14' && datos.b === 'Luis Pérez' && datos.t === 'otro' && datos.s === 'ABC123' && datos.img === 'data:image/jpeg', JSON.stringify(datos));

// Se corta la subida después de la primera hoja: la que subió se quita, la otra queda.
await page.evaluate(b => {
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    set.call(this, k, v);
    if (k === '__fs_falso' && !window.__fsFallar && Object.keys(JSON.parse(v)).some(x => x.startsWith(b + '/entregas/'))) window.__fsFallar = 'unavailable';
  };
}, BE);
await page.click('#subGuardar');
await page.waitForFunction(() => /Se cortó la subida/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 }).catch(() => {});
const t5 = await toastTxt();
log('5. si se corta la subida lo dice claro', /Se cortó la subida.*La hoja que alcanzó a subir quedó guardada y se quitó de aquí/.test(t5), t5);
const quedan = await page.$$eval('#subList .card.pag', l => l.length);
log('6. la hoja que alcanzó a subir no se repite (queda solo la otra)', quedan === 1 && (await page.inputValue('#l0n')) === 'Luis Pérez' && (await hojas()).length === 1, `${quedan} páginas, ${(await hojas()).length} hojas`);
await esp(700);
await abrir();
await page.click('#tabSub'); await page.waitForSelector('#subList .card.pag');
log('7. al volver a abrir se recupera solo la que faltó', await page.$$eval('#subList .card.pag', l => l.length) === 1 && (await page.inputValue('#l0n')) === 'Luis Pérez');

await page.click('#subGuardar');
await page.waitForSelector('#entList .card.hoja >> nth=1', { timeout: 15000 });
await esp(300);
log('8. al guardar se borra del teléfono', await enIDB() === 0 && (await hojas()).length === 2);
const h = (await hojas()).find(x => x.nombre === 'Luis Pérez');
const trozos = Object.keys(await page.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso')))).filter(k => k.startsWith(BE + '/archivos/')).length;
log('9. la imagen recuperada se subió completa', h && h.paginas.length === 1 && h.paginas[0].bytes > 10000 && trozos >= 2, JSON.stringify(h && h.paginas));
await abrir();
log('10. después de guardar no aparece nada para recuperar', !(await page.locator('#badgeSub').isVisible()) && !/recuper/.test(await toastTxt()));

// Descartar
await page.click('#tabSub');
await page.setInputFiles('#archivo', [`${FOTOS}/hoja1.jpg`]); await page.waitForSelector('#subList .card.pag'); await esp(700);
log('11. una página nueva queda guardada', await enIDB() === 1);
await page.click('#subCancelar'); await page.waitForSelector('#cfSheet:not([hidden])'); await page.click('#cfYes'); await esp(200);
log('12. al descartar se borra del teléfono enseguida', await enIDB() === 0);

// Otra clave: no se muestran las páginas de otra persona
await page.setInputFiles('#archivo', [`${FOTOS}/hoja2.jpg`]); await page.waitForSelector('#subList .card.pag'); await esp(700);
await page.evaluate(() => localStorage.setItem('nube_entregas_espacio', 'f'.repeat(40)));
await abrir();
log('13. con otra clave no se recuperan y se borran', !(await page.locator('#badgeSub').isVisible()) && await enIDB() === 0);

const raros = err.filter(x => !/falla simulada|unavailable|No se pudo guardar/.test(x));
log('14. sin errores en la página', !raros.length, raros.join(' | '));
await br.close(); srv.close();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
