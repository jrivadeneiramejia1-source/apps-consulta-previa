import { chromium, servir, pagina, semillaEquipos } from './banco.mjs';
const srv = await servir(); const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const out = process.argv[2] || '/tmp/claude-0/antes';
for (const tema of ['light', 'dark']) {
  const err = [];
  const { ctx, page } = await pagina(br, { tema, semilla: semillaEquipos(), errores: err });
  await page.goto('http://127.0.0.1:8811/equipos/'); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/eq-rec-${tema}.png` });
  await page.click('#tabEq'); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/eq-eq-${tema}.png` });
  await page.click('#tabRec'); await page.click('[data-rec="r-1"]'); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/eq-hoja-${tema}.png` });
  await ctx.close();
  const p2 = await pagina(br, { tema, semilla: { nube_entregas_espacio: 'x'.repeat(40), nube_entregas_nombre: 'Jeiler' }, errores: err });
  await p2.page.goto('http://127.0.0.1:8811/entregas/'); await p2.page.waitForTimeout(1200);
  await p2.page.screenshot({ path: `${out}/en-hojas-${tema}.png` });
  await p2.page.click('#tabSub'); await p2.page.waitForTimeout(300); await p2.page.screenshot({ path: `${out}/en-subir-${tema}.png` });
  await p2.ctx.close();
  console.log(tema, err);
}
await br.close(); srv.close();
