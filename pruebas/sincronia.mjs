// Sincronía Entregas ↔ Equipos y mantenimiento programado. Uso: node pruebas/sincronia.mjs
import { chromium, lanzar, AXE_JS, FOTOS, SALIDA, servir, pagina, semillaEquipos, huella } from './banco.mjs';
const URL = 'http://127.0.0.1:8814', esp = ms => new Promise(r => setTimeout(r, ms));
const srv = await servir(8814); const br = await lanzar();
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
  await en.click('#tabSub'); await en.setInputFiles('#archivo', [FOTOS + '/' + archivo]); await en.waitForSelector('#l0n');
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
log('A5b. el pendiente que llegó de Entregas sale primero en Recibidos', (await eqp.locator('#recList .card.rec').first().locator(`[data-listo="${ridA}"]`).count()) === 1);
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

console.log('\n— G. Agenda: tareas físicas, remotas y backup');
await eqp.evaluate(B => { const d = JSON.parse(localStorage.getItem('__fs_falso')); d[`${B}/equipos/VB009911`].fechaMtto = '2025-01-01'; localStorage.setItem('__fs_falso', JSON.stringify(d)); }, B);
await eqp.reload(); await eqp.waitForSelector('#recList .card.rec');
const T_ = s => Object.entries(s).filter(([k]) => k.startsWith(B + '/tareas/'));
await eqp.click('#tabMt'); await eqp.waitForSelector('#mtList');
log('G1. sin tareas muestra el estado vacío', (await eqp.locator('#mtList .empty-state').count()) === 1);
{
  const s5 = await st(eqp), viejo = f => !f || (Date.now() - Date.parse(f)) / 864e5 >= 181;
  const pend = new Set(Object.entries(s5).filter(([k, v]) => k.startsWith(B + '/recibidos/') && !v.cerrado).map(([, v]) => v.serial));
  const esperado = Object.entries(s5).filter(([k, v]) => k.startsWith(B + '/equipos/') && !pend.has(v.serial) && viejo(v.fechaMtto)).map(([, v]) => v.serial).sort();
  await eqp.click('#sumMt [data-filtro="sug"]'); await esp(100);
  const visto = (await eqp.locator('#mtList .card.mt.sug .serial').allTextContents()).sort();
  log('G2. sugeridos = equipos con 6+ meses o sin fecha que no están en Recibidos', visto.length > 0 && JSON.stringify(visto) === JSON.stringify(esperado), `visto ${visto} / esperado ${esperado}`);
  const sug1 = visto[0];
  const btn = eqp.locator('#mtList .card.mt.sug', { hasText: sug1 }).locator('[data-t-prog]');
  log('G2b. el botón de un sugerido dice solo "Programar mantenimiento"', (await btn.innerText()).trim() === 'Programar mantenimiento');
  await btn.click(); await eqp.waitForSelector('#mtSheet:not([hidden])');
  log('G2c. la hoja abre sin tipo escogido y con el serial puesto', (await eqp.locator('#mtTipo [aria-pressed="true"]').count()) === 0 && (await eqp.inputValue('#mtSerial')) === sug1);
  await eqp.click('#mtGuardar'); await esp(100);
  log('G2d. sin escoger el tipo no deja guardar', (await eqp.textContent('#mtErr')).includes('Escoge el tipo de tarea'));
  await eqp.click('#mtTipo [data-tipo="remoto"]'); await eqp.click('#mtGuardar'); await esp(300);
  const sx = await st(eqp), tr = Object.entries(sx).find(([k, v]) => k.startsWith(B + '/tareas/') && v.serial === sug1);
  log('G2e. al escoger Mantenimiento remoto se guarda y el equipo sale de sugeridos', tr && tr[1].tipo === 'remoto' && !(await eqp.locator('#mtList .card.mt.sug .serial').allTextContents()).includes(sug1));
  await eqp.evaluate(([B, k]) => { const d = JSON.parse(localStorage.getItem('__fs_falso')); delete d[k]; localStorage.setItem('__fs_falso', JSON.stringify(d)); }, [B, tr[0]]);
  await eqp.reload(); await eqp.waitForSelector('#recList .card.rec'); await eqp.click('#tabMt'); await esp(200);
  await eqp.click('#sumMt [data-filtro="prog"]'); await esp(100);
}
// Backup remoto
await eqp.click('#btnNewMt'); await eqp.waitForSelector('#mtSheet:not([hidden])');
log('G3. por defecto es mantenimiento físico y no pide AnyDesk', (await eqp.getAttribute('#mtTipo [data-tipo="fisico"]', 'aria-pressed')) === 'true' && await eqp.locator('#mtAnyBox').isHidden());
await eqp.click('#mtTipo [data-tipo="backup"]');
log('G4. al escoger Backup pide el AnyDesk y explica', await eqp.locator('#mtAnyBox').isVisible() && (await eqp.textContent('#mtTipoAyuda')).includes('AnyDesk'));
await eqp.fill('#mtSerial', 'GPS778812'); await esp(80);
log('G5. al escribir el serial muestra el equipo', (await eqp.textContent('#mtInfo')).includes('Lo tiene'));
await eqp.fill('#mtFecha', '2026-01-02'); await eqp.fill('#mtAnydesk', '123 456 789'); await eqp.fill('#mtNota', 'Copiar Documentos y Escritorio');
await eqp.click('#mtGuardar'); await esp(300);
s = await st(eqp); const tk = T_(s);
log('G6. la tarea queda guardada con tipo, fecha, nota y quién la programó', tk.length === 1 && tk[0][1].tipo === 'backup' && tk[0][1].fecha === '2026-01-02' && tk[0][1].creadoPor === 'Jeiler' && tk[0][1].estado === 'pendiente');
log('G7. el número de AnyDesk queda en el equipo', s[`${B}/equipos/GPS778812`].anydesk === '123456789');
const tidB = tk[0][0].split('/').pop();
log('G8. aparece como atrasada, con el AnyDesk y su botón para abrirlo', (await eqp.locator('#mtList .card.mt.atras').count()) === 1 && (await eqp.getAttribute('#mtList a[href^="anydesk:"]', 'href')) === 'anydesk:123456789');
await eqp.click('#btnNewMt'); await eqp.click('#mtTipo [data-tipo="backup"]'); await eqp.fill('#mtSerial', 'GPS778812'); await eqp.fill('#mtFecha', '2026-02-02'); await eqp.click('#mtGuardar'); await esp(100);
log('G9. no deja programar dos veces el mismo tipo al mismo equipo', (await eqp.textContent('#mtErr')).includes('ya tiene programada esa tarea (backup y mantenimiento remoto)'));
await eqp.click('#mtCancel'); await esp(100); if (await eqp.locator('#cfSheet').isVisible()) await eqp.click('#cfYes');
// Ida y vuelta: prender el equipo
await eqp.click(`[data-t-acc="encender"][data-t="${tidB}"]`); await eqp.waitForSelector('#cfSheet:not([hidden])'); await eqp.click('#cfYes'); await esp(300);
s = await st(eqp);
log('G10. "Voy a conectarme" deja la tarea esperando que prendan el equipo y conecten el disco', s[`${B}/tareas/${tidB}`].estado === 'encender' && (await eqp.locator('#mtList .estado-t.org').innerText()).includes('conectarle el disco de backup'));
log('G10b. el botón dice "Equipo prendido y disco conectado"', (await eqp.locator(`[data-t-acc="encendido"][data-t="${tidB}"]`).innerText()).includes('disco conectado'));
await eqp.click(`[data-t-acc="encendido"][data-t="${tidB}"]`); await esp(300);
s = await st(eqp);
log('G11. "Ya está prendido" cambia el estado', s[`${B}/tareas/${tidB}`].estado === 'encendido' && (await eqp.locator('#mtList .estado-t.ok').count()) === 1);
await eqp.click(`[data-t-acc="nopudo"][data-t="${tidB}"]`); await eqp.waitForSelector('#cfSheet:not([hidden])'); await eqp.fill('#cfMotivo', 'No tenía internet'); await eqp.click('#cfYes'); await esp(300);
s = await st(eqp);
log('G12. "No se pudo" guarda el motivo y la tarea sigue activa', s[`${B}/tareas/${tidB}`].estado === 'nopudo' && (await eqp.locator('#mtList .estado-t.rojo').innerText()).includes('No tenía internet'));
await eqp.click(`[data-t-acc="hecho"][data-t="${tidB}"]`); await eqp.waitForSelector('#cfSheet:not([hidden])');
log('G13. "Hecho" pide la fecha (hoy por defecto) y el disco del backup', (await eqp.inputValue('#cfTFecha')) === HOY && await eqp.locator('#cfTDisco').isVisible());
await eqp.fill('#cfTNota', 'Copia en el disco D'); await eqp.click('#cfYes'); await esp(200);
log('G13b. sin el disco no deja terminar el backup', await eqp.locator('#cfSheet').isVisible());
await eqp.fill('#cfTDisco', 'Disco Backup 1'); await eqp.click('#cfYes'); await esp(300);
s = await st(eqp);
const eqG = s[`${B}/equipos/GPS778812`], tB = s[`${B}/tareas/${tidB}`];
log('G14. el backup hecho: fecha y disco en el equipo, historial y la tarea cerrada', eqG.fechaBackup === HOY && eqG.discoBackup === 'Disco Backup 1' && eqG.mttos.some(m => m.tipo === 'backup' && m.disco === 'Disco Backup 1' && m.nota === 'Copia en el disco D') && tB.estado === 'hecho' && tB.hecho.disco === 'Disco Backup 1' && tB.hist.map(h => h.que).join(',') === 'programada,encender,encendido,nopudo,hecho');
log('G15. y sale de la agenda', (await eqp.locator(`[data-t-acc][data-t="${tidB}"]`).count()) === 0);
// Físico: se cierra solo desde Recibidos
await eqp.click('#btnNewMt'); await eqp.fill('#mtSerial', '5CD1234ABC'); await eqp.fill('#mtFecha', HOY); await eqp.click('#mtGuardar'); await esp(300);
s = await st(eqp); const tidF = T_(s).find(([, v]) => v.serial === '5CD1234ABC')[0].split('/').pop();
await eqp.click('#tabRec'); await eqp.waitForSelector('[data-listo="r-1"]');
await eqp.click('[data-listo="r-1"]'); await eqp.waitForSelector('#cfSheet:not([hidden])');
log('G16. al dar Listo en Recibidos avisa que se cierra la tarea programada', (await eqp.textContent('#cfText')).includes('Se da por hecha la tarea programada: mantenimiento físico'));
await eqp.click('#cfYes'); await esp(600);
s = await st(eqp);
log('G17. la tarea física queda hecha y el equipo con fecha y backup nuevos', s[`${B}/tareas/${tidF}`].estado === 'hecho' && s[`${B}/equipos/5CD1234ABC`].fechaMtto === HOY && s[`${B}/equipos/5CD1234ABC`].fechaBackup === HOY);
// Ficha del equipo y quitar
await eqp.click('#tabEq'); await eqp.click('[data-eq="GPS778812"]'); await eqp.waitForSelector('#eqSheet:not([hidden])');
log('G18. la ficha muestra el último backup con su disco y el historial', (await eqp.textContent('#eqFechasExtra')).includes('en el disco Disco Backup 1') && (await eqp.textContent('#eqHist')).includes('Quedó en el disco Disco Backup 1'));
log('G19. la ficha tiene el número de AnyDesk', (await eqp.inputValue('#eqAnydesk')) === '123456789');
await eqp.click('#eqProg'); await eqp.waitForSelector('#mtSheet:not([hidden])');
log('G20. desde el equipo se programa una tarea nueva', (await eqp.inputValue('#mtSerial')) === 'GPS778812' && (await eqp.textContent('#mtTitle')) === 'Programar tarea');
await eqp.click('#mtTipo [data-tipo="remoto"]'); await eqp.click('#mtGuardar'); await esp(300);
s = await st(eqp); const tidR = T_(s).find(([, v]) => v.tipo === 'remoto')[0].split('/').pop();
await eqp.click(`[data-t-abrir="${tidR}"]`); await eqp.waitForSelector('#mtSheet:not([hidden])');
log('G21. la tarea muestra lo que ha pasado', (await eqp.textContent('#mtHist')).includes('Programó la tarea'));
await eqp.click('#mtQuitar'); await eqp.waitForSelector('#cfSheet:not([hidden])'); await eqp.click('#cfYes'); await esp(300);
s = await st(eqp);
log('G22. se puede quitar una tarea', !s[`${B}/tareas/${tidR}`]);
// Programados con la versión anterior pasan solos a tareas
await eqp.evaluate(B => { const d = JSON.parse(localStorage.getItem('__fs_falso')); d[`${B}/equipos/TAB55001`].prog = { fecha: '2026-11-01', nota: 'viejo', resp: 'Jeiler', por: 'Carlos', creado: '2026-10-01T00:00:00Z' }; localStorage.setItem('__fs_falso', JSON.stringify(d)); }, B);
await eqp.reload(); await eqp.waitForSelector('#recList .card.rec'); await esp(800);
s = await st(eqp);
log('G23. un programado viejo pasa a tarea y se limpia del equipo', s[`${B}/tareas/mig-TAB55001`] && s[`${B}/tareas/mig-TAB55001`].resp === 'Jeiler' && s[`${B}/tareas/mig-TAB55001`].creadoPor === 'Carlos' && !s[`${B}/equipos/TAB55001`].prog);

console.log('\nerrores JS o diálogos nativos:', err.length ? err : 'ninguno');
if (err.length) mal++;
await br.close(); srv.close();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
