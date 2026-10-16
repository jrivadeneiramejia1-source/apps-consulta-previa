// Lector de códigos con la cámara en vivo: códigos pequeños, zoom, enfoque y cambio de cámara.
// Chromium usa como cámara un video (y4m) armado aquí con un código de barras pequeño en el centro.
// Uso: node pruebas/camara.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lanzar, AXE_JS, servir, pagina, semillaEquipos, require } from './banco.mjs';
const bwipjs = require('bwip-js');
const URL = 'http://127.0.0.1:8825', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'camara-'));
const srv = await servir(8825);

// ---------- videos de prueba (YUV 4:2:0) ----------
const W = 1280, H = 720;
async function video(nombre, png, ancho) {
  // El navegador pinta el código sobre un cuadro blanco con un poco de borroso (como una cámara real) y da los planos Y, U, V.
  const br = await lanzar(), pg = await br.newPage();
  const planos = await pg.evaluate(async ([src, W, H, ancho]) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#f4f2ec'; x.fillRect(0, 0, W, H);
    if (src) { const im = new Image(); im.src = src; await im.decode(); const h = Math.round(im.height * ancho / im.width); x.filter = 'blur(0.6px)'; x.drawImage(im, (W - ancho) / 2, (H - h) / 2, ancho, h); }
    const d = x.getImageData(0, 0, W, H).data, Y = new Uint8Array(W * H), U = new Uint8Array(W * H / 4).fill(128), V = new Uint8Array(W * H / 4).fill(128);
    for (let i = 0; i < W * H; i++) Y[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    const b64 = a => { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
    return [b64(Y), b64(U), b64(V)];
  }, [png ? 'data:image/png;base64,' + png.toString('base64') : '', W, H, ancho]);
  await br.close();
  const cuadro = Buffer.concat([Buffer.from('FRAME\n'), ...planos.map(p => Buffer.from(p, 'base64'))]);
  const f = path.join(TMP, nombre + '.y4m');
  fs.writeFileSync(f, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), cuadro, cuadro, cuadro, cuadro]));
  return f;
}
const codigo = (text, extra = {}) => bwipjs.toBuffer(Object.assign({ bcid: 'code128', text, scale: 2, height: 8, includetext: false, paddingwidth: 10, paddingheight: 10, backgroundcolor: 'FFFFFF' }, extra));
// Código pequeño: 230 px de ancho en un cuadro de 1280 (una etiqueta de serial vista desde unos 25 cm).
const VID_PEQ = await video('pequeno', await codigo('PF2XYZ01'), 230);
const VID_VACIO = await video('vacio', null, 0);

