// Audit H-03: a missing or malformed data file must never leave a blank page or an unhandled exception.
// Before the fix: constants.json (404 / truncated / {}), pois.json {} and layers.json {} threw uncaught errors and
// showed neither the app nor #fatal; routes.json {} showed a raw JS error instead of falling back to the mocks.
import { expect, test } from '@playwright/test';
import { startServer } from '../../tools/serve.mjs';

if (process.env.PW_CHROME) test.use({ launchOptions: { executablePath: process.env.PW_CHROME } });

let srv;
test.beforeAll(async () => { srv = await startServer(0); });
test.afterAll(async () => { await new Promise((ok) => srv.server.close(ok)); });

const NOT_FOUND = { status: 404, body: '' };
const TRUNCATED = { status: 200, contentType: 'application/json', body: '{"schema_version":"1.1","rou' };
const EMPTY = { status: 200, contentType: 'application/json', body: '{}' };

async function load(page, file, reply) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`**/bioenanos/data/${file}`, (r) => r.fulfill(reply));
  await page.goto(srv.url);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' || !document.getElementById('fatal').hidden, null, { timeout: 15_000 });
  return errors;
}

for (const [name, reply] of [['404', NOT_FOUND], ['truncated', TRUNCATED], ['{}', EMPTY]]) {
  test(`constants.json ${name}: readable fatal message, no uncaught error`, async ({ page }) => {
    const errors = await load(page, 'constants.json', reply);
    await expect(page.locator('#fatal')).toBeVisible();
    await expect(page.locator('#fatal')).toContainText('constants.json');
    expect(errors).toEqual([]);
  });
}

test('pois.json {}: readable fatal message, no uncaught error', async ({ page }) => {
  const errors = await load(page, 'pois.json', EMPTY);
  await expect(page.locator('#fatal')).toBeVisible();
  await expect(page.locator('#fatal')).toContainText('pois.json');
  expect(errors).toEqual([]);
});

for (const file of ['routes.json', 'layers/layers.json']) {
  test(`${file} {}: falls back to mock data with the MOCK DATA banner`, async ({ page }) => {
    const errors = await load(page, file, EMPTY);
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#mock-banner')).toBeVisible();
    await expect(page.locator('#fatal')).toBeHidden();
    await expect(page.locator('.poi-row')).toHaveCount(5);
    expect(errors).toEqual([]);
  });
}
