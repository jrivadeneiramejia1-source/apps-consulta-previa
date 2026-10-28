// Versión 33: una hoja a nombre de Bodega se ve como "Bodega" (no "Entrega") y la hoja descargada se marca "Descargado".
// Uso: node pruebas/bodega-descarga.mjs
import fs from 'node:fs';
import { lanzar, AXE_JS, SALIDA, servir, pagina, semillaEquipos, huella, require } from './banco.mjs';
const XLSX = require('xlsx');
const URL = 'http://127.0.0.1:8833', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const CLAVE = 'prueba123', B = `espacios/${huella('equipos', CLAVE)}`, BE = `espacios/${huella('entregas', CLAVE)}`;
async function axe(page, nombre) {
  await esp(350); await page.addScriptTag({ content: AXE_JS });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
  log(`axe sin fallas: ${nombre}`, !r.length, r.join('\n      '));
}
const fsDe = p => p.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso')));
const hoja = (nombre, tipo, extra = {}) => Object.assign({ nombre, cedula: '', fecha: '2026-10-27', tipo, proyecto: '', equipos: [{ tipo: 'PC Portátil', serial: 'PF2XYZ01' }], seriales: 'PF2XYZ01', nota: '', paginas: [{ trozos: 1, ancho: 1700, alto: 2200, bytes: 3, origen: 'semilla' }], miniatura: '', origen: 'semilla', subido: '2026-10-27T15:00:00.000Z', actualizado: '2026-10-27T15:00:00.000Z', por: 'Jeiler' }, extra);

const sem = semillaEquipos(CLAVE), F = sem.__fs_falso;
// Como en la captura: una devolución que ya quedó lista y pasó a Bodega Riohacha, una entrega a una persona y una devolución sin terminar.
F[`${BE}/entregas/e-bod`] = hoja('Bodega Riohacha', 'entrega', { devolucion: { nombre: 'MERCEDES ARPUSHAINA PUSHAINA', cedula: '', fecha: '2026-10-27' } });
F[`${BE}/entregas/e-ent`] = hoja('Luis Pérez', 'entrega', { fecha: '2026-10-26', equipos: [{ tipo: 'GPS', serial: 'GPS778812' }], seriales: 'GPS778812' });
F[`${BE}/entregas/e-dev`] = hoja('Ginna Marcela Calvo Ocampo', 'devolucion', { fecha: '2026-10-23', equipos: [{ tipo: 'PC Portátil', serial: 'TH2CGBT04F' }], seriales: 'TH2CGBT04F' });
['e-bod', 'e-ent', 'e-dev'].forEach(id => { F[`${BE}/archivos/${id}_0_0`] = { d: 'AAAA' }; });
Object.assign(sem, { nube_entregas_espacio: huella('entregas', CLAVE), nube_entregas_nombre: 'Jeiler', nube_equipos_enlace_entregas: huella('entregas', CLAVE), nube_entregas_enlace_equipos: huella('equipos', CLAVE) });

