// Fase 7 — formularios: carga del rover y 13 campos del astronauta (valores límite, vacíos, texto, coma decimal).
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { open, watch } from './common.mjs';

const setVal = (page, sel, v) => page.evaluate(([s, val]) => {
  const i = document.querySelector(s); i.focus(); i.value = val; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
  return i.value;
}, [sel, v]);

test('carga del rover: cada entrada se rechaza con mensaje o se acepta, nunca se calcula con un valor inválido', async ({ page }) => {
  const w = watch(page); await open(page);
  await page.click('.poi-row[data-id="AP-9"]');
  const rows = [];
  const inputs = ['0', '537', '537.0001', '-1', '-0', '', '   ', 'abc', '1e3', '0x10', 'NaN', 'Infinity', '350,5', '9'.repeat(400), '350'];
  for (const v of inputs) {
    // primero un valor válido conocido para detectar si el resumen cambia
    await setVal(page, '#rv-payload', '100');
    const before = await page.locator('[data-k="total.E_total_kWh"]').getAttribute('data-v');
    const domVal = await setVal(page, '#rv-payload', v);
    const msg = (await page.locator('.rv-msg').innerText()).trim();
    const after = await page.locator('[data-k="total.E_total_kWh"]').getAttribute('data-v');
    const invalid = await page.locator('#rv-payload').getAttribute('aria-invalid');
    rows.push({ input: v.length > 12 ? v.slice(0, 6) + '…' : v, dom: domVal.length > 12 ? domVal.slice(0, 6) + '…' : domVal, msg, recalculado: before !== after, E_total: Number(after), invalid });
  }
  console.log('PAYLOAD ' + JSON.stringify(rows));
  for (const r of rows) {
    expect(Number.isFinite(r.E_total)).toBe(true);
    if (r.invalid === 'true') expect(r.msg.length).toBeGreaterThan(0);
  }
  expect(w.errors).toEqual([]);
});

test('astronauta: mínimo, máximo, ±ε, vacío, texto y coma por campo; combinaciones extremas finitas', async ({ page }) => {
  test.setTimeout(180_000);
  const w = watch(page); await open(page);
  await page.click('.mode-btn[data-mode="walker"]');
  await page.click('.poi-row[data-id="APMR"]');
  const F = { H_cm: [140, 210], W: [45, 130], age: [21, 65], L_suit: [0, 250], L_gear: [0, 100], v: [0.4, 1.6], hr_rest: [40, 100], eva_limit_h: [1, 12], reserve_min: [0, 120], contingency_pct: [0, 50], k_suit: [1.0, 1.5] };
  const rows = [];
  const reset = async () => { for (const [k, [lo, hi]] of Object.entries(F)) await setVal(page, `.wk-form [name="${k}"]`, String(k === 'k_suit' ? 1 : (lo + hi) / 2)); };
  for (const [k, [lo, hi]] of Object.entries(F)) {
    for (const v of [lo, hi, lo - 0.001, hi + 0.001, '', 'abc', String(lo + 0.5).replace('.', ',')]) {
      await reset();
      const dom = await setVal(page, `.wk-form [name="${k}"]`, String(v));
      const err = (await page.locator('#wk-err').innerText().catch(() => '')).trim();
      const o2 = await page.locator('[data-s="O2_required_L"]').getAttribute('data-v').catch(() => null);
      const shown = await page.locator('.wk-summary').innerText();
      rows.push({ k, v: String(v), dom, err, o2, nanShown: /NaN|Infinity/.test(shown) });
    }
  }
  console.log('WALKER ' + JSON.stringify(rows));
  const bad = rows.filter((r) => r.nanShown || (r.err === '' && r.o2 !== null && !Number.isFinite(Number(r.o2))));
  // range input (k_suit) recorta solo: 'abc' y fuera de rango no son posibles por teclado
  const extremes = [];
  for (const combo of [0, 1]) {
    for (const [k, [lo, hi]] of Object.entries(F)) await setVal(page, `.wk-form [name="${k}"]`, String(combo ? hi : lo));
    for (const sex of ['M', 'F']) for (const fit of ['Low', 'Elite']) {
      await page.selectOption('.wk-form [name="sex"]', sex); await page.selectOption('.wk-form [name="fitness"]', fit);
      const t = await page.locator('.wk').innerText();
      extremes.push({ combo: combo ? 'max' : 'min', sex, fit, nan: /NaN|Infinity|undefined/.test(t), o2: await page.locator('[data-s="O2_required_L"]').getAttribute('data-v'), alerts: (await page.locator('.wk-alerts').innerText()).replace(/\n/g, ' | ').slice(0, 200) });
    }
  }
  console.log('EXTREMES ' + JSON.stringify(extremes));
  expect(bad).toEqual([]);
  expect(extremes.filter((e) => e.nan)).toEqual([]);
  expect(w.errors).toEqual([]);
});
