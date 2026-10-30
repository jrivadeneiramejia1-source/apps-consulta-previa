// Pruebas de Equipos y Entregas con Firebase falso. Uso: node pruebas/prueba.mjs [carpeta-de-capturas]
import fs from 'node:fs';
import { chromium, lanzar, AXE_JS, FOTOS, SALIDA, servir, pagina, semillaEquipos, huella } from './banco.mjs';

const OUT = process.argv[2] || SALIDA;
const AXE = AXE_JS;
const URL = 'http://127.0.0.1:8811';
let ok = 0, mal = 0;
const fallas = [];
function chequear(cond, nombre) { if (cond) ok++; else { mal++; fallas.push(nombre); console.log('  FALLA:', nombre); } }
const espera = ms => new Promise(r => setTimeout(r, ms));
const store = page => page.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso') || '{}'));
const visible = (page, sel) => page.locator(sel).isVisible();
async function axe(page, nombre) {
  await espera(450);   // deja terminar las animaciones de entrada
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
  chequear(!r.length, `axe sin fallas: ${nombre}${r.length ? '\n     ' + r.join('\n     ') : ''}`);
}
async function sinDesborde(page, nombre) {
  const r = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  chequear(r[0] <= r[1], `sin desplazamiento lateral: ${nombre} (${r[0]} > ${r[1]})`);
}
// El foco pasa a la hoja en el siguiente cuadro (requestAnimationFrame): se espera hasta 2 s antes de revisarlo.
async function enfocadoDentro(page, sel) {
  return page.waitForFunction(s => { const el = document.querySelector(s); return !!el && el.contains(document.activeElement); }, sel, { timeout: 2000 }).then(() => true, () => false);
}

const srv = await servir();
const br = await lanzar();

