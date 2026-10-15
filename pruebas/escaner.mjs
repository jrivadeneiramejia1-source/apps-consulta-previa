// Pruebas del escáner de Entregas: cámara del teléfono → recorte → revisar → lista de páginas.
// Uso: node pruebas/escaner.mjs [carpeta-de-capturas]. Fotos de prueba en /tmp/claude-0/esc (generadas con gen.py).
import fs from 'node:fs';
import { chromium, servir, pagina, semillaEquipos } from './banco.mjs';

const OUT = process.argv[2] || '/tmp/claude-0/pr';
const F = '/tmp/claude-0/esc';
const AXE = fs.readFileSync('/home/claude/construir/node_modules/axe-core/axe.min.js', 'utf8');
const URL = 'http://127.0.0.1:8819';
let ok = 0, mal = 0;
function chequear(cond, nombre) { if (cond) ok++; else { mal++; console.log('  FALLA:', nombre); } }
const espera = ms => new Promise(r => setTimeout(r, ms));
async function axe(page, nombre) {
  await espera(400);
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
  chequear(!r.length, `axe sin fallas: ${nombre}${r.length ? '\n     ' + r.join('\n     ') : ''}`);
}
const arriba = page => page.locator('.esc').last();
const titulo = async page => (await arriba(page).locator('.esc-titulo').textContent()).trim();
async function esperarPantalla(page, txt) {
  await page.waitForFunction(t => { const e = [...document.querySelectorAll('.esc')].pop(); return e && e.querySelector('.esc-titulo').textContent.includes(t); }, txt, { timeout: 30000 });
}
async function esperarRevisar(page) {
  await page.waitForFunction(() => { const e = [...document.querySelectorAll('.esc')].pop(); return e && e.querySelector('canvas.res') && !e.querySelector('.esc-estado.ocupado'); }, null, { timeout: 30000 });
}
async function tomarFoto(page, archivo, boton) {
  const [ch] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), boton ? boton() : Promise.resolve()]);
  await ch.setFiles(archivo);
  return ch;
}
async function sinDesborde(page, nombre) {
  const r = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  chequear(r[0] <= r[1], `sin desplazamiento lateral: ${nombre}`);
}
async function botonesGrandes(page, nombre) {
  const chicos = await page.evaluate(() => [...[...document.querySelectorAll('.esc')].pop().querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect()).filter(r => r.height < 43.5 || r.width < 43.5).length);
  chequear(chicos === 0, `botones de al menos 44 px: ${nombre} (${chicos} chicos)`);
}

const srv = await servir(8819);
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });

let ERR = [], PG = null;
process.on('uncaughtException', async e => { console.log('ERROR:', e.message.split('\n')[0], '\n  errores de la página:', ERR.join(' | ')); try { await PG.screenshot({ path: '/tmp/claude-0/esc/falla.png' }); } catch (x) {} process.exit(2); });
async function abrirEntregas(opc = {}) {
  const err = []; ERR = err;
  const sem = semillaEquipos(); delete sem.nube_equipos_espacio;
  const p = await pagina(br, Object.assign({ semilla: sem, errores: err, ancho: 360, alto: 760 }, opc));
  const pg = p.page; PG = pg;
  await pg.goto(URL + '/entregas/'); await pg.waitForSelector('#nubeClave');
  await pg.fill('#nubeK', 'prueba123'); await pg.fill('#nubeN', 'Jeiler'); await pg.click('#nubeEntrar');
  await pg.waitForSelector('#nubeNueva:not([hidden])'); await pg.click('#nubeNueva'); await pg.waitForSelector('#entList .empty-state');
  await pg.click('#tabSub');
  return { ...p, pg, err };
}

