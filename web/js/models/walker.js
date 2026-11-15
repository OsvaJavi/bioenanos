// Astronaut-on-foot model (spec §6.4–6.6). JS twin of pipeline/models_walker.py: same formulas, same constants,
// same golden vectors (tests/golden/walker.json).
//   P_total = P_rest + f_g·k_suit·C_w(G)·(W + L_suit + L_gear)·v·(1 + k_rough_walk·r),  G = tan θ
//   VO2 (L/min STPD) = P_total·60/4184 / (4.039 + 1.157·RQ)
import { C } from '../constants.js';
import { dose_mGy } from '../atmos.js';

/** Default astronaut = P-11 reference (the one used for routing). */
export function defaultWalker() {
  const w = C.walker;
  return {
    W: w.ref_mass_kg, H_cm: w.ref_height_cm, age: w.ref_age, sex: w.ref_sex, L_suit: w.suit_kg_default,
    L_gear: w.gear_kg_default, v: w.v_ms_default, f_g: w.f_g, k_suit: w.k_suit, RQ: C.o2.RQ,
    vo2max: w.vo2max_levels[w.vo2max_default_level], hr_rest: w.hr_rest_default,
  };
}
const withDefaults = (w) => ({ ...defaultWalker(), ...(w ?? {}) });

/** Minetti 2002 net cost of walking (J·kg⁻¹·m⁻¹) at grade G = tan θ (Horner form, same as Python). */
export function C_w(G) {
  const [a5, a4, a3, a2, a1, a0] = C.walker.minetti_coeffs_hi_to_lo;
  return ((((a5 * G + a4) * G + a3) * G + a2) * G + a1) * G + a0;
}

export function bmrKcalDay(w) {
  const x = withDefaults(w);
  return 10 * x.W + 6.25 * x.H_cm - 5 * x.age + (x.sex === 'M' ? 5 : -161);
}
export const pRestW = (w) => bmrKcalDay(w) * C.units.kcal_day_to_W;

/** {P_rest, P_loco, P_total} in W at grade G and roughness r. */
export function powerW(w, G, r = 0) {
  const x = withDefaults(w);
  const pr = pRestW(x);
  const pl = x.f_g * x.k_suit * C_w(G) * (x.W + x.L_suit + x.L_gear) * x.v * (1 + C.walker.k_rough_walk * r);
  return { P_rest_W: pr, P_loco_W: pl, P_total_W: pr + pl };
}

export const vo2Lmin = (P_total_W, RQ = C.o2.RQ) => (P_total_W * C.units.W_to_kcal_min) / (C.o2.kcal_per_L_a + C.o2.kcal_per_L_b * RQ);

export function heartRate(w, vo2_mlkgmin) {
  const x = withDefaults(w);
  const hrmax = C.bio.hrmax_a - C.bio.hrmax_b * x.age;
  const frac = Math.min(Math.max((vo2_mlkgmin - 3.5) / (x.vo2max - 3.5), 0), 1);
  return x.hr_rest + (hrmax - x.hr_rest) * frac;
}

export const sweatLh = (P_total_W) => (C.bio.q_heat_frac * P_total_W * C.bio.phi_evap / C.bio.latent_J_per_g) * 3600 / 1000;

/** Full metabolic state at constant G, r (golden G-WLK-2 / G-WLK-7). */
export function metabolic(w, G = 0, r = 0) {
  const x = withDefaults(w);
  const p = powerW(x, G, r);
  const vo2 = vo2Lmin(p.P_total_W, x.RQ);
  const vk = (vo2 * 1000) / x.W;
  return {
    BMR_kcal_day: bmrKcalDay(x), ...p, kcal_per_min: p.P_total_W * C.units.W_to_kcal_min,
    VO2_Lmin: vo2, VO2_mlkgmin: vk, HR_bpm: heartRate(x, vk), sweat_L_h: sweatLh(p.P_total_W),
  };
}

