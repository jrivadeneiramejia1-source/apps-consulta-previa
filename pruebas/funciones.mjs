/* global MAX_PAGINAS, lote, DB:writable */
// Funciones de la versión 24 en Equipos y Entregas. Uso: node pruebas/funciones.mjs
// Equipos: atajos de fecha, acciones rápidas al programar, WhatsApp, lector de códigos (Code 128 y QR reales), hojas de Entregas en la ficha.
// Entregas: mover páginas, sugerencias por persona, escanear serial, subir en paralelo, agregar página a una hoja guardada, importar por lotes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lanzar, AXE_JS, FOTOS, servir, pagina, semillaEquipos, huella, require } from './banco.mjs';
const bwipjs = require('bwip-js');
const URL = 'http://127.0.0.1:8823', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const CLAVE = 'prueba123', B = `espacios/${huella('equipos', CLAVE)}`, BE = `espacios/${huella('entregas', CLAVE)}`;
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const masDias = n => { const d = new Date(); d.setHours(12); d.setDate(d.getDate() + n); return iso(d); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'codigos-'));
async function codigo(nombre, bcid, text, extra = {}) {
  const f = path.join(TMP, nombre + '.png');
  fs.writeFileSync(f, await bwipjs.toBuffer(Object.assign({ bcid, text, scale: 3, height: 12, includetext: true, paddingwidth: 24, paddingheight: 24, backgroundcolor: 'FFFFFF' }, extra)));
  return f;
}
async function axe(page, nombre) {
  await esp(350);
  await page.addScriptTag({ content: AXE_JS });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
  log(`axe sin fallas: ${nombre}`, !r.length, r.join('\n      '));
}
const toastTxt = p => p.locator('#toast').textContent().catch(() => '');
const fsDe = p => p.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso')));

// ---------- datos ----------
const sem = semillaEquipos(CLAVE), F = sem.__fs_falso;
Object.assign(F[`${B}/equipos/5CD1234ABC`], { anydesk: '123456789' });
Object.assign(F[`${B}/equipos/PF2XYZ01`], { anydesk: '987654321' });
Object.assign(F[`${B}/equipos/VB009911`], { anydesk: '555666777' });
F[`${B}/avisos/d-ana`] = { nombre: 'Ana Gómez', app: 'equipos', equipo: 'Android · Chrome', visto: new Date().toISOString(), creado: new Date().toISOString(), sub: null };
F[`${B}/tareas/t-1`] = { serial: 'PF2XYZ01', tipo: 'remoto', fecha: masDias(1), nota: '', resp: '', creadoPor: 'Jeiler', creado: new Date().toISOString(), estado: 'pendiente', hist: [] };
const b64 = fs.readFileSync(path.join(FOTOS, 'hoja1.jpg')).toString('base64');
F[`${BE}/entregas/e-semilla`] = { nombre: 'Ana Gómez', cedula: '1122', fecha: '2026-09-01', tipo: 'entrega', proyecto: 'Consulta Previa', equipos: [{ tipo: 'Portátil', serial: '5CD1234ABC' }], seriales: '5CD1234ABC', nota: '', paginas: [{ trozos: 1, ancho: 800, alto: 1100, bytes: 76000, origen: 'semilla' }], miniatura: '', origen: 'semilla', subido: new Date().toISOString(), actualizado: new Date().toISOString(), por: 'Jeiler', equiposSync: { fecha: new Date().toISOString(), texto: 'ya', completo: true } };
F[`${BE}/archivos/e-semilla_0_0`] = { e: 'e-semilla', p: 0, c: 0, n: 1, d: b64 };
Object.assign(sem, { nube_entregas_espacio: huella('entregas', CLAVE), nube_entregas_nombre: 'Jeiler', nube_equipos_enlace_entregas: huella('entregas', CLAVE), nube_entregas_enlace_equipos: huella('equipos', CLAVE) });