for (const tema of ['light', 'dark']) {
  console.log(`\n=== EQUIPOS (${tema}) ===`);
  const err = [];
  const { ctx, page } = await pagina(br, { tema, semilla: semillaEquipos(), errores: err });
  const H = huella('equipos', 'prueba123'), B = `espacios/${H}`;
  await page.goto(URL + '/equipos/'); await page.waitForSelector('#recList .card.rec');
  chequear(await page.locator('#recList .card.rec').count() === 3, 'recibidos: 3 tarjetas');
  const ordenRec = (await page.locator('#recList .card.rec').allTextContents()).map(t => ['NUEVO7788', 'R58N90AB', '5CD1234ABC'].find(x => t.includes(x)));
  chequear(ordenRec.join() === 'NUEVO7788,R58N90AB,5CD1234ABC', `recibidos: el más nuevo arriba (${ordenRec})`);
  const marcas = await page.evaluate(() => ['m-hp', 'm-samsung', 'm-dell'].map(k => document.querySelectorAll(`#recList .ico.con-marca .marca.${k} svg path`).length));
  chequear(marcas.join() === '1,1,1', `recibidos: logo de la marca sobre el ícono (HP, Samsung, Dell: ${marcas})`);
  const mx = await page.evaluate(() => ({ modelo: (marcaDe('', 'ThinkPad E14') || {}).k, ini: marcaIco('Starlink'), dos: marcaIco('Western Digital'), vacia: marcaIco(''), lg: (marcaDe('Algo') || {}).k }));
  chequear(mx.modelo === 'lenovo' && mx.ini.includes('>ST<') && mx.dos.includes('>WD<') && mx.vacia === '' && !mx.lg, `marcas: por el modelo, iniciales si no hay logo y nada si no hay marca (${JSON.stringify(mx)})`);
  chequear((await page.textContent('#subtitulo')).includes('8 equipos · 3 en espera'), 'subtítulo con cifras');
  chequear(await page.locator('#badgeRec').textContent() === '3', 'insignia de recibidos = 3');
  chequear(await page.locator('.tab svg.ph').count() >= 6, 'iconos Phosphor en la barra');
  chequear(await page.locator('#recList svg.ph').count() > 5, 'iconos Phosphor en tarjetas');
  if (tema === 'light') await page.screenshot({ path: `${OUT}/e1-recibidos.png` }); else await page.screenshot({ path: `${OUT}/e1-recibidos-oscuro.png` });
  await axe(page, `equipos recibidos ${tema}`);
  await sinDesborde(page, 'equipos recibidos ' + tema);

  // botón de tema: automático → claro → oscuro → automático
  const fondo = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const otro = tema === 'light' ? 'dark' : 'light', CLARO = 'rgb(244, 241, 232)', OSCURO = 'rgb(10, 27, 28)';
  chequear(await page.locator('#btnTema svg.ph').count() === 1 && (await page.getAttribute('#btnTema', 'aria-label')).startsWith('Tema automático'), 'botón de tema en automático');
  await page.click('#btnTema'); await espera(80);
  chequear(await page.evaluate(() => document.documentElement.dataset.theme) === 'light' && await fondo() === CLARO, 'tema claro a mano');
  await page.click('#btnTema'); await espera(80);
  chequear(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark' && await fondo() === OSCURO, 'tema oscuro a mano');
  chequear(await page.getAttribute('meta[name="theme-color"]', 'content') === '#0D3B37', 'barra del teléfono del color del tema');
  await axe(page, `tema oscuro a mano (${tema})`);
  await page.reload(); await page.waitForSelector('#recList .card.rec');
  chequear(await fondo() === OSCURO, 'el tema escogido se mantiene al volver a abrir');
  await page.click('#btnTema'); await espera(80);
  chequear(!(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))) && await fondo() === (tema === 'light' ? CLARO : OSCURO), 'vuelve a automático');
  await page.click('#btnTema'); await espera(80);
  await axe(page, `tema claro a mano (${tema})`);
  await page.click('#btnTema'); await page.click('#btnTema'); await espera(80);
  chequear(!(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))), 'deja el tema en automático');

  // tablero tocable
  await espera(900);
  chequear(await page.locator('#sumRec [data-k="rEsp"]').textContent() === '3', 'la cifra termina de contar en su valor real');
  await page.click('#sumRec [data-filtro="sinmtto"]'); await espera(80);
  chequear(await page.locator('#sumRec [data-filtro="sinmtto"]').getAttribute('aria-pressed') === 'true' && await page.locator('#chipsRec [data-f="sinmtto"]').getAttribute('aria-pressed') === 'true', 'tocar una cifra filtra y marca el chip');
  chequear(await page.locator('#recList .card.rec').count() === 2, 'cifra Sin mantenimiento muestra 2');
  await page.click('#sumRec [data-filtro="sinmtto"]'); await espera(80);
  chequear(await page.locator('#chipsRec [data-f="pendientes"]').getAttribute('aria-pressed') === 'true', 'tocarla otra vez vuelve a En espera');
  chequear((await page.locator('#toast').count()) === 1, 'aviso existe');
  // filtros y búsqueda
  await page.click('#chipsRec [data-f="sinbackup"]');
  chequear(await page.locator('#recList .card.rec').count() === 3, 'filtro sin backup');
  await page.click('#chipsRec [data-f="pendientes"]');
  await page.fill('#qRec', 'epieyu'); await espera(100);
  chequear(await page.locator('#recList .card.rec').count() === 1, 'búsqueda sin tildes');
  await page.fill('#qRec', 'zzzz'); await espera(100);
  chequear(await page.locator('#recList .empty-state').count() === 1, 'estado vacío al no haber coincidencias');
  await page.fill('#qRec', '');
  await page.locator('#qRec').blur(); await espera(100);

  // marcar mantenimiento hecho en r-1
  await page.click('[data-rid="r-1"][data-tarea="mtto"][data-v="hecho"]'); await espera(150);
  let s = await store(page);
  chequear(s[`${B}/recibidos/r-1`].mtto === 'hecho' && !!s[`${B}/recibidos/r-1`].mttoFecha, 'mantenimiento marcado hecho con fecha');
  chequear(await page.textContent('#toast') === 'Mantenimiento marcado como hecho', 'aviso al marcar');

  // r-2: backup hecho → pregunta pasar → pasar
  await page.click('[data-rid="r-2"][data-tarea="backup"][data-v="hecho"]'); await page.waitForSelector('#cfSheet:not([hidden])');
  chequear((await page.textContent('#cfTitle')).includes('R58N90AB') && await page.locator('#cfOpc [value="María Epieyú"]').isChecked(), 'pregunta pasar y propone a la persona del registro');
  chequear(await enfocadoDentro(page, '#cfSheet'), 'foco dentro de la confirmación');
  if (tema === 'light') await page.screenshot({ path: `${OUT}/e2-confirmar.png` });
  await axe(page, `confirmación ${tema}`);
  await page.click('#cfYes'); await espera(300);
  s = await store(page);
  chequear(s[`${B}/recibidos/r-2`].cerrado === true, 'r-2 cerrado');
  chequear(s[`${B}/equipos/R58N90AB`].asignado === 'María Epieyú', 'equipo asignado a María');

  // r-3 (equipo nuevo) con el botón Listo
  await page.click('[data-listo="r-3"]'); await page.waitForSelector('#cfSheet:not([hidden])');
  chequear((await page.textContent('#cfText')).includes('se agrega como equipo nuevo'), 'aviso de equipo nuevo');
  await page.click('#cfYes'); await espera(300);
  s = await store(page);
  chequear(s[`${B}/equipos/NUEVO7788`] && s[`${B}/equipos/NUEVO7788`].asignado === 'Carlos Ipuana', 'equipo nuevo creado y asignado');

  // registrar recibido con serial conocido (autollenado)
  await page.click('#btnNewRec'); await page.waitForSelector('#rcSheet:not([hidden])'); await espera(80);
  chequear(await enfocadoDentro(page, '#rcSheet'), 'foco dentro de la hoja al abrir');
  await page.fill('#rcSerial', 'PF2XYZ01'); await espera(80);
  chequear((await page.textContent('#rcConocido')).includes('Equipo ya registrado'), 'serial conocido');
  chequear(await page.inputValue('#rcMarca') === 'Lenovo', 'autollenado de marca');
  await page.click('#rcAcc [data-acc="Cargador"]'); await espera(300);
  if (tema === 'light') await page.screenshot({ path: `${OUT}/e3-registrar.png` });
  await axe(page, `hoja registrar ${tema}`);
  // Tab no sale de la hoja
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  chequear(await enfocadoDentro(page, '#rcSheet'), 'el foco no sale de la hoja con Tab');
  // Escape con cambios → pregunta
  await page.keyboard.press('Escape'); await espera(80);
  chequear(await visible(page, '#cfSheet') && (await page.textContent('#cfTitle')) === 'Descartar cambios', 'Escape con cambios pregunta antes');
  await page.keyboard.press('Escape'); await espera(80);
  chequear(!(await visible(page, '#cfSheet')) && await visible(page, '#rcSheet'), 'Escape cierra solo la confirmación');
  await page.click('#rcGuardar'); await espera(200);
  chequear(!(await visible(page, '#rcSheet')), 'hoja cerrada al guardar');
  s = await store(page);
  const nuevo = Object.entries(s).find(([k, v]) => k.includes('/recibidos/') && v.serial === 'PF2XYZ01');
  chequear(nuevo && nuevo[1].acc.includes('Cargador') && nuevo[1].persona === 'Bodega', 'recibido guardado con accesorios y persona');
  chequear(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'btnNewRec', 'foco vuelve al botón que abrió la hoja');

  // serial repetido en espera
  await page.click('#btnNewRec'); await page.fill('#rcSerial', '5CD1234ABC'); await page.click('#rcGuardar'); await espera(80);
  chequear(await visible(page, '#rcErr') && (await page.textContent('#rcErr')).includes('ya está en espera'), 'no deja repetir un serial en espera');
  await page.click('#rcCancel'); await page.waitForSelector('#cfSheet:not([hidden])'); await page.click('#cfYes'); await espera(80);
  chequear(!(await visible(page, '#rcSheet')), 'Descartar cierra la hoja');

  // abrir y cerrar sin cambios: no pregunta
  await page.click('[data-rec="r-1"]'); await page.waitForSelector('#rcSheet:not([hidden])');
  await page.click('#rcCancel'); await espera(80);
  chequear(!(await visible(page, '#rcSheet')) && !(await visible(page, '#cfSheet')), 'cerrar sin cambios no pregunta');

  // pestaña Equipos
  await page.click('#tabEq'); await page.waitForSelector('#eqList .card');
  chequear(await page.locator('#eqList .grupo').count() >= 5, 'equipos agrupados por tipo');
  await page.click('#sumEq [data-filtro="asignados"]'); await espera(80);
  { const sx = await store(page); const n = Object.entries(sx).filter(([k, v]) => k.startsWith(B + '/equipos/') && v.asignado && !/bodega/i.test(v.asignado)).length;
    chequear(n > 0 && await page.locator('#eqList .card').count() === n && Number(await page.locator('#sumEq [data-k="eAsi"]').textContent()) === n, `cifra Asignados a personas filtra (${n})`); }
  await page.click('#sumEq [data-filtro="asignados"]'); await espera(80);
  await page.click('#sumEq [data-filtro="bodega"]'); await espera(80);
  chequear(await page.locator('#eqList .card').count() === 3 && await page.inputValue('#fEqEst') === 'bodega', 'cifra En bodega filtra');
  await page.click('#sumEq [data-filtro="bodega"]'); await espera(80);
  chequear(await page.inputValue('#fEqEst') === 'todos', 'tocarla otra vez quita el filtro');
  await page.fill('#qEq', 'garmin'); await espera(100);
  chequear(await page.locator('#eqList .card').count() === 1, 'búsqueda de equipos');
  await page.fill('#qEq', ''); await page.selectOption('#fEqEst', 'bodega'); await espera(100);
  chequear(await page.locator('#eqList .card').count() === 3, 'filtro bodega');
  await page.selectOption('#fEqEst', 'todos');
  if (tema === 'light') await page.screenshot({ path: `${OUT}/e4-equipos.png` });
  await axe(page, `equipos lista ${tema}`);
  await sinDesborde(page, 'equipos lista ' + tema);
  await page.click('[data-eq="GPS778812"]'); await page.waitForSelector('#eqSheet:not([hidden])');
  await page.fill('#eqAsignado', 'Luis Pérez Uriana'); await page.click('#eqGuardar'); await espera(150);
  s = await store(page);
  chequear(s[`${B}/equipos/GPS778812`].asignado === 'Luis Pérez Uriana', 'editar equipo guarda');
  await page.click('#btnNewEq'); await page.waitForSelector('#eqSheet:not([hidden])');
  await page.fill('#eqSerial', 'abc 999'); await page.click('#eqGuardar'); await espera(80);
  chequear((await page.textContent('#eqErr')) === 'Escribe el tipo de equipo.', 'pide el tipo');
  await page.fill('#eqTipo', 'Monitor'); await page.click('#eqGuardar'); await espera(150);
  s = await store(page);
  chequear(s[`${B}/equipos/ABC999`] && s[`${B}/equipos/ABC999`].tipo === 'Monitor', 'equipo nuevo agregado');
  await page.click('[data-eq="ABC999"]'); await page.click('#eqDel'); await page.waitForSelector('#cfSheet:not([hidden])'); await page.click('#cfYes'); await espera(150);
  s = await store(page);
  chequear(!s[`${B}/equipos/ABC999`], 'equipo eliminado');

  // Base de datos
  await page.click('#tabDb'); await page.waitForSelector('#dbTable table');
  const celda = page.locator('#dbTable tr[data-id="PF2XYZ01"] input[data-f="modelo"]');
  await celda.fill('ThinkPad E14 Gen 2'); await celda.press('Tab'); await espera(150);
  s = await store(page);
  chequear(s[`${B}/equipos/PF2XYZ01`].modelo === 'ThinkPad E14 Gen 2', 'editar celda guarda');
  await page.click('#segRec'); await espera(80);
  chequear(await page.locator('#dbTable tbody tr').count() === 4, 'tabla de recibidos');
  if (tema === 'light') await page.screenshot({ path: `${OUT}/e5-base.png`, fullPage: true });
  await axe(page, `base de datos ${tema}`);
  await sinDesborde(page, 'base de datos ' + tema);

  // nube: cambiar nombre con diálogo propio
  await page.click('#btnNombre'); await page.waitForSelector('.nube-dlg');
  chequear(await enfocadoDentro(page, '.nube-dlg'), 'foco en el diálogo de nombre');
  await axe(page, `diálogo de nombre ${tema}`);
  await page.fill('.nube-dlg input', '   '); await page.click('.nube-dlg [type=submit]'); await espera(50);
  chequear(await page.locator('.nube-dlg .err').isVisible(), 'nombre vacío muestra error dentro del diálogo');
  await page.keyboard.press('Escape'); await espera(50);
  chequear(await page.locator('.nube-dlg').count() === 0, 'Escape cierra el diálogo de nombre');
  await page.click('#btnNombre'); await page.fill('.nube-dlg input', 'Jeiler Rivadeneira');
  await Promise.all([page.waitForNavigation(), page.click('.nube-dlg [type=submit]')]);
  chequear(await page.evaluate(() => localStorage.getItem('nube_equipos_nombre')) === 'Jeiler Rivadeneira', 'nombre cambiado');
  await page.waitForSelector('#recList .card.rec');
  // salir y volver a entrar
  await page.click('#tabDb'); await page.click('#btnSalir'); await page.waitForSelector('#cfSheet:not([hidden])');
  await Promise.all([page.waitForNavigation(), page.click('#cfYes')]);
  await page.waitForSelector('#nubeClave');
  if (tema === 'light') await page.screenshot({ path: `${OUT}/e6-clave.png` });
  await axe(page, `pantalla de clave ${tema}`);
  await page.fill('#nubeK', '123'); await page.fill('#nubeN', 'Jeiler'); await page.click('#nubeEntrar');
  chequear((await page.textContent('#nubeErr')).includes('al menos 6'), 'clave corta avisa');
  await page.fill('#nubeK', 'prueba123'); await page.click('#nubeEntrar');
  await page.waitForSelector('#recList .card.rec');
  chequear(await page.locator('#nubeClave').count() === 0, 'entra con la clave correcta');

  chequear(!err.length, `sin errores ni diálogos nativos en Equipos ${tema}${err.length ? ': ' + err.join(' | ') : ''}`);
  await ctx.close();

  console.log(`\n=== ENTREGAS (${tema}) ===`);
  const err2 = [];
  // Comparten el teléfono: Equipos ya tiene datos con la misma clave, así que Entregas se conecta sola.
  const sem = semillaEquipos(); delete sem.nube_equipos_espacio;
  const p2 = await pagina(br, { tema, semilla: sem, errores: err2 });
  const pg = p2.page, HE = huella('entregas', 'prueba123'), BE = `espacios/${HE}`;
  await pg.goto(URL + '/entregas/'); await pg.waitForSelector('#nubeClave');
  await pg.fill('#nubeK', 'prueba123'); await pg.fill('#nubeN', 'Jeiler'); await pg.click('#nubeEntrar');
  await pg.waitForSelector('#nubeNueva:not([hidden])');
  await pg.click('#nubeNueva'); await pg.waitForSelector('#entList .empty-state');
  await espera(300);
  chequear(await pg.locator('#entEnlace').isHidden(), 'conectada sola con Equipos (misma clave)');
  if (tema === 'light') await pg.screenshot({ path: `${OUT}/n1-vacia.png` });
  await axe(pg, `entregas vacía ${tema}`);

  // subir dos fotos
  await pg.click('#tabSub');
  await pg.setInputFiles('#archivo', [`${FOTOS}/hoja1.jpg`, `${FOTOS}/hoja2.jpg`]);
  await pg.waitForSelector('#subList .card.pag >> nth=1');
  chequear(await pg.locator('#badgeSub').textContent() === '2', 'insignia de páginas sin guardar');
  await pg.fill('#l0n', 'Ana Gómez'); await pg.fill('#l0f', '2026-10-14');
  await pg.locator('#subList [data-i="0"] [data-eq-k="serial"]').fill('PF2XYZ01'); await espera(100);
  chequear((await pg.locator('#subList [data-i="0"] [data-eq-info]').textContent()).includes('asignado ahora a'), 'muestra el dueño actual en Equipos');
  await pg.fill('#l1n', 'Luis Pérez'); await pg.fill('#l1f', '2026-10-13'); await pg.selectOption('#l1t', 'devolucion');
  await pg.locator('#subList [data-i="1"] [data-eq-k="serial"]').fill('GPS778812');
  if (tema === 'light') await pg.screenshot({ path: `${OUT}/n2-subir.png`, fullPage: true });
  await axe(pg, `entregas subir ${tema}`);
  await sinDesborde(pg, 'entregas subir ' + tema);
  await pg.click('#subGuardar'); await pg.waitForSelector('#cfSheet:not([hidden])', { timeout: 15000 });
  chequear((await pg.textContent('#cfTitle')) === 'Equipos actualizado', 'resumen de Equipos actualizado');
  const txt = await pg.textContent('#cfText');
  chequear(txt.includes('asignado a Ana Gómez') && txt.includes('pendiente en Recibidos'), 'entrega asigna y devolución deja pendiente');
  await pg.click('#cfYes'); await pg.waitForSelector('#entList .card.hoja');
  let s2 = await store(pg);
  chequear(s2[`${B}/equipos/PF2XYZ01`].asignado === 'Ana Gómez', 'Equipos: PF2XYZ01 asignado a Ana');
  chequear(Object.values(s2).some(v => v && v.origen === 'entregas' && v.serial === 'GPS778812' && !v.cerrado), 'Equipos: GPS en Recibidos');
  chequear(await pg.locator('#entList .card.hoja').count() === 2, '2 hojas en la lista');
  await pg.click('#sumEnt [data-filtro="mes"]'); await espera(80);
  chequear(await pg.locator('#chipsEnt [data-f="mes"]').getAttribute('aria-pressed') === 'true', 'cifra De este mes filtra');
  await pg.click('#sumEnt [data-filtro="mes"]'); await espera(80);
  chequear(await pg.locator('#badgeSub').isHidden(), 'insignia se va al guardar');
  if (tema === 'light') await pg.screenshot({ path: `${OUT}/n3-hojas.png` }); else await pg.screenshot({ path: `${OUT}/n3-hojas-oscuro.png` });
  await axe(pg, `entregas hojas ${tema}`);
  await sinDesborde(pg, 'entregas hojas ' + tema);

  // abrir una hoja, ver página, visor, Escape por capas
  await pg.locator('#entList .card.hoja', { hasText: 'Ana Gómez' }).click(); await pg.waitForSelector('#enSheet:not([hidden])');
  await pg.waitForSelector('#enPaginas img:not(.borrosa)');
  chequear(await enfocadoDentro(pg, '#enSheet'), 'foco dentro de la hoja de registro');
  if (tema === 'light') await pg.screenshot({ path: `${OUT}/n4-registro.png` });
  await axe(pg, `registro de hoja ${tema}`);
  await pg.click('#enPaginas [data-pv="0"]'); await pg.waitForSelector('#visor:not([hidden])');
  await pg.keyboard.press('Escape'); await espera(80);
  chequear(await pg.locator('#visor').isHidden() && await visible(pg, '#enSheet'), 'Escape cierra el visor y deja la hoja');
  await pg.fill('#enCedula', '1122334455');
  await pg.keyboard.press('Escape'); await espera(80);
  chequear((await pg.textContent('#cfTitle')) === 'Descartar cambios' && await visible(pg, '#cfSheet'), 'pregunta antes de descartar cambios de la hoja');
  await pg.click('#cfNo'); await pg.click('#enGuardar'); await espera(200);
  s2 = await store(pg);
  chequear(Object.values(s2).some(v => v && v.nombre === 'Ana Gómez' && v.cedula === '1122334455'), 'cédula guardada');

  // desconectar y conectar con diálogo propio
  await pg.click('#tabDb'); await pg.click('#enlaceBtn [data-enlace="quitar"]'); await pg.waitForSelector('#cfSheet:not([hidden])');
  await Promise.all([pg.waitForNavigation(), pg.click('#cfYes')]);
  await pg.waitForSelector('#entList .card.hoja');
  chequear(await visible(pg, '#entEnlace'), 'aviso de no conectada');
  await pg.click('#entEnlace [data-enlace]'); await pg.waitForSelector('.nube-dlg');
  chequear(await pg.locator('.nube-dlg input[type=password]').count() === 1, 'la clave se escribe oculta');
  await axe(pg, `diálogo conectar ${tema}`);
  if (tema === 'light') await pg.screenshot({ path: `${OUT}/n5-conectar.png` });
  await pg.fill('.nube-dlg input[type=password]', 'otraclave'); await pg.click('.nube-dlg [type=submit]'); await espera(200);
  chequear((await pg.textContent('.nube-dlg .err')).includes('no hay datos de Equipos'), 'clave equivocada avisa dentro del diálogo');
  await pg.fill('.nube-dlg input[type=password]', 'prueba123');
  await Promise.all([pg.waitForNavigation(), pg.click('.nube-dlg [type=submit]')]);
  await pg.waitForSelector('#entList .card.hoja'); await espera(300);
  chequear(await pg.locator('#entEnlace').isHidden(), 'conectada otra vez');

  // eliminar hoja
  await pg.locator('#entList .card.hoja', { hasText: 'Luis Pérez' }).click(); await pg.waitForSelector('#enSheet:not([hidden])');
  await pg.click('#enDel'); await pg.waitForSelector('#cfSheet:not([hidden])'); await pg.click('#cfYes'); await espera(300);
  chequear(await pg.locator('#entList .card.hoja').count() === 1, 'hoja eliminada');
  s2 = await store(pg);
  chequear(!Object.keys(s2).some(k => k.startsWith(BE + '/archivos/') && s2[k].e && !Object.values(s2).some(v => v && v.nombre === 'Ana Gómez')), 'archivos de la hoja borrada');
  await pg.click('#tabDb'); await pg.waitForSelector('#dbTable table');
  await axe(pg, `entregas base ${tema}`);
  await sinDesborde(pg, 'entregas base ' + tema);
  chequear(!err2.length, `sin errores ni diálogos nativos en Entregas ${tema}${err2.length ? ': ' + err2.join(' | ') : ''}`);
  await p2.ctx.close();
}

