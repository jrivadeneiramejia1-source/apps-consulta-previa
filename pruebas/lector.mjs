// Pruebas del lector de Entregas (OCR): saca cédula, fecha, tipo, seriales y nombre del texto, y llena la página.
// Uso: node pruebas/lector.mjs [carpeta-de-capturas]. El OCR corre de verdad (Tesseract.js desde node_modules).
import { lanzar, AXE_JS, SALIDA, servir, pagina, semillaEquipos } from './banco.mjs';

const OUT = process.argv[2] || SALIDA;
const URL = 'http://127.0.0.1:8823';
let ok = 0, mal = 0;
function chequear(cond, nombre) { if (cond) ok++; else { mal++; console.log('  FALLA:', nombre); } }
const espera = ms => new Promise(r => setTimeout(r, ms));

const srv = await servir(8823);
const br = await lanzar();
const err = [];
const { page: pg } = await pagina(br, { semilla: semillaEquipos(), errores: err, ancho: 360, alto: 760 });
await pg.goto(URL + '/entregas/'); await pg.waitForSelector('#nubeClave');
await pg.fill('#nubeK', 'prueba123'); await pg.fill('#nubeN', 'Jeiler'); await pg.click('#nubeEntrar');
await pg.waitForSelector('#nubeNueva:not([hidden])'); await pg.click('#nubeNueva'); await pg.waitForSelector('#entList .empty-state');

