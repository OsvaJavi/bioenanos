// H-01: "EVA limit" = 8.2 h (o 4.1 h) congela la página (bucle infinito en o2Plan, web/js/models/walker.js).
import { expect, test } from '@playwright/test';
import { open, responsive } from './common.mjs';

for (const eva of ['8.2', '4.1', '8']) {
  test(`ON FOOT, AP-9, EVA limit = ${eva} h: la página sigue respondiendo`, async ({ page }) => {
    await open(page);
    await page.click('.mode-btn[data-mode="walker"]');
    await page.click('.poi-row[data-id="AP-9"]');
    await page.waitForSelector('.wk-form [name="eva_limit_h"]');
    // Igual que un usuario que escribe el valor y sale del campo (evento change). No esperamos al evaluate: puede no volver.
    page.evaluate((v) => {
      const i = document.querySelector('.wk-form [name="eva_limit_h"]');
      i.value = v;
      i.dispatchEvent(new Event('change', { bubbles: true }));
    }, eva).catch(() => {});
    await new Promise((ok) => setTimeout(ok, 500));
    const r = await responsive(page, 5000);
    expect(r, `EVA ${eva} h`).toBe('OK');
  });
}
