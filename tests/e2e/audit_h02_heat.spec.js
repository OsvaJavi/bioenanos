// Audit H-02 (spec v1.3) in the browser: heat-limited EVAs and the NOT FEASIBLE state on foot.
import { expect, test } from '@playwright/test';
import { startServer } from '../../tools/serve.mjs';

if (process.env.PW_CHROME) test.use({ launchOptions: { executablePath: process.env.PW_CHROME } });
test.use({ viewport: { width: 1440, height: 900 } });

let srv;
test.beforeAll(async () => { srv = await startServer(0); });
test.afterAll(async () => { await new Promise((ok) => srv.server.close(ok)); });

const setField = (page, name, value) => page.evaluate(([n, v]) => {
  const i = document.querySelector(`.wk-form [name="${n}"]`);
  i.value = String(v);
  i.dispatchEvent(new Event('change', { bubbles: true }));
}, [name, value]);

test('AP-8 at 1.3 m/s: 8 EVAs, heat-limit alert, no core-temp alert above 38.5 °C', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(srv.url);
  await page.waitForSelector('body[data-ready="true"]');
  await page.click('.mode-btn[data-mode="walker"]');
  await page.click('.poi-row[data-id="AP-8"]');
  await setField(page, 'v', 1.3);
  await expect(page.locator('[data-s="n_evas"]')).toHaveAttribute('data-v', '8');
  await expect(page.locator('[data-alert="heat-limit"]')).toContainText('38.5 °C');
  await expect(page.locator('[data-alert="core-temp"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('extreme inputs: "Not feasible on foot" instead of EVAs and oxygen, playback disabled', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(srv.url);
  await page.waitForSelector('body[data-ready="true"]');
  await page.click('.mode-btn[data-mode="walker"]');
  await page.click('.poi-row[data-id="APMR"]');
  await setField(page, 'v', 1.6);
  await setField(page, 'L_gear', 100);
  await expect(page.locator('#telemetry-walker')).toContainText('Not feasible on foot');
  await expect(page.locator('[data-alert="not-feasible"]')).toBeVisible();
  await expect(page.locator('.wk-play')).toBeDisabled();
  expect(await page.locator('#telemetry-walker').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  expect(errors).toEqual([]);
});