/** One segment of 3-D length d_m at angle theta_deg. */
export function segment(w, d_m, theta_deg, r = 0) {
  const x = withDefaults(w);
  const G = Math.tan((theta_deg * Math.PI) / 180);
  const { P_total_W } = powerW(x, G, r);
  const t_s = d_m / x.v;
  const E_J = P_total_W * t_s;
  return { t_s, P_total_W, E_J, E_kcal: E_J * C.units.J_to_kcal, O2_L: (vo2Lmin(P_total_W, x.RQ) * t_s) / 60 };
}

/** Walk exported `points` as Python does (HANDOFF_M2 §4). Returns {E_kcal, O2_metabolic_L, time_h}. */
export function routeEnergy(points, w) {
  let e = 0;
  let o2 = 0;
  let t = 0;
  for (let k = 1; k < points.length; k++) {
    const s = segment(w, 1000 * (points[k].s_km - points[k - 1].s_km), points[k].grade_deg, points[k].rough);
    e += s.E_J; o2 += s.O2_L; t += s.t_s;
  }
  return { E_kcal: e * C.units.J_to_kcal, O2_metabolic_L: o2, time_h: t / 3600 };
}

/** O₂ plan for an ordered list of segments [{t_s, O2_L}] (out then back), spec §6.5. */
export function o2Plan(segments, { eva_limit_h = C.o2.eva_limit_h, reserve_min = C.o2.reserve_min, contingency = C.o2.contingency } = {}) {
  let t_total = 0;
  let o2_total = 0;
  for (const s of segments) { t_total += s.t_s; o2_total += s.O2_L; }
  const t_round_h = t_total / 3600;
  const n_evas = Math.max(1, Math.ceil(Math.round((t_round_h / eva_limit_h) * 1e9) / 1e9));
  const vo2_mean = t_total > 0 ? o2_total / (t_total / 60) : 0;
  const per = new Array(n_evas).fill(0);
  const lim = eva_limit_h * 3600;
  let clock = 0;
  for (const s of segments) {
    let remT = s.t_s;
    let remO = s.O2_L;
    while (remT > 1e-12) {
      const k = Math.min(Math.floor(clock / lim), n_evas - 1);
      const room = k < n_evas - 1 ? (k + 1) * lim - clock : remT;
      const take = Math.min(remT, room);
      const frac = take / remT;
      per[k] += remO * frac;
      remO -= remO * frac;
      remT -= take;
      clock += take;
    }
  }
  const req = (o2_total + n_evas * reserve_min * vo2_mean) * (1 + contingency);
  const perEva = per.map((p) => (p + reserve_min * vo2_mean) * (1 + contingency));
  return {
    t_round_h, n_evas, single_eva_feasible: n_evas === 1, O2_metabolic_L: o2_total, VO2_mean_Lmin: vo2_mean,
    O2_required_L: req, O2_required_kg: req * C.o2.O2_kg_per_L, O2_per_EVA_L: perEva, O2_max_per_EVA_L: Math.max(...perEva),
  };
}

/** Core temperature after t_s at constant P_total (LCVG removes up to 500 W). */
export function coreTempC(P_total_W, W, t_s, Tc0 = C.bio.Tc0_C) {
  const q = C.bio.q_heat_frac * P_total_W;
  return Tc0 + ((q - Math.min(q, C.bio.LCVG_cap_W)) / (W * C.bio.body_cp_J_per_kgK)) * t_s;
}

/** Round-trip timeline (out then back) for the playback: per segment cumulative distance, time, energy, O₂, sweat,
 *  core temperature (reset to Tc0 at each EVA start, spec §6.6) and EVA boundaries (by time). */