async function abrir(videoArchivo, { simular = false, guardada = null, antes = null } = {}) {
  const br = await lanzar(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${videoArchivo}`]);
  const err = [], { ctx, page } = await pagina(br, { semilla: semillaEquipos(), errores: err });
  await ctx.grantPermissions(['camera'], { origin: URL });
  await ctx.addInitScript(([simular, guardada]) => {
    window.__codigosSinNativo = true;
    if (guardada) localStorage.setItem('codigos.camara', guardada);
    if (!simular) return;
    // Teléfono con zoom de 1× a 5×, enfoque continuo, manual y por toque, y linterna. Se anota cada ajuste.
    const cap0 = MediaStreamTrack.prototype.getCapabilities;
    MediaStreamTrack.prototype.getCapabilities = function () { return Object.assign({}, cap0 ? cap0.call(this) : {}, { zoom: { min: 1, max: 5, step: 0.1 }, focusMode: ['continuous', 'manual', 'single-shot'], focusDistance: { min: 0.05, max: 2, step: 0.01 }, torch: true }); };
    window.__ajustes = [];
    MediaStreamTrack.prototype.applyConstraints = function (c) { window.__ajustes.push(JSON.parse(JSON.stringify(c))); return Promise.resolve(); };
    // Dos cámaras traseras (la segunda es la de verdad del navegador de prueba).
    const enu = MediaDevices.prototype.enumerateDevices;
    MediaDevices.prototype.enumerateDevices = async function () { const l = await enu.call(this); const v = l.filter(d => d.kind === 'videoinput'); return v.length ? [{ kind: 'videoinput', deviceId: 'gran-angular', label: 'camera2 2, facing back', groupId: '' }, ...v.map(d => ({ kind: d.kind, deviceId: d.deviceId, label: 'camera2 0, facing back', groupId: d.groupId }))] : l; };
  }, [simular, guardada]);
  if (antes) await antes(ctx, page);
  await page.goto(URL + '/equipos/'); await page.waitForSelector('#recList .card'); await esp(300);
  return { br, page, err };
}
const ajustes = p => p.evaluate(() => (window.__ajustes || []).map(c => c.advanced ? c.advanced[0] : c));

// 1. Código pequeño en vivo
{
  console.log('\n— Código pequeño en vivo');
  const { br, page, err } = await abrir(VID_PEQ);
  await page.click('#btnNewRec'); await page.waitForSelector('#rcSheet:not([hidden])');
  const t0 = Date.now();
  await page.locator('[data-scan="rcSerial"]').click(); await page.waitForSelector('.cod');
  await page.waitForFunction(() => !document.querySelector('.cod'), null, { timeout: 25000 }).catch(() => {});
  log('C1. lee en vivo un código de barras pequeño (230 px de 1280)', (await page.inputValue('#rcSerial')) === 'PF2XYZ01', `${await page.inputValue('#rcSerial')} (${Date.now() - t0} ms)`);
  console.log(`      tardó ${((Date.now() - t0) / 1000).toFixed(1)} s (incluye abrir la cámara y cargar el lector)`);
  log('C2. queda el equipo reconocido', (await page.textContent('#rcConocido')).includes('Equipo ya registrado'));
  log('C3. la cámara se apaga al cerrar', await page.evaluate(() => !document.querySelector('.cod video')));
  log('sin errores', !err.length, err.join(' | '));
  await br.close();
}

// 2. Teléfono con zoom y enfoque (simulado): botones y ajustes
{
  console.log('\n— Zoom, enfoque y cámaras');
  const { br, page, err } = await abrir(VID_VACIO, { simular: true });
  await page.click('#btnNewRec'); await page.waitForSelector('#rcSheet:not([hidden])');
  await page.locator('[data-scan="rcSerial"]').click(); await page.waitForSelector('.cod-zoom:not([hidden])', { timeout: 20000 }).catch(() => {});
  const zooms = await page.$$eval('.cod-zoom [data-zoom]', l => l.map(b => b.textContent));
  log('Z1. botones de zoom 1×, 2×, 3× y 4×', JSON.stringify(zooms) === JSON.stringify(['1×', '2×', '3×', '4×']), JSON.stringify(zooms));
  await esp(300);
  let a = await ajustes(page);
  log('Z2. empieza en 2× (se aleja el teléfono y enfoca)', await page.getAttribute('[data-zoom="2"]', 'aria-pressed') === 'true' && a.some(c => c.zoom === 2), JSON.stringify(a));
  log('Z3. pide enfoque continuo', a.some(c => c.focusMode === 'continuous'));
  await page.click('[data-zoom="3"]'); await esp(150); a = await ajustes(page);
  log('Z4. tocar 3× pone zoom 3', a[a.length - 1].zoom === 3 && await page.getAttribute('[data-zoom="3"]', 'aria-pressed') === 'true');
  log('Z5. aparecen Enfocar de cerca, Cambiar cámara y Linterna', await page.isVisible('[data-a="cerca"]') && await page.isVisible('[data-a="otra"]') && await page.isVisible('[data-a="linterna"]'));
  await page.click('[data-a="cerca"]'); await esp(150); a = await ajustes(page);
  log('Z6. Enfocar de cerca: enfoque manual a la distancia mínima', a[a.length - 1].focusMode === 'manual' && a[a.length - 1].focusDistance === 0.05 && await page.getAttribute('[data-a="cerca"]', 'aria-pressed') === 'true', JSON.stringify(a[a.length - 1]));
  await page.click('[data-a="cerca"]'); await esp(150); a = await ajustes(page);
  log('Z7. al quitarlo vuelve al enfoque continuo', a[a.length - 1].focusMode === 'continuous' && await page.getAttribute('[data-a="cerca"]', 'aria-pressed') === 'false');
  const caja = await page.locator('.cod video').boundingBox();
  await page.mouse.click(caja.x + caja.width * 0.25, caja.y + caja.height * 0.5); await esp(150); a = await ajustes(page);
  const toque = a[a.length - 1];
  log('Z8. tocar la imagen enfoca en ese punto', toque.focusMode === 'single-shot' && Math.abs(toque.pointsOfInterest[0].x - 0.25) < 0.02 && Math.abs(toque.pointsOfInterest[0].y - 0.5) < 0.02, JSON.stringify(toque));
  await page.waitForSelector('.cod-ayuda:not([hidden])', { timeout: 9000 }).catch(() => {});
  const ayuda = await page.textContent('.cod-ayuda').catch(() => '');
  log('Z9. si no lee en 6 s, explica qué hacer con códigos pequeños', /2×/.test(ayuda) && /Enfocar de cerca/.test(ayuda) && /Tomar foto/.test(ayuda), ayuda);
  await page.addScriptTag({ content: AXE_JS });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(x => `${x.id}: ${x.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
  log('Z10. axe sin fallas con todos los controles', !v.length, v.join(' · '));
  // Cambiar cámara: la gran angular no existe en el navegador de prueba → avisa y sigue con la que tenía
  await page.click('[data-a="otra"]'); await esp(800);
  log('Z11. Cambiar cámara pasa a la siguiente o avisa si no se pudo', /Cámara 2 de 2|No se pudo cambiar de cámara|Cámara 1 de 2/.test(await page.textContent('.cod-estado')), await page.textContent('.cod-estado'));
  log('sin errores', !err.length, err.join(' | '));
  await br.close();
}

// 3. La cámara guardada ya no existe: abre la trasera normal y lee
{
  console.log('\n— Cámara guardada que ya no existe');
  const { br, page, err } = await abrir(VID_PEQ, { guardada: 'camara-vieja' });
  await page.click('#tabEq'); await page.waitForSelector('#eqList .card');
  await page.locator('[data-scan="qEq"]').click();
  await page.waitForSelector('#eqSheet:not([hidden])', { timeout: 25000 }).catch(() => {});
  log('G1. abre la cámara normal, lee y abre el equipo', await page.isVisible('#eqSheet') && (await page.textContent('#eqTitle')) === 'PF2XYZ01');
  log('sin errores', !err.length, err.join(' | '));
  await br.close();
}

// 4. Foto grande con un código pequeño (Tomar foto)
{
  console.log('\n— Foto con un código pequeño');
  const { br, page, err } = await abrir(VID_VACIO);
  const png = await codigo('GPS778812', { scale: 1, height: 5 });
  const n = await page.evaluate(async src => {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const x = c.getContext('2d');
    x.fillStyle = '#efece4'; x.fillRect(0, 0, c.width, c.height); x.filter = 'blur(0.5px)'; x.drawImage(im, 2000 - im.width / 2, 1500 - im.height / 2);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.92));
    return Codigos.leerImagen(blob);
  }, 'data:image/png;base64,' + png.toString('base64'));
  log('F1. una foto de 4000×3000 con un código diminuto en el centro se lee', JSON.stringify(n) === '["GPS778812"]', JSON.stringify(n));
  log('sin errores', !err.length, err.join(' | '));
  await br.close();
}

