// M5 unit tests: T-M5-01 (golden in JS), T-M5-02 (parity with routes.json `ref`), T-M5-03 (form validation),
// T-M5-04 (monotonicity), T-M5-05 (EVA count incl. the 8.0 h edge), T-M5-06 logic (playback end = summary).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as wk from '../../web/js/models/walker.js';
import { dose_mGy } from '../../web/js/atmos.js';
import { walkerSummary, MULTI_EVA_ALERT } from '../../web/js/telemetry_walker.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const GOLD = Object.fromEntries(read('../golden/walker.json').cases.map((c) => [c.id, c]));
const ROUTES = read('../../web/data/routes.json');
const route = (poi, dir) => ROUTES.routes.find((r) => r.poi === poi && r.mode === 'walker' && r.direction === dir);
const walkerFrom = (i) => Object.fromEntries(Object.entries(i).filter(([k]) => ['W', 'H_cm', 'age', 'sex', 'L_suit', 'L_gear', 'v', 'f_g', 'k_suit', 'RQ', 'vo2max', 'hr_rest'].includes(k)));
const defaults = () => wk.fromForm(wk.validateForm(wk.defaultForm()).values);

describe('T-M5-01 golden vectors in JS (same JSON as Python)', () => {
  for (const id of ['G-WLK-1', 'G-WLK-4']) {
    it(id, () => {
      const c = GOLD[id];
      c.input.forEach((g, k) => expect(Math.abs(wk.C_w(g) - c.expect[k])).toBeLessThanOrEqual(c.tol));
      if (c.also) {
        const a = c.also.min_over_range;
        let mn = Infinity;
        for (let k = 0; k <= 200000; k++) mn = Math.min(mn, wk.C_w(a.range[0] + ((a.range[1] - a.range[0]) * k) / 200000));
        expect(Math.abs(mn - a.expect_min)).toBeLessThanOrEqual(a.tol);
      }
    });
  }
  for (const id of ['G-WLK-2', 'G-WLK-7']) {
    it(id, () => {
      const c = GOLD[id];
      const got = wk.metabolic(walkerFrom(c.input), c.input.G, c.input.r);
      for (const [k, v] of Object.entries(c.expect)) expect(Math.abs(got[k] - v), `${id} ${k}`).toBeLessThanOrEqual(c.tol[k]);
    });
  }
  it('G-WLK-3 segment', () => {
    const c = GOLD['G-WLK-3'];
    const s = wk.segment(walkerFrom(GOLD['G-WLK-2'].input), c.input.d_m, 0, 0);
    expect(Math.abs(s.t_s - c.expect.t_s)).toBeLessThanOrEqual(c.tol.t_s);
    expect(Math.abs(s.O2_L - c.expect.O2_metabolic_L)).toBeLessThanOrEqual(c.tol.O2_metabolic_L);
    expect(Math.abs(s.E_kcal - c.expect.kcal)).toBeLessThanOrEqual(c.tol.kcal);
  });
  for (const id of ['G-WLK-5', 'G-WLK-6']) {
    it(id, () => {
      const c = GOLD[id];
      const w = walkerFrom(GOLD['G-WLK-2'].input);
      const s = wk.segment(w, 200, 0, 0);
      const plan = wk.o2Plan(Array.from({ length: c.input.round_trip_m / 200 }, () => ({ t_s: s.t_s, O2_L: s.O2_L })));
      for (const [k, v] of Object.entries(c.expect)) {
        if (typeof v === 'number' && !Number.isInteger(v)) expect(Math.abs(plan[k] - v), `${id} ${k}`).toBeLessThanOrEqual(c.tol[k]);
        else expect(plan[k], `${id} ${k}`).toBe(v);
      }
    });
  }
  it('G-BIO-1 core temperature', () => {
    const c = GOLD['G-BIO-1'].input;
    const tc = wk.coreTempC(c.P_total_W, c.W, c.t_s);
    expect(Math.abs(tc - 40.242)).toBeLessThanOrEqual(0.005);
  });
  it('G-ENV-1 dose', () => {
    const c = read('../golden/env.json').cases[0];
    expect(Math.abs(dose_mGy(c.t_h, c.rate_mGy_day) - c.expect.dose_mGy)).toBeLessThanOrEqual(c.tol.dose_mGy);
  });
});

