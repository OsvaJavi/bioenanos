// T-M0-03: G-ATM-1 in JS (+ G-ENV-1 for dose_mGy).
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { atmos, dose_mGy, env_fixed } from '../../web/js/atmos.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../golden/${f}`, import.meta.url), 'utf8'));

it('G-ATM-1', () => {
  for (const c of read('atmos.json').cases) {
    const got = atmos(c.z_km, c.T, c.P0);
    for (const [k, exp] of Object.entries(c.expect)) {
      expect(Math.abs(got[k] - exp), `${c.id} ${k}`).toBeLessThanOrEqual(c.tol[k]);
    }
  }
});

it('G-ENV-1', () => {
  for (const c of read('env.json').cases) {
    expect(Math.abs(dose_mGy(c.t_h, c.rate_mGy_day) - c.expect.dose_mGy)).toBeLessThanOrEqual(c.tol.dose_mGy);
  }
  expect(dose_mGy(8)).toBeCloseTo(0.071, 9);
});

it('env_fixed', () => {
  const e = env_fixed(-3.9);
  expect(e.T_K).toBe(210);
  expect(e.irr_tau04_Wm2).toBe(185.3);
  expect(e.irr_tau20_Wm2).toBe(27.5);
  expect(e.P_Pa).toBeCloseTo(879.384, 1);
});