console.log('\n=== SACAR DATOS DEL TEXTO ===');
const casos = await pg.evaluate(() => {
  const x = (t, c) => Lector.extraer(t, c || { seriales: ['5CD1234ABC', 'PF2XYZ01', 'GPS778812'], nombres: ['Ana Gómez', 'Luis Pérez'] });
  return {
    acta: x('ACTA DE DEVOLUCIÓN DE EQUIPOS\nFecha: 15/10/2026\nNombre: Ana Gómez   C.C. No. 1.118.456.789\nPortátil HP serial 5CD1234A8C\nCargador S/N: XYZ98765'),
    entrega: x('FORMATO DE ENTREGA DE EQUIPOS\nRiohacha, 3 de septiembre de 2026\nRecibe: LUIS PEREZ\nCédula de ciudadanía 84.012.345\nGPS Garmin GPS-778812'),
    setiembre: x('Riohacha, 3 de setiembre del 2025'),
    sinDatos: x('Firma\n\nObservaciones: ninguna'),
    rotulo: x('NOMBRE: CARLOS IPUANA CEDULA 40123456\nDOCUMENTO DE ENTREGA No. 123456', { seriales: [], nombres: [] }),
    fechaMala: x('Fecha: 31/02/2026 y 2026-10-03'),
    serialConN: x('Serial NXH12345AB'),
    numeroActa: x('Acta No. 98765432 de entrega', { seriales: [], nombres: [] }),
    malLeido: x('Serial: 5E0D1234ABC'),
    parecido: x('Equipo PF2XYZ99 en bodega'),
    mil: (() => {
      const ser = Array.from({ length: 1000 }, (_, i) => 'SN' + String(i * 7919 % 100000).padStart(6, '0') + 'X');
      const txt = Array.from({ length: 60 }, (_, i) => `Línea ${i} con texto de ejemplo ${i * 31} y más palabras`).join('\n') + '\nSerial ' + ser[500];
      const t0 = performance.now(), r = Lector.extraer(txt, { seriales: ser, nombres: [] });
      return { ms: performance.now() - t0, n: r.seriales.length, s: r.seriales[0] && r.seriales[0].serial, esperado: ser[500] };
    })()
  };
});
const c = casos;
chequear(c.acta.tipo === 'devolucion', `tipo devolución (${c.acta.tipo})`);
chequear(c.acta.fecha === '2026-10-15', `fecha día/mes/año (${c.acta.fecha})`);
chequear(c.acta.cedula === '1118456789', `cédula con puntos (${c.acta.cedula})`);
chequear(c.acta.nombre === 'Ana Gómez', `nombre conocido (${c.acta.nombre})`);
chequear(c.acta.seriales.some(s => s.serial === '5CD1234ABC' && s.conocido), 'serial de Equipos aunque el OCR cambie B por 8');
chequear(c.acta.seriales.some(s => s.serial === 'XYZ98765' && !s.conocido), 'serial nuevo después de S/N');
chequear(c.acta.seriales.length === 2, `sin seriales repetidos (${c.acta.seriales.map(s => s.serial)})`);
chequear(c.entrega.tipo === 'entrega' && c.entrega.fecha === '2026-09-03', `entrega y fecha con mes en letras (${c.entrega.tipo} ${c.entrega.fecha})`);
chequear(c.entrega.cedula === '84012345', `cédula de ciudadanía (${c.entrega.cedula})`);
chequear(c.entrega.nombre === 'Luis Pérez', `nombre conocido sin tildes en la hoja (${c.entrega.nombre})`);
chequear(c.entrega.seriales.some(s => s.serial === 'GPS778812'), 'serial conocido con guion en la hoja');
chequear(c.setiembre.fecha === '2025-09-03', `"setiembre" (${c.setiembre.fecha})`);
chequear(!c.sinDatos.nombre && !c.sinDatos.cedula && !c.sinDatos.fecha && !c.sinDatos.tipo && !c.sinDatos.seriales.length, 'sin datos: todo vacío');
chequear(c.rotulo.nombre === 'Carlos Ipuana', `nombre después de "Nombre:" hasta "Cédula" (${c.rotulo.nombre})`);
chequear(c.rotulo.cedula === '40123456', `no confunde el número del documento de entrega con la cédula (${c.rotulo.cedula})`);
chequear(c.fechaMala.fecha === '2026-10-03', `descarta fechas imposibles (${c.fechaMala.fecha})`);
chequear(c.serialConN.seriales[0] && c.serialConN.seriales[0].serial === 'NXH12345AB', `serial que empieza con N (${c.serialConN.seriales.map(s => s.serial)})`);
chequear(!c.numeroActa.cedula, 'el número del acta no es cédula');
chequear(c.malLeido.seriales.length === 1 && c.malLeido.seriales[0].serial === '5CD1234ABC', `serial de Equipos con dos letras mal leídas (${c.malLeido.seriales.map(s => s.serial)})`);
chequear(!c.parecido.seriales.some(s => s.conocido), `no confunde un serial parecido de otro equipo (${c.parecido.seriales.map(s => s.serial)})`);
chequear(c.mil.n === 1 && c.mil.s === c.mil.esperado && c.mil.ms < 1500, `con 1000 seriales en Equipos (${Math.round(c.mil.ms)} ms, ${c.mil.n} hallado)`);
console.log(`  (1000 seriales contra 60 líneas: ${Math.round(c.mil.ms)} ms)`);

