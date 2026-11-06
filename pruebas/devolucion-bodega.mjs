// Versión 40: una devolución se ve en Bodega desde que la traen (no con el nombre de quien la devolvió).
// Versión 41: mientras espera, el título dice "Devolución · Bodega Riohacha" y la etiqueta dice qué está pendiente
// (mantenimiento, backup o los dos; el backup no se pide a impresoras ni a otros equipos sin backup). Al terminar dice Bodega.
// Versión 42: "Devuelto por [nombre]" se ve más (tamaño normal, nombre en negrita) y una entrega a una persona dice "Entrega a [nombre]".
// Uso: node pruebas/devolucion-bodega.mjs
/* global EQR, renderEnt */   // variables y funciones de la página de Entregas, usadas dentro de page.evaluate
import fs from 'node:fs';
import { lanzar, AXE_JS, SALIDA, servir, pagina, semillaEquipos, huella, require } from './banco.mjs';
const XLSX = require('xlsx');
const URL = 'http://127.0.0.1:8834', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const CLAVE = 'prueba123', B = `espacios/${huella('equipos', CLAVE)}`, BE = `espacios/${huella('entregas', CLAVE)}`;
async function axe(page, nombre) {
  await esp(350); await page.addScriptTag({ content: AXE_JS });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
  log(`axe sin fallas: ${nombre}`, !r.length, r.join('\n      '));
}
const fsDe = p => p.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso')));
const hoja = (nombre, tipo, serial, extra = {}) => Object.assign({ nombre, cedula: '', fecha: '2026-10-27', tipo, proyecto: '', equipos: serial ? [{ tipo: 'PC Portátil', serial }] : [], seriales: serial || '', nota: '', paginas: [{ trozos: 1, ancho: 1700, alto: 2200, bytes: 3, origen: 'semilla' }], miniatura: '', origen: 'semilla', subido: '2026-10-27T15:00:00.000Z', actualizado: '2026-10-27T15:00:00.000Z', por: 'Jeiler' }, extra);
const recibido = (serial, hojaId, mtto, backup, extra = {}) => Object.assign({ serial, tipo: 'PC Portátil', marca: '', modelo: '', persona: 'Bodega Riohacha', proyecto: '', fechaIngreso: '2026-10-27', mtto, mttoFecha: mtto === 'hecho' ? '2026-10-28' : '', backup, backupFecha: backup === 'hecho' ? '2026-10-29' : '', acc: [], obs: '', cerrado: false, cerradoEn: '', origen: 'entregas', hoja: hojaId, devueltoPor: '' }, extra);

