// Sincronía Entregas ↔ Equipos y mantenimiento programado. Uso: node pruebas/sincronia.mjs
import { chromium, servir, pagina, semillaEquipos, huella } from './banco.mjs';
const URL = 'http://127.0.0.1:8814', esp = ms => new Promise(r => setTimeout(r, ms));
const srv = await servir(8814); const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const B = `espacios/${huella('equipos', 'prueba123')}`, BE = `espacios/${huella('entregas', 'prueba123')}`;
const HOY = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
let ok = 0, mal = 0;
const log = (n, t, extra) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (extra && !t ? '\n      ' + extra : '')); };
const sem = semillaEquipos(); delete sem.nube_equipos_espacio;
const err = [];
const { ctx, page: en } = await pagina(br, { semilla: sem, errores: err });
const st = p => p.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso')));
const recDe = (s, serial) => Object.entries(s).filter(([k, v]) => k.startsWith(B + '/recibidos/') && v.serial === serial);
const pendDe = (s, serial) => recDe(s, serial).filter(([, v]) => !v.cerrado);
const hojaDe = (s, nombre) => Object.entries(s).find(([k, v]) => k.startsWith(BE + '/entregas/') && (v.nombre === nombre || (v.devolucion && v.devolucion.nombre === nombre)));
const archivosDe = (s, hid) => Object.keys(s).filter(k => k.startsWith(BE + '/archivos/' + hid + '_'));

async function subir(nombre, tipo, serial, archivo = 'hoja1.jpg') {
  await en.click('#tabSub'); await en.setInputFiles('#archivo', ['/tmp/claude-0/pr/' + archivo]); await en.waitForSelector('#l0n');
  await en.fill('#l0n', nombre); await en.fill('#l0f', '2026-10-14'); await en.selectOption('#l0t', tipo);
  await en.locator('[data-i="0"] [data-eq-k="serial"]').fill(serial);
  await en.click('#subGuardar'); await en.waitForSelector('#cfSheet:not([hidden])'); await en.click('#cfYes'); await esp(500);
}
async function abrirHoja(nombre) { await en.click('#tabEnt'); await en.locator('#entList .card.hoja', { hasText: nombre }).first().click(); await en.waitForSelector('#enSheet:not([hidden])'); }

// Entregas con la misma clave que Equipos
await en.goto(URL + '/entregas/'); await en.waitForSelector('#nubeClave');
await en.fill('#nubeK', 'prueba123'); await en.fill('#nubeN', 'Jeiler'); await en.click('#nubeEntrar');
await en.waitForSelector('#nubeNueva:not([hidden])'); await en.click('#nubeNueva'); await en.waitForSelector('#entList .empty-state'); await esp(300);

console.log('\n— A. Devolución → Listo en Equipos → la hoja pasa a Entrega');
await subir('Luis Pérez', 'devolucion', 'VB009911');
let s = await st(en);
let [hk, hv] = hojaDe(s, 'Luis Pérez'); const hidA = hk.split('/').pop();
let rec = pendDe(s, 'VB009911');
log('A1. la devolución crea un pendiente en Recibidos', rec.length === 1);
log('A2. el pendiente guarda su hoja y quién lo devolvió', rec[0][1].hoja === hidA && rec[0][1].devueltoPor === 'Luis Pérez');
log('A3. la hoja guarda su pendiente', hv.recibidos && hv.recibidos.VB009911 === rec[0][0].split('/').pop());
await en.click('#tabEnt'); await esp(200);
log('A4. la tarjeta en Entregas dice que está en Recibidos', (await en.locator('#entList .card.hoja', { hasText: 'Luis Pérez' }).innerText()).includes('En Recibidos'));

