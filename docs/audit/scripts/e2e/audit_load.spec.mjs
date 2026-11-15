// Fase 7/8 — carga y red: consola limpia, sin dominios externos, sin 4xx, red lenta, sin conexión.
import { expect, test } from '@playwright/test';
import { open, watch } from './common.mjs';

test('carga: 0 errores, 0 warnings, 0 externos, 0 respuestas 4xx', async ({ page }) => {
  const w = watch(page);
  await open(page);
  await page.waitForLoadState('networkidle');
  console.log(JSON.stringify({ errors: w.errors, warnings: w.warnings, external: w.external, http4xx: w.http4xx }));
  expect(w.errors).toEqual([]);
  expect(w.external).toEqual([]);
  expect(w.http4xx).toEqual([]);
  expect(w.warnings).toEqual([]);
});

test('sin barra final (/bioenanos) también carga', async ({ page, baseURL }) => {
  const w = watch(page);
  await page.goto(baseURL.replace(/\/$/, ''));
  await page.waitForSelector('body[data-ready="true"]', { timeout: 30_000 });
  expect(page.url().endsWith('/bioenanos/')).toBe(true);
  expect(w.errors).toEqual([]);
});

test('red lenta (Fast 3G emulado, CDP): la primera carga termina y muestra la lista', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP solo en Chromium');
  test.setTimeout(180_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 563, downloadThroughput: (1.6 * 1024 * 1024) / 8 * 0.9, uploadThroughput: (750 * 1024) / 8 * 0.9 });
  const t0 = Date.now();
  await page.goto('');
  await page.waitForSelector('.poi-row', { timeout: 120_000 });
  const tList = Date.now() - t0;
  await page.waitForSelector('body[data-ready="true"]', { timeout: 120_000 });
  const tReady = Date.now() - t0;
  await page.waitForLoadState('load', { timeout: 120_000 });
  console.log(`Fast3G: lista visible ${tList} ms, app lista ${tReady} ms, load ${Date.now() - t0} ms`);
});

test('sin conexión después de cargar: seleccionar POI, cambiar modo y capas sigue funcionando', async ({ page, context }) => {
  const w = watch(page);
  await open(page);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.click('.poi-row[data-id="AP-8"]');
  await page.click('.mode-btn[data-mode="walker"]');
  for (const id of ['elevation', 'slope', 'roughness', 'thermal', 'optical', 'shielding', 'detail', 'hillshade']) await page.check(`input[name="layer"][value="${id}"]`);
  await expect(page.locator('path.route-line')).toHaveCount(1);
  const notice = await page.locator('#legend .legend-error').count();
  console.log(JSON.stringify({ offlineErrors: w.errors, layerNoticeShown: notice }));
  await context.setOffline(false);
});