const sem = semillaEquipos(CLAVE), F = sem.__fs_falso;
// Una hoja de cada caso. e-pend, e-parc, e-dos y e-sin siguen siendo Devolución; e-listo, e-na y e-cerr ya terminaron (Bodega).
const HOJAS = {
  'e-pend': hoja('Ginna Marcela Calvo Ocampo', 'devolucion', 'PEND0001', { recibidos: { PEND0001: 'r-pend' }, fecha: '2026-10-23' }),
  'e-parc': hoja('Pedro Parcial', 'devolucion', 'PARC0001', { recibidos: { PARC0001: 'r-parc' }, fecha: '2026-10-22' }),
  'e-listo': hoja('Laura Lista', 'devolucion', 'LIST0001', { recibidos: { LIST0001: 'r-listo' }, fecha: '2026-10-21' }),
  'e-na': hoja('Nora NoAplica', 'devolucion', 'NOAP0001', { recibidos: { NOAP0001: 'r-na' }, fecha: '2026-10-20' }),
  'e-cerr': hoja('Camilo Cerrado', 'devolucion', 'CERR0001', { recibidos: { CERR0001: 'r-cerr' }, fecha: '2026-10-19' }),
  'e-dos': hoja('Dora Dosequipos', 'devolucion', 'DOS00001', { recibidos: { DOS00001: 'r-dos1', DOS00002: 'r-dos2' }, equipos: [{ tipo: 'PC Portátil', serial: 'DOS00001' }, { tipo: 'GPS', serial: 'DOS00002' }], seriales: 'DOS00001, DOS00002', fecha: '2026-10-18' }),
  'e-sin': hoja('Sofía Sinenlace', 'devolucion', 'SIN00001', { fecha: '2026-10-17' }),
  'e-ent': hoja('Luis Pérez', 'entrega', 'GPS778812', { fecha: '2026-10-26' }),
  'e-bod': hoja('Bodega Riohacha', 'entrega', 'BOD00001', { fecha: '2026-10-25' }),
  'e-otro': hoja('Hoja Otra', 'otro', '', { fecha: '2026-10-24' }),
  'e-sn': hoja('', 'entrega', 'SN000001', { fecha: '2026-10-13' }),
  // v41: equipos que no llevan backup (impresora) y uno que sí (tablet)
  'e-imp': hoja('Iván Impresora', 'devolucion', 'IMP00001', { recibidos: { IMP00001: 'r-imp' }, equipos: [{ tipo: 'Impresora', serial: 'IMP00001' }], fecha: '2026-10-16' }),
  'e-imp2': hoja('Irene Impresora', 'devolucion', 'IMP00002', { recibidos: { IMP00002: 'r-imp2' }, equipos: [{ tipo: 'Impresora', serial: 'IMP00002' }], fecha: '2026-10-15' }),
  'e-tab': hoja('Tomás Tablet', 'devolucion', 'TAB00001', { recibidos: { TAB00001: 'r-tab' }, equipos: [{ tipo: 'Tablet', serial: 'TAB00001' }], fecha: '2026-10-14' })
};
for (const [id, h] of Object.entries(HOJAS)) { F[`${BE}/entregas/${id}`] = h; F[`${BE}/archivos/${id}_0_0`] = { d: 'AAAA' }; }
F[`${B}/recibidos/r-pend`] = recibido('PEND0001', 'e-pend', 'pend', 'pend');
F[`${B}/recibidos/r-parc`] = recibido('PARC0001', 'e-parc', 'hecho', 'pend');
F[`${B}/recibidos/r-listo`] = recibido('LIST0001', 'e-listo', 'hecho', 'hecho');
F[`${B}/recibidos/r-na`] = recibido('NOAP0001', 'e-na', 'hecho', 'na');
F[`${B}/recibidos/r-cerr`] = recibido('CERR0001', 'e-cerr', 'hecho', 'hecho', { cerrado: true, cerradoEn: '2026-10-30T15:00:00.000Z' });   // de antes: sin "cerradoA", la hoja no se convierte sola
F[`${B}/recibidos/r-dos1`] = recibido('DOS00001', 'e-dos', 'hecho', 'hecho');
F[`${B}/recibidos/r-dos2`] = recibido('DOS00002', 'e-dos', 'hecho', 'pend');
F[`${B}/recibidos/r-imp`] = recibido('IMP00001', 'e-imp', 'pend', 'pend', { tipo: 'Impresora Portátil' });   // el backup no se le pide a una impresora
F[`${B}/recibidos/r-imp2`] = recibido('IMP00002', 'e-imp2', 'hecho', 'pend', { tipo: 'Impresora Portátil' });   // mantenimiento hecho: ya está lista aunque el backup siga en pendiente
F[`${B}/recibidos/r-tab`] = recibido('TAB00001', 'e-tab', 'hecho', 'pend', { tipo: 'Tablet' });
Object.assign(sem, { nube_entregas_espacio: huella('entregas', CLAVE), nube_entregas_nombre: 'Jeiler', nube_equipos_enlace_entregas: huella('entregas', CLAVE), nube_entregas_enlace_equipos: huella('equipos', CLAVE) });