const eqp = await ctx.newPage(); eqp.on('pageerror', e => err.push('equipos: ' + e.message)); eqp.on('dialog', d => { err.push('diálogo nativo'); d.dismiss(); });
await eqp.goto(URL + '/equipos/'); await eqp.waitForSelector('#nubeClave');
await eqp.fill('#nubeK', 'prueba123'); await eqp.fill('#nubeN', 'Jeiler'); await eqp.click('#nubeEntrar'); await eqp.waitForSelector('#recList .card.rec'); await esp(300);
await eqp.click('#tabDb'); await esp(100);
log('A5. Equipos quedó conectada sola con Entregas (misma clave)', (await eqp.textContent('#enlaceInfo')).startsWith('Conectada'));
await eqp.click('#tabRec');
const ridA = rec[0][0].split('/').pop();
await eqp.click(`[data-listo="${ridA}"]`); await eqp.waitForSelector('#cfSheet:not([hidden])');
const opciones = await eqp.locator('#cfOpc [name=cfDest]').evaluateAll(xs => xs.map(x => x.value + (x.checked ? '*' : '')));
log('A6. al dar Listo pregunta a quién: Bodega (marcado), quien lo devolvió u otra', opciones.join('|') === 'Bodega Riohacha*|Luis Pérez|__otro', opciones.join('|'));
await eqp.check('#cfOpc [value="Luis Pérez"]'); await eqp.click('#cfYes'); await esp(600);
s = await st(eqp);
log('A7. Equipos: asignado a la persona escogida y registro cerrado', s[`${B}/equipos/VB009911`].asignado === 'Luis Pérez' && s[`${B}/recibidos/${ridA}`].cerrado && s[`${B}/recibidos/${ridA}`].cerradoA === 'Luis Pérez');
hv = s[hk];
log('A8. Entregas: la hoja pasó a Entrega a nombre de Luis Pérez', hv.tipo === 'entrega' && hv.nombre === 'Luis Pérez' && hv.devolucion && hv.devolucion.nombre === 'Luis Pérez', JSON.stringify({ tipo: hv.tipo, nombre: hv.nombre }));
await en.reload(); await en.waitForSelector('#entList .card.hoja'); await esp(300);
const tarjeta = await en.locator('#entList .card.hoja', { hasText: 'Luis Pérez' }).innerText();
log('A9. la tarjeta muestra Entrega y "Antes: devolución de Luis Pérez"', tarjeta.includes('Entrega') && tarjeta.includes('Antes: devolución de Luis Pérez'), tarjeta.replace(/\n/g, ' | '));
await abrirHoja('Luis Pérez'); await en.fill('#enNota', 'corregida'); await en.click('#enGuardar'); await esp(600);
s = await st(en);
log('A10. corregir la hoja después NO crea otro pendiente', pendDe(s, 'VB009911').length === 0);

console.log('\n— B. Listo con "Otra persona" y con Bodega');
await subir('Carlos Ipuana', 'devolucion', 'TAB55001');
s = await st(en); const ridB = pendDe(s, 'TAB55001')[0][0].split('/').pop();
await eqp.reload(); await eqp.waitForSelector(`[data-listo="${ridB}"]`);   // el Firebase falso no avisa entre pestañas; el real sí
await eqp.click(`[data-listo="${ridB}"]`); await eqp.waitForSelector('#cfSheet:not([hidden])');
await eqp.check('#cfOpc [value="__otro"]'); await eqp.click('#cfYes'); await esp(200);
log('B1. "Otra persona" sin nombre no deja seguir', await eqp.locator('#cfSheet').isVisible() && await eqp.locator('#cfDestOtro').isVisible());
await eqp.fill('#cfDestOtro', 'Diana Uriana'); await eqp.click('#cfYes'); await esp(600);
s = await st(eqp);
log('B2. queda asignado a la otra persona y la hoja a su nombre', s[`${B}/equipos/TAB55001`].asignado === 'Diana Uriana' && hojaDe(s, 'Diana Uriana') && hojaDe(s, 'Diana Uriana')[1].tipo === 'entrega');

