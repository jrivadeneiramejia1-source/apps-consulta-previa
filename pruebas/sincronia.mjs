// Revisa la sincronía Entregas ↔ Equipos (solo mira, no cambia nada).
import { chromium, servir, pagina, semillaEquipos, huella } from './banco.mjs';
const URL = 'http://127.0.0.1:8814', esp = ms => new Promise(r => setTimeout(r, ms));
const srv = await servir(8814); const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const B = `espacios/${huella('equipos', 'prueba123')}`, BE = `espacios/${huella('entregas', 'prueba123')}`;
const sem = semillaEquipos(); delete sem.nube_equipos_espacio;
const err = [];
const { ctx, page: en } = await pagina(br, { semilla: sem, errores: err });
const st = p => p.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso')));
const recDe = (s, serial) => Object.entries(s).filter(([k, v]) => k.startsWith(B + '/recibidos/') && v.serial === serial);
const hojas = s => Object.entries(s).filter(([k]) => k.startsWith(BE + '/entregas/'));
const log = (n, t) => console.log((t ? 'OK   ' : 'FALLA') + ' ' + n);

await en.goto(URL + '/entregas/'); await en.waitForSelector('#nubeClave');
await en.fill('#nubeK', 'prueba123'); await en.fill('#nubeN', 'Jeiler'); await en.click('#nubeEntrar');
await en.waitForSelector('#nubeNueva:not([hidden])'); await en.click('#nubeNueva'); await en.waitForSelector('#entList .empty-state'); await esp(300);

// 1) devolución de VB009911 → Recibidos
await en.click('#tabSub'); await en.setInputFiles('#archivo', ['/tmp/claude-0/pr/hoja1.jpg']); await en.waitForSelector('#l0n');
await en.fill('#l0n', 'Luis Pérez'); await en.fill('#l0f', '2026-10-14'); await en.selectOption('#l0t', 'devolucion');
await en.locator('[data-i="0"] [data-eq-k="serial"]').fill('VB009911');
await en.click('#subGuardar'); await en.waitForSelector('#cfSheet:not([hidden])'); await en.click('#cfYes'); await esp(400);
let s = await st(en);
const rec = recDe(s, 'VB009911'), hoja = hojas(s)[0];
log('1. la devolución crea el pendiente en Recibidos', rec.length === 1 && !rec[0][1].cerrado);
log('1b. el recibido guarda de qué hoja vino (enlace entre registros)', JSON.stringify(rec[0][1]).includes(hoja[0].split('/').pop()));
log('1c. la hoja guarda qué recibido creó', JSON.stringify(hoja[1]).includes(rec[0][0].split('/').pop()));

// 2) en Equipos se da por listo
const p2 = await ctx.newPage(); p2.on('pageerror', e => err.push(e.message));
await p2.evaluate(() => 0).catch(() => {});
await p2.goto(URL + '/equipos/'); await p2.waitForSelector('#nubeClave');
await p2.fill('#nubeK', 'prueba123'); await p2.fill('#nubeN', 'Jeiler'); await p2.click('#nubeEntrar'); await p2.waitForSelector('#recList .card.rec');
const rid = rec[0][0].split('/').pop();
await p2.click(`[data-listo="${rid}"]`); await p2.waitForSelector('#cfSheet:not([hidden])'); await p2.click('#cfYes'); await esp(400);
s = await st(p2);
log('2. en Equipos queda cerrado y el equipo en Bodega Riohacha', s[`${B}/recibidos/${rid}`].cerrado && s[`${B}/equipos/VB009911`].asignado === 'Bodega Riohacha');
await en.reload(); await en.waitForSelector('#entList .card.hoja'); await esp(300);
const txtHoja = await en.locator('#entList .card.hoja').first().innerText();
log('2b. Entregas muestra que el equipo ya se recibió/terminó (no solo "Devolución")', /recibid|listo|terminad|entregad/i.test(txtHoja));
console.log('     tarjeta en Entregas: ' + txtHoja.replace(/\n+/g, ' | '));

// 3) editar la hoja después (corregir el nombre) → ¿crea otro pendiente?
await en.locator('#entList .card.hoja').first().click(); await en.waitForSelector('#enSheet:not([hidden])');
await en.fill('#enNombre', 'Luis Pérez Ipuana'); await en.click('#enGuardar'); await esp(600);
s = await st(en);
log('3. corregir el nombre NO crea otro pendiente en Recibidos', recDe(s, 'VB009911').filter(([, v]) => !v.cerrado).length === 0);
console.log('     recibidos de VB009911: ' + recDe(s, 'VB009911').map(([k, v]) => (v.cerrado ? 'cerrado' : 'PENDIENTE')).join(', '));

