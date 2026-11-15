// M4 unit tests: T-M4-01 (golden in JS), T-M4-02 (parity with routes.json `ref`), T-M4-03 (payload validation),
// T-M4-04 (monotonic in payload), T-M4-05 logic (timeline end = summary), T-M4-07 (synthetic 200 km route).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { C } from '../../web/js/constants.js';
import * as rv from '../../web/js/models/rover.js';
import { niceTicks } from '../../web/js/chart.js';
import { envValues, meanElevation } from '../../web/js/env_strip.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const GOLD = Object.fromEntries(read('../golden/rover.json').cases.map((c) => [c.id, c]));
const ROUTES = read('../../web/data/routes.json');
const K = rv.J_PER_KWH;

const seg = (i) => rv.segmentEnergy(i.d_m, i.theta_deg, i.r, {
  rho: i.rho, payload_kg: i.payload_kg, v_ms: i.v_ms, ...(i.g != null && { g: i.g }), ...(i.crr != null && { crr: i.crr }), ...(i.aux != null && { aux: i.aux }),
});

describe('T-M4-01 golden rover vectors (same JSON as Python)', () => {
  for (const id of ['G-ROV-1', 'G-ROV-4', 'G-ROV-5']) {
    it(id, () => {
      const c = GOLD[id];
      const e = seg(c.input);
      const got = { E_wheel_kWh: e.E_wheel_J / K, E_drive_kWh: e.E_drive_J / K, E_aux_kWh: e.E_aux_J / K, E_total_kWh: e.E_total_J / K };
      for (const [k, v] of Object.entries(c.expect)) expect(Math.abs(got[k] - v), `${id} ${k}`).toBeLessThanOrEqual(c.tol[k]);
    });
  }
  it('G-ROV-2 Earth calibration', () => {
    const c = GOLD['G-ROV-2'];
    const per100 = (seg(c.input).E_total_J / K) * (100000 / c.input.d_m);
    expect(Math.abs(per100 - c.expect.kWh_per_100km)).toBeLessThanOrEqual(c.tol.kWh_per_100km);
    expect(per100).toBeGreaterThanOrEqual(c.expect.range[0]);
    expect(per100).toBeLessThanOrEqual(c.expect.range[1]);
  });
  for (const id of ['G-ROV-3', 'G-ROV-6']) {
    it(id, () => {
      const c = GOLD[id];
      const got = c.input.map((i) => seg(i).E_total_J / K);
      got.forEach((g, k) => expect(Math.abs(g - c.expect.E_total_kWh[k])).toBeLessThanOrEqual(c.tol.E_total_kWh));
    });
  }
});

describe('T-M4-02 parity with Python (`ref` of every rover route)', () => {
  const rover = ROUTES.routes.filter((r) => r.mode === 'rover');
  it('covers the 10 rover routes', () => expect(rover).toHaveLength(10));
  for (const r of rover) {
    it(`${r.poi} ${r.direction}`, () => {
      const js = rv.routeEnergy(r.points);
      for (const k of ['E_total_kWh', 'E_drive_kWh', 'E_aux_kWh']) {
        expect(Math.abs(js[k] - r.ref[k]) / r.ref[k], k).toBeLessThanOrEqual(0.005); // spec: <= 0.5 %
        expect(Math.abs(js[k] - r.ref[k]) / r.ref[k], `${k} (float level)`).toBeLessThan(1e-9);
      }
      expect(js.time_h).toBeCloseTo(r.time_h, 9);
    });
  }
});

describe('T-M4-03 payload validation', () => {
  it('accepts 0 … 537 kg and rejects the rest with a message', () => {
    expect(rv.validatePayload('0').ok).toBe(true);
    expect(rv.validatePayload(537).ok).toBe(true);
    for (const bad of ['538', '-1', '', 'abc', '1e9']) {
      const r = rv.validatePayload(bad);
      expect(r.ok, bad).toBe(false);
      expect(r.message.length, bad).toBeGreaterThan(10);
    }
    expect(rv.validatePayload('600').message).toContain('537');
  });
});

