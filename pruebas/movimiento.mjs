// Animaciones pequeñas: tarjetas que se deslizan, confeti al terminar y vibración. Uso: node pruebas/movimiento.mjs
import { lanzar, servir, pagina, semillaEquipos, AXE_JS, SALIDA } from './banco.mjs';
const URL = 'http://127.0.0.1:8819', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const srv = await servir(8819); const br = await lanzar();
// Animaciones hechas con element.animate() (no las de CSS)
const animaciones = p => p.evaluate(() => document.getAnimations().filter(a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length);
const vibraciones = `window.__vib = []; Object.defineProperty(navigator, 'vibrate', { value: p => { window.__vib.push(p); return true; }, configurable: true });`;

// 1) Con movimiento
const err = [];
const { ctx, page } = await pagina(br, { semilla: semillaEquipos(), errores: err });
await ctx.addInitScript(vibraciones);
const pedidos = []; page.on('request', r => pedidos.push(r.url()));
await page.goto(URL + '/equipos/'); await page.waitForSelector('#recList .card.rec'); await esp(800);
log('1. antes de tocar la pantalla no vibra', (await page.evaluate(() => window.__vib.length)) === 0);
await page.click('#tabEq');
await page.waitForSelector('#eqList .card'); await esp(900);
const a0 = await animaciones(page);
await page.fill('#qEq', 'samsung'); await esp(40);
const a1 = await animaciones(page);
log('2. al buscar, las tarjetas se deslizan a su puesto nuevo', a1 > a0, `${a0} → ${a1}`);
await esp(600);
log('3. las animaciones terminan solas', (await animaciones(page)) === 0);
await page.fill('#qEq', ''); await esp(600);
const orden = await page.$$eval('#eqList [data-eq]', l => l.map(x => x.dataset.eq));
log('4. la lista queda igual que sin animación', orden.length >= 8 && new Set(orden).size === orden.length, orden.join(','));

await page.click('#tabRec'); await page.waitForSelector('#recList [data-listo="r-3"]'); await esp(500);
await page.click('[data-listo="r-3"]'); await page.waitForSelector('#cfSheet:not([hidden])'); await page.click('#cfYes'); await esp(350);
log('5. al dar Listo sale confeti', await page.locator('canvas').count() > 0);
await page.screenshot({ path: `${SALIDA}/movimiento-confeti.png` });
log('6. el confeti se carga de la app (lib/confetti.js), no de internet', pedidos.some(u => u.startsWith(URL + '/lib/confetti.js')) && !err.some(x => x.includes('confetti')));
const vib = await page.evaluate(() => window.__vib);
log('7. vibra al guardar y al celebrar', vib.length >= 2 && vib.some(v => Array.isArray(v) && v.length === 3), JSON.stringify(vib));
await esp(4500);
log('8. el confeti se quita solo', await page.locator('canvas').count() === 0);
await page.addScriptTag({ content: AXE_JS });
const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(x => x.id));
log('9. sigue siendo accesible (axe)', !v.length, v.join(', '));
await page.screenshot({ path: `${SALIDA}/movimiento-listo.png` });
log('10. sin errores en la página', !err.length, err.join(' | '));
await ctx.close();

// 2) Con "reducir movimiento" del teléfono: nada se mueve, pero sí vibra
const err2 = [];
const { ctx: ctx2, page: page2 } = await pagina(br, { semilla: semillaEquipos(), errores: err2, quieto: true });
await ctx2.addInitScript(vibraciones);
await page2.goto(URL + '/equipos/'); await page2.waitForSelector('#recList .card.rec'); await esp(600);
await page2.click('#tabEq'); await page2.waitForSelector('#eqList .card'); await esp(500);
await page2.fill('#qEq', 'samsung'); await esp(40);
log('11. con "reducir movimiento" las tarjetas no se mueven', (await animaciones(page2)) === 0);
const r = await page2.evaluate(() => UI.celebrar());
log('12. con "reducir movimiento" no hay confeti, pero sí vibra', r === false && await page2.locator('canvas').count() === 0 && (await page2.evaluate(() => window.__vib.length)) > 0, JSON.stringify([r, await page2.evaluate(() => window.__vib)]));
log('13. sin errores en la página', !err2.length, err2.join(' | '));
await ctx2.close();

await br.close(); srv.close();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
