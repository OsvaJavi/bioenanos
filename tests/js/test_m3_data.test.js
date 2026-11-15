// M3 unit tests (no browser): data.js contract, mock fallback, list ordering, interpolation; T-M3-08 (llToXY = Python).
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import * as data from '../../web/js/data.js';
import { llToXY } from '../../web/js/geo.js';
import { leaves } from '../../web/js/constants.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../../web/data/${p}`, import.meta.url), 'utf8'));
const realFetch = async (rel) => read(rel);

beforeEach(() => data._reset());

describe('loadData (real files)', () => {
  it('loads routes, layers and pois without mock', async () => {
    await data.loadData({ fetchJson: realFetch });
    const routes = read('routes.json');
    expect(data.isMock()).toBe(routes.mock === true || read('layers/layers.json').mock === true);
    expect(data.getPOIs()).toHaveLength(5);
    expect(data.getBase().id).toBe('AP-1');
    for (const r of routes.routes) {
      expect(data.getRoute(r.poi, r.mode, r.direction)).toBe(data.getRoute(r.poi, r.mode, r.direction));
      expect(data.getRoute(r.poi, r.mode, r.direction).length_km_3d).toBe(r.length_km_3d);
    }
    expect(data.getRoute('AP-9', 'rover')).toBe(data.getRoute('AP-9', 'rover', 'out'));
    expect(data.getRoute('nope', 'rover')).toBeNull();
    expect(data.getPOI('APMR').short).toBe('APMR');
    expect(data.getPOI('AP-1').id).toBe('AP-1');
    expect(data.getConstants().C.geo.R_km).toBe(3388);
  });
});

describe('mock fallback (T-M3-09 logic)', () => {
  it('uses data/mock/* and flags isMock when real files are missing', async () => {
    const fetchJson = async (rel) => {
      if (rel === 'routes.json' || rel === 'layers/layers.json') throw new Error('HTTP 404');
      return realFetch(rel);
    };
    await data.loadData({ fetchJson });
    expect(data.isMock()).toBe(true);
    expect(data.getRoute('AP-9', 'walker', 'back').mock).toBe(true);
    expect(data.getLayers().mock).toBe(true);
    expect(data.getWarnings().length).toBe(2);
  });
  it('fails loudly only when pois.json is missing', async () => {
    await expect(data.loadData({ fetchJson: async () => { throw new Error('HTTP 404'); } })).rejects.toThrow();
  });
});

describe('helpers', () => {
  it('sortByDistance orders by the out route of the given mode (T-M3-03 logic)', async () => {
    await data.loadData({ fetchJson: realFetch });
    for (const mode of ['rover', 'walker']) {
      const ids = data.sortByDistance(data.getPOIs(), mode).map((p) => p.id);
      const lens = ids.map((id) => data.getRoute(id, mode, 'out').length_km_3d);
      expect([...lens].sort((a, b) => a - b)).toEqual(lens);
    }
  });
  it('pointAtS interpolates and clamps', () => {
    const route = { points: [
      { x_km: 0, y_km: 0, lat: 40, lon: 203, z_m: -3900, s_km: 0 },
      { x_km: 1, y_km: 0, lat: 40, lon: 203.01, z_m: -3890, s_km: 1 },
      { x_km: 1, y_km: 2, lat: 40.02, lon: 203.01, z_m: -3880, s_km: 3 },
    ] };
    expect(data.pointAtS(route, -1).x_km).toBe(0);
    expect(data.pointAtS(route, 99).y_km).toBe(2);
    const m = data.pointAtS(route, 2);
    expect(m.x_km).toBeCloseTo(1, 12);
    expect(m.y_km).toBeCloseTo(1, 12);
    expect(m.z_m).toBeCloseTo(-3885, 12);
  });
  it('formatLatLon uses °N and °E 0–360', () => {
    expect(data.formatLatLon(39.8, 202.1)).toBe('39.800°N 202.100°E');
    expect(data.formatLatLon(-1.5, -157.9, 1)).toBe('1.5°S 202.1°E');
  });
  it('assumptionRows lists every ASSUMPTION / PROXY constant', () => {
    const n = [...leaves()].filter(([, l]) => l.source === 'ASSUMPTION' || l.source === 'PROXY').length;
    expect(data.assumptionRows()).toHaveLength(n);
    expect(n).toBeGreaterThan(10);
  });
  it('layerUrl resolves files relative to web/data/', () => {
    expect(data.layerUrl('layers/slope.png')).toMatch(/\/web\/data\/layers\/slope\.png$/);
    expect(data.layerUrl(null)).toBeNull();
  });
});

it('T-M3-08 llToXY in JS equals Python (G-LEQ-1)', () => {
  const g = JSON.parse(readFileSync(new URL('../golden/geo.json', import.meta.url), 'utf8')).cases.find((c) => c.id === 'G-LEQ-1');
  const [x, y] = llToXY(g.lat, g.lon);
  expect(Math.abs(x / 1000 - g.expect.x_km)).toBeLessThanOrEqual(g.tol.x_km);
  expect(Math.abs(y / 1000 - g.expect.y_km)).toBeLessThanOrEqual(g.tol.y_km);
});