console.log('\n— C. Borrar desde Equipos');
await subir('María Epieyú', 'devolucion', 'GPS778812');
s = await st(en); let [hkC] = hojaDe(s, 'María Epieyú'); const hidC = hkC.split('/').pop(); const ridC = pendDe(s, 'GPS778812')[0][0].split('/').pop();
log('C0. la hoja tiene sus páginas guardadas', archivosDe(s, hidC).length > 0);
await eqp.reload(); await eqp.waitForSelector(`[data-rec="${ridC}"]`);
await eqp.click(`[data-rec="${ridC}"]`); await eqp.click('#rcDel'); await eqp.waitForSelector('#cfSheet:not([hidden])');
log('C1. ofrece borrar también la hoja (marcado)', await eqp.locator('#cfBorrarHoja').isChecked());
await eqp.click('#cfYes'); await esp(600);
s = await st(eqp);
log('C2. se borran el registro, la hoja y sus páginas', !s[`${B}/recibidos/${ridC}`] && !s[hkC] && archivosDe(s, hidC).length === 0);
await subir('Rosa Pushaina', 'devolucion', 'STL00042');
s = await st(en); const [hkC3] = hojaDe(s, 'Rosa Pushaina'); const ridC3 = pendDe(s, 'STL00042')[0][0].split('/').pop();
await eqp.reload(); await eqp.waitForSelector(`[data-rec="${ridC3}"]`);
await eqp.click(`[data-rec="${ridC3}"]`); await eqp.click('#rcDel'); await eqp.waitForSelector('#cfSheet:not([hidden])');
await eqp.uncheck('#cfBorrarHoja'); await eqp.click('#cfYes'); await esp(600);
s = await st(eqp);
log('C3. si se desmarca, solo se borra en Equipos', !s[`${B}/recibidos/${ridC3}`] && !!s[hkC3]);

console.log('\n— D. Borrar desde Entregas');
await abrirHoja('Rosa Pushaina'); await en.click('#enDel'); await en.waitForSelector('#cfSheet:not([hidden])'); await en.click('#cfYes'); await esp(500);
await subir('Pedro Gómez', 'devolucion', 'GPS778812');
s = await st(en); const ridD = pendDe(s, 'GPS778812')[0][0].split('/').pop();
await en.reload(); await en.waitForSelector('#entList .card.hoja'); await esp(300);
await abrirHoja('Pedro Gómez'); await en.click('#enDel'); await en.waitForSelector('#cfSheet:not([hidden])');
log('D1. ofrece quitar el pendiente de Recibidos (marcado)', await en.locator('#cfBorrarPend').isChecked());
await en.click('#cfYes'); await esp(600);
s = await st(en);
log('D2. borrar la hoja quita el pendiente en Equipos', !s[`${B}/recibidos/${ridD}`] && !hojaDe(s, 'Pedro Gómez'));
await abrirHoja('Luis Pérez'); await en.click('#enDel'); await en.waitForSelector('#cfSheet:not([hidden])');
log('D3. si ya estaba terminado, ofrece borrarlo pero sin marcar', (await en.locator('#cfBorrarTerm').count()) === 1 && !(await en.locator('#cfBorrarTerm').isChecked()));
await en.click('#cfNo'); await en.click('#enCancel'); await esp(100);

