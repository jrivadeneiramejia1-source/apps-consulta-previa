// Versión 30: cuando Firebase no deja leer (reglas, cupo gratis o red bloqueada), la pantalla dice la causa.
// Antes, un computador sin copia guardada veía "No hay equipos en espera" y "Revisa tu internet", como si se hubiera borrado todo.
// Uso: node pruebas/sin-datos.mjs
import { lanzar, AXE_JS, servir, pagina, semillaEquipos, huella } from './banco.mjs';
const URL = 'http://127.0.0.1:8830', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const CLAVE = 'prueba123';
const nube = semillaEquipos(CLAVE).__fs_falso;
nube[`espacios/${huella('entregas', CLAVE)}/entregas/e-1`] = { nombre: 'Ana Gómez', cedula: '1122', fecha: '2026-09-01', tipo: 'otro', proyecto: '', equipos: [], seriales: '', nota: '', paginas: [], miniatura: '', origen: 'semilla', subido: new Date().toISOString(), actualizado: new Date().toISOString(), por: 'Jeiler' };
const srv = await servir(8830), br = await lanzar();
const CASOS = {
  'permission-denied': { aviso: /reglas publicadas no son las de la app/, lista: /firestore\.rules completo/ },
  'resource-exhausted': { aviso: /50\.000 lecturas/, lista: /plan Blaze/ },
  'unavailable': { aviso: /red del SENA/, lista: /datos del celular/ }
};
async function axe(page, nombre) {
  await page.addScriptTag({ content: AXE_JS });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
  log(`axe sin fallas: ${nombre}`, !r.length, r.join('\n      '));
}
// Computador nuevo: la nube tiene datos, pero este navegador no tiene clave ni copia.
async function abrir(app, falla) {
  const err = [];
  const { ctx, page } = await pagina(br, { ancho: 1366, alto: 768, semilla: { __fs_falso: nube }, errores: err });
  if (falla) await ctx.addInitScript(c => { window.__snapErr = c; }, falla);
  await page.goto(`${URL}/${app}/`); await page.waitForSelector('#nubeClave');
  await page.fill('#nubeK', CLAVE); await page.fill('#nubeN', 'Jeiler'); await page.click('#nubeEntrar');
  await page.waitForSelector('#nubeClave', { state: 'detached', timeout: 15000 });
  await esp(1500);
  return { ctx, page, err };
}
const leer = (page, lista) => page.evaluate(l => ({ estado: document.querySelector('#conn span').textContent, aviso: document.getElementById('avisoOff').hidden ? '' : document.getElementById('avisoOffTxt').textContent, lista: document.getElementById(l).innerText.replace(/\s+/g, ' ') }), lista);

for (const [app, lista, vacioViejo] of [['equipos', 'recList', /No hay equipos en espera/], ['entregas', 'entList', /Todavía no hay hojas/]]) {
  console.log(`\n— ${app} en un computador nuevo`);
  const b = await abrir(app, null);
  const v0 = await leer(b.page, lista);
  log(`${app}: con Firebase bien muestra los datos, sin avisos`, v0.estado === 'En vivo' && !v0.aviso && /card|[A-Z0-9]{6}|Ana/.test(v0.lista) && !/No se pudo leer/.test(v0.lista), JSON.stringify(v0));
  await b.ctx.close();
  for (const [codigo, esperado] of Object.entries(CASOS)) {
    const { ctx, page, err } = await abrir(app, codigo);
    const v = await leer(page, lista);
    log(`${app} (${codigo}): el aviso dice la causa`, v.estado === 'Sin conexión' && esperado.aviso.test(v.aviso) && /^No se puede leer la base de datos\./.test(v.aviso), JSON.stringify(v));
    log(`${app} (${codigo}): la lista explica y no dice que no hay datos`, /No se pudo leer la base de datos/.test(v.lista) && esperado.lista.test(v.lista) && !vacioViejo.test(v.lista), v.lista);
    if (codigo === 'permission-denied') await axe(page, `${app} con Firebase sin permiso`);
    log(`${app} (${codigo}): sin errores en la página`, !err.filter(e => !/fonts|ERR_FAILED/.test(e)).length, err.join('\n      '));
    await ctx.close();
  }
}

// Teléfono con copia: sigue viendo lo último y además se entera de la causa.
console.log('\n— equipos con copia en el teléfono');
{
  const { ctx, page } = await abrir('equipos', null);
  await esp(1600);   // la copia se guarda 1,2 s después
  await ctx.addInitScript(() => { window.__snapErr = 'resource-exhausted'; });
  await page.reload(); await page.waitForSelector('#avisoOff:not([hidden])', { timeout: 15000 });
  const v = await leer(page, 'recList');
  log('con copia: sigue mostrando los equipos y explica el cupo', /Estás viendo la última copia guardada en este teléfono/.test(v.aviso) && /50\.000 lecturas/.test(v.aviso) && /5CD1234ABC/.test(v.lista), JSON.stringify(v));
  await ctx.close();
}
await br.close(); srv.close();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
