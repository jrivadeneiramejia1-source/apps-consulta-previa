// Versión 36 (y 39: dice qué app cambió): aviso de «la app se actualizó». Uso: node pruebas/novedades.mjs
/* global personas, AV */   // funciones de la app de Equipos, usadas dentro de page.evaluate
// ../version.json trae `notas` solo en las versiones que se quieren avisar. La primera persona que abre Equipos después de publicarla
// le manda a todas las personas con notificaciones (también a ella) un aviso que dice qué app se actualizó y trae esas notas; la versión ya avisada queda en avisos/_novedades.
import fs from 'node:fs';
import { lanzar, servir, pagina, semillaEquipos, huella, RAIZ } from './banco.mjs';
const URL = 'http://127.0.0.1:8835/equipos/', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const B = `espacios/${huella('equipos', 'prueba123')}`, WORKER = 'https://avisos-equipos.jrivadeneiramejia1.workers.dev/**';
const VERSION = Number(JSON.parse(fs.readFileSync(RAIZ + '/version.json', 'utf8')).v);
const NOTAS = ['Entregas: Bodega y Descargado en las hojas', 'Soporte: Historial de movimientos', 'Avisos cuando la app se actualiza'];
const sub = n => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/' + n, keys: { p256dh: 'BEl6-c', auth: 'aa' } });
const fsDe = p => p.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso')));
const ahora = new Date().toISOString();

function semilla(extra = {}, quienes = ['ana', 'luis', 'pedro', 'jeiler']) {
  const s = semillaEquipos('prueba123'), F = s.__fs_falso;
  const nom = { ana: 'Ana Gómez', luis: 'Luis', pedro: 'Pedro', jeiler: 'Jeiler' };
  for (const q of quienes) F[`${B}/avisos/d-${q}`] = { nombre: nom[q], app: 'equipos', equipo: 'Android · Chrome', creado: ahora, visto: ahora, sub: q === 'pedro' ? null : sub(q) };
  s.eqcp_disp = '"d-jeiler"';   // este teléfono es el de Jeiler
  return Object.assign(s, extra);
}

