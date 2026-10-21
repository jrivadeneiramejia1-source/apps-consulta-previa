// Soporte (chat) de Equipos con el Firebase falso. Uso: node pruebas/chat.mjs
// Lista de personas con presencia, chat de todos, privados, responder citando, borrar, sin leer, vincular otro teléfono,
// avisos cuando falta el inicio anónimo, enlace desde una notificación, Escape y Atrás, 320 px y accesibilidad.
import { lanzar, AXE_JS, servir, pagina, semillaEquipos, huella, SALIDA } from './banco.mjs';
const URL = 'http://127.0.0.1:8829/equipos/', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const CLAVE = 'prueba123', B = `espacios/${huella('equipos', CLAVE)}`;
async function axe(page, nombre) {
  await esp(350);
  await page.addScriptTag({ content: AXE_JS });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
  log(`axe sin fallas: ${nombre}`, !r.length, r.join('\n      '));
}
const fsDe = p => p.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso')));
const toastTxt = p => p.locator('#toast').textContent().catch(() => '');
const sinDesborde = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.msg-burbuja, .so-fila')].every(e => e.getBoundingClientRect().right <= innerWidth + 1));

// ---------- datos: Ana (conectada) y Luis (hace 3 días); mensajes de Ana sin leer ----------
const ahora = Date.now(), hace = min => ahora - min * 60e3;
function semilla(extra) {
  const s = semillaEquipos(CLAVE), F = s.__fs_falso;
  F[`${B}/gente/ana-gomez`] = { nombre: 'Ana Gómez', uids: ['u-ana'], visto: hace(1), creado: hace(3000) };
  F[`${B}/gente/luis`] = { nombre: 'Luis', uids: ['u-luis'], visto: hace(4320), creado: hace(5000) };
  F[`${B}/chat/c1`] = { de: 'ana-gomez', nombre: 'Ana Gómez', texto: '¿Alguien tiene el disco de backup 2?', en: hace(30) };
  F[`${B}/chat/c2`] = { de: 'luis', nombre: 'Luis', texto: 'Yo lo dejé en la oficina de Riohacha: https://ejemplo.org/mapa', en: hace(20) };
  F[`${B}/privados/ana-gomez__jeiler/mensajes/p1`] = { de: 'ana-gomez', texto: 'Jeiler, ¿puedes revisar el portátil de María?', en: hace(10), leido: false };
  return Object.assign(s, extra || {});
}