console.log('\n— E. Corregir el tipo o el serial de la hoja');
await subir('Ana Gómez', 'devolucion', 'X4E01234');
await en.reload(); await en.waitForSelector('#entList .card.hoja'); await esp(300);
await abrirHoja('Ana Gómez'); await en.selectOption('#enTipo', 'entrega'); await en.click('#enGuardar'); await esp(700);
s = await st(en);
log('E1. pasar de Devolución a Entrega quita el pendiente y asigna el equipo', pendDe(s, 'X4E01234').length === 0 && s[`${B}/equipos/X4E01234`].asignado === 'Ana Gómez');
log('E2. guarda a quién estaba asignado antes', hojaDe(s, 'Ana Gómez')[1].antes && hojaDe(s, 'Ana Gómez')[1].antes.X4E01234 === 'Oficina Riohacha');
await abrirHoja('Ana Gómez'); await en.selectOption('#enTipo', 'devolucion'); await en.click('#enGuardar'); await esp(700);
await abrirHoja('Ana Gómez'); await en.locator('#enEqs [data-eq-k="serial"]').fill('R58N90AB'); await en.click('#enGuardar'); await esp(700);
s = await st(en);
log('E3. corregir el serial quita el pendiente del serial malo y deja uno del bueno', pendDe(s, 'X4E01234').length === 0 && pendDe(s, 'R58N90AB').length === 1, `X4E: ${pendDe(s, 'X4E01234').length}, R58: ${pendDe(s, 'R58N90AB').length}`);
await abrirHoja('Ana Gómez'); await en.locator('#enEqs [data-eq-k="serial"]').fill('X4E01234'); await en.selectOption('#enTipo', 'entrega'); await en.click('#enGuardar'); await esp(700);
await abrirHoja('Ana Gómez'); await en.click('#enDel'); await en.waitForSelector('#cfSheet:not([hidden])');
log('E4. al borrar una entrega ofrece devolver el equipo a quien lo tenía', await en.locator('#cfDevolver').isChecked());
await en.click('#cfYes'); await esp(600);
s = await st(en);
log('E5. el equipo vuelve a quien lo tenía antes', s[`${B}/equipos/X4E01234`].asignado === 'Oficina Riohacha', s[`${B}/equipos/X4E01234`].asignado);
log('E6. sin pendientes sueltos de R58N90AB', pendDe(s, 'R58N90AB').length === 0);

console.log('\n— F. Hojas de antes (sin enlace) se enlazan solas');
await en.evaluate(([B, BE]) => {
  const d = JSON.parse(localStorage.getItem('__fs_falso'));
  d[`${BE}/entregas/e-vieja`] = { nombre: 'Hoja Vieja', cedula: '', fecha: '2026-09-01', tipo: 'devolucion', proyecto: '', equipos: [{ tipo: 'GPS', serial: 'PF2XYZ01' }], seriales: 'PF2XYZ01', nota: '', paginas: [], miniatura: '', origen: 'x', subido: '2026-09-01T00:00:00Z' };
  d[`${B}/recibidos/r-vieja`] = { serial: 'PF2XYZ01', fechaIngreso: '2026-09-01', tipo: '', marca: '', modelo: '', persona: 'Bodega Riohacha', proyecto: '', mtto: 'pend', mttoFecha: '', backup: 'pend', backupFecha: '', obs: 'Devuelto por Hoja Vieja el 01/09/2026 (hoja de Entregas)', acc: [], cerrado: false, cerradoEn: '', origen: 'entregas' };
  localStorage.setItem('__fs_falso', JSON.stringify(d));
}, [B, BE]);
await en.reload(); await en.waitForSelector('#entList .card.hoja'); await esp(1200);
s = await st(en);
log('F1. la hoja vieja y su pendiente quedan enlazados', s[`${BE}/entregas/e-vieja`].recibidos && s[`${BE}/entregas/e-vieja`].recibidos.PF2XYZ01 === 'r-vieja' && s[`${B}/recibidos/r-vieja`].hoja === 'e-vieja');
await en.evaluate(B => { const d = JSON.parse(localStorage.getItem('__fs_falso')); d[`${B}/recibidos/r-vieja`].cerrado = true; localStorage.setItem('__fs_falso', JSON.stringify(d)); }, B);
await en.reload(); await en.waitForSelector('#entList .card.hoja'); await esp(1200);
s = await st(en);
log('F2. una hoja vieja ya terminada NO se cambia sola a Entrega', s[`${BE}/entregas/e-vieja`].tipo === 'devolucion');
log('F3. pero muestra que el equipo ya está listo', (await en.locator('#entList .card.hoja', { hasText: 'Hoja Vieja' }).innerText()).includes('ya listo'));

