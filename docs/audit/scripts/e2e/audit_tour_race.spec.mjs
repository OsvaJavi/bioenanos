// Fase 7 — recorrido completo (POI × modo × show return × capa/subcapa) y condiciones de carrera.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { POIS, open, responsive, watch } from './common.mjs';

const REPO = process.env.REPO;
const ROUTES = JSON.parse(readFileSync(`${REPO}/web/data/routes.json`, 'utf8'));
const len = (p, m, d = 'out') => ROUTES.routes.find((r) => r.poi === p && r.mode === m && r.direction === d).length_km_3d;
const LAYERS = ['hillshade', 'elevation', 'slope', 'roughness', 'thermal', 'optical', 'shielding', 'detail'];

test('recorrido: 5 POI × 2 modos × show return × 8 capas (+3 subcapas de detalle)', async ({ page }) => {
  test.setTimeout(240_000);
  const w = watch(page); const bad = [];
  await open(page);
  for (const mode of ['rover', 'walker']) {
    await page.click(`.mode-btn[data-mode="${mode}"]`);
    for (const poi of POIS) {
      await page.click(`.poi-row[data-id="${poi}"]`);
      for (const ret of [false, true]) {
        await page.setChecked('#show-return', ret);
        const n = await page.locator('path.route-line').count();
        const nOut = await page.locator(`path.route-line.${mode}.out`).count();
        const nBack = await page.locator(`path.route-line.${mode}.back`).count();
        if (nOut !== 1 || nBack !== (ret ? 1 : 0) || n !== 1 + (ret ? 1 : 0)) bad.push(`${mode}/${poi}/ret=${ret}: lines=${n} out=${nOut} back=${nBack}`);
        const km = Number(await page.locator(`.poi-row[data-id="${poi}"] .poi-dist`).getAttribute('data-km'));
        if (Math.abs(km - len(poi, mode)) > 0.05) bad.push(`${mode}/${poi}: dist ${km} vs ${len(poi, mode)}`);
        for (const l of LAYERS) {
          await page.check(`input[name="layer"][value="${l}"]`);
          const subs = l === 'detail' ? ['hillshade', 'slope', 'ortho'] : [null];
          for (const s of subs) {
            if (s) await page.check(`input[name="detail-sub"][value="${s}"]`);
            const legend = (await page.locator('#legend').innerText()).trim();
            if (!legend) bad.push(`${mode}/${poi}/${l}/${s}: leyenda vacía`);
            if (await page.locator(`path.route-line.${mode}.out`).count() !== 1) bad.push(`${mode}/${poi}/${l}/${s}: la ruta desapareció al cambiar capa`);
          }
        }
        await page.check('input[name="layer"][value="hillshade"]');
      }
      const tele = mode === 'rover' ? await page.locator('[data-k="total.E_total_kWh"]').getAttribute('data-v') : await page.locator('[data-s="O2_required_L"]').getAttribute('data-v');
      if (!(Number(tele) > 0)) bad.push(`${mode}/${poi}: telemetría vacía`);
    }
  }
  console.log(JSON.stringify({ bad, errors: w.errors }));
  expect(bad).toEqual([]);
  expect(w.errors).toEqual([]);
});

async function startPlay(page, mode, poi, speed) {
  await page.click(`.mode-btn[data-mode="${mode}"]`);
  await page.click(`.poi-row[data-id="${poi}"]`);
  const p = mode === 'rover' ? 'rv' : 'wk';
  await page.click(`.${p}-speed[data-speed="${speed}"]`);
  await page.click(`.${p}-play`);
  await page.waitForTimeout(700);
}
const state = (page) => page.evaluate(() => ({
  dots: document.querySelectorAll('path.progress-dot').length,
  lines: [...document.querySelectorAll('path.route-line')].map((p) => p.getAttribute('class').replace('leaflet-interactive', '').trim()),
  rvPlay: document.querySelector('.rv-play')?.textContent ?? null, wkPlay: document.querySelector('.wk-play')?.textContent ?? null,
  selected: document.querySelector('.poi-row[aria-pressed="true"]')?.dataset.id ?? null,
  rvPoi: document.querySelector('.rv')?.dataset.poi ?? null, wkPoi: document.querySelector('.wk')?.dataset.poi ?? null,
  mode: document.querySelector('.mode-btn[aria-pressed="true"]')?.dataset.mode,
}));

