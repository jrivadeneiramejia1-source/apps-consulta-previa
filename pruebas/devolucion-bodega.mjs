// Versión 40: una devolución se ve en Bodega desde que la traen (no con el nombre de quien la devolvió).
// La etiqueta dice Devolución hasta que el mantenimiento y el backup terminan; entonces dice Bodega.
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
  'e-otro': hoja('Hoja Otra', 'otro', '', { fecha: '2026-10-24' })
};
for (const [id, h] of Object.entries(HOJAS)) { F[`${BE}/entregas/${id}`] = h; F[`${BE}/archivos/${id}_0_0`] = { d: 'AAAA' }; }
F[`${B}/recibidos/r-pend`] = recibido('PEND0001', 'e-pend', 'pend', 'pend');
F[`${B}/recibidos/r-parc`] = recibido('PARC0001', 'e-parc', 'hecho', 'pend');
F[`${B}/recibidos/r-listo`] = recibido('LIST0001', 'e-listo', 'hecho', 'hecho');
F[`${B}/recibidos/r-na`] = recibido('NOAP0001', 'e-na', 'hecho', 'na');
F[`${B}/recibidos/r-cerr`] = recibido('CERR0001', 'e-cerr', 'hecho', 'hecho', { cerrado: true, cerradoEn: '2026-10-30T15:00:00.000Z' });   // de antes: sin "cerradoA", la hoja no se convierte sola
F[`${B}/recibidos/r-dos1`] = recibido('DOS00001', 'e-dos', 'hecho', 'hecho');
F[`${B}/recibidos/r-dos2`] = recibido('DOS00002', 'e-dos', 'hecho', 'pend');
Object.assign(sem, { nube_entregas_espacio: huella('entregas', CLAVE), nube_entregas_nombre: 'Jeiler', nube_equipos_enlace_entregas: huella('entregas', CLAVE), nube_entregas_enlace_equipos: huella('equipos', CLAVE) });

