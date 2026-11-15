// Fase 7 — fugas: 200 ciclos de selección de POI y cambio de modo; heap, nodos, listeners y canvas (CDP, solo Chromium).
import { expect, test } from '@playwright/test';
import { POIS, open, watch } from './common.mjs';

test('200 ciclos POI × modo: heap / nodos / listeners / canvas estables', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP solo en Chromium');
  test.setTimeout(300_000);
  const w = watch(page); await open(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
    return { heapMB: +(m.JSHeapUsedSize / 1e6).toFixed(2), nodes: m.Nodes, listeners: m.JSEventListeners, canvases };
  };
  const series = [await metrics()];
  for (let k = 1; k <= 200; k++) {
    await page.click(`.poi-row[data-id="${POIS[k % 5]}"]`);
    await page.click(`.mode-btn[data-mode="${k % 2 ? 'walker' : 'rover'}"]`);
    if (k % 50 === 0) series.push(await metrics());
  }
  console.log('MEM ' + JSON.stringify(series));
  const [a, , , , z] = series;
  expect(z.listeners - a.listeners).toBeLessThan(200);
  expect(z.nodes - a.nodes).toBeLessThan(2000);
  expect(z.canvases).toBeLessThanOrEqual(a.canvases + 3);
  expect(w.errors).toEqual([]);
});