// 4) borrar la hoja en Entregas → ¿se borra el recibido?
await en.locator('#entList .card.hoja').first().click(); await en.waitForSelector('#enSheet:not([hidden])');
await en.click('#enDel'); await en.waitForSelector('#cfSheet:not([hidden])'); await en.click('#cfYes'); await esp(400);
s = await st(en);
log('4. borrar la hoja borra también lo que creó en Recibidos', recDe(s, 'VB009911').length === 0);

// 5) nueva devolución y se borra desde Equipos → ¿se borra la hoja?
await en.click('#tabSub'); await en.setInputFiles('#archivo', ['/tmp/claude-0/pr/hoja2.jpg']); await en.waitForSelector('#l0n');
await en.fill('#l0n', 'María Epieyú'); await en.fill('#l0f', '2026-10-15'); await en.selectOption('#l0t', 'devolucion');
await en.locator('[data-i="0"] [data-eq-k="serial"]').fill('TAB55001');
await en.click('#subGuardar'); await en.waitForSelector('#cfSheet:not([hidden])'); await en.click('#cfYes'); await esp(400);
s = await st(en); const r5 = recDe(s, 'TAB55001')[0][0].split('/').pop();
await p2.reload(); await p2.waitForSelector(`[data-rec="${r5}"]`);
await p2.click(`[data-rec="${r5}"]`); await p2.click('#rcDel'); await p2.waitForSelector('#cfSheet:not([hidden])'); await p2.click('#cfYes'); await esp(400);
s = await st(p2);
log('5. borrar en Recibidos borra (o marca) la hoja en Entregas', !hojas(s).some(([, v]) => v.nombre === 'María Epieyú'));
log('5b. Equipos conoce la base de datos de Entregas', await p2.evaluate(() => !!(window.APP.enlaces || []).length));

// 6) cambiar la hoja de Devolución a Entrega → ¿se quita el pendiente?
await en.reload(); await en.waitForSelector('#entList .card.hoja');
await en.click('#tabSub'); await en.setInputFiles('#archivo', ['/tmp/claude-0/pr/hoja1.jpg']); await en.waitForSelector('#l0n');
await en.fill('#l0n', 'Ana Gómez'); await en.fill('#l0f', '2026-10-15'); await en.selectOption('#l0t', 'devolucion');
await en.locator('[data-i="0"] [data-eq-k="serial"]').fill('X4E01234');
await en.click('#subGuardar'); await en.waitForSelector('#cfSheet:not([hidden])'); await en.click('#cfYes'); await esp(400);
await en.locator('#entList .card.hoja', { hasText: 'Ana Gómez' }).click(); await en.waitForSelector('#enSheet:not([hidden])');
await en.selectOption('#enTipo', 'entrega'); await en.click('#enGuardar'); await esp(600);
s = await st(en);
log('6. pasar la hoja de Devolución a Entrega quita el pendiente', recDe(s, 'X4E01234').filter(([, v]) => !v.cerrado).length === 0);
console.log('     X4E01234: asignado a ' + s[`${B}/equipos/X4E01234`].asignado + '; pendientes: ' + recDe(s, 'X4E01234').filter(([, v]) => !v.cerrado).length);

// 7) cambiar el serial en la hoja (estaba mal escrito)
await en.locator('#entList .card.hoja', { hasText: 'Ana Gómez' }).click(); await en.waitForSelector('#enSheet:not([hidden])');
await en.selectOption('#enTipo', 'devolucion'); await en.locator('#enEqs [data-eq-k="serial"]').fill('PF2XYZ01'); await en.click('#enGuardar'); await esp(600);
s = await st(en);
log('7. corregir el serial quita el pendiente del serial equivocado', recDe(s, 'X4E01234').filter(([, v]) => !v.cerrado).length === 0);
console.log('     pendientes X4E01234: ' + recDe(s, 'X4E01234').filter(([, v]) => !v.cerrado).length + ', PF2XYZ01: ' + recDe(s, 'PF2XYZ01').filter(([, v]) => !v.cerrado).length);
console.log('errores JS:', err.length ? err : 'ninguno');
await br.close(); srv.close();