const srv = await servir(8834); const br = await lanzar();
const err = [];
for (const tema of ['light', 'dark']) {
  const sufijo = tema === 'dark' ? ' (oscuro)' : '';
  console.log(`\n— Entregas${sufijo}`);
  const { ctx, page } = await pagina(br, { tema, semilla: sem, errores: err });
  await page.goto(URL + '/entregas/'); await page.waitForSelector('#entList .card.hoja'); await esp(800);   // da tiempo a que lleguen los registros de Equipos
  const card = id => page.locator(`#entList .card.hoja[data-en="${id}"]`);
  const vista = async id => {
    const c = card(id), p = c.locator('.card-head .pill');
    return { titulo: (await c.locator('.card-title').innerText()).trim(), pill: (await p.innerText()).trim(), clase: await p.getAttribute('class'), texto: (await c.innerText()).replace(/\s+/g, ' ') };
  };
  const V = {}; for (const id of Object.keys(HOJAS)) V[id] = await vista(id);
  const es = (id, titulo, pill, clase) => V[id].titulo === titulo && V[id].pill === pill && new RegExp('\\b' + clase + '\\b').test(V[id].clase);

  // ---- Devolución sin terminar: Bodega con la etiqueta Devolución ----
  log('V1. devolución recién traída: el título dice Bodega Riohacha (no el nombre) y la etiqueta Devolución' + sufijo, es('e-pend', 'Bodega Riohacha', 'Devolución', 't-devolucion'), JSON.stringify(V['e-pend']));
  log('V2. sigue diciendo quién la devolvió y que está en Recibidos' + sufijo, V['e-pend'].texto.includes('Devuelto por Ginna Marcela Calvo Ocampo') && V['e-pend'].texto.includes('En Recibidos, sin terminar'), V['e-pend'].texto);
  log('V3. con solo el mantenimiento hecho sigue en Devolución' + sufijo, es('e-parc', 'Bodega Riohacha', 'Devolución', 't-devolucion') && V['e-parc'].texto.includes('En Recibidos, sin terminar'), JSON.stringify(V['e-parc']));
  log('V4. con dos equipos, si a uno le falta el backup sigue en Devolución' + sufijo, es('e-dos', 'Bodega Riohacha', 'Devolución', 't-devolucion'), JSON.stringify(V['e-dos']));
  log('V5. sin enlace con Equipos también dice Bodega, Devolución y quién la devolvió' + sufijo, es('e-sin', 'Bodega Riohacha', 'Devolución', 't-devolucion') && V['e-sin'].texto.includes('Devuelto por Sofía Sinenlace') && !V['e-sin'].texto.includes('Recibidos'), JSON.stringify(V['e-sin']));

  // ---- Mantenimiento y backup terminados: etiqueta Bodega ----
  log('V6. mantenimiento y backup hechos (sin dar Listo todavía): la etiqueta pasa a Bodega' + sufijo, es('e-listo', 'Bodega Riohacha', 'Bodega', 't-bodega'), JSON.stringify(V['e-listo']));
  log('V7. y dice "Listo para pasar a Equipos" y quién la devolvió' + sufijo, V['e-listo'].texto.includes('Listo para pasar a Equipos') && V['e-listo'].texto.includes('Devuelto por Laura Lista') && !V['e-listo'].texto.includes('En Recibidos, sin terminar'), V['e-listo'].texto);
  log('V8. backup "No aplica" también cuenta como terminado' + sufijo, es('e-na', 'Bodega Riohacha', 'Bodega', 't-bodega'), JSON.stringify(V['e-na']));
  log('V9. una devolución de antes ya cerrada en Equipos dice Bodega y "Equipo ya listo en Equipos"' + sufijo, es('e-cerr', 'Bodega Riohacha', 'Bodega', 't-bodega') && V['e-cerr'].texto.includes('Equipo ya listo en Equipos'), JSON.stringify(V['e-cerr']));

  // ---- Lo que no cambia ----
  log('V10. una entrega a una persona sigue con su nombre y Entrega' + sufijo, es('e-ent', 'Luis Pérez', 'Entrega', 't-entrega') && !V['e-ent'].texto.includes('Devuelto por'), JSON.stringify(V['e-ent']));
  log('V11. una entrega a Bodega dice Bodega enseguida, sin pasar por Devolución' + sufijo, es('e-bod', 'Bodega Riohacha', 'Bodega', 't-bodega') && !V['e-bod'].texto.includes('Devuelto por'), JSON.stringify(V['e-bod']));
  log('V12. una hoja "Otro" no cambia' + sufijo, V['e-otro'].titulo === 'Hoja Otra' && V['e-otro'].pill === 'Otro', JSON.stringify(V['e-otro']));

  // ---- Filtros y búsqueda ----
  const chips = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#chipsEnt .chip')].map(c => [c.dataset.f, Number(c.querySelector('.n').textContent)])));
  log('F1. los filtros cuentan lo que se ve: Devoluciones 4, Bodega 4, Entregas 1, Otras 1, Todas 10' + sufijo, chips.devolucion === 4 && chips.bodega === 4 && chips.entrega === 1 && chips.otro === 1 && chips.todos === 10, JSON.stringify(chips));
  const ids = async () => page.evaluate(() => [...document.querySelectorAll('#entList .card.hoja')].map(c => c.dataset.en).sort());
  await page.click('#chipsEnt [data-f="devolucion"]'); await esp(150);
  log('F2. el filtro Devoluciones muestra solo las que siguen sin terminar' + sufijo, JSON.stringify(await ids()) === JSON.stringify(['e-dos', 'e-parc', 'e-pend', 'e-sin']), JSON.stringify(await ids()));
  await page.click('#chipsEnt [data-f="bodega"]'); await esp(150);
  log('F3. el filtro Bodega muestra las terminadas y las entregas a Bodega' + sufijo, JSON.stringify(await ids()) === JSON.stringify(['e-bod', 'e-cerr', 'e-listo', 'e-na']), JSON.stringify(await ids()));
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
  log('L2. si se desmarca el backup en Equipos, vuelve a Devolución' + sufijo, v.pill === 'Devolución' && /\bt-devolucion\b/.test(v.clase), JSON.stringify(v));
  await poner('r-pend', { mtto: 'pend' });

  // ---- La hoja abierta ----
  await card('e-pend').click(); await page.waitForSelector('#enSheet:not([hidden])');
  const ab = await page.evaluate(() => ({ titulo: document.getElementById('enTitle').textContent.trim(), sub: document.getElementById('enSub').textContent.trim(), nombre: document.getElementById('enNombre').value, tipo: document.getElementById('enTipo').value }));
  log('H1. la hoja abierta dice Bodega Riohacha arriba y Devolución como etiqueta' + sufijo, ab.titulo === 'Bodega Riohacha' && ab.sub.startsWith('Devolución ·'), JSON.stringify(ab));
  log('H2. el campo Nombre conserva a quien devolvió y el Tipo sigue siendo devolución' + sufijo, ab.nombre === 'Ginna Marcela Calvo Ocampo' && ab.tipo === 'devolucion', JSON.stringify(ab));
  await page.keyboard.press('Escape'); await esp(200);
  await card('e-listo').click(); await page.waitForSelector('#enSheet:not([hidden])');
  const ab2 = await page.evaluate(() => ({ titulo: document.getElementById('enTitle').textContent.trim(), sub: document.getElementById('enSub').textContent.trim(), nombre: document.getElementById('enNombre').value }));
  log('H3. la hoja ya terminada dice Bodega arriba y conserva el nombre en el campo' + sufijo, ab2.titulo === 'Bodega Riohacha' && ab2.sub.startsWith('Bodega ·') && ab2.nombre === 'Laura Lista', JSON.stringify(ab2));
  await page.keyboard.press('Escape'); await esp(200);

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
