// M6 end-to-end integration tests (spec T-M6-02…07 + site weight and first load).
// T-M6-01 is the whole suite (pytest + Vitest + Playwright) running green in CI.
// T-M6-03 on the public site: PAGES_URL=https://osvajavi.github.io/bioenanos/ npm run e2e -- -g "public site"
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { startServer } from '../../tools/serve.mjs';

const WEB = fileURLToPath(new URL('../../web/', import.meta.url));
const ROUTES = JSON.parse(readFileSync(join(WEB, 'data/routes.json'), 'utf8'));
const LAYERS = JSON.parse(readFileSync(join(WEB, 'data/layers/layers.json'), 'utf8'));
const POIS = Object.keys(ROUTES.summary);
const outLen = (poi, mode) => ROUTES.routes.find((r) => r.poi === poi && r.mode === mode && r.direction === 'out').length_km_3d;

if (process.env.PW_CHROME) test.use({ launchOptions: { executablePath: process.env.PW_CHROME } });
test.use({ viewport: { width: 1440, height: 900 } });

let srv;
test.beforeAll(async () => { srv = await startServer(0); });
test.afterAll(async () => { await new Promise((ok) => srv.server.close(ok)); });

function watch(page) {
  const errors = [];
  const external = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(u.hostname)) external.push(r.url());
  });
  return { errors, external };
}

async function open(page, url = srv.url) {
  await page.goto(url);
  await page.waitForSelector('body[data-ready="true"]', { timeout: 20_000 });
}

test('T-M6-07 real data: routes and layers are not mocks and no MOCK DATA banner', async ({ page }) => {
  expect(ROUTES.mock).toBe(false);
  expect(LAYERS.mock).toBe(false);
  expect(ROUTES.routes.every((r) => r.mock === false)).toBe(true);
  await open(page);
  await expect(page.locator('#mock-banner')).toBeHidden();
});

test('T-M6-02 / T-M6-04 every POI in both modes: route, distance, telemetry; no errors, no external requests', async ({ page }) => {
  test.setTimeout(90_000);
  const w = watch(page);
  await open(page);
  for (const mode of ['rover', 'walker']) {
    await page.click(`.mode-btn[data-mode="${mode}"]`);
    for (const poi of POIS) {
      await page.click(`.poi-row[data-id="${poi}"]`);
      await expect(page.locator(`path.route-line.${mode}`)).toHaveCount(1);
      const km = Number(await page.locator(`.poi-row[data-id="${poi}"] .poi-dist`).getAttribute('data-km'));
      expect(Math.abs(km - outLen(poi, mode))).toBeLessThanOrEqual(0.05);
      if (mode === 'rover') {
        await expect(page.locator('#telemetry-rover [data-verdict]')).toHaveText(ROUTES.summary[poi].rover.verdict);
        expect(Number(await page.locator('[data-k="out.E_total_kWh"]').getAttribute('data-v'))).toBeGreaterThan(0);
      } else {
        expect(Number(await page.locator('[data-s="O2_required_L"]').getAttribute('data-v'))).toBeGreaterThan(0);
        expect(Number(await page.locator('[data-s="n_evas"]').getAttribute('data-v'))).toBe(ROUTES.summary[poi].walker.n_evas);
      }
      await expect(page.locator('#env-strip')).toContainText('Environment along the route');
    }
  }
  // the rest of the surface: every layer, both dialogs, a short playback in each mode
  for (const l of LAYERS.layers.filter((x) => x.available)) await page.check(`input[name="layer"][value="${l.id}"]`);
  await page.click('#open-about'); await page.keyboard.press('Escape');
  await page.click('#open-credits'); await page.keyboard.press('Escape');
  await page.click('.wk-speed[data-speed="36000"]'); await page.click('.wk-play'); await page.waitForTimeout(600); await page.click('.wk-play');
  await page.click('.mode-btn[data-mode="rover"]');
  await page.click('.rv-speed[data-speed="3600"]'); await page.click('.rv-play'); await page.waitForTimeout(600); await page.click('.rv-play');
  expect(w.errors).toEqual([]);
  expect(w.external).toEqual([]);
});