const srv = await servir(8823); const br = await lanzar();
const err = [];
const { ctx, page } = await pagina(br, { semilla: sem, errores: err });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL });
await ctx.addInitScript(() => { window.__abiertos = []; window.open = u => { window.__abiertos.push(String(u)); return null; }; window.__codigosSinNativo = true; });
const abiertos = () => page.evaluate(() => window.__abiertos.slice());

const CODE_PF = await codigo('pf2', 'code128', 'PF2XYZ01');
const CODE_GPS = await codigo('gps', 'code128', 'GPS778812');
const CODE_NUEVO = await codigo('nuevo', 'code128', 'S/N: ZX81NUEVO');
const QR_DELL = await codigo('dell', 'qrcode', 'https://www.dell.com/support/home/es-co/product-support/servicetag/7HQ2XK3', { height: 30, includetext: false });
const PN = await codigo('pn', 'code128', 'P/N 6YX45UT#ABA');

// Escanea con el botón dado: sin cámara (navegador de prueba) se usa "Tomar foto" con la imagen del código.
async function escanearCon(boton, archivo, { elegir = null } = {}) {
  await page.locator(boton).first().click();
  await page.waitForSelector('.cod');
  await page.waitForSelector('.cod-sin:not([hidden])', { timeout: 30000 });
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.click('.cod [data-a="foto"]')]);
  await ch.setFiles(archivo);
  if (elegir) { await page.waitForSelector(`.cod [data-usar="${elegir}"]`, { timeout: 15000 }); await page.click(`.cod [data-usar="${elegir}"]`); }
  await page.waitForFunction(() => !document.querySelector('.cod'), null, { timeout: 15000 });
}

// ======================= EQUIPOS =======================
console.log('\n— Equipos');
await page.goto(URL + '/equipos/'); await page.waitForSelector('#recList .card'); await esp(400);

// Lector: unidades
const lim = await page.evaluate(() => [Codigos.limpiar('S/N: 5cd1234abc'), Codigos.limpiar('https://www.dell.com/support/home/product-support/servicetag/7HQ2XK3'), Codigos.limpiar('http://pcsupport.lenovo.com/?serialnumber=PF2XYZ01&x=1'), Codigos.limpiar(' Serial No. R58N90AB\n')]);
log('L1. limpia el serial (S/N:, enlaces de Dell y Lenovo, espacios)', JSON.stringify(lim) === JSON.stringify(['5CD1234ABC', '7HQ2XK3', 'PF2XYZ01', 'R58N90AB']), JSON.stringify(lim));

// Registrar recibido escaneando el Code 128
await page.click('#btnNewRec'); await page.waitForSelector('#rcSheet:not([hidden])');
await page.locator('[data-scan="rcSerial"]').click(); await page.waitForSelector('.cod-sin:not([hidden])', { timeout: 30000 });
log('L2. sin cámara en vivo ofrece tomar una foto', (await page.textContent('.cod-sin')).includes('Tomar foto') && await page.locator('.cod [data-a="foto"]').isVisible());
await axe(page, 'lector de códigos');
await page.keyboard.press('Escape'); await esp(150);
log('L3. Escape cierra el lector y deja la hoja abierta', !(await page.locator('.cod').count()) && await page.locator('#rcSheet').isVisible());
await escanearCon('[data-scan="rcSerial"]', CODE_PF);
log('L4. Code 128 de la etiqueta → serial en el campo', (await page.inputValue('#rcSerial')) === 'PF2XYZ01', await page.inputValue('#rcSerial'));
log('L5. reconoce el equipo y llena sus datos', (await page.textContent('#rcConocido')).includes('Equipo ya registrado') && (await page.inputValue('#rcMarca')) === 'Lenovo');
await escanearCon('[data-scan="rcSerial"]', CODE_NUEVO);
log('L6. quita "S/N:" del código', (await page.inputValue('#rcSerial')) === 'ZX81NUEVO', await page.inputValue('#rcSerial'));
await escanearCon('[data-scan="rcSerial"]', QR_DELL);
log('L7. QR de Dell → service tag', (await page.inputValue('#rcSerial')) === '7HQ2XK3', await page.inputValue('#rcSerial'));
await page.click('#rcCancel'); if (await page.locator('#cfSheet').isVisible()) await page.click('#cfYes'); await esp(200);

