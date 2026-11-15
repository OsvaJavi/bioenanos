// T-M0-04 (JS side): constants load in Node, every leaf has value + valid source; parity with the JSON.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { C, C_meta, VALID_SOURCES, buildConstants, constantsError, leaves } from '../../web/js/constants.js';

const RAW = JSON.parse(readFileSync(new URL('../../web/data/constants.json', import.meta.url), 'utf8'));

it('loads without error', () => {
  expect(constantsError).toBeNull();
  expect(C.geo.R_km).toBe(3388);
  expect(C.rover.regen_enabled).toBe(false);
  expect(C.walker.vo2max_levels.Good).toBe(47);
  expect(C_meta.rover.crr.source).toBe('ASSUMPTION');
  expect('_meta' in C_meta).toBe(false);
});

it('every leaf has value and a valid source', () => {
  const all = [...leaves()];
  expect(all.length).toBeGreaterThan(80);
  for (const [key, leaf] of all) {
    expect('value' in leaf, key).toBe(true);
    expect(VALID_SOURCES, key).toContain(leaf.source);
  }
});

it('buildConstants is a pure function of the JSON (same as the auto-loaded C)', () => {
  expect(buildConstants(RAW).C).toEqual(C);
});
