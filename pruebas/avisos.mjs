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
  let permiso = localStorage.getItem('__permiso') || 'default', sub = null;   // el permiso queda guardado, como en Chrome
  window.Notification = function () {}; Object.defineProperty(Notification, 'permission', { get: () => permiso });
  Notification.requestPermission = async () => { localStorage.setItem('__permiso', 'granted'); return (permiso = 'granted'); };
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
const tareas = s => Object.entries(s).filter(([k]) => k.startsWith(B + '/tareas/'));
// Cada persona en "su teléfono": otro nombre y otro identificador de teléfono.
async function como(n, extra) {
  if (!page.url().startsWith('http')) await page.goto(URL + '/equipos/');
  await page.evaluate(([n, extra]) => { localStorage.setItem('nube_equipos_nombre', n); localStorage.setItem('eqcp_disp', JSON.stringify('d-' + n.toLowerCase())); Object.entries(extra || {}).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v))); }, [n, extra]);
  await page.goto(URL + '/equipos/'); await page.waitForSelector('#recList .card.rec'); await esp(400);
}
const ultimoEnvio = () => envios[envios.length - 1];

await como('Jeiler');
let s = await st();
log('1. al abrir la app queda anotado este teléfono a nombre de Jeiler', avisos(s).length === 1 && avisos(s)[0][1].nombre === 'Jeiler' && avisos(s)[0][1].sub === null && !!avisos(s)[0][1].visto);
await page.click('#tabMt'); await esp(200);
log('2. la Agenda invita a activar las notificaciones', await page.locator('#notiAviso').isVisible());
await page.addScriptTag({ content: AXE }); await esp(300);
let v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'] })).violations.map(x => x.id));
log('3. accesible (axe)', !v.length, v.join(', '));
await page.click('#notiAviso [data-noti="activar"]'); await esp(400);
s = await st();
log('4. al activar se guarda la suscripción en el mismo registro del teléfono', avisos(s).length === 1 && avisos(s)[0][1].sub && avisos(s)[0][1].sub.endpoint.includes('/send/Jeiler'));
await page.click('#tabDb'); await esp(150);
log('5. Base de datos: avisos activos y la lista de personas', (await page.textContent('#notiInfo')).startsWith('Activadas para Jeiler') && (await page.textContent('#personasLista')).includes('avisos activos'));
await page.click('#notiBtns [data-noti="probar"]'); await esp(400);
log('6. Probar envía un aviso a este mismo teléfono', envios.length === 1 && ultimoEnvio().titulo === 'Prueba de avisos');

// Carlos (uno de los encargados) entra y programa un backup para Jeiler
await como('Carlos');
s = await st();
log('7. Carlos queda anotado en su propio registro', avisos(s).length === 2);
await page.click('#tabMt'); await page.click('#btnNewMt'); await page.waitForSelector('#mtSheet:not([hidden])');
const opc = await page.locator('#mtResp option').allTextContents();
log('8. el responsable se escoge de las personas con sesión, con su estado de avisos', opc.some(o => o.startsWith('Jeiler · avisos activos')) && opc.some(o => o.startsWith('Carlos (tú) · sin avisos')) && opc.includes('Otra persona (escribir el nombre)'), opc.join(' | '));
await page.click('#mtTipo [data-tipo="backup"]'); await page.fill('#mtSerial', 'GPS778812'); await page.fill('#mtFecha', '2026-10-20'); await page.fill('#mtAnydesk', '987654321'); await page.fill('#mtDisco', 'Disco Backup 2');
await page.selectOption('#mtResp', 'Jeiler'); await esp(80);
log('9. dice que a Jeiler le llegará el aviso', (await page.textContent('#mtRespInfo')).includes('le llegará el aviso'));
await page.addScriptTag({ content: AXE }); await esp(200);
v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'] })).violations.map(x => x.id));
log('10. la hoja de la tarea es accesible (axe)', !v.length, v.join(', '));
await page.click('#mtGuardar'); await esp(500);
log('11. aviso a Jeiler: qué tarea, de qué equipo, AnyDesk y quién la programó', envios.length === 2 && ultimoEnvio().subs[0].endpoint.includes('/send/Jeiler') && ultimoEnvio().titulo === 'Te asignaron: backup de GPS778812' && ultimoEnvio().cuerpo.includes('AnyDesk 987 654 321') && ultimoEnvio().cuerpo.includes('programó Carlos') && ultimoEnvio().cuerpo.includes('Disco de backup: Disco Backup 2'), JSON.stringify(ultimoEnvio()));
s = await st(); const tid = tareas(s).find(([, x]) => x.tipo === 'backup')[0].split('/').pop();
await page.click('#btnNewMt'); await page.fill('#mtSerial', 'PF2XYZ01'); await page.fill('#mtFecha', '2026-10-25');
await page.selectOption('#mtResp', '__otro'); await page.fill('#mtRespOtro', 'Pedro'); await esp(80);
log('12. si escribe otra persona sin avisos lo dice', (await page.textContent('#mtRespInfo')).includes('no tiene notificaciones'));
await page.click('#mtGuardar'); await esp(400);
log('13. y no intenta enviar (dice que lo verá al abrir la app)', envios.length === 2 && (await page.textContent('#toast')).includes('Pedro no tiene notificaciones'));
await page.click('#tabDb'); await page.click('#notiBtns [data-noti="activar"]'); await esp(400);