for (const tema of ['light', 'dark']) {
  console.log(`\n=== ESCÁNER (${tema}) ===`);
  const { ctx, pg, err } = await abrirEntregas({ tema });

  // 1. El botón abre la cámara del teléfono de una vez
  const ch1 = await tomarFoto(pg, `${F}/fotos2/00.jpg`, () => pg.click('#btnEscanear'));
  chequear(await ch1.element().getAttribute('capture') === 'environment' && !ch1.isMultiple(), 'abre la cámara trasera del teléfono (una foto)');
  await esperarRevisar(pg);
  chequear((await titulo(pg)) === 'Página 1', 'pantalla de revisar: Página 1');
  chequear((await arriba(pg).locator('.esc-estado').textContent()).includes('Hoja encontrada'), 'encontró la hoja sola');
  const dim = () => arriba(pg).locator('canvas.res').evaluate(c => ({ w: c.width, h: c.height }));
  let d = await dim();
  chequear(Math.abs(Math.max(d.h / d.w, d.w / d.h) - 297 / 210) < 0.01, `proporción real A4 (${(d.h / d.w).toFixed(3)})`);
  // borde de la hoja recortada: blanco (no quedó mesa)
  const bordeBlanco = await arriba(pg).locator('canvas.res').evaluate(c => {
    const x = c.getContext('2d'), w = c.width, h = c.height, m = Math.round(Math.min(w, h) * 0.012); let t = 0, n = 0;
    for (const [a, b, cw, chh] of [[0, 0, w, m], [0, h - m, w, m], [0, 0, m, h], [w - m, 0, m, h]]) { const d = x.getImageData(a, b, cw, chh).data; for (let i = 0; i < d.length; i += 16) { t += d[i]; n++; } }
    return t / n;
  });
  chequear(bordeBlanco > 215, `el recorte no deja mesa en los bordes (brillo ${Math.round(bordeBlanco)})`);
  chequear(await arriba(pg).locator('[data-f="doc"]').getAttribute('aria-pressed') === 'true', 'filtro Documento por defecto');
  if (tema === 'light') await pg.screenshot({ path: `${OUT}/s1-revisar.png` });
  await axe(pg, `revisar ${tema}`); await sinDesborde(pg, 'revisar'); await botonesGrandes(pg, 'revisar');
  chequear(await pg.evaluate(() => [...document.querySelectorAll('.esc')].pop().contains(document.activeElement)), 'el foco queda dentro de la pantalla');

  // filtros y giro
  await arriba(pg).locator('[data-f="color"]').click(); await esperarRevisar(pg);
  chequear(await arriba(pg).locator('[data-f="color"]').getAttribute('aria-pressed') === 'true', 'filtro Color');
  await arriba(pg).locator('[data-a="girar"]').click(); await esperarRevisar(pg);
  const d2 = await dim(); chequear(d2.w === d.h && d2.h === d.w, 'Girar voltea la hoja 90°');

  // 2. Ajustar esquinas (arrastre con lupa y teclado)
  await arriba(pg).locator('[data-a="esquinas"]').click();
  await esperarPantalla(pg, 'Ajusta las esquinas');
  await espera(150);
  chequear(await arriba(pg).locator('.esc-mango').count() === 4, 'editor con 4 esquinas');
  const m0 = arriba(pg).locator('.esc-mango').nth(0), b0 = await m0.boundingBox();
  await pg.mouse.move(b0.x + 30, b0.y + 30); await pg.mouse.down(); await pg.mouse.move(b0.x + 50, b0.y + 60, { steps: 4 });
  chequear(await arriba(pg).locator('.esc-lupa').isVisible(), 'la lupa aparece al arrastrar');
  if (tema === 'light') await pg.screenshot({ path: `${OUT}/s2-esquinas.png` });
  await pg.mouse.up();
  const b1 = await m0.boundingBox();
  chequear(Math.abs(b1.x - b0.x - 20) < 3 && Math.abs(b1.y - b0.y - 30) < 3, 'la esquina sigue al dedo sin saltar');
  chequear(await arriba(pg).locator('.esc-lupa').isHidden(), 'la lupa se esconde al soltar');
  await m0.focus(); await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('ArrowUp');
  const b2 = await m0.boundingBox(); chequear(b2.x < b1.x && b2.y < b1.y, 'la esquina se mueve con las flechas');
  await axe(pg, `esquinas ${tema}`); await botonesGrandes(pg, 'esquinas');
  await arriba(pg).locator('[data-a="listo"]').click(); await esperarRevisar(pg);
  chequear((await arriba(pg).locator('.esc-estado').textContent()).includes('ajustado a mano'), 'vuelve a revisar con el recorte nuevo');
  chequear(await arriba(pg).locator('[data-f="color"]').getAttribute('aria-pressed') === 'true', 'conserva el filtro escogido');
  await arriba(pg).locator('[data-a="usar"]').click();
  await pg.waitForSelector('.esc-pag');
  chequear(await pg.locator('.esc').count() === 1 && await pg.locator('.esc-pag').count() === 1, 'la página queda en la lista');
  chequear((await pg.locator('.esc [data-x="listo"]').textContent()) === 'Listo · 1', 'botón Listo · 1');
  chequear(await pg.evaluate(() => localStorage.getItem('escaner.filtro')) === 'color', 'recuerda el último filtro');
  if (tema === 'light') await pg.screenshot({ path: `${OUT}/s3-lista.png` });
  await axe(pg, `lista ${tema}`); await sinDesborde(pg, 'lista'); await botonesGrandes(pg, 'lista');

  // 3. Foto sin hoja: abre el editor; Repetir abre la cámara otra vez
  await tomarFoto(pg, `${F}/neg/00.jpg`, () => pg.locator('.esc [data-a="camara"]').click());
  await esperarPantalla(pg, 'Ajusta las esquinas');
  chequear((await arriba(pg).locator('.esc-estado').textContent()).includes('No encontré'), 'sin hoja: pide ajustar las esquinas');
  await arriba(pg).locator('[data-a="todo"]').click(); await arriba(pg).locator('[data-a="listo"]').click(); await esperarRevisar(pg);
  await tomarFoto(pg, `${F}/fotos3/05.jpg`, () => arriba(pg).locator('[data-a="repetir"]').click());
  await esperarRevisar(pg);
  chequear((await titulo(pg)) === 'Página 2' && (await arriba(pg).locator('.esc-estado').textContent()).includes('Hoja encontrada'), 'Repetir abre la cámara y procesa la foto nueva');
  d = await dim(); chequear(Math.abs(Math.max(d.h / d.w, d.w / d.h) - 330 / 216) < 0.01, `proporción real oficio (${(d.h / d.w).toFixed(3)})`);
  await arriba(pg).locator('[data-a="usar"]').click(); await pg.waitForSelector('.esc-pag >> nth=1');

  // 4. Galería: varias fotos, una por una
  const chG = await tomarFoto(pg, [`${F}/fotos/03.jpg`, `${F}/fotos/07.jpg`], () => pg.locator('.esc [data-a="galeria"]').click());
  chequear(chG.isMultiple() && !(await chG.element().getAttribute('capture')), 'galería: varias fotos, sin cámara');
  await esperarRevisar(pg);
  chequear((await titulo(pg)) === 'Página 3 (1 de 2)', 'galería: Página 3 (1 de 2)');
  await arriba(pg).locator('[data-a="repetir"]').count().then(n => chequear(n === 0, 'galería: sin botón Repetir'));
  await arriba(pg).locator('[data-a="usar"]').click();
  await pg.waitForFunction(() => { const e = [...document.querySelectorAll('.esc')].pop(); return e && e.querySelector('.esc-titulo').textContent.includes('2 de 2') && e.querySelector('canvas.res'); }, null, { timeout: 30000 });
  await arriba(pg).locator('[data-a="cancelar"]').click();
  await pg.waitForFunction(() => document.querySelectorAll('.esc').length === 1 && !document.querySelector('.esc-estado.ocupado'));
  chequear(await pg.locator('.esc-pag').count() === 3, 'galería: una usada y una descartada');

  // 5. Quitar una página, calidad
  await pg.locator('.esc-quitar').nth(1).click();
  chequear(await pg.locator('.esc-pag').count() === 2, 'quitar una página');
  await pg.locator('.esc [data-a="calidad"]').click();
  chequear(await pg.locator('.esc [data-a="calidad"]').getAttribute('aria-expanded') === 'true' && await pg.locator('.esc [data-cal]').count() === 3, 'panel de calidad');
  await axe(pg, `calidad ${tema}`);
  await pg.keyboard.press('Escape');
  chequear(await pg.locator('.esc').count() === 1 && await pg.locator('.esc-panel').isHidden(), 'Escape cierra primero el panel de calidad');
  await pg.locator('.esc [data-a="calidad"]').click(); await pg.locator('.esc [data-cal="ahorro"]').click();
  chequear((await pg.locator('.esc-cal b').textContent()) === 'Ahorro' && await pg.evaluate(() => localStorage.getItem('escaner.calidad')) === 'ahorro', 'cambia la calidad y la recuerda');
  await pg.locator('.esc [data-cal]').count().then(n => chequear(n === 0, 'el panel se cierra al escoger'));

  // 6. Listo: las páginas pasan a Subir
  await pg.locator('.esc [data-a="listo"]').click();
  await pg.waitForSelector('#subList .card.pag >> nth=1');
  chequear(await pg.locator('.esc').count() === 0 && await pg.locator('#subList .card.pag').count() === 2, 'Listo: 2 páginas en Subir');
  chequear(await pg.evaluate(() => document.activeElement && document.activeElement.id === 'btnEscanear'), 'el foco vuelve al botón Escanear');
  chequear(!(await pg.evaluate(() => document.body.classList.contains('con-esc'))), 'la página de atrás vuelve a desplazarse');
  const lote = await pg.locator('#subList .card.pag img').first().getAttribute('src');
  chequear(lote && lote.startsWith('data:image/jpeg'), 'miniatura de la página escaneada');

  // 7. Cerrar con páginas pide confirmación; atrás del teléfono
  await tomarFoto(pg, `${F}/fotos/09.jpg`, () => pg.click('#btnEscanear')); await esperarRevisar(pg);
  await pg.goBack(); await espera(200);
  chequear(await pg.locator('.esc').count() === 1 && await pg.locator('.esc-pag').count() === 0, 'atrás del teléfono: descarta la foto y vuelve a la lista');
  if (tema === 'light') await pg.screenshot({ path: `${OUT}/s0-guia.png` });
  await axe(pg, `guía ${tema}`); await botonesGrandes(pg, 'guía');
  await tomarFoto(pg, `${F}/fotos/09.jpg`, () => pg.locator('.esc [data-a="camara"]').click()); await esperarRevisar(pg);
  await arriba(pg).locator('[data-a="usar"]').click(); await pg.waitForSelector('.esc-pag');
  await pg.locator('.esc [data-a="cerrar"]').click();
  chequear(await pg.locator('.esc').count() === 1 && (await pg.locator('.esc [data-a="cerrar"]').textContent()).includes('¿Descartar 1?'), 'Cerrar con páginas pide confirmar');
  await pg.locator('.esc [data-a="cerrar"]').click(); await espera(150);
  chequear(await pg.locator('.esc').count() === 0 && await pg.locator('#subList .card.pag').count() === 2, 'segundo toque descarta sin tocar lo de Subir');
  const [chA] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#btnEscanear')]);
  await pg.goBack(); await espera(200);
  chequear(await pg.locator('.esc').count() === 0 && await pg.locator('#subList .card.pag').count() === 2, 'atrás en la lista: cierra el escáner');
  chequear(pg.url().endsWith('/entregas/'), 'atrás no se sale de la app');

  // 8. Recortar una página ya cargada (foto de galería subida aparte)
  await pg.setInputFiles('#archivo', [`${F}/fotos3/12.jpg`]);
  await pg.waitForSelector('#subList .card.pag >> nth=2');
  await pg.locator('[data-recortar="2"]').click();
  await esperarRevisar(pg);
  chequear((await titulo(pg)) === 'Recortar la página' && (await arriba(pg).locator('[data-a="usar"]').textContent()).includes('Aplicar'), 'Recortar: misma pantalla con Aplicar');
  await arriba(pg).locator('[data-a="usar"]').click();
  await pg.waitForFunction(() => !document.querySelector('.esc'));
  await espera(300);
  chequear((await pg.locator('#toast').textContent()).includes('Página 3 recortada'), 'Recortar actualiza la página');
  chequear(!err.length, `sin errores ni diálogos nativos (${tema})${err.length ? ': ' + err.join(' | ') : ''}`);
  await ctx.close();
}

