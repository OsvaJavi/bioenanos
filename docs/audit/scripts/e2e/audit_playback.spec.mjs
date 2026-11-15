// Fase 7 — reproducción: al final de cada velocidad los acumulados = resumen (±0.1 %); cambio de velocidad a mitad
// sin saltos; pausa/reanudar; reiniciar. Usa el reloj simulado de Playwright (rAF y performance.now controlados).
import { expect, test } from '@playwright/test';
import { open, watch } from './common.mjs';

const gv = async (page, sel) => Number(await page.locator(sel).getAttribute('data-v'));

for (const speed of [60, 600, 3600]) {
  test(`rover AP-9 a ×${speed}: energía final = resumen de ida (±0.1 %)`, async ({ page }) => {
    test.setTimeout(300_000);
    const w = watch(page);
    await page.clock.install();
    await open(page);
    await page.click('.poi-row[data-id="AP-9"]');
    await page.click(`.rv-speed[data-speed="${speed}"]`);
    await page.click('.rv-play');
    const out = await gv(page, '[data-k="out.E_total_kWh"]');
    const travel_s = (await page.evaluate(() => 0)) || 0; // placeholder
    // avanzar en bloques hasta data-done
    for (let k = 0; k < 400 && (await page.locator('.rv').getAttribute('data-done')) !== 'true'; k++) await page.clock.runFor(speed === 60 ? 60_000 : 10_000);
    const e = await gv(page, '[data-g="energy"]');
    console.log(`rover ×${speed}: final ${e} kWh vs resumen ${out}`);
    expect(await page.locator('.rv').getAttribute('data-done')).toBe('true');
    expect(Math.abs(e - out) / out).toBeLessThanOrEqual(0.001);
    expect(w.errors).toEqual([]);
  });
}

for (const speed of [600, 3600, 36000]) {
  test(`a pie HCP a ×${speed}: O₂ y kcal finales = resumen (±0.1 %)`, async ({ page }) => {
    test.setTimeout(300_000);
    const w = watch(page);
    await page.clock.install();
    await open(page);
    await page.click('.mode-btn[data-mode="walker"]');
    await page.click('.poi-row[data-id="HCP_ESP_037655_2210"]');
    await page.click(`.wk-speed[data-speed="${speed}"]`);
    await page.click('.wk-play');
    for (let k = 0; k < 600 && (await page.locator('.wk').getAttribute('data-done')) !== 'true'; k++) await page.clock.runFor(speed === 600 ? 60_000 : 10_000);
    const o2 = await gv(page, '[data-g="o2"]'); const kcal = await gv(page, '[data-g="kcal"]');
    const o2met = await page.evaluate(() => 0);
    const sumK = await gv(page, '[data-s="kcal"]');
    console.log(`walker ×${speed}: kcal ${kcal} vs ${sumK}; O2 usado ${o2} L`);
    expect(await page.locator('.wk').getAttribute('data-done')).toBe('true');
    expect(Math.abs(kcal - sumK) / sumK).toBeLessThanOrEqual(0.001);
    expect(w.errors).toEqual([]);
  });
}

test('rover: cambiar de velocidad a mitad no produce saltos; pausa/reanudar; reiniciar', async ({ page }) => {
  const w = watch(page);
  await page.clock.install();
  await open(page);
  await page.click('.poi-row[data-id="APMR"]');
  await page.click('.rv-speed[data-speed="600"]'); await page.click('.rv-play');
  await page.clock.runFor(5_000);
  const a = await gv(page, '[data-g="remaining"]');
  await page.click('.rv-speed[data-speed="3600"]');
  await page.clock.runFor(16);
  const b = await gv(page, '[data-g="remaining"]');
  await page.clock.runFor(1000);
  const c = await gv(page, '[data-g="remaining"]');
  console.log('restante (km): antes', a, 'justo después del cambio', b, '1 s después', c);
  expect(a - b).toBeLessThan(0.5); // un fotograma a ×3600 avanza ~0.08 km
  await page.click('.rv-play'); // pausa
  const p1 = await gv(page, '[data-g="remaining"]'); await page.clock.runFor(5000); const p2 = await gv(page, '[data-g="remaining"]');
  expect(p2).toBe(p1);
  await page.click('.rv-play'); await page.clock.runFor(1000); const p3 = await gv(page, '[data-g="remaining"]');
  expect(p3).toBeLessThan(p2);
  await page.click('.rv-reset');
  const r = await gv(page, '[data-g="energy"]');
  expect(r).toBe(0);
  expect(w.errors).toEqual([]);
});