// Etiqueta con dos códigos (serial y número de producto): se escoge
const doble = path.join(TMP, 'doble.png');
const dataDoble = await page.evaluate(async ([a, b]) => {
  const im = async u => { const i = new Image(); i.src = u; await i.decode(); return i; };
  const [x, y] = [await im(a), await im(b)], c = document.createElement('canvas');
  c.width = Math.max(x.width, y.width) + 40; c.height = x.height + y.height + 60;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(x, 20, 20); g.drawImage(y, 20, x.height + 40);
  return c.toDataURL('image/png');
}, ['data:image/png;base64,' + fs.readFileSync(PN).toString('base64'), 'data:image/png;base64,' + fs.readFileSync(CODE_GPS).toString('base64')]);
fs.writeFileSync(doble, Buffer.from(dataDoble.split(',')[1], 'base64'));
await page.click('#tabEq'); await page.waitForSelector('#eqList .card');
await escanearCon('[data-scan="qEq"]', doble);
log('L8. etiqueta con un serial conocido y otro código: abre el equipo conocido sin preguntar', await page.locator('#eqSheet').isVisible() && (await page.textContent('#eqTitle')) === 'GPS778812');
await page.click('#eqCancel'); await esp(150);
const otraDoble = path.join(TMP, 'doble2.png');
const dataDoble2 = await page.evaluate(async ([a, b]) => {
  const im = async u => { const i = new Image(); i.src = u; await i.decode(); return i; };
  const [x, y] = [await im(a), await im(b)], c = document.createElement('canvas');
  c.width = Math.max(x.width, y.width) + 40; c.height = x.height + y.height + 60;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(x, 20, 20); g.drawImage(y, 20, x.height + 40);
  return c.toDataURL('image/png');
}, ['data:image/png;base64,' + fs.readFileSync(PN).toString('base64'), 'data:image/png;base64,' + fs.readFileSync(CODE_NUEVO).toString('base64')]);
fs.writeFileSync(otraDoble, Buffer.from(dataDoble2.split(',')[1], 'base64'));
await page.click('#tabRec'); await page.waitForSelector('#recList .card');
await escanearCon('[data-scan="qRec"]', otraDoble, { elegir: 'ZX81NUEVO' });
log('L9. dos códigos desconocidos: se escoge el serial y abre "Registrar" con él', await page.locator('#rcSheet').isVisible() && (await page.inputValue('#rcSerial')) === 'ZX81NUEVO');
await page.click('#rcCancel'); if (await page.locator('#cfSheet').isVisible()) await page.click('#cfYes'); await esp(200);

// Ficha del equipo: hojas de Entregas, compartir
await page.click('#tabEq'); await page.fill('#qEq', ''); await page.dispatchEvent('#qEq', 'input'); await page.locator('#eqList .card', { hasText: '5CD1234ABC' }).click(); await page.waitForSelector('#eqSheet:not([hidden])');
await page.waitForSelector('#eqHojas .hoja-ent', { timeout: 8000 }).catch(() => {});
const hoja = page.locator('#eqHojas .hoja-ent');
log('E1. la ficha muestra la hoja de Entregas del equipo', await hoja.count() === 1 && (await hoja.innerText()).includes('Ana Gómez') && (await page.textContent('#eqHojasTit')).includes('1'));
log('E2. la hoja se abre en Entregas', (await hoja.getAttribute('href')) === '../entregas/?hoja=e-semilla');
await page.locator('#eqCompartir [data-wa]').click();
let ab = await abiertos();
log('E3. Compartir por WhatsApp abre wa.me con el resumen', ab.length === 1 && ab[0].startsWith('https://wa.me/?text=') && decodeURIComponent(ab[0]).includes('Equipo 5CD1234ABC') && decodeURIComponent(ab[0]).includes('AnyDesk: 123 456 789'), ab.join(' | '));
await page.locator('#eqCompartir [data-copiar-txt]').click(); await esp(200);
log('E4. Copiar resumen', (await page.evaluate(() => navigator.clipboard.readText())).includes('Asignado a: Ana Gómez'));
await axe(page, 'ficha con hojas de Entregas');