test('T-M6-05 attribution links are present', async ({ page }) => {
  await open(page);
  await page.click('#open-credits');
  const links = await page.$$eval('#credits-body a', (as) => as.map((a) => a.href));
  expect(links.length).toBeGreaterThanOrEqual(5);
  for (const host of ['astrogeology.usgs.gov', 'stac.astrogeology.usgs.gov', 'planetarymaps.usgs.gov', 'tesla', 'leafletjs.com']) {
    expect(links.some((h) => h.includes(host)), host).toBe(true);
  }
  await expect(page.locator('#credits-body')).toContainText('CC BY-SA 3.0 IGO');
  await expect(page.locator('#credits-body')).toContainText('CC0');
});

test('T-M6-06 APMR: rover ONE-WAY ONLY, on foot more than one EVA', async ({ page }) => {
  await open(page);
  await page.click('.poi-row[data-id="APMR"]');
  await expect(page.locator('[data-verdict]')).toHaveText('ONE-WAY ONLY');
  await page.click('.mode-btn[data-mode="walker"]');
  expect(Number(await page.locator('[data-s="n_evas"]').getAttribute('data-v'))).toBeGreaterThan(1);
  await expect(page.locator('[data-alert="multi-eva"]')).toBeVisible();
});

test('T-M6-03 works under the /bioenanos/ sub-path with relative URLs only', async ({ page }) => {
  const requested = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await open(page);
  expect(srv.url.endsWith('/bioenanos/')).toBe(true);
  const local = requested.filter((p) => p !== '/favicon.ico');
  expect(local.length).toBeGreaterThan(10);
  expect(local.every((p) => p.startsWith('/bioenanos/'))).toBe(true);
});

test('site weight < 25 MB and first load < 5 s', async ({ page }) => {
  let bytes = 0;
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      const st = statSync(p);
      if (st.isDirectory()) walk(p); else bytes += st.size;
    }
  })(WEB);
  test.info().annotations.push({ type: 'site-weight', description: `${(bytes / 1e6).toFixed(2)} MB` });
  expect(bytes).toBeLessThan(25e6);
  const t0 = Date.now();
  await open(page);
  const ms = Date.now() - t0;
  test.info().annotations.push({ type: 'first-load', description: `${ms} ms (local server)` });
  expect(ms).toBeLessThan(5000);
});

test('T-M6-03 public site (only with PAGES_URL)', async ({ page }) => {
  test.skip(!process.env.PAGES_URL, 'set PAGES_URL to the GitHub Pages URL to run this check');
  const w = watch(page);
  await open(page, process.env.PAGES_URL);
  await page.click('.poi-row[data-id="AP-9"]');
  await expect(page.locator('path.route-line')).toHaveCount(1);
  await expect(page.locator('#mock-banner')).toBeHidden();
  expect(w.errors).toEqual([]);
  expect(w.external.filter((u) => !u.startsWith(process.env.PAGES_URL))).toEqual([]);
});

test('missing data shows a notice, never a blank screen', async ({ page, context }) => {
  // pois.json missing -> fatal message (the only file the app cannot run without)
  await page.route('**/data/pois.json', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto(srv.url);
  await expect(page.locator('#fatal')).toBeVisible();
  await expect(page.locator('#fatal')).toContainText('Could not load mission data');

  // routes.json missing -> mock routes + MOCK DATA banner, the app still works
  const p2 = await context.newPage();
  await p2.route('**/data/routes.json', (r) => r.fulfill({ status: 404, body: '' }));
  await open(p2);
  await expect(p2.locator('#mock-banner')).toBeVisible();
  await p2.click('.poi-row[data-id="AP-9"]');
  await expect(p2.locator('path.route-line')).toHaveCount(1);

  // a layer image missing -> notice under the legend; switching to a layer that loads clears it
  const p3 = await context.newPage();
  await p3.route('**/data/layers/thermal.png', (r) => r.fulfill({ status: 404, body: '' }));
  await open(p3);
  await p3.check('input[name="layer"][value="thermal"]');
  await expect(p3.locator('#legend .legend-error')).toContainText('Image not available');
  await p3.check('input[name="layer"][value="slope"]');
  await expect(p3.locator('#legend .legend-error')).toHaveCount(0);
  await expect(p3.locator('#fatal')).toBeHidden();
});