console.log('\n— G. Mantenimiento programado');
await eqp.evaluate(B => { const d = JSON.parse(localStorage.getItem('__fs_falso')); d[`${B}/equipos/VB009911`].fechaMtto = '2025-01-01'; localStorage.setItem('__fs_falso', JSON.stringify(d)); }, B);
await eqp.reload(); await eqp.waitForSelector('#recList .card.rec');
await eqp.click('#tabMt'); await eqp.waitForSelector('#mtList');
log('G1. sin programados, muestra el estado vacío y sugeridos', (await eqp.locator('#mtList .empty-state').count()) === 1 && Number(await eqp.locator('#sumMt [data-k="mSug"]').textContent()) >= 0);
await eqp.click('#btnNewMt'); await eqp.waitForSelector('#mtSheet:not([hidden])');
await eqp.fill('#mtSerial', 'GPS778812'); await esp(80);
log('G2. al escribir el serial muestra el equipo', (await eqp.textContent('#mtInfo')).includes('Asignado a'));
await eqp.fill('#mtFecha', '2026-01-02'); await eqp.fill('#mtNota', 'Comunicarse con Luis');
await eqp.click('#mtGuardar'); await esp(300);
s = await st(eqp);
log('G3. queda programado en el equipo', s[`${B}/equipos/GPS778812`].prog && s[`${B}/equipos/GPS778812`].prog.fecha === '2026-01-02' && s[`${B}/equipos/GPS778812`].prog.nota === 'Comunicarse con Luis');
log('G4. aparece en la lista como atrasado y la pestaña lo cuenta', (await eqp.locator('#mtList .card.mt.atras').count()) === 1 && (await eqp.textContent('#badgeMt')) === '1');
await eqp.click('#sumMt [data-filtro="sug"]'); await esp(100);
{
  const s5 = await st(eqp), viejo = f => !f || (Date.now() - Date.parse(f)) / 864e5 >= 181;
  const pend = new Set(Object.entries(s5).filter(([k, v]) => k.startsWith(B + '/recibidos/') && !v.cerrado).map(([, v]) => v.serial));
  const esperado = Object.entries(s5).filter(([k, v]) => k.startsWith(B + '/equipos/') && !(v.prog && v.prog.fecha) && !pend.has(v.serial) && viejo(v.fechaMtto)).map(([, v]) => v.serial).sort();
  const visto = (await eqp.locator('#mtList .card.mt.sug .serial').allTextContents()).sort();
  log('G5. sugeridos = equipos con 6+ meses o sin fecha, sin programar y que no están en Recibidos', visto.length > 0 && JSON.stringify(visto) === JSON.stringify(esperado), `visto ${visto} / esperado ${esperado}`);
}
await eqp.click('#sumMt [data-filtro="prog"]'); await esp(100);
await eqp.click('[data-mt-hecho="GPS778812"]'); await eqp.waitForSelector('#cfSheet:not([hidden])');
log('G6. pide la fecha del mantenimiento (hoy por defecto)', (await eqp.inputValue('#cfMtFecha')) === HOY);
await eqp.click('#cfYes'); await esp(300);
s = await st(eqp);
const g = s[`${B}/equipos/GPS778812`];
log('G7. Mantenimiento hecho: fecha nueva, sin programación y en el historial', g.fechaMtto === HOY && !g.prog && g.mttos && g.mttos.length === 1 && g.mttos[0].nota === 'Comunicarse con Luis');
await eqp.click('#tabEq'); await eqp.click('[data-eq="GPS778812"]'); await eqp.waitForSelector('#eqSheet:not([hidden])');
log('G8. el historial del equipo muestra el mantenimiento', (await eqp.textContent('#eqHist')).includes('Mantenimiento programado'));
await eqp.click('#eqProg'); await eqp.waitForSelector('#mtSheet:not([hidden])');
log('G9. desde el equipo se puede programar', (await eqp.inputValue('#mtSerial')) === 'GPS778812');
await eqp.click('#mtGuardar'); await esp(200);
await eqp.click('[data-mt="GPS778812"]'); await eqp.waitForSelector('#mtSheet:not([hidden])');
await eqp.click('#mtQuitar'); await eqp.waitForSelector('#cfSheet:not([hidden])'); await eqp.click('#cfYes'); await esp(300);
s = await st(eqp);
log('G10. se puede quitar la programación', !s[`${B}/equipos/GPS778812`].prog);

console.log('\nerrores JS o diálogos nativos:', err.length ? err : 'ninguno');
if (err.length) mal++;
await br.close(); srv.close();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