// Programar desde la ficha: acciones rápidas y atajos de fecha
await page.click('#eqProg'); await page.waitForSelector('#mtSheet:not([hidden])');
log('P1. atajos de fecha debajo de la fecha', await page.locator('#mtFechaRap .chip').count() === 5);
await page.locator('#mtFechaRap [data-dias="1"]').click();
log('P2. "Mañana" pone la fecha de mañana y queda marcado', (await page.inputValue('#mtFecha')) === masDias(1) && await page.locator('#mtFechaRap [data-dias="1"]').getAttribute('aria-pressed') === 'true');
await page.locator('#mtFechaRap [data-meses="1"]').click();
const mes = new Date(); mes.setHours(12); const d0 = mes.getDate(); mes.setDate(1); mes.setMonth(mes.getMonth() + 1); mes.setDate(Math.min(d0, new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()));
log('P3. "+1 mes"', (await page.inputValue('#mtFecha')) === iso(mes), await page.inputValue('#mtFecha'));
await page.locator('#mtFechaRap [data-dias="0"]').click();
log('P4. "Hoy"', (await page.inputValue('#mtFecha')) === masDias(0));
await page.fill('#mtFecha', masDias(3)); await page.dispatchEvent('#mtFecha', 'input');
log('P5. escribir la fecha a mano marca el atajo que coincide', await page.locator('#mtFechaRap [data-dias="3"]').getAttribute('aria-pressed') === 'true');
const acc = page.locator('#mtInfo .acc-rap');
log('P6. acciones rápidas: responsable, remoto, AnyDesk y WhatsApp', await acc.locator('[data-mt-resp]').count() === 1 && await acc.locator('[data-mt-tipo="remoto"]').count() === 1 && await acc.locator('a[href="anydesk:123456789"]').count() === 1 && await acc.locator('[data-mt-wa]').count() === 1);
await axe(page, 'programar con acciones rápidas');
await acc.locator('[data-mt-resp]').click();
log('P7. un toque pone como responsable a quien tiene el equipo', (await page.inputValue('#mtResp')) === 'Ana Gómez' && !(await page.locator('#mtInfo [data-mt-resp]').count()));
await page.locator('#mtInfo [data-mt-tipo="remoto"]').click();
log('P8. un toque lo pasa a remoto (tiene AnyDesk)', await page.locator('#mtTipo [data-tipo="remoto"]').getAttribute('aria-pressed') === 'true' && (await page.inputValue('#mtAnydesk')).replace(/\D/g, '') === '123456789');
await page.locator('#mtInfo [data-copiar]').click(); await esp(200);
log('P9. copiar el AnyDesk', (await page.evaluate(() => navigator.clipboard.readText())) === '123456789');
await page.locator('#mtInfo [data-mt-wa]').click();
ab = await abiertos();
log('P10. avisar por WhatsApp a quien lo tiene: que lo deje prendido', decodeURIComponent(ab[ab.length - 1]).includes('Hola Ana') && decodeURIComponent(ab[ab.length - 1]).includes('déjalo prendido'), decodeURIComponent(ab[ab.length - 1]));
await page.click('#mtGuardar'); await esp(400);
const s1 = await fsDe(page);
const t2 = Object.values(s1).find(v => v && v.serial === '5CD1234ABC' && v.tipo === 'remoto' && v.estado === 'pendiente');
log('P11. la tarea se guarda con la fecha, el tipo y el responsable', t2 && t2.fecha === masDias(3) && t2.resp === 'Ana Gómez', JSON.stringify(t2));