const srv = await servir(8834); const br = await lanzar();
// pdf-lib viene de internet y las pruebas no lo tienen: se pone uno de mentira que solo arma un PDF vacío.
const PDFLIB_FALSO = () => { window.PDFLib = { PDFDocument: { create: async () => ({ embedJpg: async () => ({ width: 100, height: 140 }), addPage: () => ({ drawImage() {} }), save: async () => new Uint8Array([37, 80, 68, 70]) }) } }; };
const err = [];
for (const tema of ['light', 'dark']) {
  const sufijo = tema === 'dark' ? ' (oscuro)' : '';
  console.log(`\n— Entregas${sufijo}`);
  const { ctx, page } = await pagina(br, { tema, semilla: sem, errores: err });
  await ctx.addInitScript(PDFLIB_FALSO);
  await page.goto(URL + '/entregas/'); await page.waitForSelector('#entList .card.hoja'); await esp(800);   // da tiempo a que lleguen los registros de Equipos
  const card = id => page.locator(`#entList .card.hoja[data-en="${id}"]`);
  const vista = async id => {
    const c = card(id), p = c.locator('.card-head .pill');
    return { titulo: (await c.locator('.card-title').innerText()).trim(), pill: (await p.innerText()).trim(), clase: await p.getAttribute('class'), texto: (await c.innerText()).replace(/\s+/g, ' ') };
  };
  const V = {}; for (const id of Object.keys(HOJAS)) V[id] = await vista(id);
  const es = (id, titulo, pill, clase) => V[id].titulo === titulo && V[id].pill === pill && new RegExp('\\b' + clase + '\\b').test(V[id].clase);

  // ---- Devolución sin terminar: Bodega con la etiqueta Devolución ----
  log('V1. devolución recién traída: el título dice Devolución · Bodega Riohacha (no el nombre) y la etiqueta dice que falta mantenimiento y backup' + sufijo, es('e-pend', 'Devolución · Bodega Riohacha', 'Mantenimiento y backup pendientes', 't-devolucion'), JSON.stringify(V['e-pend']));
  log('V2. sigue diciendo quién la devolvió y que está en Recibidos' + sufijo, V['e-pend'].texto.includes('Devuelto por Ginna Marcela Calvo Ocampo') && V['e-pend'].texto.includes('En Recibidos, sin terminar'), V['e-pend'].texto);
  log('V3. con solo el mantenimiento hecho, la etiqueta dice Backup pendiente' + sufijo, es('e-parc', 'Devolución · Bodega Riohacha', 'Backup pendiente', 't-devolucion') && V['e-parc'].texto.includes('En Recibidos, sin terminar'), JSON.stringify(V['e-parc']));
  log('V4. con dos equipos, si a uno le falta el backup dice Backup pendiente' + sufijo, es('e-dos', 'Devolución · Bodega Riohacha', 'Backup pendiente', 't-devolucion'), JSON.stringify(V['e-dos']));
  log('V5. sin enlace con Equipos dice Devolución · Bodega Riohacha, etiqueta Devolución (no se sabe qué falta) y quién la devolvió' + sufijo, es('e-sin', 'Devolución · Bodega Riohacha', 'Devolución', 't-devolucion') && V['e-sin'].texto.includes('Devuelto por Sofía Sinenlace') && !V['e-sin'].texto.includes('Recibidos'), JSON.stringify(V['e-sin']));

  // ---- Mantenimiento y backup terminados: etiqueta Bodega ----
  log('V6. mantenimiento y backup hechos (sin dar Listo todavía): la etiqueta pasa a Bodega' + sufijo, es('e-listo', 'Bodega Riohacha', 'Bodega', 't-bodega'), JSON.stringify(V['e-listo']));
  log('V7. y dice "Listo para pasar a Equipos" y quién la devolvió' + sufijo, V['e-listo'].texto.includes('Listo para pasar a Equipos') && V['e-listo'].texto.includes('Devuelto por Laura Lista') && !V['e-listo'].texto.includes('En Recibidos, sin terminar'), V['e-listo'].texto);
  log('V8. backup "No aplica" también cuenta como terminado' + sufijo, es('e-na', 'Bodega Riohacha', 'Bodega', 't-bodega'), JSON.stringify(V['e-na']));
  log('V9. una devolución de antes ya cerrada en Equipos dice Bodega y "Equipo ya listo en Equipos"' + sufijo, es('e-cerr', 'Bodega Riohacha', 'Bodega', 't-bodega') && V['e-cerr'].texto.includes('Equipo ya listo en Equipos'), JSON.stringify(V['e-cerr']));

  // ---- Equipos que no llevan backup ----
  log('V13. una impresora recién traída solo dice Mantenimiento pendiente: nunca pide backup' + sufijo, es('e-imp', 'Devolución · Bodega Riohacha', 'Mantenimiento pendiente', 't-devolucion') && !/backup/i.test(V['e-imp'].texto), JSON.stringify(V['e-imp']));
  log('V14. una impresora con el mantenimiento hecho ya está lista (Bodega) aunque el backup siga en pendiente, y no menciona backup' + sufijo, es('e-imp2', 'Bodega Riohacha', 'Bodega', 't-bodega') && V['e-imp2'].texto.includes('Listo para pasar a Equipos') && !/backup/i.test(V['e-imp2'].texto), JSON.stringify(V['e-imp2']));
  log('V15. una tablet con el mantenimiento hecho sí pide el backup' + sufijo, es('e-tab', 'Devolución · Bodega Riohacha', 'Backup pendiente', 't-devolucion') && V['e-tab'].texto.includes('Backup pendiente'), JSON.stringify(V['e-tab']));
  log('V16. ninguna etiqueta de espera dice "en proceso"' + sufijo, !Object.values(V).some(x => /en proceso/i.test(x.pill) || /en proceso/i.test(x.texto)), JSON.stringify(Object.values(V).map(x => x.pill)));

  // ---- Lo que no cambia ----
  log('V10. una entrega a una persona dice "Entrega a [nombre]" y la etiqueta Entrega' + sufijo, es('e-ent', 'Entrega a Luis Pérez', 'Entrega', 't-entrega') && !V['e-ent'].texto.includes('Devuelto por'), JSON.stringify(V['e-ent']));
  log('V11. una entrega a Bodega dice Bodega enseguida, sin pasar por Devolución' + sufijo, es('e-bod', 'Bodega Riohacha', 'Bodega', 't-bodega') && !V['e-bod'].texto.includes('Devuelto por'), JSON.stringify(V['e-bod']));
  log('V12. una hoja "Otro" no cambia' + sufijo, V['e-otro'].titulo === 'Hoja Otra' && V['e-otro'].pill === 'Otro', JSON.stringify(V['e-otro']));
  log('V17. una entrega sin nombre sigue diciendo "Sin nombre" (no "Entrega a ")' + sufijo, V['e-sn'].titulo === 'Sin nombre', JSON.stringify(V['e-sn']));
  // "Devuelto por [nombre]" tiene que verse: tamaño de texto normal, nombre en negrita y más oscuro que el texto de apoyo.
  const quien = await card('e-pend').evaluate(c => { const q = c.querySelector('.quien'), m = c.querySelector('.meta'), n = q && q.querySelector('b'); return q && n ? { texto: q.textContent.trim(), px: parseFloat(getComputedStyle(q).fontSize), peso: Number(getComputedStyle(n).fontWeight), color: getComputedStyle(q).color, colorMeta: m ? getComputedStyle(m).color : '' } : null; });
  log('V18. "Devuelto por [nombre]" se ve: texto de 16 px, nombre en negrita y color más oscuro que el texto de apoyo' + sufijo, !!quien && quien.texto === 'Devuelto por Ginna Marcela Calvo Ocampo' && quien.px >= 15.5 && quien.peso >= 700 && quien.color !== quien.colorMeta, JSON.stringify(quien));

  // ---- Filtros y búsqueda ----
  const chips = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#chipsEnt .chip')].map(c => [c.dataset.f, Number(c.querySelector('.n').textContent)])));
  log('F1. los filtros cuentan lo que se ve: Devoluciones 6, Bodega 5, Entregas 2, Otras 1, Todas 14' + sufijo, chips.devolucion === 6 && chips.bodega === 5 && chips.entrega === 2 && chips.otro === 1 && chips.todos === 14, JSON.stringify(chips));
  const ids = async () => page.evaluate(() => [...document.querySelectorAll('#entList .card.hoja')].map(c => c.dataset.en).sort());
  await page.click('#chipsEnt [data-f="devolucion"]'); await esp(150);
  log('F2. el filtro Devoluciones muestra solo las que siguen sin terminar' + sufijo, JSON.stringify(await ids()) === JSON.stringify(['e-dos', 'e-imp', 'e-parc', 'e-pend', 'e-sin', 'e-tab']), JSON.stringify(await ids()));
  await page.click('#chipsEnt [data-f="bodega"]'); await esp(150);
  log('F3. el filtro Bodega muestra las terminadas y las entregas a Bodega' + sufijo, JSON.stringify(await ids()) === JSON.stringify(['e-bod', 'e-cerr', 'e-imp2', 'e-listo', 'e-na']), JSON.stringify(await ids()));
  await page.click('#chipsEnt [data-f="todos"]'); await esp(150);
  await page.fill('#qEnt', 'Ginna'); await esp(200);
  log('F4. se sigue encontrando por el nombre de quien devolvió' + sufijo, JSON.stringify(await ids()) === JSON.stringify(['e-pend']), JSON.stringify(await ids()));
  await page.fill('#qEnt', ''); await esp(200);

  // ---- En vivo: lo que pasa en Equipos cambia la tarjeta ----
  const poner = (rid, datos) => page.evaluate(([r, d]) => { EQR.set(r, Object.assign({}, EQR.get(r), d)); renderEnt(); }, [rid, datos]);
  await poner('r-pend', { mtto: 'hecho', backup: 'hecho' }); await esp(100);
  let v = await vista('e-pend');
  log('L1. al terminar mantenimiento y backup en Equipos, la tarjeta pasa de Devolución a Bodega' + sufijo, v.pill === 'Bodega' && /\bt-bodega\b/.test(v.clase) && v.titulo === 'Bodega Riohacha', JSON.stringify(v));
  await poner('r-pend', { backup: 'pend' }); await esp(100);
  v = await vista('e-pend');
  log('L2. si se desmarca el backup en Equipos, vuelve a Devolución · Bodega Riohacha con Backup pendiente' + sufijo, v.pill === 'Backup pendiente' && v.titulo === 'Devolución · Bodega Riohacha' && /\bt-devolucion\b/.test(v.clase), JSON.stringify(v));
  await poner('r-pend', { mtto: 'pend' });

  // ---- La hoja abierta ----
  await card('e-pend').click(); await page.waitForSelector('#enSheet:not([hidden])');
  const ab = await page.evaluate(() => ({ titulo: document.getElementById('enTitle').textContent.trim(), sub: document.getElementById('enSub').textContent.trim(), nombre: document.getElementById('enNombre').value, tipo: document.getElementById('enTipo').value }));
  log('H1. la hoja abierta dice Devolución · Bodega Riohacha arriba y Devolución como etiqueta' + sufijo, ab.titulo === 'Devolución · Bodega Riohacha' && ab.sub.startsWith('Devolución ·'), JSON.stringify(ab));
  log('H2. el campo Nombre conserva a quien devolvió y el Tipo sigue siendo devolución' + sufijo, ab.nombre === 'Ginna Marcela Calvo Ocampo' && ab.tipo === 'devolucion', JSON.stringify(ab));
  await page.keyboard.press('Escape'); await esp(200);
  await card('e-ent').click(); await page.waitForSelector('#enSheet:not([hidden])');
  const ab4 = await page.evaluate(() => ({ titulo: document.getElementById('enTitle').textContent.trim(), nombre: document.getElementById('enNombre').value }));
  log('H4. la hoja abierta de una entrega dice "Entrega a [nombre]" arriba y el campo Nombre conserva solo el nombre' + sufijo, ab4.titulo === 'Entrega a Luis Pérez' && ab4.nombre === 'Luis Pérez', JSON.stringify(ab4));
  await page.keyboard.press('Escape'); await esp(200);
  await card('e-listo').click(); await page.waitForSelector('#enSheet:not([hidden])');
  const ab2 = await page.evaluate(() => ({ titulo: document.getElementById('enTitle').textContent.trim(), sub: document.getElementById('enSub').textContent.trim(), nombre: document.getElementById('enNombre').value }));
  log('H3. la hoja ya terminada dice Bodega arriba y conserva el nombre en el campo' + sufijo, ab2.titulo === 'Bodega Riohacha' && ab2.sub.startsWith('Bodega ·') && ab2.nombre === 'Laura Lista', JSON.stringify(ab2));
  await page.keyboard.press('Escape'); await esp(200);

  // ---- Nombre del PDF: igual que se ve en la app ----
  // Se lee el nombre que arma la app (atributo download del enlace): el Chromium de prueba cambia por "download" cualquier nombre con tilde.
  const pdfDe = async id => {
    await card(id).click(); await page.waitForSelector('#enSheet:not([hidden])');
    await page.evaluate(() => { window.__nombres = []; if (!window.__clickOrig) { window.__clickOrig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__nombres.push(this.download); return window.__clickOrig.call(this); }; } });
    await page.click('#enPdf'); await esp(400);
    const n = await page.evaluate(() => { document.querySelectorAll('a[download]').forEach(x => x.remove()); return window.__nombres[0]; });
    await page.keyboard.press('Escape'); await esp(200); return n;
  };
  const pdfEspera = await pdfDe('e-pend'), pdfLista = await pdfDe('e-listo');
  log('P1. el PDF de una devolución en espera se llama "Devolución Bodega Riohacha - Quien fecha.pdf"' + sufijo, pdfEspera === 'Devolución Bodega Riohacha - Ginna Marcela Calvo Ocampo 2026-10-23.pdf', pdfEspera);
  log('P2. el PDF de una devolución ya terminada se llama "Bodega Riohacha - Quien fecha.pdf"' + sufijo, pdfLista === 'Bodega Riohacha - Laura Lista 2026-10-21.pdf', pdfLista);

  // ---- Los datos guardados no se tocan ----
  const g = await fsDe(page);
  const intactas = Object.entries(HOJAS).every(([id, h]) => { const x = g[`${BE}/entregas/${id}`]; return x && x.tipo === h.tipo && x.nombre === h.nombre && x.actualizado === h.actualizado; });
  log('D1. ninguna hoja cambió en la base de datos: mismo tipo, mismo nombre, misma fecha de cambio' + sufijo, intactas, JSON.stringify(Object.keys(HOJAS).map(id => [id, (g[`${BE}/entregas/${id}`] || {}).tipo])));

  await axe(page, 'lista de hojas con devoluciones en Bodega' + sufijo);
  if (tema === 'light') {
    await page.screenshot({ path: SALIDA + '/devolucion-bodega.png', fullPage: true });
    // ---- Excel: la columna Tipo dice lo mismo que la tarjeta ----
    await page.click('#tabDb'); await page.waitForSelector('#dbTable tbody tr'); await esp(200);
    const [x] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#btnExcel')]);
    const wb = XLSX.read(fs.readFileSync(await x.path())), filas = XLSX.utils.sheet_to_json(wb.Sheets.Entregas, { header: 1 });
    const tipo = n => (filas.find(f => f[0] === n) || [])[3];
    log('X1. el Excel dice Devolución mientras falta y Bodega cuando terminó; el nombre sigue siendo el de la persona', tipo('Ginna Marcela Calvo Ocampo') === 'Devolución' && tipo('Laura Lista') === 'Bodega' && tipo('Luis Pérez') === 'Entrega', JSON.stringify(filas.map(f => [f[0], f[3]])));
  }
  await ctx.close();
}

console.log(`\n${ok} bien, ${mal} mal`);
if (err.length) { console.log('Errores de la página:\n  ' + err.join('\n  ')); mal++; }
await br.close(); srv.close();
process.exit(mal ? 1 : 0);