describe('T-M4-04 more payload => more energy', () => {
  it('on every rover route', () => {
    for (const r of ROUTES.routes.filter((x) => x.mode === 'rover')) {
      const es = [0, 100, 350, 537].map((p) => rv.routeEnergy(r.points, { payload_kg: p }).E_total_kWh);
      for (let k = 1; k < es.length; k++) expect(es[k]).toBeGreaterThan(es[k - 1]);
    }
  });
});

describe('T-M4-05 timeline (playback) ends at the summary', () => {
  it('cumulative energy, distance and time at the end equal the route totals', () => {
    for (const r of ROUTES.routes.filter((x) => x.mode === 'rover' && x.direction === 'out')) {
      const segs = rv.timeline(r.points);
      const end = rv.stateAt(segs, 1e12);
      const sum = rv.routeEnergy(r.points);
      expect(end.done).toBe(true);
      expect(Math.abs(end.E_J / K - sum.E_total_kWh) / sum.E_total_kWh).toBeLessThanOrEqual(0.001);
      expect(end.s_km).toBeCloseTo(r.length_km_3d, 6);
      expect(end.t_s / 3600).toBeCloseTo(sum.time_h, 9);
      const mid = rv.stateAt(segs, end.t_s / 2);
      expect(mid.s_km).toBeGreaterThan(0);
      expect(mid.s_km).toBeLessThan(end.s_km);
    }
  });
});

describe('T-M4-07 synthetic long routes and verdicts', () => {
  const flat = (km, step = 0.2) => ({ points: Array.from({ length: Math.round(km / step) + 1 }, (_, k) => ({ s_km: k * step, z_m: -3900, grade_deg: 0, rough: 0 })) });
  it('200 km: the verdict follows §6.3 (NOT REACHABLE if one way > 96 kWh, else ONE-WAY ONLY)', () => {
    const r = flat(200);
    const out = rv.routeSummary(r).E_total_kWh;
    const v = rv.verdict(out, out).verdict;
    expect(v).toBe(out > C.rover.battery_usable_kWh ? 'NOT REACHABLE' : 'ONE-WAY ONLY');
    expect(out).toBeCloseTo(0.48069 * 200, 1); // flat rate of G-ROV-1 at rho(-3.9 km)
    expect(v).toBe('NOT REACHABLE');
  });
  it('120 km: ONE-WAY ONLY; 60 km: ROUND TRIP OK', () => {
    const e120 = rv.routeSummary(flat(120)).E_total_kWh;
    const e60 = rv.routeSummary(flat(60)).E_total_kWh;
    expect(rv.verdict(e120, e120).verdict).toBe('ONE-WAY ONLY');
    expect(rv.verdict(e60, e60).verdict).toBe('ROUND TRIP OK');
  });
  it('APMR (real) is ONE-WAY ONLY, as in routes.json summary', () => {
    const o = ROUTES.routes.find((r) => r.poi === 'APMR' && r.mode === 'rover' && r.direction === 'out');
    const b = ROUTES.routes.find((r) => r.poi === 'APMR' && r.mode === 'rover' && r.direction === 'back');
    expect(rv.verdict(rv.routeEnergy(o.points).E_total_kWh, rv.routeEnergy(b.points).E_total_kWh).verdict).toBe(ROUTES.summary.APMR.rover.verdict);
  });
});

describe('helpers', () => {
  it('niceTicks', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(-4100, -3900, 4)).toEqual([-4100, -4050, -4000, -3950, -3900]);
  });
  it('env strip values at the route mean elevation (spec §6.2)', () => {
    const v = envValues(-3900);
    expect(v.P_Pa).toBeCloseTo(879.38, 1);
    expect(v.rho).toBeCloseTo(0.022166, 5);
    expect(v.irr04).toBe(185.3);
    expect(v.irr20).toBe(27.5);
    expect(v.dose).toBe(0.213);
    expect(meanElevation({ points: [{ s_km: 0, z_m: -4000 }, { s_km: 1, z_m: -3800 }, { s_km: 3, z_m: -3800 }] })).toBeCloseTo(-3833.33, 1);
  });
  it('rhoAt matches atmos()', async () => {
    const { atmos } = await import('../../web/js/atmos.js');
    expect(rv.rhoAt(-3900)).toBeCloseTo(atmos(-3.9).rho, 12);
  });
});
