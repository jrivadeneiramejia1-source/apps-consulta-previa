/* avisos-equipos — Cloudflare Worker que envía las notificaciones de la app de Equipos.
   La app le manda a quién avisar (las suscripciones del teléfono, guardadas en Firestore) y el texto;
   este Worker cifra el mensaje (RFC 8291) y lo firma (VAPID, RFC 8292) para el servicio de notificaciones
   del teléfono (Google, Apple o Mozilla). No guarda nada.
   Secreto que hay que crear en Cloudflare: VAPID_D (la parte privada de la llave). */

// Parte pública de la llave VAPID (la misma que usa la app en config.js).
const VAPID_X = 'YWkeAiPGn6veSXcFRzTM8JY4TNjmPWI3b4-TVv6MgCQ';
const VAPID_Y = 'S9hYnx9UKCEk-9hRzpQmuz0uqNXCx_1W5PSkqARfd9Q';
// Páginas que pueden pedir avisos.
const ORIGENES = ['https://jrivadeneiramejia1-source.github.io', 'http://127.0.0.1:8811', 'http://localhost:8811'];
const MAX_SUBS = 25, MAX_TEXTO = 600;

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));
const unir = (...partes) => { const t = new Uint8Array(partes.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of partes) { t.set(p, i); i += p.length; } return t; };

async function hkdf(salt, ikm, info, largo) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, largo * 8));
}

// Cifrado aes128gcm para Web Push (RFC 8291).
export async function cifrar(texto, p256dh, auth) {
  const uaPub = deB64u(p256dh), secreto = deB64u(auth);
  if (uaPub.length !== 65 || secreto.length !== 16) throw new Error('suscripción inválida');
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(secreto, compartido, unir(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const llave = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const claro = unir(enc.encode(texto), new Uint8Array([2]));   // 2 = último registro, sin relleno
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, llave, claro));
  const rs = new Uint8Array([0, 0, 16, 0]);   // tamaño de registro 4096
  return unir(sal, rs, new Uint8Array([65]), asPub, cifrado);
}

// Firma VAPID (JWT ES256) para el servicio de notificaciones.
// x, y: parte pública de la llave (por defecto la de la app; las pruebas usan una llave propia).
export async function vapid(endpoint, d, sujeto, x = VAPID_X, y = VAPID_Y) {
  const llave = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x, y, d, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const cab = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const cuerpo = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujeto })));
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, llave, enc.encode(cab + '.' + cuerpo));
  const pub = b64u(unir(new Uint8Array([4]), deB64u(x), deB64u(y)));
  return `vapid t=${cab}.${cuerpo}.${b64u(firma)}, k=${pub}`;
}

function cors(origen) {
  return { 'Access-Control-Allow-Origin': origen, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
const json = (datos, estado, h) => new Response(JSON.stringify(datos), { status: estado, headers: Object.assign({ 'Content-Type': 'application/json' }, h) });

// Registro de errores: las apps mandan aquí los errores que pasan en los teléfonos y el Worker los publica en Slack.
// Secreto opcional en Cloudflare: SLACK_WEBHOOK (dirección de un "Incoming Webhook" de Slack). Sin él, no se publica nada.
const MAX_ERRORES = 10;
const corto = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').slice(0, n);
// Slack interpreta < > & (menciones como <!channel>): se escapan para que el texto llegue tal cual.
const slackTxt = v => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function errores(req, env, h) {
  let datos;
  try { datos = await req.json(); } catch (e) { return json({ error: 'JSON inválido' }, 400, h); }
  const lista = (Array.isArray(datos && datos.errores) ? datos.errores : [datos]).filter(x => x && x.mensaje).slice(0, MAX_ERRORES);
  if (!lista.length) return json({ error: 'no hay errores' }, 400, h);
  if (!env.SLACK_WEBHOOK) return json({ ok: true, slack: false }, 202, h);
  const bloques = lista.map(x => {
    const quien = slackTxt([corto(x.nombre, 40) || 'sin nombre', corto(x.navegador, 60)].filter(Boolean).join(' · '));
    const veces = Number(x.veces) > 1 ? ` (${Math.min(999, Number(x.veces))} veces)` : '';
    return `:warning: *Error en ${slackTxt(corto(x.app, 20)) || 'la app'} v${slackTxt(corto(x.version, 10)) || '?'}*${veces} · ${quien}\n>${slackTxt(corto(x.mensaje, 300))}` +
      (x.detalle ? '\n```' + slackTxt(corto(x.detalle, 1200)).replace(/```/g, "'''") + '```' : '') + (x.donde ? `\n_${slackTxt(corto(x.donde, 120))}_` : '');
  });
  try {
    const r = await fetch(env.SLACK_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: bloques.join('\n\n') }) });
    return json({ ok: r.ok, slack: true, estado: r.status }, r.ok ? 200 : 502, h);
  } catch (e) { return json({ ok: false, slack: true, error: String(e.message || e) }, 502, h); }
}

export default {
  async fetch(req, env) {
    const origen = req.headers.get('Origin') || '';
    const permitido = ORIGENES.includes(origen);
    const h = permitido ? cors(origen) : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: permitido ? 204 : 403, headers: h });
    if (req.method === 'GET') return json({ ok: true, servicio: 'avisos-equipos', listo: !!env.VAPID_D, slack: !!env.SLACK_WEBHOOK }, 200, h);
    if (req.method !== 'POST') return json({ error: 'método no permitido' }, 405, h);
    if (!permitido) return json({ error: 'origen no permitido' }, 403, h);
    if (new URL(req.url).pathname.replace(/\/+$/, '').endsWith('/errores')) return errores(req, env, h);
    if (!env.VAPID_D) return json({ error: 'falta el secreto VAPID_D en el Worker' }, 500, h);
    let datos;
    try { datos = await req.json(); } catch (e) { return json({ error: 'JSON inválido' }, 400, h); }
    const subs = Array.isArray(datos.subs) ? datos.subs.slice(0, MAX_SUBS) : [];
    const aviso = { titulo: String(datos.titulo || 'Equipos').slice(0, 120), cuerpo: String(datos.cuerpo || '').slice(0, MAX_TEXTO), url: String(datos.url || './').slice(0, 300), etiqueta: String(datos.etiqueta || '').slice(0, 80) };
    if (!subs.length) return json({ error: 'no hay a quién avisar' }, 400, h);
    const texto = JSON.stringify(aviso), sujeto = new URL(req.url).origin;
    const resultados = await Promise.all(subs.map(async s => {
      try {
        if (!s || !/^https:\/\//.test(s.endpoint || '') || !s.keys) return { estado: 0, error: 'suscripción inválida' };
        const r = await fetch(s.endpoint, {
          method: 'POST',
          headers: { Authorization: await vapid(s.endpoint, env.VAPID_D, sujeto, env.VAPID_X || VAPID_X, env.VAPID_Y || VAPID_Y), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' },
          body: await cifrar(texto, s.keys.p256dh, s.keys.auth)
        });
        return { estado: r.status, vencida: r.status === 404 || r.status === 410 };
      } catch (e) { return { estado: 0, error: String(e.message || e) }; }
    }));
    return json({ ok: true, resultados }, 200, h);
  }
};
