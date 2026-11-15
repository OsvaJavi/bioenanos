// T-M0-07: serve.mjs responds 200 on /bioenanos/vendor/leaflet/leaflet.js; stubs keep their signatures.
import { afterAll, beforeAll, expect, it } from 'vitest';
import { startServer } from '../../tools/serve.mjs';

let srv;
beforeAll(async () => {
  srv = await startServer(0);
});
afterAll(() => new Promise((ok) => srv.server.close(ok)));

it('serves Leaflet under /bioenanos/', async () => {
  const res = await fetch(`${srv.url}vendor/leaflet/leaflet.js`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toMatch(/javascript/);
  expect((await res.text()).length).toBeGreaterThan(100000);
});

it('serves data JSON and blocks path traversal / foreign paths', async () => {
  const ok = await fetch(`${srv.url}data/constants.json`);
  expect(ok.status).toBe(200);
  expect(ok.headers.get('content-type')).toMatch(/json/);
  expect((await fetch(`${srv.url}..%2f..%2fpackage.json`)).status).toBeGreaterThanOrEqual(400);
  expect((await fetch(`http://localhost:${srv.port}/vendor/leaflet/leaflet.js`)).status).toBe(404);
});

it('stubs export their final signatures', async () => {
  const rover = await import('../../web/js/telemetry_rover.js');
  const walker = await import('../../web/js/telemetry_walker.js');
  const env = await import('../../web/js/env_strip.js');
  const chart = await import('../../web/js/chart.js');
  expect(rover.mountRoverPanel.length).toBe(2);
  expect(walker.mountWalkerPanel.length).toBe(2);
  expect(env.mountEnvStrip.length).toBe(2);
  expect(typeof chart.lineChart).toBe('function');
  const el = { innerHTML: '' };
  rover.mountRoverPanel(el, {});
  expect(el.innerHTML).toContain('Pending module M4');
  walker.mountWalkerPanel(el, {});
  expect(el.innerHTML).toContain('Pending module M5');
});
