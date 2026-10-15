// Registro de errores: lo que falla en el teléfono se manda al Worker (y de ahí a Slack). Uso: node pruebas/errores.mjs
import { lanzar, servir, pagina, semillaEquipos } from './banco.mjs';
const URL = 'http://127.0.0.1:8818', DESTINO = URL + '/__errores', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const srv = await servir(8818); const br = await lanzar();
const HUELLA = 'ab12'.repeat(10);

// 1) Con destino (como en GitHub Pages)
const err = [];
const { ctx, page } = await pagina(br, { semilla: semillaEquipos(), errores: err });
await ctx.addInitScript(d => { window.ERRORES_URL = d; localStorage.setItem('nube_equipos_nombre', 'Jeiler'); }, DESTINO);
const envios = []; let caido = false;
await ctx.route(DESTINO, async r => {
  if (caido) return r.abort();
  envios.push(JSON.parse(r.request().postData()));
  await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"slack":true}' });
});
const lanzarError = (m, tipo = 'error') => page.evaluate(([m, tipo]) => {
  if (tipo === 'promesa') { Promise.reject(new Error(m)); return; }
  setTimeout(() => { throw new TypeError(m); });
}, [m, tipo]);
const todos = () => envios.flatMap(e => e.errores);

await page.goto(URL + '/equipos/'); await page.waitForSelector('#recList .card.rec'); await esp(300);
await lanzarError(`falla de prueba en espacios/${HUELLA}/equipos de ana.gomez@empresa.com`);
await esp(3600);
let e = todos()[0] || {};
log('1. un error del código llega al registro', envios.length === 1 && Array.isArray(envios[0].errores), JSON.stringify(envios));
log('2. trae app, versión, persona y navegador', e.app === 'Equipos Consulta Previa' && /^\d+$/.test(e.version) && e.nombre === 'Jeiler' && /Chrome/.test(e.navegador), JSON.stringify(e));
log('3. mensaje con el tipo de error y dónde pasó', e.mensaje.startsWith('TypeError: falla de prueba') && e.donde.startsWith('/equipos/') && e.veces === 1, JSON.stringify(e));
log('4. no manda la huella del espacio ni correos', !JSON.stringify(envios).includes(HUELLA) && !JSON.stringify(envios).includes('ana.gomez@') && e.mensaje.includes('…@…'), e.mensaje);
log('5. el detalle no lleva la dirección completa del sitio', !String(e.detalle).includes('http://127.0.0.1'), e.detalle);

for (let i = 0; i < 3; i++) await lanzarError(`falla de prueba en espacios/${HUELLA}/equipos de ana.gomez@empresa.com`);
await esp(3600);
log('6. el mismo error repetido no se vuelve a mandar', envios.length === 1, envios.length);

await lanzarError('promesa que nadie atendió', 'promesa');
await esp(3600);
e = todos().find(x => x.mensaje.includes('promesa que nadie')) || {};
log('7. también las promesas sin atender', e.donde && e.donde.includes('promesa'), JSON.stringify(todos().map(x => x.mensaje)));

const antes = todos().length;
await lanzarError('Failed to fetch');
await page.evaluate(() => { const ev = new ErrorEvent('error', { message: 'ResizeObserver loop limit exceeded' }); window.dispatchEvent(ev); });
await page.evaluate(() => { const i = new Image(); i.src = '/no-existe.png'; document.body.append(i); });
await esp(3600);
log('8. no manda ruido (sin señal, ResizeObserver, imágenes rotas)', todos().length === antes, JSON.stringify(todos().slice(antes)));

await page.evaluate(() => nube.reportarError(new Error('reportado a mano'), 'guardarEq'));
await esp(3600);
log('9. nube.reportarError sirve desde la app', todos().some(x => x.mensaje === 'Error: reportado a mano' && x.donde === 'guardarEq'));

for (let i = 0; i < 8; i++) await lanzarError('error distinto ' + i);
await esp(3600);
log('10. máximo 5 errores distintos por sesión', todos().length === 5, todos().length);

// 2) Sin señal hacia el Worker: queda en cola y se manda al volver a abrir
caido = true;
await page.reload(); await page.waitForSelector('#recList .card.rec');
await lanzarError('error sin conexión al worker');
await esp(3600);
const cola = await page.evaluate(() => JSON.parse(localStorage.getItem('nube_equipos_errores') || '[]'));
log('11. si no se pudo mandar, queda guardado', cola.length === 1 && cola[0].mensaje.includes('sin conexión'), JSON.stringify(cola));
caido = false; const n0 = envios.length;
await page.reload(); await page.waitForSelector('#recList .card.rec'); await esp(5600);
log('12. al abrir otra vez la app se manda lo pendiente', envios.length === n0 + 1 && todos().some(x => x.mensaje.includes('sin conexión')) && await page.evaluate(() => !localStorage.getItem('nube_equipos_errores')));
await ctx.close();

// 3) Fuera de GitHub Pages (pruebas, copia local) no se manda nada
const err2 = [];
const p2 = await pagina(br, { semilla: semillaEquipos(), errores: err2 });
await p2.page.goto(URL + '/equipos/'); await p2.page.waitForSelector('#recList .card.rec');
await p2.page.evaluate(() => setTimeout(() => { throw new Error('local'); }));
await esp(3600);
log('13. fuera de GitHub Pages no manda nada', !err2.some(x => x.startsWith('externo:')), err2.join(' | '));
await p2.ctx.close();

const raros = err.filter(x => !/falla de prueba|promesa que nadie|Failed to fetch|reportado a mano|error distinto|sin conexión|no-existe\.png|404|ResizeObserver|__errores|ERR_FAILED/.test(x));
log('14. sin otros errores en la página', !raros.length, raros.join(' | '));
await br.close(); srv.close();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