export function roundTripTimeline(out, back, w, { eva_limit_h = C.o2.eva_limit_h } = {}) {
  const x = withDefaults(w);
  const lim = eva_limit_h * 3600;
  const segs = [];
  let t = 0; let s = 0; let kcal = 0; let o2 = 0; let sweat = 0; let tc = C.bio.Tc0_C;
  for (const [leg, route] of [['out', out], ['back', back]]) {
    if (!route) continue;
    const p = route.points;
    const legLen = p[p.length - 1].s_km;
    for (let k = 1; k < p.length; k++) {
      const d = 1000 * (p[k].s_km - p[k - 1].s_km);
      const g = segment(x, d, p[k].grade_deg, p[k].rough);
      const vo2 = vo2Lmin(g.P_total_W, x.RQ);
      const vk = (vo2 * 1000) / x.W;
      const sweatRate = sweatLh(g.P_total_W) / 3600; // L/s
      const o2Rate = g.t_s > 0 ? g.O2_L / g.t_s : 0;
      const kcalRate = g.t_s > 0 ? g.E_kcal / g.t_s : 0;
      // split the segment at EVA boundaries so the core-temperature reset (spec §6.6) happens exactly at each one
      let f0 = 0;
      while (f0 < 1 - 1e-12) {
        const tNow = t;
        const eva = Math.floor(tNow / lim + 1e-9);
        const boundary = (eva + 1) * lim;
        const remT = (1 - f0) * g.t_s;
        const take = Math.min(remT, boundary - tNow);
        const f1 = g.t_s > 0 ? f0 + take / g.t_s : 1;
        if (segs.length && segs[segs.length - 1].eva !== eva) tc = C.bio.Tc0_C;
        const piece = {
          leg, legLen, legS0: p[k - 1].s_km + f0 * (p[k].s_km - p[k - 1].s_km), legS1: p[k - 1].s_km + f1 * (p[k].s_km - p[k - 1].s_km),
          s0: s, s1: s + ((f1 - f0) * d) / 1000, t0: tNow, t1: tNow + take, P_W: g.P_total_W, VO2_Lmin: vo2, VO2_mlkgmin: vk,
          HR: heartRate(x, vk), kcal0: kcal, kcal1: kcal + kcalRate * take, o20: o2, o21: o2 + o2Rate * take,
          sw0: sweat, sw1: sweat + sweatRate * take, tc0: tc, tc1: coreTempC(g.P_total_W, x.W, take, tc),
          grade_deg: p[k].grade_deg, z0: p[k - 1].z_m + f0 * (p[k].z_m - p[k - 1].z_m), z1: p[k - 1].z_m + f1 * (p[k].z_m - p[k - 1].z_m), eva,
        };
        segs.push(piece);
        t = piece.t1; s = piece.s1; kcal = piece.kcal1; o2 = piece.o21; sweat = piece.sw1; tc = piece.tc1;
        f0 = f1;
      }
    }
  }
  const evaMarks = [];
  for (let k = 1; k * lim < t - 1e-9; k++) evaMarks.push({ t_s: k * lim, s_km: sAtT(segs, k * lim), label: `EVA ${k + 1}` });
  return { segs, evaMarks, total_t_s: t, total_s_km: s };
}

function sAtT(segs, t) {
  const g = segs.find((x) => x.t1 >= t) ?? segs[segs.length - 1];
  const f = g.t1 > g.t0 ? (t - g.t0) / (g.t1 - g.t0) : 1;
  return g.s0 + f * (g.s1 - g.s0);
}