describe('T-M5-02 parity with Python (`ref` of every walker route)', () => {
  const walker = ROUTES.routes.filter((r) => r.mode === 'walker');
  it('covers the 10 walker routes', () => expect(walker).toHaveLength(10));
  for (const r of walker) {
    it(`${r.poi} ${r.direction}`, () => {
      const js = wk.routeEnergy(r.points);
      for (const k of ['E_kcal', 'O2_metabolic_L']) {
        expect(Math.abs(js[k] - r.ref[k]) / r.ref[k], k).toBeLessThanOrEqual(0.005);
        expect(Math.abs(js[k] - r.ref[k]) / r.ref[k], `${k} (float level)`).toBeLessThan(1e-9);
      }
      expect(js.time_h).toBeCloseTo(r.time_h, 9);
    });
  }
  it('summary (EVAs, O2 required, max O2 per EVA) equals routes.json summary for the default astronaut', () => {
    const { w, plan } = defaults();
    for (const [poi, s] of Object.entries(ROUTES.summary)) {
      const got = walkerSummary(route(poi, 'out'), route(poi, 'back'), w, plan);
      expect(got.o2.n_evas).toBe(s.walker.n_evas);
      expect(got.o2.O2_required_L).toBeCloseTo(s.walker.O2_required_L, 0);
      expect(got.o2.O2_max_per_EVA_L).toBeCloseTo(s.walker.O2_max_per_EVA_L, 0);
      expect(got.o2.t_round_h).toBeCloseTo(s.walker.t_round_h, 2);
    }
  });
});

describe('T-M5-03 form validation', () => {
  const base = () => ({ ...wk.defaultForm() });
  it('defaults are valid', () => expect(wk.validateForm(base()).ok).toBe(true));
  it('range ends are accepted', () => {
    for (const [k, [, lo, hi]] of Object.entries(wk.FIELDS)) {
      expect(wk.validateForm({ ...base(), [k]: lo }).ok, `${k}=${lo}`).toBe(true);
      expect(wk.validateForm({ ...base(), [k]: hi }).ok, `${k}=${hi}`).toBe(true);
    }
  });
  it('empty and out-of-range values are rejected with a message naming the field', () => {
    for (const [k, [label, lo, hi]] of Object.entries(wk.FIELDS)) {
      for (const bad of ['', 'abc', lo - 1, hi + 1]) {
        const r = wk.validateForm({ ...base(), [k]: bad });
        expect(r.ok, `${k}=${bad}`).toBe(false);
        expect(r.errors[k]).toContain(label);
      }
    }
    expect(wk.validateForm({ ...base(), H_cm: 139 }).errors.H_cm).toBe('Height must be between 140 and 210 cm.');
    expect(wk.validateForm({ ...base(), sex: 'X' }).ok).toBe(false);
    expect(wk.validateForm({ ...base(), fitness: 'Superhuman' }).ok).toBe(false);
  });
});

describe('T-M5-04 monotonicity', () => {
  const r = route('AP-9', 'out');
  const back = route('AP-9', 'back');
  const sum = (patch) => {
    const { w, plan } = defaults();
    return walkerSummary(r, back, { ...w, ...patch }, plan);
  };
  it('more mass => more O2 (body, suit, gear)', () => {
    expect(sum({ W: 90 }).o2.O2_required_L).toBeGreaterThan(sum({ W: 80 }).o2.O2_required_L);
    expect(sum({ L_suit: 200 }).o2.O2_required_L).toBeGreaterThan(sum({}).o2.O2_required_L);
    expect(sum({ L_gear: 40 }).o2.O2_required_L).toBeGreaterThan(sum({}).o2.O2_required_L);
  });
  it('more speed => more P_total and less time', () => {
    const { w } = defaults();
    expect(wk.powerW({ ...w, v: 1.2 }, 0, 0).P_total_W).toBeGreaterThan(wk.powerW({ ...w, v: 1.0 }, 0, 0).P_total_W);
    expect(sum({ v: 1.2 }).o2.t_round_h).toBeLessThan(sum({ v: 1.0 }).o2.t_round_h);
  });
});