// Escritorio
{
  const { ctx, page } = await pagina(br, { ancho: 1280, alto: 860, semilla: semillaEquipos() });
  await page.goto(URL + '/equipos/'); await page.waitForSelector('#recList .card.rec');
  await page.screenshot({ path: `${OUT}/d1-escritorio.png` });
  await page.click('[data-rec="r-1"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/d2-escritorio-hoja.png` });
  await sinDesborde(page, 'escritorio');
  await ctx.close();
}

// Evidencias sigue funcionando con el nube.js nuevo
console.log('\n=== EVIDENCIAS (humo) ===');
const err3 = [];
const p3 = await pagina(br, { semilla: { nube_evidencias_espacio: huella('evidencias', 'prueba123'), nube_evidencias_nombre: 'Jeiler' }, errores: err3 });
await p3.page.goto(URL + '/evidencias/'); await espera(1200);
chequear(await p3.page.locator('#nubeClave').count() === 0, 'evidencias abre');
await p3.page.evaluate(() => { nube.cambiarNombre(); }); await p3.page.waitForSelector('.nube-dlg');
chequear(true, 'evidencias usa el diálogo propio');
await p3.page.screenshot({ path: `${OUT}/v1-evidencias-dialogo.png` });
await p3.page.keyboard.press('Escape');
chequear(!err3.filter(e => !e.startsWith('externo: https://fonts')).filter(e => !e.includes('ERR_FAILED')).length, 'evidencias sin errores: ' + err3.join(' | '));
await p3.ctx.close();

await br.close(); srv.close();
console.log(`\n${ok} bien, ${mal} mal`);
if (mal) { console.log(fallas.join('\n')); process.exit(1); }