test('carrera: cambiar de modo durante la reproducción', async ({ page }) => {
  const w = watch(page); await open(page);
  await startPlay(page, 'rover', 'AP-9', 3600);
  await page.click('.mode-btn[data-mode="walker"]');
  await page.waitForTimeout(600);
  const s = await state(page); console.log('modo', JSON.stringify(s));
  expect(s.rvPlay).toBe('Resume'); // diseño (HANDOFF_M4): cambiar de modo PAUSA el rover, no lo reinicia
  expect(s.dots).toBe(0);
  expect(s.lines).toEqual(['route-line walker out']);
  expect(w.errors).toEqual([]);
});

test('carrera: cambiar de POI durante la reproducción (rover y a pie)', async ({ page }) => {
  const w = watch(page); await open(page);
  for (const mode of ['rover', 'walker']) {
    await startPlay(page, mode, 'AP-9', mode === 'rover' ? 3600 : 36000);
    await page.click('.poi-row[data-id="AP-8"]');
    await page.waitForTimeout(600);
    const s = await state(page); console.log('poi', mode, JSON.stringify(s));
    expect(s.selected).toBe('AP-8');
    expect(mode === 'rover' ? s.rvPoi : s.wkPoi).toBe('AP-8');
    expect(mode === 'rover' ? s.rvPlay : s.wkPlay).toBe('Simulate traverse');
    expect(s.dots, 'marcador de progreso residual de la ruta anterior').toBe(0);
  }
  expect(w.errors).toEqual([]);
});

test('carrera: limpiar la selección durante la reproducción (botón y Escape)', async ({ page }) => {
  const w = watch(page); await open(page);
  for (const how of ['button', 'escape']) {
    await startPlay(page, 'walker', 'HCP_ESP_037655_2210', 36000);
    if (how === 'button') await page.click('#clear-selection'); else await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const s = await state(page); console.log('clear', how, JSON.stringify(s));
    expect(s.selected).toBe(null); expect(s.lines).toEqual([]); expect(s.dots).toBe(0);
  }
  expect(w.errors).toEqual([]);
});

test('carrera: 50 cambios de POI en < 5 s y doble clic en play', async ({ page }) => {
  const w = watch(page); await open(page);
  const t0 = Date.now();
  for (let k = 0; k < 50; k++) await page.click(`.poi-row[data-id="${POIS[k % 5]}"]`, { delay: 0 });
  const dt = Date.now() - t0;
  const s = await state(page); console.log('50 clics en', dt, 'ms', JSON.stringify(s));
  expect(s.selected).toBe(POIS[49 % 5]); expect(s.lines.length).toBe(1);
  await page.dblclick('.rv-play'); await page.waitForTimeout(500);
  const s2 = await state(page); console.log('dblclick', JSON.stringify(s2));
  // doble clic = play + pausa: debe quedar en pausa y sin dos bucles rAF simultáneos
  const t1 = await page.locator('[data-g="energy"]').getAttribute('data-v'); await page.waitForTimeout(500);
  const t2 = await page.locator('[data-g="energy"]').getAttribute('data-v');
  console.log('energía tras dblclick', t1, t2);
  expect(t1).toBe(t2);
  expect(w.errors).toEqual([]);
});

test('carrera: recargar a mitad de la reproducción y botón atrás', async ({ page }) => {
  const w = watch(page); await open(page);
  await startPlay(page, 'rover', 'APMR', 600);
  await page.reload(); await page.waitForSelector('body[data-ready="true"]');
  const s = await state(page); console.log('reload', JSON.stringify(s));
  expect(s.lines).toEqual([]); expect(s.dots).toBe(0);
  await page.goto('about:blank'); await page.goBack(); await page.waitForSelector('body[data-ready="true"]');
  expect(await responsive(page)).toBe('OK');
  console.log('back url', page.url());
  expect(w.errors).toEqual([]);
});