describe('T-M5-05 EVA count', () => {
  it('n_evas = ceil(t_round / eva_limit) with the 8.0 h edge = 1', () => {
    expect(wk.o2Plan([{ t_s: 8 * 3600, O2_L: 10 }]).n_evas).toBe(1);
    expect(wk.o2Plan([{ t_s: 8 * 3600, O2_L: 10 }]).single_eva_feasible).toBe(true);
    expect(wk.o2Plan([{ t_s: 8 * 3600 + 1, O2_L: 10 }]).n_evas).toBe(2);
    expect(wk.o2Plan([{ t_s: 4 * 3600, O2_L: 1 }, { t_s: 4 * 3600, O2_L: 1 }]).n_evas).toBe(1); // sums of segments
    for (const h of [0.5, 7.99, 12, 16, 33.2, 66.8]) {
      const p = wk.o2Plan([{ t_s: h * 3600, O2_L: 5 }]);
      expect(p.n_evas, String(h)).toBe(Math.ceil(h / 8));
      expect(p.single_eva_feasible).toBe(p.n_evas === 1);
    }
    expect(wk.o2Plan([{ t_s: 10 * 3600, O2_L: 10 }], { eva_limit_h: 12 }).n_evas).toBe(1);
  });
  it('every real POI needs more than one EVA (spec §6.5) and raises the multi-EVA alert', () => {
    const { w, plan } = defaults();
    for (const poi of Object.keys(ROUTES.summary)) {
      const s = walkerSummary(route(poi, 'out'), route(poi, 'back'), w, plan);
      expect(s.o2.n_evas).toBeGreaterThan(1);
      expect(s.alerts.find((a) => a.key === 'multi-eva').text).toContain(MULTI_EVA_ALERT);
    }
  });
});

describe('T-M5-06 timeline (playback) ends at the summary', () => {
  it('cumulative kcal and O2 at the end equal the summary; EVA markers every 8 h', () => {
    const { w, plan } = defaults();
    for (const poi of Object.keys(ROUTES.summary)) {
      const s = walkerSummary(route(poi, 'out'), route(poi, 'back'), w, plan);
      const end = wk.walkerStateAt(s.tl, 1e12, plan.eva_limit_h);
      expect(end.done).toBe(true);
      expect(Math.abs(end.kcal - s.kcal) / s.kcal).toBeLessThanOrEqual(0.001);
      expect(Math.abs(end.O2_L - s.o2.O2_metabolic_L) / s.o2.O2_metabolic_L).toBeLessThanOrEqual(0.001);
      expect(end.eva).toBe(s.o2.n_evas);
      expect(s.tl.evaMarks).toHaveLength(s.o2.n_evas - 1);
      expect(end.s_km).toBeCloseTo(route(poi, 'out').length_km_3d + route(poi, 'back').length_km_3d, 6);
      expect(end.dose_mGy).toBeCloseTo(dose_mGy(s.o2.t_round_h), 9);
    }
  });
  it('core temperature restarts at 37.0 °C at each EVA', () => {
    const { w, plan } = defaults();
    const s = walkerSummary(route('AP-9', 'out'), route('AP-9', 'back'), w, plan);
    for (const m of s.tl.evaMarks) {
      const after = wk.walkerStateAt(s.tl, m.t_s + 1, plan.eva_limit_h);
      expect(after.Tc).toBeLessThan(37.05);
    }
  });
});
