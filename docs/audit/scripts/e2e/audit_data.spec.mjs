// Fase 7 — datos faltantes o corruptos: cada archivo de web/data/ con 404, JSON truncado, '{}' (y PNG corrupto).
// Criterio: nunca pantalla en blanco ni excepción sin manejar; siempre un aviso comprensible.
import { test } from '@playwright/test';

const JSONS = ['data/pois.json', 'data/routes.json', 'data/layers/layers.json', 'data/constants.json'];
const PNGS = ['hillshade', 'elevation', 'slope', 'roughness', 'thermal', 'optical', 'shielding', 'detail_hillshade', 'detail_slope', 'detail_ortho'].map((n) => `data/layers/${n}.png`);
const MODES = { '404': { status: 404, body: '' }, truncado: { status: 200, body: '{"schema_version":"1.1","rou', contentType: 'application/json' }, vacio: { status: 200, body: '{}', contentType: 'application/json' } };

async function probe(page, baseURL, file, how) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route((u) => u.href === new URL(file, baseURL).href, (r) => r.fulfill(how));
  await page.goto('');
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => ({
    ready: document.body.dataset.ready === 'true',
    fatal: !document.getElementById('fatal').hidden ? document.getElementById('fatal').textContent.trim().slice(0, 140) : null,
    banner: !document.getElementById('mock-banner').hidden,
    pois: document.querySelectorAll('.poi-row').length,
    layerNotice: document.querySelector('#legend .legend-error')?.textContent?.slice(0, 80) ?? null,
  }));
  // intentar usar la app: seleccionar un POI y cambiar a la capa afectada
  let interact = 'n/a';
  if (st.pois) {
    try {
      await page.click('.poi-row[data-id="AP-9"]', { timeout: 3000 });
      const lid = file.match(/layers\/(\w+?)(?:_\w+)?\.png$/)?.[1];
      if (lid) {
        await page.check(`input[name="layer"][value="${lid === 'detail' ? 'detail' : lid}"]`, { timeout: 3000 });
        const sub = file.match(/detail_(\w+)\.png$/)?.[1];
        if (sub) await page.check(`input[name="detail-sub"][value="${sub}"]`, { timeout: 3000 });
        await page.waitForTimeout(800);
      }
      interact = 'ok';
    } catch (e) { interact = `fallo: ${e.message.split('\n')[0].slice(0, 80)}`; }
  }
  const after = await page.evaluate(() => document.querySelector('#legend .legend-error')?.textContent?.slice(0, 80) ?? null);
  const blank = !st.ready && !st.fatal;
  return { file, how: how.status === 404 ? '404' : how.body.length < 5 ? '{}' : 'truncado', ...st, layerNoticeAfter: after, interact, unhandled: errors.slice(0, 2), VERDICT: blank || errors.length ? 'FALLA' : 'ok' };
}

test('matriz de datos faltantes/corruptos', async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const rows = [];
  for (const f of JSONS) for (const how of Object.values(MODES)) {
    const ctx = await browser.newContext({ baseURL }); const page = await ctx.newPage();
    rows.push(await probe(page, baseURL, f, how)); await ctx.close();
  }
  for (const f of PNGS) for (const how of [MODES['404'], { status: 200, body: 'not a png', contentType: 'image/png' }]) {
    const ctx = await browser.newContext({ baseURL }); const page = await ctx.newPage();
    const r = await probe(page, baseURL, f, how); r.how = how.status === 404 ? '404' : 'png corrupto'; rows.push(r); await ctx.close();
  }
  console.log('DATA_MATRIX ' + JSON.stringify(rows));
});
