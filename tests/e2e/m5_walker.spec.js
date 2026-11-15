// M5 end-to-end tests: on-foot panel in the real page (served under /bioenanos/).
// Summary = routes.json summary, T-M5-03 (form), T-M5-04 (mass), T-M5-05 (EVAs), T-M5-06 (playback end),
// T-M5-07 (no console errors), traverse:progress, EVA separators, mode switch.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { startServer } from '../../tools/serve.mjs';

const ROUTES = JSON.parse(readFileSync(new URL('../../web/data/routes.json', import.meta.url), 'utf8'));

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
  await page.click('.mode-btn[data-mode="walker"]');
}
const sv = async (page, key) => Number(await page.locator(`[data-s="${key}"]`).getAttribute('data-v'));
const gv = async (page, key) => Number(await page.locator(`[data-g="${key}"]`).getAttribute('data-v'));

test('empty state, then summary equal to routes.json for every POI (T-M5-05: EVAs > 1)', async ({ page }) => {
  await open(page);
  await expect(page.locator('#telemetry-walker')).toContainText('Select a point of interest');
  for (const [poi, s] of Object.entries(ROUTES.summary)) {
    await page.click(`.poi-row[data-id="${poi}"]`);
    expect(Math.abs((await sv(page, 'O2_required_L')) - s.walker.O2_required_L)).toBeLessThanOrEqual(0.1);
    expect(Math.abs((await sv(page, 'O2_max_per_EVA_L')) - s.walker.O2_max_per_EVA_L)).toBeLessThanOrEqual(0.1);
    expect(await sv(page, 'n_evas')).toBe(s.walker.n_evas);
    expect(s.walker.n_evas).toBeGreaterThan(1);
    await expect(page.locator('[data-s="n_evas"]')).toHaveAttribute('data-single', 'false');
    await expect(page.locator('[data-alert="multi-eva"]')).toContainText('Multi-EVA traverse — overnight shelter and resupply are not modeled');
  }
  await expect(page.locator('#telemetry-walker')).toContainText('Oxygen required (L, STP)');
});

test('T-M5-03 invalid form: inline message, no calculation; T-M5-04 more mass => more O2', async ({ page }) => {
  await open(page);
  await page.click('.poi-row[data-id="AP-9"]');
  const o2 = await sv(page, 'O2_required_L');
  await page.fill('input[name="W"]', '200');
  await page.press('input[name="W"]', 'Enter');
  await expect(page.locator('#wk-err')).toHaveText('Body mass must be between 45 and 130 kg.');
  await expect(page.locator('input[name="W"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-s="O2_required_L"]')).toHaveCount(0);
  await expect(page.locator('.wk-summary')).toContainText('Fix the highlighted field');
  await page.fill('input[name="W"]', '');
  await page.press('input[name="W"]', 'Enter');
  await expect(page.locator('#wk-err')).toHaveText('Body mass is required.');
  await page.fill('input[name="W"]', '100');
  await page.press('input[name="W"]', 'Enter');
  await expect(page.locator('#wk-err')).toHaveText('');
  expect(await sv(page, 'O2_required_L')).toBeGreaterThan(o2);
  // EVA limit 12 h -> fewer EVAs
  const n8 = await sv(page, 'n_evas');
  await page.fill('input[name="eva_limit_h"]', '12');
  await page.press('input[name="eva_limit_h"]', 'Enter');
  expect(await sv(page, 'n_evas')).toBeLessThan(n8);
});

test('T-M5-06 / T-M5-07 playback reaches the summary with EVA separators; no console errors', async ({ page }) => {
  const errors = [];
  await open(page, errors);
  await page.click('.poi-row[data-id="HCP_ESP_037655_2210"]');
  await page.evaluate(() => { window.__prog = []; document.addEventListener('traverse:progress', (e) => window.__prog.push(e.detail)); });
  await page.click('.wk-speed[data-speed="36000"]');
  await page.click('.wk-play');
  await expect(page.locator('path.progress-dot')).toHaveCount(1);
  await page.waitForSelector('.wk[data-done="true"]', { timeout: 20_000 });
  const s = ROUTES.summary.HCP_ESP_037655_2210.walker;
  const o2used = await gv(page, 'o2');
  // O2 used during the walk = metabolic O2 (without reserve and contingency): required / (1+c) - n * 30 min * mean VO2
  const vo2 = await sv(page, 'VO2_mean');
  const metabolic = s.O2_required_L / 1.1 - s.n_evas * 30 * vo2;
  expect(Math.abs(o2used - metabolic) / metabolic).toBeLessThanOrEqual(0.001);
  expect(await gv(page, 'eva')).toBe(s.n_evas);
  expect(await gv(page, 'kcal')).toBeCloseTo(await sv(page, 'kcal'), 3);
  const prog = await page.evaluate(() => window.__prog);
  expect(prog.length).toBeGreaterThan(3);
  expect(prog.every((p) => p.mode === 'walker' && p.id === 'HCP_ESP_037655_2210')).toBe(true);
  expect(prog.at(-1).s_km).toBeCloseTo(0, 6); // back at the base: the marker returns to the start of the out route
  expect(errors).toEqual([]);
});

test('switching to ROVER pauses the walk and clears the marker', async ({ page }) => {
  await open(page);
  await page.click('.poi-row[data-id="AP-8"]');
  await page.click('.wk-speed[data-speed="600"]');
  await page.click('.wk-play');
  await expect(page.locator('.wk-play')).toHaveText('Pause');
  await page.click('.mode-btn[data-mode="rover"]');
  await expect(page.locator('#telemetry-walker')).toBeHidden();
  await expect(page.locator('path.progress-dot')).toHaveCount(0);
  await page.click('.mode-btn[data-mode="walker"]');
  await expect(page.locator('.wk-play')).toHaveText('Resume');
});
