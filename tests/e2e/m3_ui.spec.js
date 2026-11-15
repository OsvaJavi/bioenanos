// M3 end-to-end tests (Playwright, served under /bioenanos/ like GitHub Pages): T-M3-01…07, 09 (+ events).
// Locally without Playwright's bundled browser: PW_CHROME=/path/to/chrome npm run e2e
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { startServer } from '../../tools/serve.mjs';

const ROUTES = JSON.parse(readFileSync(new URL('../../web/data/routes.json', import.meta.url), 'utf8'));
const LAYERS = JSON.parse(readFileSync(new URL('../../web/data/layers/layers.json', import.meta.url), 'utf8'));
const routeLen = (poi, mode) => ROUTES.routes.find((r) => r.poi === poi && r.mode === mode && r.direction === 'out').length_km_3d;

if (process.env.PW_CHROME) test.use({ launchOptions: { executablePath: process.env.PW_CHROME } });
test.use({ viewport: { width: 1440, height: 900 } });

let srv;
test.beforeAll(async () => { srv = await startServer(0); });
test.afterAll(async () => { await new Promise((ok) => srv.server.close(ok)); });

async function open(page, { errors } = {}) {
  if (errors) {
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  }
  await page.goto(srv.url);
  await page.waitForSelector('body[data-ready="true"]', { timeout: 20_000 });
}

const distances = (page) => page.$$eval('.poi-row', (rows) => rows.map((r) => ({ id: r.dataset.id, km: Number(r.querySelector('.poi-dist').dataset.km) })));

test('T-M3-01 loads without console errors (and requests nothing from external hosts)', async ({ page }) => {
  const errors = [];
  const external = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url()); });
  await open(page, { errors });
  await page.click('.poi-row[data-id="AP-8"]');
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('T-M3-02 markers = 5 POI + 1 base, with permanent labels', async ({ page }) => {
  await open(page);
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(6);
  await expect(page.locator('.leaflet-marker-icon.base-marker')).toHaveCount(1);
  await expect(page.locator('.leaflet-tooltip.poi-label')).toHaveCount(5);
});

test('T-M3-03 list sorted and distances equal routes.json (±0.05 km)', async ({ page }) => {
  await open(page);
  const rows = await distances(page);
  expect(rows).toHaveLength(5);
  for (let k = 1; k < rows.length; k++) expect(rows[k].km).toBeGreaterThanOrEqual(rows[k - 1].km);
  for (const r of rows) {
    expect(Math.abs(r.km - routeLen(r.id, 'rover'))).toBeLessThanOrEqual(0.05);
    const shown = Number((await page.locator(`.poi-row[data-id="${r.id}"] .poi-dist`).textContent()).replace(' km', ''));
    expect(Math.abs(shown - routeLen(r.id, 'rover'))).toBeLessThanOrEqual(0.05);
  }
});

test('T-M3-04 no route lines by default', async ({ page }) => {
  await open(page);
  await expect(page.locator('path.route-line')).toHaveCount(0);
});

test('T-M3-05 clicking a POI draws exactly one route and emits poi:selected', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__ev = []; document.addEventListener('poi:selected', (e) => window.__ev.push(e.detail)); });
  await page.click('.poi-row[data-id="AP-9"]');
  await expect(page.locator('path.route-line')).toHaveCount(1);
  expect(await page.evaluate(() => window.__ev)).toEqual([{ id: 'AP-9', mode: 'rover' }]);
  // clicking the map marker selects too (Escape first: it clears and zooms back out, so every marker is on screen)
  await page.keyboard.press('Escape');
  await expect(page.locator('path.route-line')).toHaveCount(0);
  await page.waitForTimeout(800); // fly-to animation
  await page.locator('.leaflet-marker-icon[title^="HCP"]').click({ timeout: 5000 });
  await expect(page.locator('path.route-line')).toHaveCount(1);
  await expect(page.locator('.poi-row[data-id="HCP_ESP_037655_2210"]')).toHaveAttribute('aria-pressed', 'true');
  // "Show return" adds the dashed back route; Escape clears and emits poi:cleared
  await page.check('#show-return');
  await expect(page.locator('path.route-line')).toHaveCount(2);
  await expect(page.locator('path.route-line.back')).toHaveCount(1);
  await page.evaluate(() => { window.__cleared = 0; document.addEventListener('poi:cleared', () => { window.__cleared++; }); });
  await page.keyboard.press('Escape');
  await expect(page.locator('path.route-line')).toHaveCount(0);
  expect(await page.evaluate(() => window.__cleared)).toBe(1);
});