console.log('\n=== LEER UNA HOJA DE VERDAD (OCR) ===');
await pg.click('#tabSub');
// Hoja impresa de ejemplo, como sale del escáner.
const hoja = await pg.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 1240; c.height = 1754; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#111';
  x.font = 'bold 46px Arial'; x.fillText('ACTA DE DEVOLUCIÓN DE EQUIPOS', 150, 170);
  x.font = '34px Arial';
  ['Fecha: 15/10/2026', 'Nombre: Ana Gómez', 'C.C. No. 1.118.456.789', 'Equipo: Portátil HP ProBook', 'Serial: 5CD1234ABC', 'Cargador S/N: XYZ98765'].forEach((t, i) => x.fillText(t, 120, 320 + i * 80));
  x.strokeStyle = '#1f3fbf'; x.lineWidth = 4; x.beginPath(); x.moveTo(200, 1400); x.bezierCurveTo(380, 1300, 500, 1480, 760, 1380); x.stroke();
  x.font = '28px Arial'; x.fillText('Firma de quien devuelve', 200, 1460);
  return c.toDataURL('image/png').split(',')[1];
});
await pg.setInputFiles('#archivo', { name: 'acta.png', mimeType: 'image/png', buffer: Buffer.from(hoja, 'base64') });
await pg.waitForSelector('[data-leer="0"]');
chequear(await pg.locator('#l0c').inputValue() === '', 'antes de leer la cédula está vacía');
const t0 = Date.now();
await pg.click('[data-leer="0"]');
await pg.waitForFunction(() => { const b = document.querySelector('[data-leer="0"]'); return b && !b.disabled; }, null, { timeout: 120000 });
console.log(`  (OCR en frío: ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
chequear(await pg.locator('#l0c').inputValue() === '1118456789', `llenó la cédula (${await pg.locator('#l0c').inputValue()})`);
chequear(await pg.locator('#l0f').inputValue() === '2026-10-15', `llenó la fecha (${await pg.locator('#l0f').inputValue()})`);
chequear(await pg.locator('#l0t').inputValue() === 'devolucion', `cambió el tipo a Devolución (${await pg.locator('#l0t').inputValue()})`);
chequear(await pg.locator('#l0n').inputValue() === 'Ana Gómez', `llenó el nombre (${await pg.locator('#l0n').inputValue()})`);
const seriales = await pg.locator('[data-i="0"] [data-eq-k=serial]').evaluateAll(xs => xs.map(x => x.value));
chequear(seriales.includes('5CD1234ABC') && seriales.includes('XYZ98765') && seriales.length === 2, `llenó los seriales (${seriales})`);
chequear(await pg.locator('[data-i="0"] [data-eq-k=marca]').first().inputValue() === 'HP', 'trae la marca de Equipos');
const aviso = await pg.locator('.toast').last().textContent();
chequear(/llené .*cédula.*Revisa/.test(aviso), `avisa qué llenó (${aviso})`);
await pg.screenshot({ path: `${OUT}/l1-leida.png`, fullPage: true });

// Leer otra vez no repite ni cambia lo que ya está escrito.
await pg.fill('#l0n', 'Ana María Gómez'); await pg.locator('#l0n').dispatchEvent('change');
const t1 = Date.now();
await pg.click('[data-leer="0"]');
await pg.waitForFunction(() => { const b = document.querySelector('[data-leer="0"]'); return b && !b.disabled; }, null, { timeout: 60000 });
console.log(`  (OCR en caliente: ${((Date.now() - t1) / 1000).toFixed(1)} s)`);
chequear(await pg.locator('#l0n').inputValue() === 'Ana María Gómez', 'no reemplaza lo que escribiste');
chequear((await pg.locator('[data-i="0"] [data-eq-k=serial]').count()) === 2, 'no repite seriales');
chequear(/no encontré datos impresos nuevos/.test(await pg.locator('.toast').last().textContent()), 'avisa que no había nada nuevo');

// Página en blanco: no llena nada y lo dice.
const blanca = await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 800; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 600, 800); return c.toDataURL('image/png').split(',')[1]; });
await pg.setInputFiles('#archivo', { name: 'blanca.png', mimeType: 'image/png', buffer: Buffer.from(blanca, 'base64') });
await pg.waitForSelector('[data-leer="1"]');
await pg.click('[data-leer="1"]');
await pg.waitForFunction(() => { const b = document.querySelector('[data-leer="1"]'); return b && !b.disabled; }, null, { timeout: 60000 });
chequear(await pg.locator('#l1c').inputValue() === '' && await pg.locator('#l1n').inputValue() === '', 'página en blanco: no llena nada');

// Accesibilidad de la lista con los botones nuevos.
await espera(400);
await pg.addScriptTag({ content: AXE_JS });
const v = await pg.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(v => `${v.id}: ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
chequear(!v.length, 'axe sin fallas en Subir' + (v.length ? '\n     ' + v.join('\n     ') : ''));
const r = await pg.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
chequear(r[0] <= r[1], 'sin desplazamiento lateral a 360 px');
const externos = err.filter(e => e.startsWith('externo'));
chequear(!err.length, 'sin errores en la página' + (err.length ? ': ' + err.join(' | ') : ''));
if (externos.length) console.log('  ', externos.join('\n   '));

await br.close(); srv.close();
console.log(`\nResultado: ${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
