// Audit H-02 (team decision, spec v1.3): an EVA ends when the estimated core temperature reaches 38.5 °C; the next
// EVA starts at 37 °C. A heat-limited EVA shorter than bio.min_eva_h (1 h) makes the traverse NOT FEASIBLE on foot.
// Same hand-computed case as tests/py/test_audit_h02_heat_limited_evas.py: 800 W, 80 kg -> 38.5 °C after 4164 s.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { C } from '../../web/js/constants.js';
import * as wk from '../../web/js/models/walker.js';
import { walkerSummary } from '../../web/js/telemetry_walker.js';

const ROUTES = JSON.parse(readFileSync(new URL('../../web/data/routes.json', import.meta.url), 'utf8'));
const route = (poi, dir) => ROUTES.routes.find((r) => r.poi === poi && r.mode === 'walker' && r.direction === dir);
const defaults = () => wk.fromForm(wk.validateForm(wk.defaultForm()).values);
const seg = (t_s, O2_L, P_W) => ({ t_s, O2_L, P_W });

describe('audit H-02 heat-limited EVAs (o2Plan)', () => {
  it('min_eva_h constant exists', () => expect(C.bio.min_eva_h).toBe(1));

  it('cuts the EVA when Tc reaches 38.5 °C (hand-computed 4164 s)', () => {
    const p = wk.o2Plan(Array.from({ length: 10 }, () => seg(1080, 1, 800)), { W: 80, reserve_min: 0, contingency: 0 });
    expect(p.feasible).toBe(true);
    expect(p.n_evas).toBe(3);
    expect(p.heat_limited_evas).toBe(2);
    expect(p.eva_starts_s[1]).toBeCloseTo(4164, 6);
    expect(p.eva_starts_s[2]).toBeCloseTo(8328, 6);
    expect(p.O2_max_per_EVA_L).toBeCloseTo(4164 / 1080, 9);
  });

  it('a heat-limited EVA under 1 h -> not feasible, no EVA count or O2 requirement', () => {
    const p = wk.o2Plan([seg(3600, 1, 1000), seg(3600, 1, 1000)], { W: 80 });
    expect(p.feasible).toBe(false);
    expect(p.n_evas).toBeNull();
    expect(p.O2_required_L).toBeNull();
  });

  it('without power per segment the plan stays time-based', () => {
    const p = wk.o2Plan([{ t_s: 8 * 3600 + 1, O2_L: 10 }]);
    expect(p.n_evas).toBe(2);
    expect(p.heat_limited_evas).toBe(0);
  });
});

describe('audit H-02 in the on-foot panel model (walkerSummary + playback timeline)', () => {
  it('AP-9 default: 5 EVAs, one heat-limited, core temp never above 38.5 °C', () => {
    const { w, plan } = defaults();
    const s = walkerSummary(route('AP-9', 'out'), route('AP-9', 'back'), w, plan);
    expect(s.o2.n_evas).toBe(5);
    expect(s.o2.heat_limited_evas).toBe(1);
    expect(s.tcMax).toBeLessThanOrEqual(C.bio.Tc_alert_C + 1e-6);
    expect(s.tl.evaMarks).toHaveLength(4);
    expect(s.alerts.map((a) => a.key)).toContain('heat-limit');
    expect(s.alerts.map((a) => a.key)).not.toContain('core-temp');
  });

  it('AP-9 at 1.3 m/s is not feasible (a heat-limited EVA would last ~22 min < 1 h)', () => {
    const { w, plan } = defaults();
    expect(walkerSummary(route('AP-9', 'out'), route('AP-9', 'back'), { ...w, v: 1.3 }, plan).o2.feasible).toBe(false);
  });

  it('AP-8 at 1.3 m/s: 8 EVAs (7 heat-limited), markers at the heat cuts, Tc restarts at 37 °C', () => {
    const { w, plan } = defaults();
    const s = walkerSummary(route('AP-8', 'out'), route('AP-8', 'back'), { ...w, v: 1.3 }, plan);
    expect(s.o2.n_evas).toBe(8);
    expect(s.o2.heat_limited_evas).toBe(7);
    expect(s.tl.evaMarks).toHaveLength(7);
    expect(s.tcMax).toBeLessThanOrEqual(C.bio.Tc_alert_C + 1e-6);
    s.tl.evaMarks.forEach((m, k) => {
      expect(m.t_s).toBeCloseTo(s.o2.eva_starts_s[k + 1], 6);
      expect(wk.walkerStateAt(s.tl, m.t_s + 1).Tc).toBeLessThan(37.05);
      expect(wk.walkerStateAt(s.tl, m.t_s + 1).eva).toBe(k + 2);
    });
  });

  it('extreme inputs: not feasible on foot, with an alert and no NaN', () => {
    const { w, plan } = defaults();
    const s = walkerSummary(route('APMR', 'out'), route('APMR', 'back'), { ...w, v: 1.6, L_gear: 100 }, plan);
    expect(s.o2.feasible).toBe(false);
    expect(s.alerts.map((a) => a.key)).toContain('not-feasible');
    expect(Number.isFinite(s.kcal)).toBe(true);
  });
});
