// Prueba del Worker: descifra con http_ece (como lo haría el teléfono) y verifica la firma VAPID.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/claude/construir/');
const ece = require('http_ece');
const v = JSON.parse(fs.readFileSync(process.env.VAPID_JSON || '/tmp/claude-0/vapid.json'));
const W = await import('/home/claude/apps-consulta-previa/avisos/worker.js');
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
const a = await W.vapid(sub.endpoint, v.d, 'https://avisos-equipos.ejemplo.workers.dev');
const [, jwt, k] = a.match(/^vapid t=([^,]+), k=(.+)$/);
const [h, c, f] = jwt.split('.');
const claims = JSON.parse(Buffer.from(c, 'base64url'));
const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: v.x, y: v.y }, format: 'jwk' });
t('la firma VAPID es válida (ES256)', crypto.verify('sha256', Buffer.from(h + '.' + c), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(f, 'base64url')));
t('aud = servicio del teléfono, exp < 24 h', claims.aud === 'https://fcm.googleapis.com' && claims.exp - Date.now() / 1000 < 86400 && claims.exp > Date.now() / 1000);
t('la llave pública k coincide con la de la app', k === v.pub);
// 3) el Worker completo con un fetch falso
const llamados = [];
globalThis.fetch = async (url, o) => { llamados.push({ url, o }); return new Response('', { status: url.includes('vencida') ? 410 : 201 }); };
const env = { VAPID_D: v.d };
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
console.log(`\n${ok} bien, ${mal} mal`);
