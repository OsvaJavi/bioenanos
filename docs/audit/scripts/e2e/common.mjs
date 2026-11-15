// Utilidades comunes de las pruebas de auditoría.
export function watch(page) {
  const w = { errors: [], warnings: [], external: [], http4xx: [] };
  const base = new URL(page.context()._options?.baseURL ?? process.env.BASE ?? 'http://127.0.0.1:4173/bioenanos/');
  page.on('pageerror', (e) => w.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') w.errors.push(`console.error: ${m.text()}`);
    if (m.type() === 'warning') w.warnings.push(`console.warn: ${m.text()}`);
  });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.host !== base.host) w.external.push(r.url());
  });
  page.on('response', (r) => { if (r.status() >= 400) w.http4xx.push(`${r.status()} ${r.url()}`); });
  return w;
}

export async function open(page, path = '') {
  await page.goto(path);
  await page.waitForSelector('body[data-ready="true"]', { timeout: 30_000 });
}

/** Evalúa en la página con un tope de tiempo: si el hilo principal está bloqueado devuelve 'TIMEOUT'. */
export async function responsive(page, ms = 3000) {
  return Promise.race([
    page.evaluate(() => 'OK'),
    new Promise((ok) => setTimeout(() => ok('TIMEOUT'), ms)),
  ]);
}

export const POIS = ['AP-9', 'APMR', 'HCP_ESP_037655_2210', 'AP-8', 'US1_FRONT'];