test('T-M3-06 mode change emits mode:changed and shows the new mode distances', async ({ page }) => {
  await open(page);
  await page.click('.poi-row[data-id="APMR"]');
  await page.evaluate(() => { window.__modes = []; document.addEventListener('mode:changed', (e) => window.__modes.push(e.detail.mode)); });
  await page.click('.mode-btn[data-mode="walker"]');
  expect(await page.evaluate(() => window.__modes)).toEqual(['walker']);
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'walker');
  for (const r of await distances(page)) expect(Math.abs(r.km - routeLen(r.id, 'walker'))).toBeLessThanOrEqual(0.05);
  await expect(page.locator('path.route-line.walker')).toHaveCount(1);
  await expect(page.locator('#telemetry-walker')).toBeVisible();
  await expect(page.locator('#telemetry-rover')).toBeHidden();
  const differs = ROUTES.routes.some((r) => r.mode === 'rover' && r.direction === 'out'
    && Math.abs(r.length_km_3d - routeLen(r.poi, 'walker')) >= 0.05);
  test.info().annotations.push({ type: 'T-M3-06', description: differs ? 'rover/walker distances differ for at least one POI' : 'rover and walker distances coincide (reported)' });
});

test('T-M3-07 layer selector swaps the overlay; unavailable layers are disabled', async ({ page }) => {
  await open(page);
  const src = () => page.locator('img.layer-overlay').getAttribute('src');
  expect(await src()).toMatch(/layers\/hillshade\.png$/);
  await page.check('input[name="layer"][value="slope"]');
  expect(await src()).toMatch(/layers\/slope\.png$/);
  await expect(page.locator('#legend')).toContainText('Slope');
  // detail: regional hillshade below + detail overlay + "Visual only" note + sub-selector
  const detail = LAYERS.layers.find((l) => l.id === 'detail');
  if (detail.available) {
    await page.check('input[name="layer"][value="detail"]');
    await expect(page.locator('img.detail-overlay')).toHaveCount(1);
    await expect(page.locator('#detail-note')).toHaveText('Visual only — not used for routing');
    await page.check('input[name="detail-sub"][value="slope"]');
    expect(await page.locator('img.detail-overlay').getAttribute('src')).toMatch(/detail_slope\.png$/);
  }
  // an unavailable layer is disabled with the tooltip "Not available"
  await page.route('**/data/layers/layers.json', async (route) => {
    const doc = structuredClone(LAYERS);
    doc.layers.find((l) => l.id === 'thermal').available = false;
    doc.layers.find((l) => l.id === 'thermal').file = null;
    await route.fulfill({ json: doc });
  });
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  await expect(page.locator('input[name="layer"][value="thermal"]')).toBeDisabled();
  await expect(page.locator('label.layer-opt', { hasText: 'Thermal' })).toHaveAttribute('title', 'Not available');
});

test('T-M3-09 MOCK DATA banner only with mock data', async ({ page }) => {
  await open(page);
  await expect(page.locator('#mock-banner')).toBeHidden();
  await page.route('**/data/routes.json', (route) => route.fulfill({ status: 404, body: 'not found' }));
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  await expect(page.locator('#mock-banner')).toBeVisible();
  await expect(page.locator('#mock-banner')).toContainText('MOCK DATA');
});

test('traverse:progress draws a moving marker; About and credits panels are filled', async ({ page }) => {
  await open(page);
  await page.click('.poi-row[data-id="AP-9"]');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('traverse:progress', { detail: { mode: 'rover', id: 'AP-9', s_km: 10 } })));
  await expect(page.locator('path.progress-dot')).toHaveCount(1);
  await expect(page.locator('path.route-line')).toHaveCount(1); // the progress dot is not a route line
  await page.click('#open-about');
  await expect(page.locator('#about-body table tbody tr')).not.toHaveCount(0);
  await expect(page.locator('#about-body')).toContainText('P-11');
  await page.keyboard.press('Escape');
  await page.click('#open-credits');
  expect(await page.locator('#credits-body a').count()).toBeGreaterThanOrEqual(5);
  await expect(page.locator('#credits-body')).toContainText('CC BY-SA 3.0 IGO');
});

test('a missing data file shows an error instead of a blank page', async ({ page }) => {
  await page.route('**/data/pois.json', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto(srv.url);
  await expect(page.locator('#fatal')).toBeVisible();
  await expect(page.locator('#fatal')).toContainText('Could not load mission data');
});
