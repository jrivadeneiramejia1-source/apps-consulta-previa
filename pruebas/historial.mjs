// Versión 34: Soporte → Historial de movimientos (quién hizo qué en Equipos). Uso: node pruebas/historial.mjs
// La lista, la insignia de lo nuevo de otras personas, el filtro por persona, abrir el equipo, lo que se anota al hacer cambios
// (Listo, editar, programar, hacer, borrar), que varios cambios seguidos del mismo equipo se junten, que lo automático no se anote,
// la limpieza de los 30 días, el aviso cuando faltan las reglas, 320 px y accesibilidad.
import { lanzar, AXE_JS, servir, pagina, semillaEquipos, huella, SALIDA } from './banco.mjs';
const URL = 'http://127.0.0.1:8834/equipos/', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const CLAVE = 'prueba123', B = `espacios/${huella('equipos', CLAVE)}`;
async function axe(page, nombre) {
  await esp(350);
  await page.addScriptTag({ content: AXE_JS });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
  log(`axe sin fallas: ${nombre}`, !r.length, r.join('\n      '));
}
const fsDe = p => p.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso')));
const movs = async p => Object.entries(await fsDe(p)).filter(([k]) => k.startsWith(B + '/actividad/')).map(([k, v]) => Object.assign({ id: k.split('/').pop() }, v)).sort((a, b) => a.en - b.en);
const badge = p => p.evaluate(() => { const b = document.getElementById('badgeSo'); return b.hidden ? 0 : Number(b.textContent); });
const sinDesborde = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#histPantalla .hist-item, #soHist .so-fila')].every(e => e.getBoundingClientRect().right <= innerWidth + 1));

// ---------- datos: Ana hizo algo hace 30 min (sin ver), Luis hace 3 h, Jeiler hace 5 h y algo de hace 31 días ----------
const ahora = Date.now(), hace = min => ahora - min * 60e3, DIA = 864e5;
function semilla(extra) {
  const s = semillaEquipos(CLAVE), F = s.__fs_falso;
  F[`${B}/actividad/a1`] = { de: 'ana-gomez', nombre: 'Ana Gómez', en: hace(30), serial: 'VB009911', titulo: 'Dio Listo a VB009911', lineas: ['Quedó asignado a Luis Pérez', 'Backup: pendiente → hecho'] };
  F[`${B}/actividad/a2`] = { de: 'luis', nombre: 'Luis', en: hace(180), serial: 'STL00042', titulo: 'Editó el equipo STL00042', lineas: ['Asignado a: Campo Uribia → Bodega'] };
  F[`${B}/actividad/a3`] = { de: 'jeiler', nombre: 'Jeiler', en: hace(300), titulo: 'Borró un registro viejo' };
  F[`${B}/actividad/a4`] = { de: 'luis', nombre: 'Luis', en: ahora - 31 * DIA, titulo: 'Esto es de hace 31 días' };
  s.eqcp_hist_visto = hace(60);   // ya vio todo hasta hace una hora
  s.eqcp_hist_limpieza = ahora;   // la limpieza automática ya corrió hoy: la prueba la llama a mano
  return Object.assign(s, extra || {});
}

