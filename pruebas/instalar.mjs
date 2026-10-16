// Instalar la app: franja arriba, botón en la pantalla de la clave y bloque fijo en "Copia de seguridad y acceso".
// Uso: node pruebas/instalar.mjs
import { lanzar, servir, pagina, semillaEquipos, AXE_JS, SALIDA, huella } from './banco.mjs';
const URL = 'http://127.0.0.1:8821', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const srv = await servir(8821); const br = await lanzar();
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const errores = [];
async function abrir({ ua, app = 'equipos', conClave = true, standalone = false } = {}) {
  const sem = semillaEquipos();
  if (app === 'entregas') Object.assign(sem, { nube_entregas_espacio: huella('entregas', 'prueba123'), nube_entregas_nombre: 'Jeiler' });
  if (app === 'evidencias') Object.assign(sem, { nube_evidencias_espacio: huella('evidencias', 'prueba123'), nube_evidencias_nombre: 'Jeiler' });
  if (!conClave) delete sem.nube_equipos_espacio;
  // Contexto propio para poder cambiar el navegador (userAgent); pagina() le pone el Firebase falso y los datos.
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', userAgent: ua, isMobile: !!ua, hasTouch: !!ua });
  const q = await pagina({ newContext: async () => ctx }, { semilla: sem, errores });
  if (standalone) await ctx.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = m => /display-mode:\s*standalone/.test(m) ? { matches: true, media: m, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(m); });
  await q.page.goto(`${URL}/${app}/`);
  if (conClave) await q.page.waitForSelector(app === 'equipos' ? '#recList .card' : app === 'entregas' ? '#entList' : '#nubeInfo', { state: 'attached' });
  else await q.page.waitForSelector('#nubeClave');
  await esp(400);
  return { ctx, page: q.page };
}
const axe = async (page, nombre) => {
  await page.addScriptTag({ content: AXE_JS });
  const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'] })).violations.map(x => x.id + ': ' + x.nodes[0].target));
  log(`accesible (axe): ${nombre}`, !v.length, v.join(' | '));
};
const dialogo = page => page.locator('.nube-dlg');
const encima = page => page.evaluate(() => { const d = document.querySelector('.nube-dlg .sheet'); if (!d) return false; const r = d.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + 20); return !!el && d.contains(el); });

console.log('Computador (sin aviso del navegador)');
let { ctx, page } = await abrir({ conClave: false });
log('pantalla de la clave: botón "Instalar la app en este teléfono"', await page.locator('#nubeInstClave').isVisible());
await axe(page, 'pantalla de la clave');
await page.click('#nubeInstClave'); await page.waitForSelector('.nube-dlg');
log('explica cómo instalar en el computador, por encima de la pantalla de la clave', /Instalar en el computador/.test(await dialogo(page).textContent()) && await encima(page));
log('las instrucciones tienen un solo botón: Entendido', (await dialogo(page).locator('button').count()) === 1);
await dialogo(page).locator('[type=submit]').click(); await esp(150);
log('Entendido cierra las instrucciones', (await dialogo(page).count()) === 0);
await ctx.close();
({ ctx, page } = await abrir());
log('en el computador sin aviso no sale la franja de arriba', (await page.locator('#nubeInstalar').count()) === 0);
await page.click('#tabDb'); await page.waitForSelector('#nubeInstBloque');
log('Base de datos: bloque fijo "Instalar en este teléfono"', /Instalar en este teléfono/.test(await page.textContent('#nubeInstBloque')) && await page.locator('#nubeInstBloqueBtn').isVisible());
// Chrome avisa que se puede instalar
await page.evaluate(() => { window.__pidio = 0; const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => { window.__pidio++; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); dispatchEvent(e); });
await esp(150);
log('con el aviso de Chrome sale la franja con "Instalar"', (await page.textContent('#nubeInstBtn')) === 'Instalar');
log('y el bloque también dice "Instalar la app"', /Instalar la app/.test(await page.textContent('#nubeInstBloqueBtn')));
await page.click('#nubeInstBtn'); await esp(200);
log('Instalar abre el aviso del navegador', (await page.evaluate(() => window.__pidio)) === 1);
log('después de instalar ya no sale la franja', (await page.locator('#nubeInstalar').count()) === 0);
log('y el bloque dice que ya está instalada', /Ya la instalaste/.test(await page.textContent('#nubeInstBloque')));
await ctx.close();

