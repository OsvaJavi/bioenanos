// M4 end-to-end tests: rover panel in the real page (served under /bioenanos/).
// T-M4-02 (shown energy = routes.json ref), T-M4-03/04 (payload), T-M4-05 (playback end = summary), T-M4-06 (no console
// errors), verdicts, traverse:progress, environment strip.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { startServer } from '../../tools/serve.mjs';

const ROUTES = JSON.parse(readFileSync(new URL('../../web/data/routes.json', import.meta.url), 'utf8'));
const ref = (poi, dir) => ROUTES.routes.find((r) => r.poi === poi && r.mode === 'rover' && r.direction === dir);

if (process.env.PW_CHROME) test.use({ launchOptions: { executablePath: process.env.PW_CHROME } });
test.use({ viewport: { width: 1440, height: 900 } });

let srv;
test.beforeAll(async () => { srv = await startServer(0); });
test.afterAll(async () => { await new Promise((ok) => srv.server.close(ok)); });

async function open(page, errors) {
  if (errors) {
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  }
  await page.goto(srv.url);
  await page.waitForSelector('body[data-ready="true"]');
}
const num = async (page, sel) => Number(await page.locator(sel).getAttribute('data-v'));

test('empty state before any selection; environment strip at the base', async ({ page }) => {
  await open(page);
  await expect(page.locator('#telemetry-rover')).toContainText('Select a point of interest');
  await expect(page.locator('#env-strip')).toContainText('Environment at AP-1');
  await expect(page.locator('#env-strip [data-env="irr"]')).toContainText('185.3');
  await expect(page.locator('#env-strip [data-env="dose"]')).toContainText('0.213 mGy/day');
});

test('T-M4-02 summary shows the same energy as routes.json (out, back, total)', async ({ page }) => {
  await open(page);
  for (const poi of ['HCP_ESP_037655_2210', 'AP-9', 'APMR']) {
    await page.click(`.poi-row[data-id="${poi}"]`);
    const out = await num(page, '[data-k="out.E_total_kWh"]');
    const back = await num(page, '[data-k="back.E_total_kWh"]');
    const tot = await num(page, '[data-k="total.E_total_kWh"]');
    expect(Math.abs(out - ref(poi, 'out').ref.E_total_kWh) / ref(poi, 'out').ref.E_total_kWh).toBeLessThanOrEqual(0.005);
    expect(Math.abs(back - ref(poi, 'back').ref.E_total_kWh) / ref(poi, 'back').ref.E_total_kWh).toBeLessThanOrEqual(0.005);
    expect(tot).toBeCloseTo(out + back, 9);
    await expect(page.locator('[data-verdict]')).toHaveText(ROUTES.summary[poi].rover.verdict);
    await expect(page.locator('#env-strip')).toContainText('Environment along the route');
  }
  await expect(page.locator('[data-verdict]')).toHaveText('ONE-WAY ONLY'); // APMR (spec Appendix E, T-M6-06)
});

test('T-M4-03 / T-M4-04 payload validation and monotonic energy', async ({ page }) => {
  await open(page);
  await page.click('.poi-row[data-id="AP-9"]');
  const e350 = await num(page, '[data-k="out.E_total_kWh"]');
  for (const bad of ['538', '-5']) {
    await page.fill('#rv-payload', bad);
    await page.press('#rv-payload', 'Enter');
    await expect(page.locator('#rv-msg')).toContainText('between 0 and 537 kg');
    await expect(page.locator('#rv-payload')).toHaveAttribute('aria-invalid', 'true');
    expect(await num(page, '[data-k="out.E_total_kWh"]')).toBe(e350); // rejected: nothing recomputed
  }
  await page.fill('#rv-payload', '537');
  await page.press('#rv-payload', 'Enter');
  await expect(page.locator('#rv-msg')).toHaveText('');
  const e537 = await num(page, '[data-k="out.E_total_kWh"]');
  await page.fill('#rv-payload', '0');
  await page.press('#rv-payload', 'Enter');
  const e0 = await num(page, '[data-k="out.E_total_kWh"]');
  expect(e0).toBeLessThan(e350);
  expect(e350).toBeLessThan(e537);
});

test('T-M4-05 / T-M4-06 playback ends at the summary, emits traverse:progress, no console errors', async ({ page }) => {
  const errors = [];
  await open(page, errors);
  await page.click('.poi-row[data-id="AP-9"]');
  await page.evaluate(() => { window.__prog = []; document.addEventListener('traverse:progress', (e) => window.__prog.push(e.detail)); });
  await page.click('.rv-speed[data-speed="3600"]');
  await page.click('.rv-play');
  await expect(page.locator('path.progress-dot')).toHaveCount(1); // M3 draws the marker
  await page.waitForSelector('.rv[data-done="true"]', { timeout: 20_000 });
  const used = await num(page, '[data-g="energy"]');
  const out = await num(page, '[data-k="out.E_total_kWh"]');
  expect(Math.abs(used - out) / out).toBeLessThanOrEqual(0.001);
  expect(await num(page, '[data-g="remaining"]')).toBeCloseTo(0, 6);
  expect(await num(page, '[data-g="battery"]')).toBeCloseTo(100 * (1 - out / 96), 6);
  await expect(page.locator('[data-g="eta"]')).toHaveText('Arrived');
  await expect(page.locator('[data-g="tbatt"]')).toContainText('held by heater');
  const prog = await page.evaluate(() => window.__prog);
  expect(prog.length).toBeGreaterThan(3);
  expect(prog.every((p) => p.mode === 'rover' && p.id === 'AP-9')).toBe(true);
  expect(prog.at(-1).s_km).toBeCloseTo(ref('AP-9', 'out').length_km_3d, 6);
  for (let k = 1; k < prog.length; k++) expect(prog[k].s_km).toBeGreaterThanOrEqual(prog[k - 1].s_km);
  expect(errors).toEqual([]);
});

test('switching to ON FOOT pauses the rover playback and hides its panel', async ({ page }) => {
  await open(page);
  await page.click('.poi-row[data-id="APMR"]');
  await page.click('.rv-speed[data-speed="60"]');
  await page.click('.rv-play');
  await expect(page.locator('.rv-play')).toHaveText('Pause');
  await page.click('.mode-btn[data-mode="walker"]');
  await expect(page.locator('#telemetry-rover')).toBeHidden();
  await expect(page.locator('path.progress-dot')).toHaveCount(0);
  await page.click('.mode-btn[data-mode="rover"]');
  await expect(page.locator('.rv-play')).toHaveText('Resume');
});
