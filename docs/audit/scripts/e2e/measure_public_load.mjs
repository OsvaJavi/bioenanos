// Fase 8: tiempo real de primera carga (sin caché) del sitio publicado y bytes transferidos, en los 3 navegadores.
import { chromium, firefox, webkit } from '@playwright/test';
const URL_ = process.argv[2] ?? 'https://osvajavi.github.io/bioenanos/';
for (const [name, bt] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  const b = await bt.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  let bytes = 0; let n = 0;
  p.on('response', async (r) => { n++; try { bytes += (await r.body()).length; } catch {} });
  const runs = [];
  for (let k = 0; k < 3; k++) {
    await ctx.clearCookies();
    const t0 = Date.now();
    await p.goto(URL_ + `?nocache=${Date.now()}`, { waitUntil: 'load' });
    await p.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
    runs.push(Date.now() - t0);
    await p.goto('about:blank');
  }
  console.log(`${name}: data-ready en ${runs.join(' / ')} ms (1.ª corrida sin caché); ${n} respuestas, ${(bytes / 1e6).toFixed(2)} MB descargados en total`);
  await b.close();
}
