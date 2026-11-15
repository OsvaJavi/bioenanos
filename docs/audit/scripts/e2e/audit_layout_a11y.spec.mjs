// Fase 7 — pantallas (390/768/1280/1440/1920, zoom 200 %), diálogos, accesibilidad (axe-core, teclado, foco, reduced motion), textos.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { open, watch } from './common.mjs';
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const SIZES = [[390, 844, 1], [768, 1024, 1], [1280, 800, 1], [1440, 900, 1], [1920, 1080, 1], [720, 450, 2]]; // 1440×900 al 200 % ≈ 720×450 CSS px
for (const [wd, ht, dpr] of SIZES) {
  test(`pantalla ${wd}×${ht}${dpr === 2 ? ' (≈1440 al 200 %)' : ''}: sin desborde horizontal, info clave visible, diálogos caben`, async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL, viewport: { width: wd, height: ht }, deviceScaleFactor: dpr });
    const page = await ctx.newPage(); const w = watch(page);
    await open(page);
    await page.click('.poi-row[data-id="AP-9"]');
    const m = await page.evaluate(() => {
      const vis = (s) => { const e = document.querySelector(s); if (!e) return 'no existe'; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right <= innerWidth + 1 && r.left >= -1 ? 'ok' : `fuera/oculto (${Math.round(r.left)},${Math.round(r.right)} w=${Math.round(r.width)})`; };
      const over = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 2; }).slice(0, 5).map((e) => e.className || e.tagName);
      return { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, map: vis('#map'), list: vis('#poi-list'), verdict: vis('[data-verdict]'), modeBtns: vis('.mode'), telemetry: vis('#telemetry-rover'), overflowing: over };
    });
    const dlg = {};
    for (const id of ['about', 'credits']) {
      await page.click(`#open-${id}`);
      dlg[id] = await page.evaluate((i) => { const d = document.getElementById(i); const r = d.getBoundingClientRect(); const b = d.querySelector('.dialog-body');
        return { fits: r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1, scrollable: b.scrollHeight <= b.clientHeight || ['auto', 'scroll'].includes(getComputedStyle(b).overflowY) || ['auto', 'scroll'].includes(getComputedStyle(d).overflowY) }; }, id);
      await page.keyboard.press('Escape');
      dlg[id].closedByEscape = !(await page.evaluate((i) => document.getElementById(i).open, id));
    }
    await page.screenshot({ path: `shots/${test.info().project.name}_${wd}x${ht}.png`, fullPage: false });
    console.log(`LAYOUT ${wd}x${ht} ` + JSON.stringify({ ...m, dlg }));
    expect(m.scrollW).toBeLessThanOrEqual(m.innerW + 1);
    expect(dlg.about.fits && dlg.credits.fits).toBe(true);
    expect(w.errors).toEqual([]);
    await ctx.close();
  });
}

test('axe-core (wcag2a/aa) en estado inicial, con POI seleccionado y con diálogo abierto', async ({ page }) => {
  await open(page);
  const run = async (label) => {
    await page.addScriptTag({ content: AXE });
    const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'] })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 2).map((n) => n.target.join(' ')) })));
    console.log(`AXE ${label} ` + JSON.stringify(r));
    return r;
  };
  await run('inicial');
  await page.click('.poi-row[data-id="AP-9"]'); await run('rover AP-9');
  await page.click('.mode-btn[data-mode="walker"]'); await run('walker AP-9');
  await page.click('#open-about'); await run('About abierto');
});