// Agenda: WhatsApp desde la tarjeta y Sugeridos con AnyDesk
await page.click('#tabMt'); await page.waitForSelector('#mtList .card');
await page.locator('#mtList .card', { hasText: 'PF2XYZ01' }).locator('[data-t-wa]').click();
ab = await abiertos();
log('A1. recordatorio de la tarea por WhatsApp (mañana, prendido, AnyDesk)', /mañana/.test(decodeURIComponent(ab[ab.length - 1])) && decodeURIComponent(ab[ab.length - 1]).includes('AnyDesk: 987 654 321'), decodeURIComponent(ab[ab.length - 1]));
await page.locator('#sumMt [data-filtro="sug"]').click(); await esp(200);
const sug = page.locator('#mtList .card.sug', { hasText: 'VB009911' });
log('A2. Sugeridos con AnyDesk: abrir, copiar y "Programar remoto"', await sug.locator('a[href="anydesk:555666777"]').count() === 1 && await sug.locator('[data-tipo="remoto"]').count() === 1);
await sug.locator('[data-tipo="remoto"]').click(); await page.waitForSelector('#mtSheet:not([hidden])');
log('A3. "Programar remoto" abre la hoja con remoto ya escogido', await page.locator('#mtTipo [data-tipo="remoto"]').getAttribute('aria-pressed') === 'true' && (await page.inputValue('#mtSerial')) === 'VB009911');
await axe(page, 'programar remoto desde Sugeridos');
await page.click('#mtCancel'); if (await page.locator('#cfSheet').isVisible()) await page.click('#cfYes');

// Recibido: compartir que está listo
await page.click('#tabRec'); await page.fill('#qRec', ''); await page.dispatchEvent('#qRec', 'input'); await page.locator('#recList .card', { hasText: 'R58N90AB' }).locator('[data-rec]').click(); await page.waitForSelector('#rcSheet:not([hidden])');
await page.locator('#rcCompartir [data-wa]').click();
ab = await abiertos();
log('R1. recibido: avisar por WhatsApp con lo que falta', decodeURIComponent(ab[ab.length - 1]).includes('Hola María') && decodeURIComponent(ab[ab.length - 1]).includes('Falta: backup'), decodeURIComponent(ab[ab.length - 1]));
await page.click('#rcCancel');

// Abrir la hoja desde Equipos: Entregas la muestra
await page.goto(URL + '/entregas/?hoja=e-semilla');
await page.waitForSelector('#enSheet:not([hidden])', { timeout: 10000 }).catch(() => {});
log('H1. Entregas abre directo la hoja que se tocó en Equipos', await page.locator('#enSheet').isVisible() && (await page.textContent('#enTitle')) === 'Ana Gómez');
await page.click('#enCancel'); await esp(150);

// ======================= ENTREGAS =======================
console.log('\n— Entregas');
log('S0. hasta 100 páginas a la vez', await page.evaluate(() => MAX_PAGINAS) === 100);
await page.click('#tabSub');
await page.setInputFiles('#archivo', [`${FOTOS}/hoja1.jpg`, `${FOTOS}/hoja2.jpg`, `${FOTOS}/galeria-1.jpg`]);
await page.waitForSelector('#subList .card.pag >> nth=2');
const origenes = () => page.$$eval('#subList .card.pag .pag-cab .meta', l => l.map(x => x.textContent));
log('M1. la primera no se puede subir más y la última no se puede bajar', await page.locator('[data-mover="0"][data-dir="-1"]').isDisabled() && await page.locator('[data-mover="2"][data-dir="1"]').isDisabled());
await page.locator('[data-mover="2"][data-dir="-1"]').click();
log('M2. mover la página 3 antes: queda de segunda', JSON.stringify(await origenes()) === JSON.stringify(['hoja1.jpg', 'galeria-1.jpg', 'hoja2.jpg']), JSON.stringify(await origenes()));
log('M3. el foco sigue en el botón de la página movida', await page.evaluate(() => document.activeElement && document.activeElement.dataset.mover === '1'));
await page.locator('#subList [data-i="1"] [data-k="unir"]').check(); await esp(100);
await page.locator('[data-mover="1"][data-dir="-1"]').click();
log('M4. una página unida que queda de primera ya no queda unida', JSON.stringify(await origenes()) === JSON.stringify(['galeria-1.jpg', 'hoja1.jpg', 'hoja2.jpg']) && !(await page.evaluate(() => lote[0].unir)));

