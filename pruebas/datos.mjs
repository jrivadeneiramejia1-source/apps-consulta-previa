// Versión 29: cuidar los datos. Uso: node pruebas/datos.mjs
// Equipos: el Excel trae la hoja Historial; borrar un equipo ofrece quitar sus tareas de la Agenda.
// Entregas: cuánto espacio del plan gratis de Firebase ocupan las hojas. Las dos: cuándo se descargó la última copia.
import fs from 'node:fs';
import { lanzar, AXE_JS, servir, pagina, semillaEquipos, huella, require } from './banco.mjs';
const XLSX = require('xlsx');
const URL = 'http://127.0.0.1:8829', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const CLAVE = 'prueba123', B = `espacios/${huella('equipos', CLAVE)}`, BE = `espacios/${huella('entregas', CLAVE)}`;
const dias = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
async function axe(page, nombre) {
  await esp(350);
  await page.addScriptTag({ content: AXE_JS });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
  log(`axe sin fallas: ${nombre}`, !r.length, r.join('\n      '));
}
const fsDe = p => p.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso')));
async function descargar(page, boton) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click(boton)]);
  return { nombre: d.suggestedFilename(), ruta: await d.path() };
}

// ---------- datos ----------
const sem = semillaEquipos(CLAVE), F = sem.__fs_falso;
F[`${B}/equipos/GPS778812`].mttos = [{ fecha: dias(10), tipo: 'backup', por: 'Ana Gómez', disco: 'Disco Backup 1', nota: 'carpeta GPS' }, { fecha: dias(40), tipo: 'remoto', por: 'Jeiler', nota: 'drivers' }];
F[`${B}/tareas/t-1`] = { serial: 'PF2XYZ01', tipo: 'remoto', fecha: dias(-2), nota: '', resp: '', creadoPor: 'Jeiler', creado: new Date().toISOString(), estado: 'pendiente', hist: [] };
F[`${B}/tareas/t-2`] = { serial: 'PF2XYZ01', tipo: 'backup', fecha: dias(-5), nota: '', resp: '', creadoPor: 'Jeiler', creado: new Date().toISOString(), estado: 'pendiente', hist: [] };
F[`${B}/tareas/t-3`] = { serial: 'TAB55001', tipo: 'fisico', fecha: dias(-3), nota: '', resp: '', creadoPor: 'Jeiler', creado: new Date().toISOString(), estado: 'pendiente', hist: [] };
const hoja = (bytes, n = 1) => ({ nombre: 'Ana Gómez', cedula: '1122', fecha: '2026-09-01', tipo: 'otro', proyecto: '', equipos: [], seriales: '', nota: '', paginas: Array.from({ length: n }, () => ({ trozos: Math.ceil(bytes * 4 / 3 / 700000), ancho: 1700, alto: 2200, bytes, origen: 'semilla' })), miniatura: '', origen: 'semilla', subido: new Date().toISOString(), actualizado: new Date().toISOString(), por: 'Jeiler' });
F[`${BE}/entregas/e-1`] = hoja(160000, 2);
Object.assign(sem, { nube_entregas_espacio: huella('entregas', CLAVE), nube_entregas_nombre: 'Jeiler' });

const srv = await servir(8829); const br = await lanzar();
const err = [];
const { ctx, page } = await pagina(br, { semilla: sem, errores: err });
await ctx.addInitScript(() => { window.__codigosSinNativo = true; });

// ======================= EQUIPOS =======================
console.log('\n— Equipos');
await page.goto(URL + '/equipos/'); await page.waitForSelector('#recList .card'); await esp(400);

// Copia de seguridad: nunca descargada en este teléfono
await page.click('#tabDb'); await page.waitForSelector('#nubeCopia');
const c0 = await page.evaluate(() => { const el = document.getElementById('nubeCopia'); return { t: el.textContent, v: el.classList.contains('nube-vieja'), antes: el.previousElementSibling && el.previousElementSibling.id }; });
log('C1. dice que en este teléfono no se ha descargado una copia, resaltado', /todavía no has descargado/.test(c0.t) && c0.v, JSON.stringify(c0));
log('C2. el aviso va justo debajo de "Estás como…"', c0.antes === 'nubeInfo', JSON.stringify(c0));
await axe(page, 'base de datos con el aviso de la copia');