const srv = await servir(8829);
const b = await lanzar();
try {
  console.log('Lista de Soporte');
  const errs = [];
  const { ctx, page } = await pagina(b, { semilla: semilla(), errores: errs });
  await page.goto(URL); await page.waitForSelector('#tabSo');
  await page.waitForFunction(() => document.querySelector('#badgeSo') && !document.querySelector('#badgeSo').hidden, null, { timeout: 8000 }).catch(() => {});
  log('la pestaña Soporte avisa los 3 mensajes sin leer', (await page.textContent('#badgeSo')).trim() === '3', await page.textContent('#badgeSo'));
  await page.click('#tabSo'); await page.waitForSelector('#soLista .so-fila');
  const lista = await page.textContent('#soLista');
  log('sale «Soporte · Todos» y las personas con sesión', lista.includes('Soporte · Todos') && lista.includes('Ana Gómez') && lista.includes('Luis'));
  log('Ana sale conectada y primero (tiene un mensaje sin leer)', (await page.locator('#soLista [data-chat]').nth(1).getAttribute('data-chat')) === 'ana-gomez' && (await page.locator('#soLista [data-chat="ana-gomez"] .so-punto.si').count()) === 1);
  log('Luis sale con «visto hace 3 días»', /visto hace 3 días/.test(await page.textContent('#soLista [data-chat="luis"]')));
  log('dice quién eres y cuántos están conectados', /1 persona conectada ahora · tú eres Jeiler/.test(lista));
  const st = await fsDe(page);
  log('al abrir la app, la persona queda anotada con su teléfono', !!st[`${B}/gente/jeiler`] && st[`${B}/gente/jeiler`].uids.length === 1);
  await page.screenshot({ path: `${SALIDA}/chat-lista.png` });
  await axe(page, 'lista de Soporte (claro)');

  console.log('Chat de todos');
  await page.click('#soLista [data-chat="todos"]'); await page.waitForSelector('#chatPantalla:not([hidden])');
  log('abre con el título y los mensajes de todos', (await page.textContent('#chatTitulo')) === 'Soporte · Todos' && (await page.locator('#chatLista .msg').count()) === 2);
  log('muestra el nombre de quien escribe y el día', /Ana Gómez/.test(await page.textContent('#chatLista')) && /Hoy/.test(await page.textContent('#chatLista .chat-dia')));
  log('los enlaces se pueden tocar', (await page.locator('#chatLista a[href="https://ejemplo.org/mapa"][rel~="noopener"]').count()) === 1);
  log('el cursor queda en la caja de texto', await page.evaluate(() => document.activeElement.id === 'chatTexto'));
  await page.fill('#chatTexto', 'Buenos días, equipo'); await page.keyboard.press('Enter'); await esp(250);
  log('enviar con Enter: sale a la derecha como mío', (await page.locator('#chatLista .msg.mia').count()) === 1 && /Buenos días, equipo/.test(await page.textContent('#chatLista .msg.mia')));
  let d = await fsDe(page);
  const mio = Object.entries(d).find(([k, v]) => k.startsWith(`${B}/chat/`) && v.texto === 'Buenos días, equipo');
  log('se guarda con quién lo escribió y la hora', mio && mio[1].de === 'jeiler' && mio[1].nombre === 'Jeiler' && typeof mio[1].en === 'number');
  await page.click('#chatLista .msg:not(.mia) >> nth=0 >> .msg-mas'); await page.click('[data-acc="responder"]');
  log('responder muestra a quién le respondes', /Respondiendo a Ana Gómez/.test(await page.textContent('#chatCita')));
  await page.fill('#chatTexto', 'Sí, lo tengo yo'); await page.click('#chatEnviar'); await esp(250);
  log('la respuesta lleva la cita del mensaje', /Ana Gómez¿Alguien tiene el disco de backup 2\?/.test(await page.textContent('#chatLista .msg.mia >> nth=1 >> .msg-cita')));
  await page.click('#chatLista .msg.mia >> nth=1 >> .msg-cita'); await esp(100);
  log('tocar la cita lleva al mensaje original y lo resalta', (await page.locator('#chatLista .msg.brilla').count()) === 1);
  await page.click('#chatLista .msg.mia >> nth=0 >> .msg-burbuja'); await page.click('[data-acc="borrar"]');
  await page.waitForSelector('#cfSheet:not([hidden])'); await page.click('#cfYes'); await esp(250);
  log('borrar un mensaje propio (con confirmación)', !/Buenos días, equipo/.test(await page.textContent('#chatLista')));
  log('otro no se puede borrar: no sale «Borrar» en mensajes ajenos', await (async () => { await page.click('#chatLista .msg:not(.mia) >> nth=0 >> .msg-mas'); const n = await page.locator('[data-acc="borrar"]').count(); await page.keyboard.press('Escape'); return n === 0; })());
  log('nada se sale de la pantalla', await sinDesborde(page));
  await page.screenshot({ path: `${SALIDA}/chat-todos.png` });
  await axe(page, 'chat de todos (claro)');
  await page.keyboard.press('Escape'); await esp(150);
  log('Escape vuelve a la lista', await page.isHidden('#chatPantalla'));
  log('al volver, los de todos quedan leídos (sin leer: 1, el privado)', (await page.textContent('#badgeSo')).trim() === '1', await page.textContent('#badgeSo'));

  console.log('Chat privado');
  await page.click('#soLista [data-chat="ana-gomez"]'); await page.waitForSelector('#chatPantalla:not([hidden])');
  log('privado con Ana: título, conectada y «privado»', (await page.textContent('#chatTitulo')) === 'Ana Gómez' && /Conectado ahora · privado/.test(await page.textContent('#chatSub')));
  await esp(200); d = await fsDe(page);
  log('al abrirlo, lo de Ana queda leído', d[`${B}/privados/ana-gomez__jeiler/mensajes/p1`].leido === true);
  log('la pestaña ya no tiene sin leer', await page.isHidden('#badgeSo'));
  await page.fill('#chatTexto', 'Claro, ya lo reviso'); await page.keyboard.press('Enter'); await esp(250);
  d = await fsDe(page);
  const priv = Object.entries(d).find(([k, v]) => k.startsWith(`${B}/privados/ana-gomez__jeiler/mensajes/`) && v.texto === 'Claro, ya lo reviso');
  log('el privado se guarda en la conversación de los dos, sin leer', priv && priv[1].de === 'jeiler' && priv[1].leido === false);
  log('en el privado sale «Enviado» y luego «Visto»', /Enviado/.test(await page.textContent('#chatLista .msg.mia')));
  await page.evaluate(([k]) => { const s = JSON.parse(localStorage.getItem('__fs_falso')); s[k].leido = true; localStorage.setItem('__fs_falso', JSON.stringify(s)); }, [priv[0]]);
  await page.fill('#chatTexto', 'Te aviso'); await page.keyboard.press('Enter'); await esp(300);
  log('…y «Visto» cuando Ana lo lee', /Visto/.test(await page.textContent('#chatLista .msg.mia >> nth=0')));
  await page.goBack(); await esp(200);
  log('el botón Atrás del celular vuelve a la lista', await page.isHidden('#chatPantalla'));
  log('Luis sale en la lista de personas', /Luis/.test(await page.textContent('#soLista')));

  console.log('Vincular otro teléfono');
  await page.evaluate(([k]) => { const s = JSON.parse(localStorage.getItem('__fs_falso')); s[k] = { uid: 'u-tel2', clave: 'jeiler', creado: Date.now() }; s[k.replace('482913', '111222')] = { uid: 'u-ana2', clave: 'ana-gomez', creado: Date.now() }; localStorage.setItem('__fs_falso', JSON.stringify(s)); }, [`${B}/vinculos/482913`]);
  await page.click('#soLista [data-so="vincular"]'); await page.waitForSelector('#chVinc');
  await page.fill('#chVinc', '111222'); await page.click('#cfYes'); await esp(300);
  log('un código de otra persona no se acepta', /solo puedes vincular tus propios teléfonos/.test(await toastTxt(page)));
  await page.click('#soLista [data-so="vincular"]'); await page.fill('#chVinc', '482 913'); await page.click('#cfYes'); await esp(300);
  d = await fsDe(page);
  log('con el código bueno, el otro teléfono queda vinculado', d[`${B}/gente/jeiler`].uids.includes('u-tel2') && !d[`${B}/vinculos/482913`] && /vinculado/.test(await toastTxt(page)));
  await page.click('#soLista [data-so="vincular"]'); await page.fill('#chVinc', '999999'); await page.click('#cfYes'); await esp(300);
  log('un código que no existe lo dice', /no existe o ya se usó/.test(await toastTxt(page)));
  log('sin errores en la página', !errs.length, errs.join(' | '));

  console.log('Teléfono nuevo con un nombre que ya usa el chat');
  const errs2 = [];
  const s2 = semilla(); s2.__fs_falso[`${B}/gente/jeiler`] = { nombre: 'Jeiler', uids: ['u-otro-tel'], visto: hace(1), creado: hace(100) };
  const p2 = await pagina(b, { semilla: s2, errores: errs2, tema: 'dark' });
  await p2.page.goto(URL + '?chat=ana-gomez'); await p2.page.waitForSelector('#soLista .so-vincular');
  const codigo = (await p2.page.textContent('.so-codigo')).replace(/\D/g, '');
  const d2 = await fsDe(p2.page);
  log('pide vincular y muestra un código de 6 números', codigo.length === 6 && d2[`${B}/vinculos/${codigo}`] && d2[`${B}/vinculos/${codigo}`].clave === 'jeiler');
  log('no abre el privado antes de vincular', await p2.page.isHidden('#chatPantalla'));
  log('no le deja ver la lista de chats', !(await p2.page.locator('#soLista [data-chat]').count()));
  await p2.page.screenshot({ path: `${SALIDA}/chat-vincular.png` });
  await axe(p2.page, 'vincular (oscuro)');
  await p2.page.evaluate(([k, kv]) => { const s = JSON.parse(localStorage.getItem('__fs_falso')); s[k].uids.push(localStorage.getItem('__auth_uid')); localStorage.setItem('__fs_falso', JSON.stringify(s)); }, [`${B}/gente/jeiler`]);
  await p2.page.evaluate(() => { localStorage.setItem('__toque', '1'); });
  // Simula que el otro teléfono lo vinculó: llega un cambio en gente.
  await p2.page.evaluate(async () => { const S = await nube.sesionChat(); await S.F.updateDoc(S.F.doc(S.fs, 'espacios', S.espacio, 'gente', 'luis'), { visto: Date.now() }); });
  await p2.page.waitForSelector('#chatPantalla:not([hidden])', { timeout: 5000 }).catch(() => {});
  log('al vincularlo, entra solo y abre el chat que pedía la notificación', (await p2.page.textContent('#chatTitulo')) === 'Ana Gómez');
  log('el código usado se borra', !(await fsDe(p2.page))[`${B}/vinculos/${codigo}`]);
  await axe(p2.page, 'chat privado (oscuro)');
  log('sin errores en la página (teléfono nuevo)', !errs2.length, errs2.join(' | '));
  await p2.ctx.close();

  console.log('Cuando falta el inicio anónimo en Firebase');
  const p3 = await pagina(b, { semilla: semilla(), errores: [] });
  await p3.ctx.addInitScript(() => { window.__authFallar = 'auth/operation-not-allowed'; });
  await p3.page.goto(URL); await p3.page.click('#tabSo'); await p3.page.waitForSelector('#soLista .aviso');
  log('explica el paso: Authentication → Anónimo → Habilitar', /Authentication → Método de acceso \(Sign-in method\) → Anónimo \(Anonymous\) → Habilitar/.test(await p3.page.textContent('#soLista')));
  log('el resto de la app sigue funcionando', (await p3.page.click('#tabRec'), await p3.page.locator('#recList .card').count()) > 0);
  await p3.ctx.close();

  console.log('Limpieza automática (plan gratis de Firebase)');
  const sv = semilla(), FV = sv.__fs_falso, dia = 864e5, PV = `${B}/privados/ana-gomez__jeiler/mensajes`;
  FV[`${B}/chat/viejo`] = { de: 'luis', nombre: 'Luis', texto: 'de hace 8 días', en: ahora - 8 * dia };
  FV[`${PV}/viejoLeido`] = { de: 'ana-gomez', texto: 'leído hace 8 días', en: ahora - 8 * dia, leido: true };
  FV[`${PV}/viejoSinLeer`] = { de: 'ana-gomez', texto: 'sin leer de 8 días', en: ahora - 8 * dia, leido: false };
  FV[`${PV}/muyViejo`] = { de: 'jeiler', texto: 'de hace 31 días', en: ahora - 31 * dia, leido: false };
  const p5 = await pagina(b, { semilla: sv, errores: [] });
  await p5.page.goto(URL); await p5.page.click('#tabSo'); await p5.page.waitForSelector('#soLista .so-fila');
  const nBorrados = await p5.page.evaluate(() => ChatSoporte.limpiar());
  const dv = await fsDe(p5.page);
  log('se borra lo del chat de todos de más de 7 días', !dv[`${B}/chat/viejo`] && !!dv[`${B}/chat/c1`]);
  log('privado: se borra lo leído de más de 7 días y todo lo de más de 30', !dv[`${PV}/viejoLeido`] && !dv[`${PV}/muyViejo`]);
  log('privado: lo que no se ha leído (8 días) se guarda', !!dv[`${PV}/viejoSinLeer`] && !!dv[`${PV}/p1`]);
  log('cuenta lo que borró', nBorrados === 3, nBorrados);
  log('la lista dice cuándo se borran los mensajes', /se borran solos: los de todos a los 7 días/.test(await p5.page.textContent('#soLista')));
  await p5.ctx.close();

  console.log('Celular angosto (320 px)');
  const p4 = await pagina(b, { semilla: semilla(), errores: [], ancho: 320, alto: 640 });
  await p4.page.goto(URL); await p4.page.click('#tabSo'); await p4.page.waitForSelector('#soLista .so-fila');
  log('la lista cabe en 320 px', await sinDesborde(p4.page));
  log('las 5 pestañas caben (se lee «Soporte»)', await p4.page.evaluate(() => { const t = document.querySelector('#tabSo .tab-lbl'); return t.scrollWidth <= t.clientWidth + 1; }));
  await p4.page.click('#soLista [data-chat="todos"]'); await p4.page.fill('#chatTexto', 'Mensaje largo '.repeat(30)); await p4.page.keyboard.press('Enter'); await esp(250);
  log('el chat cabe en 320 px con un mensaje largo', await sinDesborde(p4.page));
  await p4.page.screenshot({ path: `${SALIDA}/chat-320.png` });
  await p4.ctx.close();
  await ctx.close();
} finally { await b.close(); srv.close(); }
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