const srv = await servir(8835);
const b = await lanzar();
// Abre Equipos como Jeiler con lo que `version.json` diga; devuelve lo que pasó.
async function abrirCon({ version, extra, quienes, antes }) {
  const errs = [], envios = [];
  const { ctx, page } = await pagina(b, { semilla: semilla(extra, quienes), errores: errs });
  let respuesta = version;
  await ctx.route(/\/version\.json/, r => (respuesta === null ? r.fulfill({ status: 404, body: 'no' }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respuesta) })));
  await ctx.route(WORKER, async r => { const d = JSON.parse(r.request().postData()); envios.push(d); await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:8835' }, body: JSON.stringify({ ok: true, resultados: d.subs.map(() => ({ estado: 201 })) }) }); });
  if (antes) await antes(ctx);
  await page.goto(URL); await page.waitForSelector('#recList .card.rec'); await esp(1200);
  return { ctx, page, errs, envios, cambiar: v => { respuesta = v; } };
}
const destinos = envios => envios.flatMap(e => e.subs.map(s => s.endpoint.split('/').pop())).sort();

try {
  console.log('Se publica una versión con novedades');
  {
    const { ctx, page, envios, errs, cambiar } = await abrirCon({ version: { v: String(VERSION), notas: NOTAS } });
    const s = await fsDe(page), marca = s[`${B}/avisos/_novedades`];
    log('N1. avisa a todas las personas con notificaciones (también a Jeiler, quien abrió), no a Pedro (sin notificaciones)', destinos(envios).join() === 'ana,jeiler,luis', destinos(envios).join());
    const aviso = envios[0] || {};
    log('N2. el aviso dice qué apps se actualizaron, la versión y las novedades', aviso.titulo === `Se actualizaron Equipos y Entregas (versión ${VERSION})` && aviso.cuerpo === NOTAS.join(' · ') && aviso.etiqueta === 'novedades' && aviso.url === './', JSON.stringify(aviso));
    log('N3. queda anotada la versión avisada, quién la avisó y las notas', !!marca && marca.v === String(VERSION) && marca.por === 'Jeiler' && JSON.stringify(marca.notas) === JSON.stringify(NOTAS) && !!marca.en, JSON.stringify(marca));
    log('N4. quien abrió ve a cuántas personas le llegó', /Aviso de la versión \d+ enviado a 3 personas/.test(await page.locator('#toast').textContent().catch(() => '')), await page.locator('#toast').textContent().catch(() => ''));
    const nombres = await page.evaluate(() => personas().map(p => p.nombre));
    log('N5. la nota de la versión no aparece como una persona ni como teléfono', nombres.join() === 'Ana Gómez,Jeiler,Luis,Pedro' && !(await page.evaluate(() => [...AV.keys()].includes('_novedades'))), nombres.join());
    await page.reload(); await page.waitForSelector('#recList .card.rec'); await esp(1200);
    log('N6. al volver a abrir la app no se repite el aviso', envios.length === 3, `${envios.length} envíos`);
    await page.click('#tabMt'); await esp(200);
    log('N7. la pestaña Agenda y las personas siguen bien con la nota guardada', (await page.locator('#vMt').count()) === 1 && errs.length === 0, errs.join('\n      '));
    // Sale una versión nueva con novedades: vuelve a avisar
    cambiar({ v: String(VERSION + 1), notas: ['Otra novedad'] });
    await page.reload(); await page.waitForSelector('#recList .card.rec'); await esp(3000);
    log('N8. una versión nueva con novedades vuelve a avisar, con su propio texto', envios.length === 6 && envios.slice(3).every(e => e.cuerpo === 'Otra novedad' && e.titulo === `Se actualizaron las apps (versión ${VERSION + 1})`), envios.map(e => e.titulo + '|' + e.cuerpo).join('\n      '));
    await ctx.close();
  }

  console.log('\nEl aviso dice qué app se actualizó');
  {
    const caso = async notas => { const { ctx, envios } = await abrirCon({ version: { v: String(VERSION), notas } }); const e = envios[0] || {}; await ctx.close(); return e; };
    let e = await caso(['Entregas: las hojas de devolución muestran cuándo se terminó el backup', 'Entregas: Bodega en el filtro']);
    log('T1. si solo cambió Entregas, lo dice, quita el "Entregas:" de las notas y abre Entregas al tocarlo', e.titulo === `Se actualizó Entregas (versión ${VERSION})` && e.cuerpo === 'Las hojas de devolución muestran cuándo se terminó el backup · Bodega en el filtro' && e.url === '../entregas/', JSON.stringify(e));
    e = await caso(['Soporte: Historial de movimientos', 'Equipos: Recibidos ordenados por fecha']);
    log('T2. Soporte y Recibidos cuentan como Equipos, que se abre con "./"', e.titulo === `Se actualizó Equipos (versión ${VERSION})` && e.url === './' && e.cuerpo.startsWith('Historial de movimientos'), JSON.stringify(e));
    e = await caso(['Equipos: algo', 'Entregas: otra cosa', 'Evidencias: una más']);
    log('T3. con tres apps las nombra a todas y abre Equipos; las notas quedan como están', e.titulo === `Se actualizaron Equipos, Entregas y Evidencias (versión ${VERSION})` && e.url === './' && e.cuerpo === 'Equipos: algo · Entregas: otra cosa · Evidencias: una más', JSON.stringify(e));
    e = await caso(['Entregas: algo', 'Mejoras generales de velocidad']);
    log('T4. una nota general junto a una de Entregas: el título dice Entregas y las notas no se tocan', e.titulo === `Se actualizó Entregas (versión ${VERSION})` && e.cuerpo === 'Entregas: algo · Mejoras generales de velocidad' && e.url === '../entregas/', JSON.stringify(e));
    e = await caso(['entregas: en minúscula']);
    log('T5. el nombre de la app se reconoce sin importar mayúsculas', e.titulo === `Se actualizó Entregas (versión ${VERSION})` && e.cuerpo === 'En minúscula', JSON.stringify(e));
  }

  console.log('\nCuando no hay que avisar');
  {
    const { ctx, page, envios } = await abrirCon({ version: { v: String(VERSION) } });
    log('S1. una versión sin notas se actualiza en silencio: no avisa ni anota nada', envios.length === 0 && !(await fsDe(page))[`${B}/avisos/_novedades`]);
    await ctx.close();
  }
  {
    const F = semilla().__fs_falso;
    F[`${B}/avisos/_novedades`] = { v: String(VERSION), por: 'Ana Gómez', en: ahora, notas: NOTAS };
    const { ctx, envios } = await abrirCon({ version: { v: String(VERSION), notas: NOTAS }, extra: { __fs_falso: F } });
    log('S2. si esa versión ya se avisó (por otra persona), no se repite', envios.length === 0, `${envios.length} envíos`);
    await ctx.close();
  }
  {
    const F = semilla().__fs_falso;
    F[`${B}/avisos/_novedades`] = { v: String(VERSION - 1), por: 'Ana Gómez', en: ahora, notas: ['Algo anterior'] };
    const { ctx, envios } = await abrirCon({ version: { v: String(VERSION), notas: NOTAS }, extra: { __fs_falso: F } });
    log('S3. si lo avisado fue una versión anterior, avisa la nueva', destinos(envios).join() === 'ana,jeiler,luis', destinos(envios).join());
    await ctx.close();
  }
  {
    const { ctx, page, envios, errs } = await abrirCon({ version: { v: String(VERSION), notas: NOTAS }, quienes: ['pedro'] });
    const toast = await page.locator('#toast').textContent().catch(() => '');
    log('S4. si nadie tiene notificaciones, queda anotada la versión y no se manda ni se muestra nada raro', envios.length === 0 && !!(await fsDe(page))[`${B}/avisos/_novedades`] && !/Aviso de la versión/.test(toast) && errs.length === 0, `${envios.length} / ${toast} / ${errs.join()}`);
    await ctx.close();
  }
  {
    const { ctx, envios } = await abrirCon({ version: null });
    log('S5. si no se puede leer version.json, no pasa nada', envios.length === 0);
    await ctx.close();
  }
  {
    const { ctx, envios } = await abrirCon({ version: { v: String(VERSION), notas: [' ', ''] } });
    log('S6. notas vacías cuentan como sin notas', envios.length === 0);
    await ctx.close();
  }
} finally { await b.close(); srv.close(); }
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