// Excel con la hoja Historial
const x = await descargar(page, '#btnExcel');
const wb = XLSX.read(fs.readFileSync(x.ruta), { cellDates: true });
log('X1. el Excel trae Equipos, Recibidos e Historial', JSON.stringify(wb.SheetNames) === JSON.stringify(['Equipos', 'Recibidos', 'Historial']), JSON.stringify(wb.SheetNames));
const his = XLSX.utils.sheet_to_json(wb.Sheets.Historial, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
const filas = his.slice(1);
log('X2. encabezados del historial', his[0].join('|') === 'FECHA|SERIAL|TIPO DE EQUIPO|MARCA|MODELO|TRABAJO|DÓNDE SE REGISTRÓ|HECHO POR|A NOMBRE DE|DISCO DEL BACKUP|NOTA', his[0].join('|'));
const bk = filas.find(f => f[1] === 'GPS778812' && f[5] === 'Backup y mantenimiento remoto');
log('X3. backup de la Agenda: quién, disco y nota', bk && bk[6] === 'Agenda' && bk[7] === 'Ana Gómez' && bk[9] === 'Disco Backup 1' && bk[10] === 'carpeta GPS', JSON.stringify(bk));
log('X4. actualización de antivirus de la Agenda', filas.some(f => f[1] === 'GPS778812' && f[5] === 'Actualización de antivirus'), JSON.stringify(filas));
const rc = filas.find(f => f[1] === 'R58N90AB');
log('X5. mantenimiento hecho en Recibidos, a nombre de quien lo trajo', rc && rc[5] === 'Mantenimiento físico' && rc[6] === 'Recibidos' && rc[8] === 'María Epieyú', JSON.stringify(rc));
log('X6. solo lo que se hizo (3 filas: nada pendiente)', filas.length === 3, JSON.stringify(filas));
const celda = wb.Sheets.Historial.A2;
log('X7. la fecha es fecha de Excel, la más reciente primero', celda && celda.t === 'd' && filas[0][1] === 'R58N90AB', JSON.stringify(celda) + ' ' + filas.map(f => f[1]).join(','));

// Copia JSON: queda la fecha
const cp = await descargar(page, '#btnCopia');
const c1 = await page.evaluate(() => ({ t: document.getElementById('nubeCopia').textContent, v: document.getElementById('nubeCopia').classList.contains('nube-vieja') }));
log('C3. tras descargar la copia dice "hoy" sin resaltar', /Última copia descargada en este teléfono: hoy\./.test(c1.t) && !c1.v && /^Copia Equipos/.test(cp.nombre), JSON.stringify(c1) + ' ' + cp.nombre);
await page.evaluate(() => localStorage.setItem('nube_equipos_copia', String(Date.now() - 45 * 864e5)));
await page.reload(); await page.waitForSelector('#recList .card'); await page.click('#tabDb'); await page.waitForSelector('#nubeCopia');
const c2 = await page.evaluate(() => ({ t: document.getElementById('nubeCopia').textContent, v: document.getElementById('nubeCopia').classList.contains('nube-vieja') }));
log('C4. a los 45 días pide otra copia, resaltado', /hace 45 días\. Ya toca otra\./.test(c2.t) && c2.v, JSON.stringify(c2));

// Borrar un equipo con dos tareas en la Agenda
await page.click('#tabEq'); await page.fill('#qEq', 'PF2XYZ01'); await page.click('[data-eq="PF2XYZ01"]'); await page.waitForSelector('#eqSheet:not([hidden])');
await page.click('#eqDel'); await page.waitForSelector('#cfSheet:not([hidden])');
const o1 = await page.evaluate(() => ({ visible: !document.getElementById('cfOpc').hidden, marcado: !!(document.getElementById('cfBorrarTareas') || {}).checked, t: document.getElementById('cfOpc').textContent }));
log('B1. ofrece quitar sus 2 tareas de la Agenda, marcado', o1.visible && o1.marcado && /sus 2 tareas programadas/.test(o1.t) && /actualización de antivirus del/.test(o1.t) && /backup y mantenimiento remoto del/.test(o1.t), JSON.stringify(o1));
await axe(page, 'borrar equipo con tareas');
await page.click('#cfYes'); await esp(400);
const d1 = await fsDe(page);
log('B2. borra el equipo y sus dos tareas; las demás siguen', !d1[`${B}/equipos/PF2XYZ01`] && !d1[`${B}/tareas/t-1`] && !d1[`${B}/tareas/t-2`] && !!d1[`${B}/tareas/t-3`], Object.keys(d1).filter(k => k.includes('/tareas/')).join(','));
log('B3. el aviso cuenta las tareas quitadas', /Equipo eliminado y sus 2 tareas quitadas de la Agenda/.test(await page.textContent('#toast')), await page.textContent('#toast'));

// Sin marcar la casilla: la tarea se queda
await page.fill('#qEq', 'TAB55001'); await page.click('[data-eq="TAB55001"]'); await page.waitForSelector('#eqSheet:not([hidden])');
await page.click('#eqDel'); await page.waitForSelector('#cfSheet:not([hidden])');
await page.uncheck('#cfBorrarTareas'); await page.click('#cfYes'); await esp(400);
const d2 = await fsDe(page);
log('B4. sin la casilla, borra el equipo y deja la tarea', !d2[`${B}/equipos/TAB55001`] && !!d2[`${B}/tareas/t-3`]);

// Equipo en Recibidos y sin tareas: solo la nota
await page.fill('#qEq', '5CD1234ABC'); await page.click('[data-eq="5CD1234ABC"]'); await page.waitForSelector('#eqSheet:not([hidden])');
await page.click('#eqDel'); await page.waitForSelector('#cfSheet:not([hidden])');
const o3 = await page.evaluate(() => ({ casilla: !!document.getElementById('cfBorrarTareas'), t: document.getElementById('cfOpc').textContent }));
log('B5. sin tareas no hay casilla; avisa que sigue en Recibidos', !o3.casilla && /Está en Recibidos \(en espera\)/.test(o3.t), JSON.stringify(o3));
await page.click('#cfNo');

// ======================= ENTREGAS =======================
console.log('\n— Entregas');
await page.goto(URL + '/entregas/'); await page.waitForSelector('#entList .card'); await esp(300);
await page.click('#tabDb'); await page.waitForSelector('#espacioInfo');
const e1 = await page.evaluate(() => ({ t: document.getElementById('espacioInfo').textContent, lleno: document.getElementById('espacioBarra').classList.contains('lleno'), sub: document.getElementById('subEspacio').hidden }));
log('E1. dice cuánto se usa del plan gratis y cuántas páginas caben', /^Usado: menos de 1 MB de 1 GB del plan gratis \(0 %\), aproximado\. Caben unas [\d.]+ páginas más como las que ya hay\.$/.test(e1.t) && !e1.lleno && e1.sub, JSON.stringify(e1));
const n1 = Number((e1.t.match(/Caben unas ([\d.]+)/) || [])[1].replace(/\./g, ''));
log('E2. el cálculo es razonable (páginas de 160 KB: entre 4.000 y 6.000 más)', n1 > 4000 && n1 < 6000, String(n1));
await axe(page, 'entregas: base de datos con el espacio');

// Se llena: 4.300 páginas de 160 KB (unos 900 MB en Firebase)
await page.evaluate(h => { window.__hojaGrande = h; }, hoja(160000, 4300));
await page.evaluate(async () => { const db = await window.claude.use('db'); await db.collection('entregas').doc('e-grande').set(window.__hojaGrande); });
await page.waitForFunction(() => document.getElementById('espacioBarra').classList.contains('lleno'), null, { timeout: 5000 }).catch(() => {});
const e2 = await page.evaluate(() => ({ t: document.getElementById('espacioInfo').textContent, lleno: document.getElementById('espacioBarra').classList.contains('lleno'), ancho: document.querySelector('#espacioBarra span').style.width }));
log('E3. al pasar del 80 % se pinta de aviso y dice qué hacer', e2.lleno && /\(8\d %\)/.test(e2.t) && /borra las hojas viejas/.test(e2.t) && /plan Blaze/.test(e2.t), JSON.stringify(e2));
await page.click('#tabSub'); await esp(200);
const s1 = await page.evaluate(() => ({ visible: !document.getElementById('subEspacio').hidden, t: document.getElementById('subEspacioTxt').textContent }));
log('E4. en Subir avisa antes de escanear', s1.visible && /^Firebase va en 8\d % de su espacio gratis \(caben unas [\d.]+ páginas más como las que ya hay\)\./.test(s1.t), JSON.stringify(s1));
await axe(page, 'entregas: subir con el aviso de espacio');

// Lleno del todo
await page.evaluate(async () => { const db = await window.claude.use('db'), h = JSON.parse(JSON.stringify(window.__hojaGrande)); await db.collection('entregas').doc('e-grande2').set(h); });
await page.waitForFunction(() => /Firebase está lleno/.test(document.getElementById('subEspacioTxt').textContent), null, { timeout: 5000 }).catch(() => {});
const s2 = await page.textContent('#subEspacioTxt');
log('E5. al pasar de 1 GB dice que las hojas nuevas no se van a guardar', /^Firebase está lleno \(1,\d\d GB de 1 GB\): las hojas nuevas no se van a guardar/.test(s2), s2);

log('sin errores en la página', !err.length, err.join('\n      '));
await br.close(); srv.close();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