// Sugerencias por persona
await page.fill('#l0n', 'Ana Gomez'); await esp(150);
const box0 = page.locator('#subList [data-i="0"] [data-sug-box]');
log('G1. al escribir el nombre sugiere los equipos que tiene asignados en Equipos', await box0.isVisible() && await box0.locator('[data-sug-serial="5CD1234ABC"]').count() === 1);
await axe(page, 'subir con sugerencias y mover páginas');
await box0.locator('[data-sug-serial="5CD1234ABC"]').click();
log('G2. un toque lo agrega con su tipo, marca y modelo', (await page.locator('#subList [data-i="0"] [data-eq-k="serial"]').first().inputValue()) === '5CD1234ABC' && (await page.locator('#subList [data-i="0"] [data-eq-k="marca"]').first().inputValue()) === 'HP');
log('G3. ya no lo vuelve a sugerir', !(await page.locator('#subList [data-i="0"] [data-sug-serial="5CD1234ABC"]').count()));
await page.fill('#l1n', 'Bodega'); await esp(100);
log('G4. a Bodega no le sugiere nada', await page.locator('#subList [data-i="1"] [data-sug-box]').isHidden());

// Escanear serial en una página
await escanearCon('#subList [data-i="1"] [data-scan-eq]', CODE_GPS);
log('C1. "Escanear serial" agrega el equipo a la página', (await page.locator('#subList [data-i="1"] [data-eq-k="serial"]').first().inputValue()) === 'GPS778812' && (await page.locator('#subList [data-i="1"] [data-eq-k="marca"]').first().inputValue()) === 'Garmin');
await page.fill('#l1n', 'Luis Pérez'); await page.selectOption('#l1t', 'otro');
await page.fill('#l2n', 'Carlos Ipuana'); await page.selectOption('#l2t', 'otro');

// Guardar: las 3 páginas suben a la vez
// Cuenta cuántos trozos están subiendo al mismo tiempo (cada uno tarda 60 ms en el Firebase falso).
await page.evaluate(async () => {
  const db = await window.claude.use('db'); let ahora = 0; window.__max = 0;
  DB = { collection(n) {
    const c = db.collection(n); if (n !== 'archivos') return c;
    return Object.assign({}, c, { doc(id) { const d = c.doc(id); return Object.assign({}, d, { async set(x) { ahora++; window.__max = Math.max(window.__max, ahora); await new Promise(r => setTimeout(r, 60)); try { return await d.set(x); } finally { ahora--; } } }); } });
  } };
});
await page.click('#subGuardar'); await page.waitForSelector('#entList .card.hoja >> nth=3', { timeout: 20000 }).catch(() => {});
await esp(400);
let s2 = await fsDe(page);
const hojas = Object.entries(s2).filter(([k]) => k.startsWith(BE + '/entregas/')).map(([k, v]) => [k.split('/').pop(), v]);
const nuevas = hojas.filter(([id]) => id !== 'e-semilla');
log('U1. se guardan las 3 hojas', nuevas.length === 3, String(nuevas.length));
log('U2. las páginas subieron al mismo tiempo (varias a la vez)', await page.evaluate(() => window.__max) >= 3, String(await page.evaluate(() => window.__max)));
log('U3. cada página tiene todos sus trozos', nuevas.every(([id, h]) => h.paginas.every((p, pi) => Array.from({ length: p.trozos }, (_, c) => s2[`${BE}/archivos/${id}_${pi}_${c}`]).every(Boolean))));
const ana = nuevas.find(([, h]) => h.nombre === 'Ana Gomez');
log('U4. la hoja guarda el equipo sugerido', ana && ana[1].equipos.some(q => q.serial === '5CD1234ABC'));