const srv = await servir(8833); const br = await lanzar();
const err = [];
// pdf-lib viene de internet y las pruebas no lo tienen: se pone uno de mentira que solo arma un PDF vacío.
const PDFLIB_FALSO = () => { window.PDFLib = { PDFDocument: { create: async () => ({ embedJpg: async () => ({ width: 100, height: 140 }), addPage: () => ({ drawImage() {} }), save: async () => new Uint8Array([37, 80, 68, 70]) }) } }; };
for (const tema of ['light', 'dark']) {
  const sufijo = tema === 'dark' ? ' (oscuro)' : '';
  console.log(`\n— Entregas${sufijo}`);
  const { ctx, page } = await pagina(br, { tema, semilla: sem, errores: err });
  await ctx.addInitScript(PDFLIB_FALSO);
  await page.goto(URL + '/entregas/'); await page.waitForSelector('#entList .card.hoja'); await esp(400);
  const card = n => page.locator('#entList .card.hoja', { hasText: n });

  // ---- Bodega ----
  const pill = async n => ({ texto: (await card(n).locator('.card-head .pill').innerText()).trim(), clase: await card(n).locator('.card-head .pill').getAttribute('class') });
  const pb = await pill('Bodega Riohacha'), pe = await pill('Luis Pérez'), pd = await pill('Ginna');
  log('B1. la hoja a nombre de Bodega dice Bodega, no Entrega' + sufijo, pb.texto === 'Bodega' && /\bt-bodega\b/.test(pb.clase), JSON.stringify(pb));
  log('B2. la entrega a una persona sigue diciendo Entrega y la devolución Devolución' + sufijo, pe.texto === 'Entrega' && pd.texto === 'Devolución', JSON.stringify([pe, pd]));
  log('B3. la hoja de Bodega conserva "Antes: devolución de…"' + sufijo, (await card('Bodega Riohacha').innerText()).includes('Antes: devolución de MERCEDES ARPUSHAINA PUSHAINA'));
  const chips = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#chipsEnt .chip')].map(c => [c.dataset.f, Number(c.querySelector('.n').textContent)])));
  log('B4. los filtros cuentan aparte: Entregas 1, Devoluciones 1, Bodega 1' + sufijo, chips.entrega === 1 && chips.devolucion === 1 && chips.bodega === 1 && chips.todos === 3, JSON.stringify(chips));
  await page.click('#chipsEnt [data-f="bodega"]'); await esp(150);
  log('B5. el filtro Bodega muestra solo esa hoja' + sufijo, await page.locator('#entList .card.hoja').count() === 1 && (await page.locator('#entList .card.hoja').innerText()).includes('Bodega Riohacha'));
  await page.click('#chipsEnt [data-f="entrega"]'); await esp(150);
  log('B6. el filtro Entregas ya no incluye la de Bodega' + sufijo, await page.locator('#entList .card.hoja').count() === 1 && (await page.locator('#entList .card.hoja').innerText()).includes('Luis Pérez'));
  await page.click('#chipsEnt [data-f="todos"]'); await esp(150);

  // ---- La hoja abierta ----
  await card('Bodega Riohacha').click(); await page.waitForSelector('#enSheet:not([hidden])');
  const sub = (await page.textContent('#enSub')).trim();
  const opt = await page.evaluate(() => { const s = document.getElementById('enTipo'); return { valor: s.value, texto: s.selectedOptions[0].textContent.trim() }; });
  log('B7. el título de la hoja abierta dice Bodega' + sufijo, sub.startsWith('Bodega ·'), sub);
  log('B8. el campo Tipo muestra Bodega y guarda el mismo valor de antes (entrega)' + sufijo, opt.texto === 'Bodega' && opt.valor === 'entrega', JSON.stringify(opt));

  // ---- Descargado ----
  const antes = (await fsDe(page))[`${BE}/entregas/e-bod`];
  log('D1. antes de descargar ninguna tarjeta dice Descargado' + sufijo, (await page.locator('#entList .descarga').count()) === 0 && !antes.descargado);
  log('D2. y la hoja abierta no dice nada de descargas' + sufijo, !(await page.textContent('#enEditado')).includes('Descargada'));
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#enPdf')]);
  log('D3. el PDF de Bodega no repite la palabra: "Bodega Riohacha 2026-10-27.pdf"' + sufijo, d.suggestedFilename() === 'Bodega Riohacha 2026-10-27.pdf', d.suggestedFilename());
  await esp(500);
  const des = await fsDe(page), h = des[`${BE}/entregas/e-bod`];
  log('D4. se guarda quién lo descargó y cuándo' + sufijo, h.descargado && h.descargado.por === 'Jeiler' && Math.abs(Date.now() - Date.parse(h.descargado.fecha)) < 60000, JSON.stringify(h.descargado));
  log('D5. descargar no cambia "actualizado" ni "por" de la hoja' + sufijo, h.actualizado === antes.actualizado && h.por === antes.por, JSON.stringify([h.actualizado, h.por]));
  const ed = (await page.textContent('#enEditado')).trim();
  log('D6. la hoja abierta dice quién la descargó' + sufijo, /Descargada por Jeiler/.test(ed), ed);
  await page.keyboard.press('Escape'); await esp(200);
  await esp(200);
  const tj = await card('Bodega Riohacha').locator('.descarga').innerText().catch(() => '');
  log('D7. la tarjeta muestra Descargado, quién y cuándo' + sufijo, /Descargado/.test(tj) && /por Jeiler/.test(tj) && /hace un momento/.test(tj), JSON.stringify(tj));
  log('D8. las otras hojas no muestran Descargado' + sufijo, await page.locator('#entList .descarga').count() === 1);
  await page.evaluate(() => document.querySelectorAll('a[download]').forEach(a => a.remove()));   // el enlace vacío con que nube.js baja el archivo dura 5 s
  await axe(page, 'lista de hojas con Bodega y Descargado' + sufijo);
  if (tema === 'light') await page.screenshot({ path: SALIDA + '/bodega-descarga.png' });
  await page.reload(); await page.waitForSelector('#entList .card.hoja'); await esp(500);
  log('D9. al recargar sigue marcada como descargada' + sufijo, (await card('Bodega Riohacha').locator('.descarga').count()) === 1);

  // ---- Excel y Base de datos ----
  if (tema === 'light') {
    await page.click('#tabDb'); await page.waitForSelector('#dbTable tbody tr'); await esp(200);
    const fila = await page.evaluate(() => { const tr = [...document.querySelectorAll('#dbTable tbody tr')].find(t => t.dataset.id === 'e-bod'); const s = tr.querySelector('select[data-f="tipo"]'); return { valor: s.value, texto: s.selectedOptions[0].textContent.trim() }; });
    log('B9. en Base de datos la fila de Bodega muestra Bodega' + sufijo, fila.texto === 'Bodega' && fila.valor === 'entrega', JSON.stringify(fila));
    const [x] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#btnExcel')]);
    const wb = XLSX.read(fs.readFileSync(await x.path())), filas = XLSX.utils.sheet_to_json(wb.Sheets.Entregas, { header: 1 });
    const tipo = n => (filas.find(f => f[0] === n) || [])[3];
    log('B10. el Excel dice Bodega en esa fila y Entrega en la de una persona' + sufijo, tipo('Bodega Riohacha') === 'Bodega' && tipo('Luis Pérez') === 'Entrega', JSON.stringify(filas.map(f => [f[0], f[3]])));
  }
  await ctx.close();
}