// 5. Casos de teléfonos reales: lector lento o sin internet, pedidos que la cámara rechaza, permiso negado,
//    cámara pegada y la app abierta dentro de WhatsApp.
const abrirLector = async page => { await page.click('#btnNewRec'); await page.waitForSelector('#rcSheet:not([hidden])'); await page.locator('[data-scan="rcSerial"]').click(); await page.waitForSelector('.cod'); };
const leyo = page => page.waitForFunction(() => !document.querySelector('.cod'), null, { timeout: 25000 }).then(() => page.inputValue('#rcSerial'), () => '(no leyó)');
{
  console.log('\n— Lector lento o sin internet: la cámara abre igual');
  const externos = [];
  const { br, page, err } = await abrir(VID_PEQ, { antes: async ctx => {
    ctx.on('request', r => { if (/jsdelivr|zxing|barcode-detector/.test(r.url()) && !r.url().startsWith(URL)) externos.push(r.url()); });
    await ctx.route('**/lib/codigos/ponyfill.js', async r => { await esp(2500); r.continue(); });
  } });
  await abrirLector(page); await esp(1200);
  const antes = await page.evaluate(() => { const v = document.querySelector('.cod video'); return { imagen: !!v && !v.hidden && v.readyState >= 2, estado: document.querySelector('.cod-estado').textContent }; });
  log('L1. la imagen de la cámara sale antes de que el lector esté listo', antes.imagen && /Preparando el lector/.test(antes.estado), JSON.stringify(antes));
  log('L2. después lee el código', (await leyo(page)) === 'PF2XYZ01');
  log('L3. el lector viene con la app (no se pide nada a internet)', !externos.length, externos.join(', '));
  log('sin errores', !err.length, err.join(' | '));
  await br.close();
}
{
  console.log('\n— La cámara rechaza la resolución pedida');
  const { br, page, err } = await abrir(VID_PEQ, { antes: async ctx => ctx.addInitScript(() => {
    const gum = MediaDevices.prototype.getUserMedia; window.__pedidos = [];
    MediaDevices.prototype.getUserMedia = function (c) { window.__pedidos.push(JSON.stringify(c.video)); return window.__pedidos.length < 3 ? Promise.reject(new DOMException('no', 'OverconstrainedError')) : gum.call(this, c); };
  }) });
  await abrirLector(page);
  log('R1. prueba pedidos más simples hasta que abre, y lee', (await leyo(page)) === 'PF2XYZ01', JSON.stringify(await page.evaluate(() => window.__pedidos)));
  log('R2. nunca pide «zoom: true» (en Android abre un segundo permiso que puede bloquear la cámara)', !(await page.evaluate(() => window.__pedidos)).some(p => /zoom/.test(p)));
  log('sin errores', !err.length, err.join(' | '));
  await br.close();
}
{
  console.log('\n— Permiso de cámara negado');
  const { br, page, err } = await abrir(VID_PEQ, { antes: async ctx => ctx.addInitScript(() => {
    const gum = MediaDevices.prototype.getUserMedia; window.__negar = true;
    Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
    MediaDevices.prototype.getUserMedia = function (c) { return window.__negar ? Promise.reject(new DOMException('no', 'NotAllowedError')) : gum.call(this, c); };
  }) });
  await abrirLector(page);
  await page.waitForSelector('.cod-sin:not([hidden])', { timeout: 8000 }).catch(() => {});
  const txt = await page.textContent('.cod-sin').catch(() => '');
  log('P1. dice que la cámara está bloqueada y cómo permitirla en Android', /bloqueada/.test(txt) && /Permisos/.test(txt) && /Información de la app/.test(txt), txt);
  log('P2. ofrece Reintentar y resalta Tomar foto', await page.isVisible('[data-a="reintentar"]') && await page.getAttribute('[data-a="foto"]', 'class').then(c => /\bsi\b/.test(c)));
  await page.addScriptTag({ content: AXE_JS });
  const v = await page.evaluate(async () => (await window.axe.run(document.querySelector('.cod'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map(x => x.id));
  log('P3. axe sin fallas en el aviso', !v.length, v.join(', '));
  await page.evaluate(() => { window.__negar = false; }); await page.click('[data-a="reintentar"]');
  log('P4. al dar permiso, Reintentar abre la cámara y lee', (await leyo(page)) === 'PF2XYZ01');
  log('sin errores', !err.length, err.join(' | '));
  await br.close();
}
{
  console.log('\n— Cámara pegada (no responde)');
  const { br, page, err } = await abrir(VID_PEQ, { antes: async ctx => ctx.addInitScript(() => {
    window.__codigosEspera = 1500; MediaDevices.prototype.getUserMedia = () => new Promise(() => {});
  }) });
  await abrirLector(page);
  await page.waitForSelector('.cod-sin:not([hidden])', { timeout: 6000 }).catch(() => {});
  const txt = await page.textContent('.cod-sin').catch(() => '');
  log('T1. no se queda en «Abriendo la cámara…»: avisa que no respondió y ofrece Reintentar', /no respondió/.test(txt) && await page.isVisible('[data-a="reintentar"]'), txt);
  log('sin errores', !err.length, err.join(' | '));
  await br.close();
}
{
  console.log('\n— App abierta dentro de WhatsApp');
  const { br, page, err } = await abrir(VID_PEQ, { antes: async ctx => ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 WhatsApp/2.24' });
    MediaDevices.prototype.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError'));
  }) });
  await abrirLector(page);
  await page.waitForSelector('.cod-sin:not([hidden])', { timeout: 8000 }).catch(() => {});
  const txt = await page.textContent('.cod-sin').catch(() => '');
  log('W1. explica que hay que abrirla en Chrome', /otra aplicación/.test(txt) && /Abrir en Chrome/.test(txt), txt);
  log('sin errores', !err.length, err.join(' | '));
  await br.close();
}

srv.close(); fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