test('teclado: Tab llega a modo, POI, capas, play; Enter selecciona; marcadores del mapa operables; foco visible', async ({ page }) => {
  const w = watch(page); await open(page);
  const seen = [];
  for (let k = 0; k < 40; k++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e);
      return { tag: e.tagName, cls: (e.className?.baseVal ?? e.className ?? '').toString().slice(0, 30), id: e.id, data: e.dataset?.id ?? e.dataset?.mode ?? e.value ?? '', outline: cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px' || cs.boxShadow !== 'none' }; }));
  }
  const kinds = seen.map((s) => `${s.tag}.${s.cls.split(' ')[0]}${s.data ? '[' + s.data + ']' : ''}`);
  console.log('TAB ' + JSON.stringify(kinds));
  console.log('FOCO sin indicador visible: ' + JSON.stringify(seen.filter((s) => !s.outline).map((s) => `${s.tag}.${s.cls}`)));
  // POI por teclado
  await page.focus('.poi-row[data-id="AP-8"]'); await page.keyboard.press('Enter');
  expect(await page.locator('.poi-row[aria-pressed="true"]').getAttribute('data-id')).toBe('AP-8');
  // marcador del mapa por teclado
  const mk = page.locator('.leaflet-marker-icon.poi-marker').first();
  const mkInfo = await mk.evaluate((e) => ({ tabindex: e.getAttribute('tabindex'), role: e.getAttribute('role'), label: e.getAttribute('aria-label') ?? e.getAttribute('alt') ?? e.title }));
  await mk.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const selAfter = await page.locator('.poi-row[aria-pressed="true"]').getAttribute('data-id');
  console.log('MARKER ' + JSON.stringify({ ...mkInfo, selAfterEnter: selAfter }));
  // diálogos: Escape cierra y el foco vuelve al botón
  await page.click('#open-credits'); await page.keyboard.press('Escape');
  const back = await page.evaluate(() => document.activeElement?.id);
  console.log('foco tras cerrar Credits: ' + back);
  expect(w.errors).toEqual([]);
});

test('prefers-reduced-motion: sin transiciones/animaciones de Leaflet ni CSS', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, reducedMotion: 'reduce' }); const page = await ctx.newPage();
  await open(page);
  const r = await page.evaluate(() => {
    const anim = [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return (parseFloat(s.transitionDuration) > 0.01) || (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.01); }).map((e) => e.className?.toString?.().slice(0, 30));
    return { animated: anim.slice(0, 8), n: anim.length };
  });
  await page.click('.poi-row[data-id="AP-9"]');
  const zoomAnim = await page.evaluate(() => !!document.querySelector('.leaflet-zoom-anim'));
  console.log('REDUCED ' + JSON.stringify({ ...r, zoomAnimClass: zoomAnim }));
  await ctx.close();
});

test('textos: cadenas exactas del Apéndice C presentes; sin TODO/STUB/Pending/mock en la UI', async ({ page }) => {
  await open(page);
  const texts = [];
  texts.push(await page.locator('body').innerText());
  await page.click('.poi-row[data-id="APMR"]'); texts.push(await page.locator('body').innerText());
  await page.click('.mode-btn[data-mode="walker"]'); texts.push(await page.locator('body').innerText());
  await page.click('#open-about'); texts.push(await page.locator('#about').innerText()); await page.keyboard.press('Escape');
  const all = texts.join('\n');
  const C = ['Arcadia Planitia Surface Navigator', 'Base of Operations', 'Points of Interest', 'Route distance', 'Show return', 'Layer', 'Payload (kg)', 'Energy used', 'Battery', 'Battery reserve', 'Round trip', 'ONE-WAY ONLY', 'Held by heater', 'EVAs required', 'Oxygen required (L, STP)', 'Max O₂ per EVA', 'Multi-EVA traverse — overnight shelter and resupply are not modeled', 'Heart rate', 'Core temp (est.)', 'Hydration loss', 'Dose', 'outside typical EVA metabolic range', 'Simulate traverse', 'About / Assumptions', 'Data credits'];
  const missing = C.filter((s) => !all.includes(s));
  const missingCI = missing.filter((s) => !all.toLowerCase().includes(s.toLowerCase()));
  const stub = all.match(/TODO|STUB|Pending module|lorem|FIXME/gi);
  console.log('TEXT ' + JSON.stringify({ missingExact: missing, missingEvenIgnoringCase: missingCI, stub }));
});