/** Interpolated state at playback time t_s. `outS_km` maps the position onto the OUT route (for the map marker). */
export function walkerStateAt(tl, t_s, eva_limit_h = C.o2.eva_limit_h) {
  const segs = tl.segs;
  if (!segs.length) return null;
  const t = Math.min(Math.max(t_s, 0), tl.total_t_s);
  let lo = 0; let hi = segs.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (segs[mid].t1 < t) lo = mid + 1; else hi = mid; }
  const g = segs[lo];
  const f = g.t1 > g.t0 ? (t - g.t0) / (g.t1 - g.t0) : 1;
  const L = (a, b) => a + f * (b - a);
  const legS = L(g.legS0, g.legS1);
  return {
    t_s: t, s_km: L(g.s0, g.s1), leg: g.leg, outS_km: g.leg === 'out' ? legS : null, legFrac: legS / g.legLen,
    P_W: g.P_W, VO2_Lmin: g.VO2_Lmin, VO2_mlkgmin: g.VO2_mlkgmin, HR: g.HR, kcal: L(g.kcal0, g.kcal1),
    O2_L: L(g.o20, g.o21), sweat_L: L(g.sw0, g.sw1), Tc: L(g.tc0, g.tc1), grade_deg: g.grade_deg, z_m: L(g.z0, g.z1),
    eva: Math.min(Math.floor(t / (eva_limit_h * 3600)), Math.max(0, Math.ceil(tl.total_t_s / (eva_limit_h * 3600) - 1e-9) - 1)) + 1,
    dose_mGy: dose_mGy(t / 3600), done: t >= tl.total_t_s, total_t_s: tl.total_t_s, total_s_km: tl.total_s_km,
  };
}

/** Form fields (spec §6.4): key → [label, min, max, unit, step]. */
export const FIELDS = {
  H_cm: ['Height', 140, 210, 'cm', 1], W: ['Body mass', 45, 130, 'kg', 0.5], age: ['Age', 21, 65, 'years', 1],
  L_suit: ['Suit + PLSS', 0, 250, 'kg', 1], L_gear: ['Gear', 0, 100, 'kg', 1], v: ['Speed', 0.4, 1.6, 'm/s', 0.05],
  hr_rest: ['Resting HR', 40, 100, 'bpm', 1], eva_limit_h: ['EVA limit', 1, 12, 'h', 0.5], reserve_min: ['O₂ reserve', 0, 120, 'min', 5],
  contingency_pct: ['Contingency', 0, 50, '%', 1], k_suit: ['Suit penalty', 1.0, 1.5, '×', 0.05],
};

/** Validate raw form values (strings or numbers). Returns {ok, values, errors: {key: message}}. */
export function validateForm(raw) {
  const errors = {};
  const values = {};
  for (const [k, [label, lo, hi, unit]] of Object.entries(FIELDS)) {
    const s = raw[k] == null ? '' : String(raw[k]).trim();
    const v = Number(s);
    if (s === '' || !Number.isFinite(v)) errors[k] = `${label} is required.`;
    else if (v < lo || v > hi) errors[k] = `${label} must be between ${lo} and ${hi} ${unit}.`;
    else values[k] = v;
  }
  if (raw.sex !== 'M' && raw.sex !== 'F') errors.sex = 'Sex must be M or F.';
  else values.sex = raw.sex;
  const levels = C.walker.vo2max_levels;
  if (!(raw.fitness in levels)) errors.fitness = 'Choose a fitness level.';
  else values.vo2max = levels[raw.fitness];
  return { ok: Object.keys(errors).length === 0, values, errors };
}

/** Walker + plan options from validated form values. */
export function fromForm(values) {
  const w = { ...defaultWalker(), W: values.W, H_cm: values.H_cm, age: values.age, sex: values.sex, L_suit: values.L_suit,
    L_gear: values.L_gear, v: values.v, hr_rest: values.hr_rest, vo2max: values.vo2max, k_suit: values.k_suit };
  const plan = { eva_limit_h: values.eva_limit_h, reserve_min: values.reserve_min, contingency: values.contingency_pct / 100 };
  return { w, plan };
}

export function defaultForm() {
  const d = defaultWalker();
  return { H_cm: d.H_cm, W: d.W, sex: d.sex, age: d.age, fitness: C.walker.vo2max_default_level, L_suit: d.L_suit, L_gear: d.L_gear,
    v: d.v, hr_rest: d.hr_rest, eva_limit_h: C.o2.eva_limit_h, reserve_min: C.o2.reserve_min, contingency_pct: C.o2.contingency * 100, k_suit: d.k_suit };
}

export { routeEnergy as route_energy, o2Plan as o2_plan, coreTempC as core_temp_C };