const srv = await servir(8834);
const b = await lanzar();
try {
  for (const tema of ['light', 'dark']) {
    const suf = tema === 'dark' ? ' (oscuro)' : '';
    console.log(`\nLista y pantalla${suf}`);
    const errs = [];
    const { ctx, page } = await pagina(b, { tema, ancho: 360, alto: 740, semilla: semilla(), errores: errs });
    await page.goto(URL); await page.waitForSelector('#tabSo');
    await page.waitForFunction(() => { const x = document.querySelector('#badgeSo'); return x && !x.hidden; }, null, { timeout: 8000 }).catch(() => {});
    log('H1. la pestaña Soporte avisa 1 movimiento nuevo de otra persona (no el de Luis ya visto, ni el mío)' + suf, await badge(page) === 1, String(await badge(page)));
    await page.click('#tabSo'); await page.waitForSelector('#soHist .so-fila');
    const fila = (await page.locator('#soHist .so-fila').innerText()).replace(/\n+/g, ' | ');
    log('H2. Soporte tiene la fila "Historial de movimientos" con lo último y el 1' + suf, /Historial de movimientos/.test(fila) && /Ana: Dio Listo a VB009911/.test(fila) && /\b1\b/.test(fila), fila);
    log('H3. la fila del historial va antes que el chat' + suf, await page.evaluate(() => !!(document.getElementById('soHist').compareDocumentPosition(document.getElementById('soLista')) & Node.DOCUMENT_POSITION_FOLLOWING)));
    await axe(page, 'Soporte con la fila del historial' + suf);

    await page.click('#soHist .so-fila'); await page.waitForSelector('#histPantalla:not([hidden])');
    const items = await page.locator('#histLista .hist-item').evaluateAll(xs => xs.map(x => ({ quien: x.querySelector('.hist-cab b').textContent, titulo: x.querySelector('.hist-titulo').textContent, nuevo: x.classList.contains('nuevo'), lineas: [...x.querySelectorAll('.hist-lineas li')].map(l => l.textContent) })));
    log('P1. la pantalla lista los 3 movimientos (el de hace 31 días no), el más nuevo primero' + suf, items.length === 3 && items[0].titulo === 'Dio Listo a VB009911' && items[2].titulo === 'Borró un registro viejo', JSON.stringify(items));
    log('P2. lo mío dice "Tú" y lo de otros su nombre' + suf, items[2].quien === 'Tú' && items[0].quien === 'Ana Gómez' && items[1].quien === 'Luis', JSON.stringify(items.map(i => i.quien)));
    log('P3. solo el de Ana sale marcado como Nuevo' + suf, items[0].nuevo && !items[1].nuevo && !items[2].nuevo && (await page.locator('#histLista .hist-item.nuevo .pill').innerText()) === 'Nuevo');
    log('P4. se ven los detalles de lo que cambió' + suf, items[0].lineas.join('|') === 'Quedó asignado a Luis Pérez|Backup: pendiente → hecho' && items[1].lineas[0] === 'Asignado a: Campo Uribia → Bodega', JSON.stringify(items.map(i => i.lineas)));
    const chips = await page.locator('#histChips .chip').evaluateAll(xs => xs.map(x => x.textContent.replace(/\s+/g, ' ').trim() + (x.getAttribute('aria-pressed') === 'true' ? '*' : '')));
    log('P5. hay un filtro por persona con cuántos movimientos tiene cada una' + suf, chips.join('|') === 'Todos 3*|Ana Gómez 1|Luis 1|Tú 1', chips.join('|'));
    await page.click('#histChips [data-hi-f="luis"]'); await esp(100);
    log('P6. al filtrar por Luis solo sale lo de Luis' + suf, (await page.locator('#histLista .hist-item').count()) === 1 && (await page.locator('#histLista .hist-item .hist-cab b').innerText()) === 'Luis');
    await page.click('#histChips [data-hi-f=""]'); await esp(100);
    log('P7. al abrir el historial lo nuevo ya cuenta como visto: la insignia se quita' + suf, await badge(page) === 0, String(await badge(page)));
    log('P8. cabe en 360 px sin desbordar' + suf, await sinDesborde(page));
    await axe(page, 'pantalla del historial' + suf);
    if (tema === 'light') await page.screenshot({ path: SALIDA + '/historial-pantalla.png' });

    // Abrir el equipo desde el historial; Escape cierra primero la ficha y luego el historial
    await page.click('#histLista [data-hi-eq="VB009911"]'); await page.waitForSelector('#eqSheet:not([hidden])');
    log('P9. "Ver VB009911" abre la ficha del equipo encima del historial' + suf, (await page.locator('#eqSheet').isVisible()) && (await page.locator('#histPantalla').isVisible()));
    await page.keyboard.press('Escape'); await esp(150);
    log('P10. Escape cierra la ficha y el historial sigue abierto' + suf, (await page.locator('#eqSheet').isHidden()) && (await page.locator('#histPantalla').isVisible()));
    await page.keyboard.press('Escape'); await esp(200);
    log('P11. otro Escape cierra el historial y el foco vuelve a su fila' + suf, (await page.locator('#histPantalla').isHidden()) && await page.evaluate(() => document.activeElement && document.activeElement.matches('#soHist [data-hist]')));
    await page.click('#soHist .so-fila'); await page.waitForSelector('#histPantalla:not([hidden])');
    await page.goBack(); await esp(250);
    log('P12. el botón Atrás del teléfono también cierra el historial' + suf, await page.locator('#histPantalla').isHidden());

    if (tema === 'dark') { log('sin errores en la página' + suf, errs.length === 0, errs.join('\n      ')); await ctx.close(); continue; }

    // ---------- lo que se anota al hacer cambios ----------
    console.log('\nQué se anota');
    await page.click('#tabRec'); await page.waitForSelector('#recList .card.rec');
    await page.click('[data-listo="r-2"]'); await page.waitForSelector('#cfSheet:not([hidden])'); await page.click('#cfYes');
    await esp(3800);
    const listo = (await movs(page)).filter(m => m.de === 'jeiler' && m.en > ahora && m.serial === 'R58N90AB');
    log('W1. dar Listo deja UNA sola línea (no una por cada cambio interno)', listo.length === 1, JSON.stringify(listo));
    log('W2. dice quién, que dio Listo y a quién quedó asignado' + '', listo[0] && listo[0].titulo === 'Dio Listo a R58N90AB' && listo[0].nombre === 'Jeiler' && listo[0].lineas.includes('Quedó asignado a María Epieyú') && listo[0].lineas.includes('Backup: pendiente → hecho'), JSON.stringify(listo[0]));
    log('W3. lo que hago yo no sube la insignia de Soporte' + '', await badge(page) === 0, String(await badge(page)));

    const nuevoMov = async (fn, espera = 3300) => { const antes = (await movs(page)).length; await page.evaluate(fn); await esp(espera); const d = await movs(page); return d.slice(antes); };
    let n = await nuevoMov(() => window.escribir({ tipo: 'update', col: 'equipos', id: '5CD1234ABC', data: { marca: 'Dell', obs: 'Pantalla cambiada', actualizado: 'x', por: 'y' } }));
    log('W4. editar un equipo anota solo lo que cambió (sin actualizado ni por)', n.length === 1 && n[0].titulo === 'Editó el equipo 5CD1234ABC' && n[0].lineas.join('|') === 'Marca: HP → Dell|Observaciones: Pantalla cambiada', JSON.stringify(n));
    n = await nuevoMov(() => window.escribir({ tipo: 'update', col: 'equipos', id: '5CD1234ABC', data: { marca: 'Dell', actualizado: 'z', por: 'jeiler' } }));
    log('W5. un guardado que no cambia nada no deja línea', n.length === 0, JSON.stringify(n));
    n = await nuevoMov(() => { window.escribir({ tipo: 'update', col: 'equipos', id: 'GPS778812', data: { modelo: 'eTrex 22x' } }); window.escribir({ tipo: 'update', col: 'equipos', id: 'GPS778812', data: { asignado: 'Ana Gómez' } }); window.escribir({ tipo: 'update', col: 'equipos', id: 'TAB55001', data: { asignado: 'Luis' } }); });
    const gps = n.find(m => m.serial === 'GPS778812');
    log('W6. dos cambios seguidos del mismo equipo se juntan en una línea; otro equipo, otra línea', n.length === 2 && gps && gps.lineas.join('|') === 'Modelo: eTrex 32x → eTrex 22x|Asignado a: Luis Pérez → Ana Gómez', JSON.stringify(n));
    n = await nuevoMov(() => window.escribir({ tipo: 'set', col: 'tareas', id: 't-h1', data: { serial: 'GPS778812', tipo: 'backup', fecha: '2026-11-02', resp: 'Ana Gómez', nota: '', creadoPor: 'Jeiler', creado: new Date().toISOString(), estado: 'pendiente', hist: [] } }));
    log('W7. programar una tarea anota qué tipo, para cuándo y quién', n.length === 1 && n[0].titulo === 'Programó backup y mantenimiento remoto de GPS778812' && n[0].lineas.join('|') === 'Para el 02/11/2026|Responsable: Ana Gómez', JSON.stringify(n));
    n = await nuevoMov(() => window.escribir({ tipo: 'update', col: 'tareas', id: 't-h1', data: { estado: 'hecho', hecho: { fecha: '2026-11-02', por: 'Jeiler', nota: 'Sin novedad', disco: 'Disco 3' }, hist: [{ t: 'x', quien: 'Jeiler', que: 'hecho', nota: '' }], actualizado: 'x', por: 'Jeiler' } }));
    log('W8. terminar una tarea dice "Hizo…" con el disco y la nota', n.length === 1 && n[0].titulo === 'Hizo backup y mantenimiento remoto de GPS778812' && n[0].lineas.join('|') === 'Disco: Disco 3|Nota: Sin novedad', JSON.stringify(n));
    n = await nuevoMov(() => window.escribir({ tipo: 'delete', col: 'tareas', id: 't-h1' }));
    log('W9. quitar una tarea queda anotado aunque ya no exista el dato', n.length === 1 && n[0].titulo === 'Quitó backup y mantenimiento remoto de GPS778812', JSON.stringify(n));
    n = await nuevoMov(() => window.escribir({ tipo: 'delete', col: 'equipos', id: 'X4E01234' }));
    log('W10. borrar un equipo dice a quién lo tenía', n.length === 1 && n[0].titulo === 'Borró el equipo X4E01234' && n[0].lineas[0] === 'Lo tenía: Oficina Riohacha', JSON.stringify(n));
    n = await nuevoMov(() => window.escribir({ silencio: true, tipo: 'update', col: 'equipos', id: 'TAB55001', data: { asignado: 'Bodega' } }));
    log('W11. lo automático (silencio) no se anota', n.length === 0, JSON.stringify(n));
    n = await nuevoMov(() => window.escribir({ tipo: 'set', col: 'recibidos', id: 'r-h1', data: { serial: 'ZZ9001', tipo: 'PC Portátil', persona: 'Carlos Ipuana', mtto: 'pend', backup: 'pend', fechaIngreso: '2026-10-28', acc: [], obs: '', cerrado: false } }));
    log('W12. registrar un equipo recibido anota la persona', n.length === 1 && n[0].titulo === 'Registró ZZ9001 en Recibidos' && n[0].lineas[0] === 'Persona: Carlos Ipuana', JSON.stringify(n));

    // ---------- lo que pasa con lo anotado por otros en vivo ----------
    console.log('\nEn vivo y limpieza');
    await page.click('#tabSo'); await esp(100);
    // Ana anota algo desde otro teléfono (el Firebase falso avisa cuando se escribe por su misma vía)
    await page.evaluate(async ([k]) => { const S = await window.nube.sesionChat(); await S.F.setDoc(S.F.doc(S.fs, ...k.split('/')), { de: 'ana-gomez', nombre: 'Ana Gómez', en: S.F.serverTimestamp(), serial: 'PF2XYZ01', titulo: 'Editó el equipo PF2XYZ01', lineas: ['Marca: Lenovo → HP'] }); }, [`${B}/actividad/en-vivo2`]);
    await page.waitForFunction(() => document.getElementById('badgeSo') && !document.getElementById('badgeSo').hidden, null, { timeout: 6000 }).catch(() => {});
    log('V1. cuando otra persona hace algo con la app abierta, la insignia sube y sale un aviso', (await badge(page)) >= 1 && /Historial · Ana Gómez: Editó el equipo PF2XYZ01/.test(await page.locator('#toast').textContent().catch(() => '')), `${await badge(page)} / ${await page.locator('#toast').textContent().catch(() => '')}`);
    const antes = Object.keys(await fsDe(page)).filter(k => k.includes('/actividad/')).length;
    const borradas = await page.evaluate(() => Historial.limpiar());
    const despues = await fsDe(page);
    log('V2. la limpieza borra lo de más de 30 días y deja lo demás', borradas === 1 && !despues[`${B}/actividad/a4`] && !!despues[`${B}/actividad/a1`] && Object.keys(despues).filter(k => k.includes('/actividad/')).length === antes - 1, `${borradas} / ${antes}`);
    log('sin errores en la página', errs.length === 0, errs.join('\n      '));
    await ctx.close();
  }

  // ---------- sin las reglas nuevas ----------
  console.log('\nSin las reglas nuevas');
  {
    const { ctx, page } = await pagina(b, { semilla: semilla(), errores: [] });
    await ctx.addInitScript(() => { window.__snapErr = 'permission-denied'; });   // Firebase rechaza la lectura, como sin las reglas pegadas
    await page.goto(URL); await page.waitForSelector('#tabSo');
    await page.waitForFunction(() => window.Historial && Historial.estado === 'sin-reglas', null, { timeout: 20000 }).catch(() => {});
    await page.click('#tabSo');
    const aviso = (await page.locator('#soHist').innerText().catch(() => '')).replace(/\s+/g, ' ');
    log('R1. si faltan las reglas, Soporte lo dice con el paso a seguir', /Falta pegar en Firebase las reglas nuevas/.test(aviso) && /Firestore Database → Reglas/.test(aviso), aviso);
    await ctx.close();
  }
} finally { await b.close(); srv.close(); }
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
