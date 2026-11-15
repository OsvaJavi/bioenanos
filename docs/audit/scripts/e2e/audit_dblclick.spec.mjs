// Diagnóstico: ¿doble clic en "Simulate traverse" deja la reproducción corriendo? Compara dblclick con dos clics sueltos.
import { expect, test } from '@playwright/test';
import { open } from './common.mjs';

for (const how of ['dblclick', 'two-clicks-100ms', 'fresh-dblclick']) {
  test(`play: ${how}`, async ({ page }) => {
    await open(page);
    await page.click('.poi-row[data-id="AP-9"]');
    if (how === 'dblclick' || how === 'fresh-dblclick') await page.dblclick('.rv-play');
    else { await page.click('.rv-play'); await page.waitForTimeout(100); await page.click('.rv-play'); }
    await page.waitForTimeout(300);
    const label = await page.locator('.rv-play').textContent();
    const e1 = await page.locator('[data-g="energy"]').getAttribute('data-v'); await page.waitForTimeout(500);
    const e2 = await page.locator('[data-g="energy"]').getAttribute('data-v');
    const n = await page.evaluate(() => document.querySelectorAll('.rv-play').length);
    console.log(`DBL ${how}: label=${label} energía ${e1} -> ${e2} botones=${n}`);
    expect(e1).toBe(e2);
  });
}