// Hoja guardada: sugerencias, escanear y agregar página
if (await page.locator('#cfSheet').isVisible()) { log('U5. al terminar muestra lo que cambió en Equipos', (await page.textContent('#cfTitle')) === 'Equipos actualizado'); await page.click('#cfYes'); await esp(150); }
await page.locator('#entList .card.hoja', { hasText: 'Luis Pérez' }).click(); await page.waitForSelector('#enSheet:not([hidden])');
await page.fill('#enNombre', 'Ana Gómez'); await esp(100);
log('V1. en la hoja guardada también sugiere los equipos de la persona', await page.locator('#enSug [data-sug-serial="5CD1234ABC"]').count() === 1);
await page.locator('#enSug [data-sug-serial="5CD1234ABC"]').click();
log('V2. un toque lo agrega a la hoja', (await page.$$eval('#enEqs [data-eq-k="serial"]', l => l.map(x => x.value))).includes('5CD1234ABC'));
await page.fill('#enNombre', 'Luis Pérez');
const eqs0 = await page.$$eval('#enEqs [data-eq-k="serial"]', l => l.map(x => x.value));
await page.locator('#enEqs [data-eq-del]').nth(eqs0.indexOf('5CD1234ABC')).click();
await axe(page, 'hoja guardada con agregar página');
const antes = (await fsDe(page))[`${BE}/entregas/${nuevas.find(([, h]) => h.nombre === 'Luis Pérez')[0]}`];
await page.setInputFiles('#enArchivo', [`${FOTOS}/hoja2.jpg`]);
await page.waitForFunction(() => /agregada/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 }).catch(() => {});
await esp(400);
const idL = nuevas.find(([, h]) => h.nombre === 'Luis Pérez')[0];
s2 = await fsDe(page);
const despues = s2[`${BE}/entregas/${idL}`];
log('V3. "Agregar foto o PDF" suma la página al final de la hoja', despues.paginas.length === antes.paginas.length + 1 && !!s2[`${BE}/archivos/${idL}_${antes.paginas.length}_0`], (await toastTxt(page)));
await page.waitForSelector(`#enPaginas [data-pv="${antes.paginas.length}"] img:not(.borrosa)`, { timeout: 10000 }).catch(() => {});
log('V4. la página nueva se ve en la hoja abierta', await page.locator(`#enPaginas [data-pv="${antes.paginas.length}"] img:not(.borrosa)`).count() === 1);
log('V5. agregar la página no borró lo que se estaba escribiendo', (await page.inputValue('#enNombre')) === 'Luis Pérez');
await page.click('#enCancel'); if (await page.locator('#cfSheet').isVisible()) await page.click('#cfYes'); await esp(200);

