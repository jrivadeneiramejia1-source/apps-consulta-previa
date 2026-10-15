// Notificaciones de la Agenda (con el permiso del navegador y el servidor simulados). Uso: node pruebas/avisos.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, servir, pagina, semillaEquipos, huella, RAIZ } from './banco.mjs';
const URL = 'http://127.0.0.1:8817', esp = ms => new Promise(r => setTimeout(r, ms));
const AXE = fs.readFileSync('/home/claude/construir/node_modules/axe-core/axe.min.js', 'utf8');
const B = `espacios/${huella('equipos', 'prueba123')}`;
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const srv = await servir(8817); const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const err = [];
const { ctx, page } = await pagina(br, { semilla: semillaEquipos(), errores: err });
// Permiso y suscripción simulados (en un teléfono real los da Chrome)
await ctx.addInitScript(() => {
  let permiso = 'default', sub = null;
  window.Notification = function () {}; Object.defineProperty(Notification, 'permission', { get: () => permiso });
  Notification.requestPermission = async () => (permiso = 'granted');
  window.PushManager = function () {};
  const pm = {
    getSubscription: async () => sub,
    subscribe: async () => (sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/' + (localStorage.getItem('nube_equipos_nombre') || 'x'), keys: { p256dh: 'BEl6-c', auth: 'aa' }, toJSON() { return { endpoint: this.endpoint, expirationTime: null, keys: this.keys }; }, unsubscribe: async () => { sub = null; return true; } })
  };
  const reg = { pushManager: pm };
  Object.defineProperty(navigator.serviceWorker, 'ready', { get: () => Promise.resolve(reg) });
  navigator.serviceWorker.getRegistration = async () => reg;
});
// Servidor de avisos simulado
const envios = []; let vencer = false;
await ctx.route('https://avisos-equipos.jrivadeneiramejia1.workers.dev/**', async r => {
  const d = JSON.parse(r.request().postData()); envios.push(d);
  await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': URL }, body: JSON.stringify({ ok: true, resultados: d.subs.map(() => (vencer ? { estado: 410, vencida: true } : { estado: 201 })) }) });
});
const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso')));
const avisos = s => Object.entries(s).filter(([k]) => k.startsWith(B + '/avisos/'));
const nombre = n => page.evaluate(n => localStorage.setItem('nube_equipos_nombre', n), n);

await page.goto(URL + '/equipos/'); await page.waitForSelector('#recList .card.rec');
await page.click('#tabMt'); await esp(200);
log('1. la Agenda invita a activar las notificaciones', await page.locator('#notiAviso').isVisible());
await page.addScriptTag({ content: AXE }); await esp(300);
const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'] })).violations.map(x => x.id));
log('2. accesible (axe)', !v.length, v.join(', '));
await page.click('#notiAviso [data-noti="activar"]'); await esp(400);
let s = await st();
log('3. al activar se guarda este teléfono a nombre de Jeiler', avisos(s).length === 1 && avisos(s)[0][1].nombre === 'Jeiler' && avisos(s)[0][1].sub.endpoint.includes('/send/Jeiler'));
log('4. el aviso de activar desaparece', !(await page.locator('#notiAviso').isVisible()));
await page.click('#tabDb'); await esp(100);
log('5. Base de datos dice que están activadas', (await page.textContent('#notiInfo')).startsWith('Activadas para Jeiler'));
await page.click('#notiBtns [data-noti="probar"]'); await esp(400);
log('6. Probar envía un aviso a este mismo teléfono', envios.length === 1 && envios[0].subs[0].endpoint.includes('/send/Jeiler') && envios[0].titulo === 'Prueba de avisos');

// Otra persona (el encargado) programa un mantenimiento para Jeiler
await nombre('Carlos'); await page.reload(); await page.waitForSelector('#recList .card.rec');
await page.click('#tabMt'); await page.click('#btnNewMt'); await page.waitForSelector('#mtSheet:not([hidden])');
await page.fill('#mtSerial', 'GPS778812'); await page.fill('#mtFecha', '2026-10-20'); await page.fill('#mtNota', 'Comunicarse con Luis');
await page.fill('#mtResp', 'jeiler'); await esp(80);
log('7. al escribir el responsable dice que le llegará el aviso', (await page.textContent('#mtRespInfo')).includes('le llegará el aviso'));
log('8. sugiere los nombres que tienen notificaciones', (await page.locator('#dlResp option').evaluateAll(o => o.map(x => x.value))).includes('Jeiler'));
await page.click('#mtGuardar'); await esp(500);
const ult = envios[envios.length - 1];
log('9. se envía el aviso solo al teléfono de Jeiler', envios.length === 2 && ult.subs.length === 1 && ult.subs[0].endpoint.includes('/send/Jeiler'));
log('10. el aviso dice qué equipo, para cuándo y quién lo programó', ult.titulo.includes('GPS778812') && ult.cuerpo.includes('20/10/2026') && ult.cuerpo.includes('Comunicarse con Luis') && ult.cuerpo.includes('programó Carlos') && ult.url === './?agenda=1', JSON.stringify(ult));
s = await st();
log('11. el responsable queda guardado', s[`${B}/equipos/GPS778812`].prog.resp === 'jeiler');
const t12 = await page.locator('#mtList .card.mt', { hasText: 'GPS778812' }).innerText();
log('12. la tarjeta muestra el responsable', /Responsable:\s*jeiler/.test(t12), t12.replace(/\n/g, ' | '));
await page.click('[data-mt="GPS778812"]'); await page.waitForSelector('#mtSheet:not([hidden])'); await page.click('#mtGuardar'); await esp(300);
log('13. guardar sin cambios no repite el aviso', envios.length === 2);
await page.click('#btnNewMt'); await page.fill('#mtSerial', 'PF2XYZ01'); await page.fill('#mtResp', 'Pedro'); await esp(80);
log('14. si el responsable no tiene notificaciones lo dice', (await page.textContent('#mtRespInfo')).includes('todavía no activó'));
await page.click('#mtGuardar'); await esp(300);
log('15. y no intenta enviar', envios.length === 2 && (await page.textContent('#toast')).includes('todavía no activó'));

// Jeiler abre la app después: le dice que le programaron
await nombre('Jeiler'); await page.evaluate(() => localStorage.setItem('eqcp_agenda_vista', JSON.stringify('2000-01-01'))); await page.reload(); await page.waitForSelector('#recList .card.rec'); await esp(1500);
log('16. al abrir la app avisa "Te programaron un mantenimiento"', (await page.textContent('#toast')).includes('Te programaron un mantenimiento: GPS778812'));
await page.goto(URL + '/equipos/?agenda=1'); await page.waitForSelector('#vMt:not([hidden])');
log('17. tocar la notificación abre la Agenda', await page.locator('#vMt').isVisible());

// Suscripción vencida: se borra sola
vencer = true;
await nombre('Carlos'); await page.goto(URL + '/equipos/'); await page.waitForSelector('#recList .card.rec');
await page.click('#tabMt'); await page.click('[data-mt="GPS778812"]'); await page.waitForSelector('#mtSheet:not([hidden])');
await page.fill('#mtFecha', '2026-10-21'); await page.click('#mtGuardar'); await esp(600);
s = await st();
log('18. si el teléfono ya no recibe avisos, se quita de la lista y lo dice', avisos(s).length === 0 && (await page.textContent('#toast')).includes('vencieron'));
vencer = false;

// Desactivar
await nombre('Jeiler'); await page.reload(); await page.waitForSelector('#recList .card.rec');
await page.click('#tabDb'); await page.click('#notiBtns [data-noti="activar"]'); await esp(400);
await page.click('#notiBtns [data-noti="quitar"]'); await page.waitForSelector('#cfSheet:not([hidden])'); await page.click('#cfYes'); await esp(300);
s = await st();
log('19. desactivar quita el teléfono', avisos(s).length === 0 && (await page.textContent('#notiInfo')).startsWith('Desactivadas'));
log('20. sin errores ni diálogos nativos', !err.length, err.join(' | '));
await br.close(); srv.close();

// sw.js: lo que hace el teléfono al recibir y tocar la notificación
const oyentes = {}, mostradas = [], abiertas = [];
const self = {
  location: { origin: 'https://x.github.io' }, registration: { scope: 'https://x.github.io/apps/equipos/', showNotification: async (t, o) => mostradas.push([t, o]) },
  clients: { matchAll: async () => [], openWindow: async u => abiertas.push(u), claim: async () => {} },
  addEventListener: (n, f) => { oyentes[n] = f; }, skipWaiting: () => {}
};
vm.runInNewContext(fs.readFileSync(RAIZ + '/equipos/sw.js', 'utf8'), { self, caches: {}, fetch: () => {}, URL: globalThis.URL, console });
let espera = null;
oyentes.push({ data: { json: () => ({ titulo: 'Mantenimiento programado: GPS778812', cuerpo: 'para el 20/10/2026', url: './?agenda=1', etiqueta: 'mt-GPS' }) }, waitUntil: p => (espera = p) }); await espera;
log('21. sw.js muestra la notificación con título, texto e ícono', mostradas.length === 1 && mostradas[0][0].includes('GPS778812') && mostradas[0][1].body === 'para el 20/10/2026' && mostradas[0][1].icon.includes('equipos-192'));
oyentes.notificationclick({ notification: { close() {}, data: mostradas[0][1].data }, waitUntil: p => (espera = p) }); await espera;
log('22. tocarla abre la app en la Agenda', abiertas[0] === 'https://x.github.io/apps/equipos/?agenda=1', abiertas[0]);
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