// Jeiler abre la app: le dice lo que le asignaron y pide prender el equipo
await como('Jeiler', { eqcp_agenda_vista: '2000-01-01' }); await esp(1200);
log('14. al abrir, Jeiler ve "Te asignaron una tarea"', (await page.textContent('#toast')).includes('Te asignaron una tarea: backup de GPS778812'));
log('15. la pestaña Agenda cuenta lo que le toca', (await page.textContent('#badgeMt')) === '1');
await page.click('#tabMt'); await page.click('#sumMt [data-filtro="mias"]'); await esp(100);
log('16. "Para mí" muestra su tarea', (await page.locator('#mtList .card.mt').count()) === 1);
await page.click(`[data-t-acc="encender"][data-t="${tid}"]`); await page.waitForSelector('#cfSheet:not([hidden])');
log('17. pregunta antes: a quién le avisa y que conecte el disco', (await page.textContent('#cfText')).includes('Se le avisa a Carlos que prenda el equipo y le conecte el disco de backup (Disco Backup 2)'));
await page.click('#cfYes'); await esp(500);
log('18. Carlos recibe "Prende el equipo y conecta el disco de backup"', ultimoEnvio().subs[0].endpoint.includes('/send/Carlos') && ultimoEnvio().titulo === 'Prende GPS778812 y conecta el disco de backup' && ultimoEnvio().cuerpo.includes('Jeiler va a conectarse') && ultimoEnvio().cuerpo.includes('Disco Backup 2'), JSON.stringify(ultimoEnvio()));

// Carlos prende el equipo
await como('Carlos', { eqcp_agenda_vista: '2000-01-01' }); await esp(1200);
const t19 = await page.textContent('#toast');
log('19. al abrir, Carlos ve "Te pidieron prender un equipo"', t19.includes('Te pidieron prender un equipo'), t19);
await page.click('#tabMt'); await page.click(`[data-t-acc="encendido"][data-t="${tid}"]`); await esp(500);
log('20. Jeiler recibe "Ya puedes entrar" con el AnyDesk', ultimoEnvio().subs[0].endpoint.includes('/send/Jeiler') && ultimoEnvio().titulo === 'Ya puedes entrar a GPS778812' && ultimoEnvio().cuerpo.includes('le conectó el disco de backup') && ultimoEnvio().cuerpo.includes('987 654 321'));

// Jeiler termina el backup
await como('Jeiler');
await page.click('#tabMt'); await page.click(`[data-t-acc="hecho"][data-t="${tid}"]`); await page.waitForSelector('#cfSheet:not([hidden])');
log('20b. al terminar propone el disco que se programó', (await page.inputValue('#cfTDisco')) === 'Disco Backup 2');
await page.click('#cfYes'); await esp(500);
log('21. Carlos recibe "Backup hecho": en qué disco y que ya puede desconectarlo', ultimoEnvio().subs[0].endpoint.includes('/send/Carlos') && ultimoEnvio().titulo === 'Backup hecho: GPS778812' && ultimoEnvio().cuerpo.includes('en el disco Disco Backup 2. Ya puedes desconectar el disco'), JSON.stringify(ultimoEnvio()));
s = await st();
log('22. la tarea queda con todo su recorrido', s[`${B}/tareas/${tid}`].hist.map(h => h.quien + ':' + h.que).join(',') === 'Carlos:programada,Jeiler:encender,Carlos:encendido,Jeiler:hecho');

// Suscripción vencida: se apaga sola en ese teléfono
vencer = true;
await como('Carlos');
await page.click('#tabMt'); await page.click('#btnNewMt'); await page.click('#mtTipo [data-tipo="remoto"]'); await page.fill('#mtSerial', 'GPS778812'); await page.selectOption('#mtResp', 'Jeiler'); await page.click('#mtGuardar'); await esp(600);
s = await st();
log('23. si el teléfono ya no recibe avisos, se marca sin avisos (sin borrar la persona)', avisos(s).find(([k]) => k.endsWith('d-jeiler'))[1].sub === null && (await page.textContent('#toast')).includes('Jeiler no tiene notificaciones'));
vencer = false;

// Lista de personas: quitar un teléfono viejo y desactivar
await page.click('#tabDb'); await page.click('#personasLista [data-quitar-disp="d-jeiler"]'); await page.waitForSelector('#cfSheet:not([hidden])'); await page.click('#cfYes'); await esp(300);
s = await st();
log('24. se puede quitar un teléfono de la lista', !avisos(s).some(([k]) => k.endsWith('d-jeiler')));
await page.click('#notiBtns [data-noti="quitar"]'); await page.waitForSelector('#cfSheet:not([hidden])'); await page.click('#cfYes'); await esp(300);
s = await st();
log('25. desactivar deja el teléfono en la lista pero sin avisos', avisos(s).find(([k]) => k.endsWith('d-carlos'))[1].sub === null && (await page.textContent('#notiInfo')).startsWith('Desactivadas'));
await page.goto(URL + '/equipos/?agenda=1'); await page.waitForSelector('#vMt:not([hidden])');
log('26. tocar la notificación abre la Agenda en "Para mí"', await page.locator('#sumMt [data-filtro="mias"][aria-pressed="true"]').count() === 1);
log('27. sin errores ni diálogos nativos', !err.length, err.join(' | '));
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
log('28. sw.js muestra la notificación con título, texto e ícono', mostradas.length === 1 && mostradas[0][0].includes('GPS778812') && mostradas[0][1].body === 'para el 20/10/2026' && mostradas[0][1].icon.includes('equipos-192'));
oyentes.notificationclick({ notification: { close() {}, data: mostradas[0][1].data }, waitUntil: p => (espera = p) }); await espera;
log('29. tocarla abre la app en la Agenda', abiertas[0] === 'https://x.github.io/apps/equipos/?agenda=1', abiertas[0]);
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
