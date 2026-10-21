// Versión 31: Agenda → Programar tarea tiene tres opciones: Mantenimiento físico, Actualización de antivirus y Backup y mantenimiento remoto.
// Recibidos (mantenimiento, backup, en espera) queda igual. Uso: node pruebas/tipos.mjs
import { lanzar, AXE_JS, servir, pagina, semillaEquipos, huella } from './banco.mjs';
const URL = 'http://127.0.0.1:8831', esp = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || !x ? '' : '\n      ' + x)); };
const B = `espacios/${huella('equipos', 'prueba123')}`;
async function axe(page, nombre) {
  await esp(350); await page.addScriptTag({ content: AXE_JS });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
  log(`axe sin fallas: ${nombre}`, !r.length, r.join('\n      '));
}
const sem = semillaEquipos('prueba123'), F = sem.__fs_falso;
F[`${B}/equipos/5CD1234ABC`].anydesk = '123456789';
const srv = await servir(8831), br = await lanzar(), err = [];
for (const tema of ['light', 'dark']) {
  const { page } = await pagina(br, { tema, ancho: 360, alto: 740, semilla: sem, errores: err });
  const sufijo = tema === 'dark' ? ' (oscuro)' : '';
  await page.goto(URL + '/equipos/'); await page.waitForSelector('#recList .card'); await esp(300);

  // Recibidos: igual que antes
  const rec = await page.evaluate(() => ({ etiquetas: [...document.querySelectorAll('#recList .tl')].map(x => x.textContent.trim()).filter((v, i, a) => a.indexOf(v) === i), pill: document.querySelector('#recList .pill').textContent.trim(), botones: [...document.querySelectorAll('#recList [data-tarea][data-v]')].map(b => b.textContent.trim()).filter((v, i, a) => a.indexOf(v) === i), cifras: [...document.querySelectorAll('#sumRec .cifra, #sumRec [data-filtro]')].map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ') }));
  log('R1. Recibidos sigue con Mantenimiento y Backup' + sufijo, rec.etiquetas.join() === 'Mantenimiento,Backup' && /En espera|Falta/.test(rec.pill) && rec.botones.join() === 'Pendiente,Hecho,No aplica' && /Sin backup/.test(rec.cifras), JSON.stringify(rec));

  // Programar tarea: tres opciones
  await page.click('#tabMt'); await page.click('#btnNewMt'); await page.waitForSelector('#mtSheet:not([hidden])');
  const op = await page.evaluate(() => [...document.querySelectorAll('#mtTipo [data-tipo]')].map(b => `${b.dataset.tipo}=${b.textContent.trim()}`));
  log('T1. la hoja tiene solo tres opciones: físico, antivirus y backup + remoto' + sufijo, op.join('|') === 'fisico=Mant. físico|remoto=Antivirus|backup=Backup + remoto', op.join('|'));
  const ancho = await page.evaluate(() => { const c = document.getElementById('mtTipo'); return c.scrollWidth <= c.clientWidth + 1 && [...c.children].every(b => b.getBoundingClientRect().right <= c.getBoundingClientRect().right + 1); });
  log('T2. en un teléfono de 360 px las tres caben sin salirse' + sufijo, ancho);
  const ayudas = {};
  for (const t of ['fisico', 'remoto', 'backup']) { await page.click(`#mtTipo [data-tipo="${t}"]`); ayudas[t] = { ayuda: await page.textContent('#mtTipoAyuda'), disco: !(await page.locator('#mtDiscoBox').isHidden()) }; }
  log('T3. antivirus se explica y no pide disco' + sufijo, /antivirus/.test(ayudas.remoto.ayuda) && !ayudas.remoto.disco, JSON.stringify(ayudas.remoto));
  log('T4. backup + remoto se explica y pide el nombre del disco' + sufijo, /mantenimiento remoto/.test(ayudas.backup.ayuda) && ayudas.backup.disco, JSON.stringify(ayudas.backup));
  await axe(page, 'programar tarea con las tres opciones' + sufijo);

  // Guardar una de cada una y ver cómo queda la Agenda
  const dar = async (serial, tipo, disco) => {
    if (await page.locator('#mtSheet').isHidden()) { await page.click('#btnNewMt'); await page.waitForSelector('#mtSheet:not([hidden])'); }
    await page.click(`#mtTipo [data-tipo="${tipo}"]`); await page.fill('#mtSerial', serial); await page.dispatchEvent('#mtSerial', 'input');
    if (disco) await page.fill('#mtDisco', disco);
    await page.click('#mtGuardar'); await esp(250);
  };
  await dar('GPS778812', 'fisico'); await dar('5CD1234ABC', 'remoto'); await dar('5CD1234ABC', 'backup', 'Disco Backup 3');
  const ag = await page.evaluate(() => [...document.querySelectorAll('#mtList .card.mt')].map(c => ({ pill: c.querySelector('.para-t .pill').textContent.trim(), boton: c.querySelector('[data-t-acc="hecho"]').textContent.trim(), disco: (c.querySelector('.acc-mini') || {}).textContent || '' })));
  log('T5. la Agenda muestra los tres nombres nuevos' + sufijo, JSON.stringify(ag.map(a => a.pill).sort()) === JSON.stringify(['Actualización de antivirus', 'Backup y mantenimiento remoto', 'Mantenimiento físico']), JSON.stringify(ag));
  log('T6. los botones dicen Antivirus hecho y Backup + remoto hecho' + sufijo, ag.some(a => a.boton === 'Antivirus hecho') && ag.some(a => a.boton === 'Backup + remoto hecho') && ag.some(a => a.boton === 'Mant. físico hecho'), JSON.stringify(ag.map(a => a.boton)));
  log('T7. solo el backup + remoto muestra el disco' + sufijo, ag.filter(a => /Disco Backup 3/.test(a.disco)).length === 1 && ag.find(a => /Disco Backup 3/.test(a.disco)).pill.startsWith('Backup'), JSON.stringify(ag));
  await axe(page, 'agenda con las tres tareas' + sufijo);
  if (tema === 'light') await page.screenshot({ path: (process.env.CAPTURAS || '/tmp') + '/tipos-agenda.png' });

  // Terminar el backup + remoto pide el disco y avisa
  await page.locator('#mtList .card.mt', { hasText: 'Backup y mantenimiento remoto' }).locator('[data-t-acc="hecho"]').click();
  await page.waitForSelector('#cfSheet:not([hidden])');
  log('T8. al terminar el backup + remoto pide el disco' + sufijo, await page.locator('#cfTDisco').count() === 1 && await page.inputValue('#cfTDisco') === 'Disco Backup 3');
  await page.click('#cfYes'); await esp(300);
  const eq = await page.evaluate(() => JSON.parse(localStorage.getItem('__fs_falso')));
  const e = eq[`${B}/equipos/5CD1234ABC`];
  log('T9. el equipo guarda la fecha y el disco del backup' + sufijo, !!e.fechaBackup && e.discoBackup === 'Disco Backup 3' && (e.mttos || []).some(m => m.tipo === 'backup'), JSON.stringify([e.fechaBackup, e.discoBackup]));
  await page.keyboard.press('Escape');
}
log('sin errores en la página', !err.filter(e => !/fonts|ERR_FAILED/.test(e)).length, err.join('\n      '));
await br.close(); srv.close();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