// ---- Equipos: la ficha del equipo lista sus hojas de Entregas ----
console.log('\n— Equipos');
{
  const { page } = await pagina(br, { semilla: sem, errores: err });
  await page.goto(URL + '/equipos/'); await page.waitForSelector('#recList .card.rec'); await esp(300);
  const hojasDe = async serial => {
    await page.click('#tabEq'); await page.fill('#qEq', serial); await page.dispatchEvent('#qEq', 'input');
    await page.locator('#eqList .card', { hasText: serial }).first().click(); await page.waitForSelector('#eqSheet:not([hidden])');
    await page.waitForSelector('#eqHojas .hoja-ent', { timeout: 8000 }).catch(() => {});
    const l = await page.locator('#eqHojas .hoja-ent b').allTextContents();
    await page.keyboard.press('Escape'); await esp(200);
    return l;
  };
  const lb = await hojasDe('PF2XYZ01'), le = await hojasDe('GPS778812');
  log('E1. la ficha del equipo lista la hoja de Bodega como Bodega · Bodega Riohacha', JSON.stringify(lb) === JSON.stringify(['Bodega · Bodega Riohacha']), JSON.stringify(lb));
  log('E2. y la entrega a una persona sigue diciendo Entrega · nombre', JSON.stringify(le) === JSON.stringify(['Entrega · Luis Pérez']), JSON.stringify(le));
}

console.log(`\n${ok} bien, ${mal} mal`);
if (err.length) { console.log('Errores de la página:\n  ' + err.join('\n  ')); mal++; }
await br.close(); srv.close();
process.exit(mal ? 1 : 0);