// Importar una copia grande por lotes (cada trozo pesa hasta 700 KB; Firestore no acepta lotes de más de 10 MB)
await page.click('#tabDb');
const copia = { app: 'entregas', fecha: new Date().toISOString(), colecciones: { entregas: { 'e-imp': { nombre: 'Importada', paginas: [] } }, archivos: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`e-imp_${i}_0`, { e: 'e-imp', p: i, c: 0, n: 1, d: 'A'.repeat(690000) }])) } };
await page.evaluate(() => { window.__lotes = []; window.__fsSoloContar = true; });
await page.setInputFiles('#archivoCopia', { name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(copia)) });
await page.waitForSelector('#cfSheet:not([hidden])'); await page.click('#cfYes');
await page.waitForFunction(() => /Copia importada/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 }).catch(() => {});
let lotes = await page.evaluate(() => window.__lotes);
log('I1. los trozos de 700 KB se importan en lotes de menos de 10 MB', lotes.length >= 3 && lotes.every(l => l.bytes < 9e6) && lotes.reduce((a, l) => a + l.n, 0) === 26, JSON.stringify(lotes));
log('I2. unos 10 trozos por lote', Math.max(...lotes.map(l => l.n)) <= 11);
const chica = { app: 'entregas', fecha: new Date().toISOString(), colecciones: { entregas: Object.fromEntries(Array.from({ length: 900 }, (_, i) => [`x${i}`, { nombre: 'P' + i }])) } };
await page.evaluate(() => { window.__lotes = []; });
await page.setInputFiles('#archivoCopia', { name: 'copia2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(chica)) });
await page.waitForSelector('#cfSheet:not([hidden])'); await page.click('#cfYes');
await page.waitForFunction(() => /Copia importada: 900/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 }).catch(() => {});
lotes = await page.evaluate(() => window.__lotes);
log('I3. registros pequeños: lotes de hasta 400', lotes.length === 3 && lotes.every(l => l.n <= 400), JSON.stringify(lotes.map(l => l.n)));
await page.evaluate(() => { window.__fsSoloContar = false; window.__lotes = null; });

// Tema oscuro: accesibilidad de las pantallas nuevas
{
  const errO = [], o = await pagina(br, { semilla: sem, errores: errO, tema: 'dark' }), po = o.page;
  await o.ctx.addInitScript(() => { window.open = () => null; window.__codigosSinNativo = true; });
  const axeO = async n => { await esp(350); await po.addScriptTag({ content: AXE_JS }); const r = await po.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(x => x.target.join(' ')).join(' | ')}`)); log(`axe sin fallas (oscuro): ${n}`, !r.length, r.join('\n      ')); };
  await po.goto(URL + '/equipos/'); await po.waitForSelector('#recList .card'); await esp(300);
  await po.click('#tabEq'); await po.locator('#eqList .card', { hasText: '5CD1234ABC' }).click(); await po.waitForSelector('#eqHojas .hoja-ent', { timeout: 8000 }).catch(() => {});
  await axeO('ficha con hojas y compartir');
  await po.click('#eqProg'); await po.waitForSelector('#mtSheet:not([hidden])'); await po.locator('#mtFechaRap [data-dias="1"]').click();
  await axeO('programar con atajos y acciones rápidas');
  await po.click('#mtCancel'); if (await po.locator('#cfSheet').isVisible()) await po.click('#cfYes');
  await po.click('#tabMt'); await po.waitForSelector('#mtList .card'); await axeO('agenda con WhatsApp');
  await po.click('#tabEq'); await po.locator('[data-scan="qEq"]').click(); await po.waitForSelector('.cod-sin:not([hidden])', { timeout: 30000 }); await axeO('lector de códigos');
  await po.keyboard.press('Escape');
  await po.goto(URL + '/entregas/'); await po.waitForSelector('#entList .card'); await po.click('#tabSub');
  await po.setInputFiles('#archivo', [`${FOTOS}/hoja1.jpg`, `${FOTOS}/hoja2.jpg`]); await po.waitForSelector('#subList .card.pag >> nth=1');
  await po.fill('#l0n', 'Ana Gómez'); await esp(100); await axeO('subir con sugerencias');
  log('sin errores en la página (oscuro)', !errO.length, errO.join(' | '));
  await o.ctx.close();
}

const raros = err.filter(x => !/externo: https:\/\/wa\.me/.test(x));
log('sin errores en la página', !raros.length, raros.join(' | '));
await br.close(); srv.close(); fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
