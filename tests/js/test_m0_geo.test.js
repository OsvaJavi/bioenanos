// T-M0-02: G-GEO-1/2/3 and G-LEQ-1..4 in JS (same golden JSON as Python).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as geo from '../../web/js/geo.js';

const GOLDEN = JSON.parse(readFileSync(new URL('../golden/geo.json', import.meta.url), 'utf8'));

function check(got, c) {
  for (const [k, exp] of Object.entries(c.expect)) {
    expect(Math.abs(got[k] - exp), `${c.id} ${k}: got ${got[k]} expected ${exp}`).toBeLessThanOrEqual(c.tol[k]);
  }
}

// Seeded PRNG (mulberry32) so the 1000 points are deterministic.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('golden geo.json', () => {
  for (const c of GOLDEN.cases) {
    it(c.id, () => {
      if (c.fn === 'dist_az') {
        const [d, az] = geo.dist_az(c.p1, c.p2, GOLDEN.R_km);
        check({ d_km: d, az_deg: az }, c);
      } else if (c.fn === 'r_local') {
        check({ r_km: geo.r_local(c.lat) }, c);
      } else if (c.fn === 'll_to_xy') {
        const [x, y] = geo.ll_to_xy(c.lat, c.lon);
        check({ x_km: x / 1000, y_km: y / 1000 }, c);
      } else if (c.fn === 'kx') {
        check({ kx: geo.kx(c.lat) }, c);
      } else if (c.fn === 'roundtrip_m') {
        const r = rng(20261114);
        let worst = 0;
        for (let k = 0; k < 1000; k++) {
          const lat = 38.7 + 2.6 * r(), lon = 200.5 + 5.0 * r();
          const [lat2, lon2] = geo.xy_to_ll(...geo.ll_to_xy(lat, lon));
          worst = Math.max(worst, geo.dist_az([lat, lon], [lat2, lon2])[0] * 1000);
        }
        expect(worst).toBeLessThanOrEqual(c.expect.max_err_m + c.tol.max_err_m);
      } else {
        throw new Error(`unknown fn ${c.fn}`);
      }
    });
  }
});

describe('geo helpers', () => {
  it('camelCase aliases are the same functions', () => {
    expect(geo.llToXY).toBe(geo.ll_to_xy);
    expect(geo.xyToLL).toBe(geo.xy_to_ll);
    expect(geo.distAz).toBe(geo.dist_az);
    expect(geo.xyToCell).toBe(geo.xy_to_cell);
  });
  it('longitude conventions', () => {
    expect(geo.lon_to_180(202.1)).toBeCloseTo(-157.9, 9);
    expect(geo.lon_to_180(180)).toBe(180);
    expect(geo.lon_to_360(-157.9)).toBeCloseTo(202.1, 9);
    const a = geo.ll_to_xy(39.8, 202.1), b = geo.ll_to_xy(39.8, -157.9);
    expect(a[0]).toBeCloseTo(b[0], 6);
    expect(geo.xy_to_ll(0, 0)).toEqual([40, 203]);
  });
  it('grid cells (parity with Python test_grid_corners_and_cells)', () => {
    expect(geo.cell_center(0, 0)[0]).toBeCloseTo(-113.3, 9);
    expect(geo.cell_center(0, 0)[1]).toBeCloseTo(76.9, 9);
    for (const [i, j] of [[0, 0], [444, 363], [769, 1133], [123, 987]]) {
      expect(geo.xy_to_cell(...geo.cell_center(i, j))).toEqual([i, j]);
    }
    expect(geo.xy_to_cell(-113.4, 77.0)).toEqual([0, 0]);
    expect(geo.in_grid(...geo.xy_to_cell(113.4, 0))).toBe(false);
    expect(geo.ll_to_cell(39.8, 202.1)).toEqual([444, 363]); // AP-1 cell (same as Python)
  });
  it('kx and horizontal distance', () => {
    expect(geo.kx(40)).toBeCloseTo(1, 12);
    expect(geo.horizontal_distance_m(0, 0, 200, 0)).toBeCloseTo(200, 9);
  });
  it('Leaflet km helpers', () => {
    const [x, y] = geo.llToXYkm(39.8, 202.1);
    expect(x).toBeCloseTo(-40.7678, 3);
    expect(y).toBeCloseTo(-11.8264, 3);
    const [lat, lon] = geo.xyKmToLL(x, y);
    expect(lat).toBeCloseTo(39.8, 9);
    expect(lon).toBeCloseTo(202.1, 9);
  });
});
