// Fase 7 — formulario del astronauta (13 campos): mínimo, máximo, ±ε, vacío, texto, coma decimal; combinaciones extremas.
// Todo dentro de la página (un evaluate por bloque) para no depender de la latencia de Playwright.
import { expect, test } from '@playwright/test';
import { open, watch } from './common.mjs';

test('astronauta: validación por campo y combinaciones extremas finitas', async ({ page }) => {
  const w = watch(page); await open(page);
  await page.click('.mode-btn[data-mode="walker"]');
  await page.click('.poi-row[data-id="APMR"]');
  const out = await page.evaluate(() => {
    const F = { H_cm: [140, 210, 180], W: [45, 130, 80], age: [21, 65, 30], L_suit: [0, 250, 170], L_gear: [0, 100, 10], v: [0.4, 1.6, 1], hr_rest: [40, 100, 60], eva_limit_h: [1, 12, 8], reserve_min: [0, 120, 30], contingency_pct: [0, 50, 10], k_suit: [1, 1.5, 1] };
    const set = (k, v) => { const i = document.querySelector(`.wk-form [name="${k}"]`); i.value = String(v); i.dispatchEvent(new Event('change', { bubbles: true })); return i.value; };
    const read = () => ({ err: document.querySelector('#wk-err')?.textContent ?? '', o2: document.querySelector('[data-s="O2_required_L"]')?.dataset.v ?? null, txt: document.querySelector('.wk')?.innerText ?? '' });
    const rows = [];
    for (const [k, [lo, hi, def]] of Object.entries(F)) {
      for (const v of [lo, hi, +(lo - 0.001).toFixed(3), +(hi + 0.001).toFixed(3), '', 'abc', String(lo + 0.5).replace('.', ',')]) {
        const dom = set(k, v); const r = read();
        rows.push({ k, v: String(v), dom, err: r.err, o2: r.o2, nan: /NaN|Infinity|undefined/.test(r.txt) });
        set(k, def);
      }
    }
    const ext = [];
    for (const which of [0, 1]) {
      for (const [k, [lo, hi]] of Object.entries(F)) set(k, which ? hi : lo);
      for (const sex of ['M', 'F']) for (const fit of ['Low', 'Elite']) {
        const s = document.querySelector('.wk-form [name="sex"]'); s.value = sex; s.dispatchEvent(new Event('change', { bubbles: true }));
        const f = document.querySelector('.wk-form [name="fitness"]'); f.value = fit; f.dispatchEvent(new Event('change', { bubbles: true }));
        const r = read();
        ext.push({ combo: which ? 'max' : 'min', sex, fit, err: r.err, o2: r.o2, nan: /NaN|Infinity|undefined/.test(r.txt), alerts: document.querySelector('.wk-alerts')?.innerText.replace(/\n/g, ' | ').slice(0, 220) });
      }
    }
    return { rows, ext };
  });
  console.log('WALKER ' + JSON.stringify(out.rows));
  console.log('EXTREMES ' + JSON.stringify(out.ext));
  expect(out.rows.filter((r) => r.nan)).toEqual([]);
  expect(out.ext.filter((r) => r.nan)).toEqual([]);
  expect(w.errors).toEqual([]);
});