console.log('iPhone');
({ ctx, page } = await abrir({ ua: IPHONE }));
log('iPhone: franja arriba con "Cómo instalar"', (await page.textContent('#nubeInstBtn')) === 'Cómo instalar');
await axe(page, 'franja iPhone');
await page.screenshot({ path: `${SALIDA}/instalar-franja.png` });
await page.click('#nubeInstBtn'); await page.waitForSelector('.nube-dlg');
const txtIos = await dialogo(page).textContent();
log('iPhone: pasos con Safari, Compartir y "Agregar a inicio"', /Instalar en iPhone/.test(txtIos) && /Safari/.test(txtIos) && /Compartir/.test(txtIos) && /Agregar a inicio/.test(txtIos), txtIos);
await axe(page, 'instrucciones iPhone');
await page.screenshot({ path: `${SALIDA}/instalar-iphone.png` });
await dialogo(page).locator('[type=submit]').click(); await esp(150);
await page.click('#nubeInstNo'); await esp(150);
log('la X oculta la franja', (await page.locator('#nubeInstalar').count()) === 0);
await page.reload(); await page.waitForSelector('#recList .card'); await esp(400);
log('sigue oculta al volver a abrir (7 días)', (await page.locator('#nubeInstalar').count()) === 0);
await page.click('#tabDb');
log('pero el bloque fijo sigue en Base de datos', await page.locator('#nubeInstBloqueBtn').isVisible());
await page.evaluate(() => localStorage.setItem('nube_equipos_noInstalar', String(Date.now() - 8 * 864e5)));
await page.reload(); await page.waitForSelector('#recList .card'); await esp(400);
log('pasados 7 días vuelve a salir', (await page.locator('#nubeInstalar').count()) === 1);
await ctx.close();

console.log('Android sin aviso del navegador (por ejemplo, abierta desde WhatsApp)');
({ ctx, page } = await abrir({ ua: ANDROID, app: 'entregas' }));
log('Entregas en Android: franja con "Cómo instalar"', (await page.textContent('#nubeInstBtn')) === 'Cómo instalar');
await page.click('#nubeInstBtn'); await page.waitForSelector('.nube-dlg');
const txtAnd = await dialogo(page).textContent();
log('Android: pasos con Chrome y "Instalar aplicación"', /Instalar en Android/.test(txtAnd) && /Chrome/.test(txtAnd) && /Instalar aplicación/.test(txtAnd), txtAnd);
await dialogo(page).locator('[type=submit]').click(); await esp(150);
await page.click('#tabDb'); await page.waitForSelector('#nubeInstBloque');
log('Entregas: bloque fijo en Base de datos', await page.locator('#nubeInstBloqueBtn').isVisible());
await axe(page, 'Base de datos de Entregas con el bloque');
await page.screenshot({ path: `${SALIDA}/instalar-bloque.png`, fullPage: true });
await ctx.close();

console.log('App ya instalada');
({ ctx, page } = await abrir({ ua: ANDROID, standalone: true }));
log('instalada: no sale la franja', (await page.locator('#nubeInstalar').count()) === 0);
await page.click('#tabDb');
log('instalada: el bloque lo dice y no muestra botón', /Estás usando la app instalada/.test(await page.textContent('#nubeInstBloque')) && (await page.locator('#nubeInstBloqueBtn').count()) === 0);
await ctx.close();
({ ctx, page } = await abrir({ ua: ANDROID, standalone: true, conClave: false }));
log('instalada: la pantalla de la clave no ofrece instalar', !(await page.locator('#nubeInstClave').isVisible()));
await ctx.close();

console.log('Evidencias');
({ ctx, page } = await abrir({ ua: IPHONE, app: 'evidencias' }));
log('Evidencias: también tiene el bloque para instalar', (await page.locator('#nubeInstBloque').count()) === 1);
await ctx.close();

const raros = errores.filter(x => !/externo:|Failed to load resource: net::ERR_FAILED/.test(x));   // fuentes de Google bloqueadas a propósito en las pruebas
log('sin errores en las páginas', !raros.length, raros.join(' | '));
await br.close(); srv.close();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
