// Prueba del Worker: descifra con http_ece (como lo haría el teléfono) y verifica la firma VAPID.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { require, RAIZ } from './banco.mjs';
const ece = require('http_ece');
// Llave de prueba: la real (si está en VAPID_JSON) o una nueva que se crea aquí (en GitHub no hay llave secreta).
function llavePrueba() {
  const f = process.env.VAPID_JSON || '/tmp/claude-0/vapid.json';
  if (fs.existsSync(f)) return Object.assign({ real: true }, JSON.parse(fs.readFileSync(f)));
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const j = privateKey.export({ format: 'jwk' });
  return { d: j.d, x: j.x, y: j.y, pub: Buffer.concat([Buffer.from([4]), Buffer.from(j.x, 'base64url'), Buffer.from(j.y, 'base64url')]).toString('base64url'), real: false };
}
const v = llavePrueba();
const W = await import(RAIZ + '/avisos/worker.js');
let ok = 0, mal = 0; const t = (n, c, x) => { c ? ok++ : mal++; console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (c ? '' : ' ' + (x || ''))); };
// "teléfono": llaves de la suscripción
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const auth = crypto.randomBytes(16);
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
// 1) cifrado
const msg = JSON.stringify({ titulo: 'Mantenimiento programado', cuerpo: 'GPS778812 · ñandú áéíóú' });
const cuerpo = await W.cifrar(msg, sub.keys.p256dh, sub.keys.auth);
const claro = ece.decrypt(Buffer.from(cuerpo), { version: 'aes128gcm', privateKey: ua, authSecret: auth });
t('el teléfono puede descifrar el mensaje (RFC 8291)', claro.toString('utf8') === msg, claro.toString('utf8'));
// 2) firma VAPID
const a = await W.vapid(sub.endpoint, v.d, 'https://avisos-equipos.ejemplo.workers.dev', v.x, v.y);
const [, jwt, k] = a.match(/^vapid t=([^,]+), k=(.+)$/);
const [h, c, f] = jwt.split('.');
const claims = JSON.parse(Buffer.from(c, 'base64url'));
const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: v.x, y: v.y }, format: 'jwk' });
t('la firma VAPID es válida (ES256)', crypto.verify('sha256', Buffer.from(h + '.' + c), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(f, 'base64url')));
t('aud = servicio del teléfono, exp < 24 h', claims.aud === 'https://fcm.googleapis.com' && claims.exp - Date.now() / 1000 < 86400 && claims.exp > Date.now() / 1000);
t('la llave pública k es la de la llave usada', k === v.pub);
// La parte pública que usa la app (config.js) debe ser la misma que tiene el Worker.
const cfg = fs.readFileSync(RAIZ + '/config.js', 'utf8'), wsrc = fs.readFileSync(RAIZ + '/avisos/worker.js', 'utf8');
const pubApp = (cfg.match(/vapid:\s*"([^"]+)"/) || [])[1], wx = (wsrc.match(/VAPID_X = '([^']+)'/) || [])[1], wy = (wsrc.match(/VAPID_Y = '([^']+)'/) || [])[1];
t('la llave pública de config.js coincide con la del Worker', pubApp === Buffer.concat([Buffer.from([4]), Buffer.from(wx, 'base64url'), Buffer.from(wy, 'base64url')]).toString('base64url'));
// 3) el Worker completo con un fetch falso
const llamados = [];
globalThis.fetch = async (url, o) => { llamados.push({ url, o }); return new Response('', { status: url.includes('vencida') ? 410 : 201 }); };
const env = { VAPID_D: v.d, VAPID_X: v.x, VAPID_Y: v.y };
const pedir = (cuerpo, origen = 'https://jrivadeneiramejia1-source.github.io', metodo = 'POST') => W.default.fetch(new Request('https://avisos-equipos.x.workers.dev/', { method: metodo, headers: { Origin: origen, 'Content-Type': 'application/json' }, body: metodo === 'POST' ? JSON.stringify(cuerpo) : undefined }), env);
let r = await pedir({ subs: [sub, Object.assign({}, sub, { endpoint: 'https://fcm.googleapis.com/fcm/send/vencida' })], titulo: 'Hola', cuerpo: 'Prueba' });
let j = await r.json();
t('envía a cada suscripción y marca las vencidas', r.status === 200 && j.resultados[0].estado === 201 && j.resultados[1].vencida === true, JSON.stringify(j));
t('manda las cabeceras de Web Push', llamados[0].o.headers['Content-Encoding'] === 'aes128gcm' && llamados[0].o.headers.Authorization.startsWith('vapid t=') && llamados[0].o.headers.TTL);
const recibido = JSON.parse(ece.decrypt(Buffer.from(llamados[0].o.body), { version: 'aes128gcm', privateKey: ua, authSecret: auth }).toString());
t('el aviso llega con título y texto', recibido.titulo === 'Hola' && recibido.cuerpo === 'Prueba');
t('CORS solo para la app', r.headers.get('Access-Control-Allow-Origin') === 'https://jrivadeneiramejia1-source.github.io');
r = await pedir({ subs: [sub] }, 'https://otro-sitio.com'); t('rechaza otros sitios', r.status === 403);
r = await pedir(null, 'https://jrivadeneiramejia1-source.github.io', 'OPTIONS'); t('responde la consulta previa del navegador (OPTIONS)', r.status === 204 && r.headers.get('Access-Control-Allow-Methods').includes('POST'));
r = await pedir({ subs: [] }); t('sin suscripciones responde 400', r.status === 400);
r = await W.default.fetch(new Request('https://x/', { method: 'POST', headers: { Origin: 'https://jrivadeneiramejia1-source.github.io' }, body: '{}' }), {}); t('sin el secreto avisa claramente', r.status === 500 && (await r.json()).error.includes('VAPID_D'));
r = await W.default.fetch(new Request('https://x/'), env); t('GET dice que está listo', (await r.json()).listo === true);
// 4) registro de errores hacia Slack
const pedirErr = (cuerpo, e, origen = 'https://jrivadeneiramejia1-source.github.io') => W.default.fetch(new Request('https://avisos-equipos.x.workers.dev/errores', { method: 'POST', headers: { Origin: origen, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }), e);
const errorEj = { app: 'Equipos', version: '21', mensaje: 'TypeError: x is <undefined> & <!channel>', detalle: 'at render (index.html:10)', nombre: 'Jeiler', navegador: 'Android · Chrome', veces: 3 };
r = await pedirErr(errorEj, env); j = await r.json();
t('errores sin Slack configurado: los acepta y no publica', r.status === 202 && j.slack === false);
llamados.length = 0;
r = await pedirErr({ errores: [errorEj, { mensaje: 'otro', app: 'Entregas' }] }, Object.assign({ SLACK_WEBHOOK: 'https://hooks.slack.com/services/T/B/X' }, env));
const slack = llamados[0] && JSON.parse(llamados[0].o.body);
t('errores con Slack: publica un solo mensaje con todos', r.status === 200 && llamados.length === 1 && llamados[0].url.startsWith('https://hooks.slack.com/') && slack.text.includes('Error en Equipos v21') && slack.text.includes('Entregas') && slack.text.includes('(3 veces)'));
t('escapa < > & para que nadie pueda mencionar a todo el canal', slack && !slack.text.includes('<!channel>') && slack.text.includes('&lt;!channel&gt;'));
r = await pedirErr(errorEj, Object.assign({ SLACK_WEBHOOK: 'https://hooks.slack.com/services/T/B/X' }, env), 'https://otro-sitio.com'); t('errores: rechaza otros sitios', r.status === 403);
r = await pedirErr({ nada: 1 }, env); t('errores vacíos responde 400', r.status === 400);
// Mis Claves (Cloudflare Pages) puede mandar errores, pero no avisos.
r = await pedirErr({ app: 'Mis Claves', version: '2.2', mensaje: 'TypeError: x' }, env, 'https://mis-claves.pages.dev'); t('Mis Claves puede mandar errores', r.status === 202 && r.headers.get('Access-Control-Allow-Origin') === 'https://mis-claves.pages.dev');
r = await W.default.fetch(new Request('https://avisos-equipos.x.workers.dev/errores', { method: 'OPTIONS', headers: { Origin: 'https://abc123.mis-claves.pages.dev' } }), env); t('y su vista previa pasa la consulta previa (OPTIONS)', r.status === 204);
r = await pedir({ subs: [sub], titulo: 'x' }, 'https://mis-claves.pages.dev'); t('Mis Claves no puede mandar avisos', r.status === 403);
r = await pedirErr({ mensaje: 'x' }, env, 'https://mis-claves.pages.dev.otro.com'); t('un sitio que se hace pasar por Mis Claves no entra', r.status === 403);
r = await pedirErr({ mensaje: 'x' }, env, 'https://otro-mis-claves.pages.dev'); t('ni otro proyecto con nombre parecido', r.status === 403);
console.log(`\n${ok} bien, ${mal} mal${v.real ? '' : ' (con una llave de prueba)'}`);
process.exit(mal ? 1 : 0);