// 9. Sin internet la primera vez: la foto se usa completa
{
  console.log('\n=== SIN RECORTADOR ===');
  const { ctx, pg, err } = await abrirEntregas();
  await ctx.route(/opencv\.js$/, r => r.abort());
  await tomarFoto(pg, `${F}/fotos/02.jpg`, () => pg.click('#btnEscanear'));
  await esperarRevisar(pg);
  chequear((await arriba(pg).locator('.esc-estado').textContent()).includes('Sin internet'), 'avisa que se usa la foto completa');
  chequear(await arriba(pg).locator('.esc-filtros').isHidden() && await arriba(pg).locator('[data-a="esquinas"]').count() === 0, 'sin filtros ni esquinas');
  await arriba(pg).locator('[data-a="usar"]').click(); await pg.waitForSelector('.esc-pag');
  await pg.locator('.esc [data-a="listo"]').click(); await pg.waitForSelector('#subList .card.pag');
  chequear(await pg.locator('#subList .card.pag').count() === 1, 'la página se guarda igual');
  const e2 = err.filter(e => !/opencv|ERR_FAILED|Failed to load resource/i.test(e));
  chequear(!e2.length, 'sin errores de la app' + (e2.length ? ': ' + e2.join(' | ') : ''));
  await ctx.close();
}

console.log(`\nResultado: ${ok} bien, ${mal} mal`);
await br.close(); srv.close();
process.exit(mal ? 1 : 0);
