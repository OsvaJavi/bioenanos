// Rover energy model — Tesla Model S AWD MY2026 on Mars (spec §6.3). JS twin of pipeline/models_rover.py:
// same formulas, same constants (web/data/constants.json), same golden vectors (tests/golden/rover.json).
//   F       = m·g·crr·(1 + k_rough·r)·cosθ + m·g·sinθ + ½·ρ·Cd·A·v²
//   E_wheel = F·d ;  E_drive = E_wheel/η_dt if > 0 else 0 (no regeneration, D-D2 rev.)
//   E_aux   = (UA·(T_batt_set − T_amb) + p_aux)·d/v ;  E_total = E_drive + E_aux
import { C } from '../constants.js';

export const J_PER_KWH = 3.6e6;
export const J_PER_WH = 3600;

export function auxPowerW(T_amb_K = C.rover.T_amb_K) {
  const r = C.rover;
  return r.UA_W_per_K * (r.T_batt_set_K - T_amb_K) + r.p_aux_W;
}

/** Air density (kg/m³) at elevation z_m (metres), spec §6.2 (same expression as pipeline/atmos.py). */
export function rhoAt(z_m) {
  const a = C.atmos;
  const H_m = (a.RGAS * a.T_K) / a.G;
  return (a.P0_Pa * Math.exp(-z_m / H_m)) / (a.RGAS * a.T_K);
}

/** Energy of one segment. opts: {rho | z_m, payload_kg, v_ms, g, crr, aux}. Returns joules and seconds. */
export function segmentEnergy(d_m, theta_deg, r, opts = {}) {
  const rv = C.rover;
  const payload = opts.payload_kg ?? rv.payload_default_kg;
  const v = opts.v_ms ?? rv.v_ms;
  const g = opts.g ?? C.atmos.G;
  const crr = opts.crr ?? rv.crr;
  const aux = opts.aux ?? true;
  let rho = opts.rho;
  if (rho == null) {
    if (opts.z_m == null) throw new Error('segmentEnergy needs rho or z_m');
    rho = rhoAt(opts.z_m);
  }
  const th = (theta_deg * Math.PI) / 180;
  const m = rv.m_curb_kg + payload;
  const F = m * g * crr * (1 + rv.k_rough * r) * Math.cos(th) + m * g * Math.sin(th) + 0.5 * rho * rv.Cd * rv.A_m2 * v * v;
  const E_wheel_J = F * d_m;
  const E_drive_J = E_wheel_J > 0 ? E_wheel_J / rv.eta_dt : 0; // regen_enabled = false
  const t_s = d_m / v;
  const E_aux_J = aux ? auxPowerW() * t_s : 0;
  return { E_wheel_J, E_drive_J, E_aux_J, E_total_J: E_drive_J + E_aux_J, t_s };
}

/** Per-segment timeline of an exported route (routes.json `points`), walked exactly as in HANDOFF_M2 §4:
 *  d = 1000·(s_k − s_{k−1}), θ = grade_deg_k, r = rough_k, z = (z_{k−1} + z_k)/2, ρ = ρ(z). */
export function timeline(points, { payload_kg, v_ms } = {}) {
  const segs = [];
  let t = 0;
  let e = 0;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    const d = 1000 * (b.s_km - a.s_km);
    const s = segmentEnergy(d, b.grade_deg, b.rough, { z_m: 0.5 * (a.z_m + b.z_m), payload_kg, v_ms });
    segs.push({
      s0: a.s_km, s1: b.s_km, t0: t, t1: t + s.t_s, e0: e, e1: e + s.E_total_J,
      P_W: s.t_s > 0 ? s.E_total_J / s.t_s : 0, grade_deg: b.grade_deg, z0: a.z_m, z1: b.z_m,
      E_drive_J: s.E_drive_J, E_aux_J: s.E_aux_J,
    });
    t += s.t_s;
    e += s.E_total_J;
  }
  return segs;
}

/** Totals of one route: kWh, time, kWh/100 km, ascent/descent, max grade. */
export function routeEnergy(points, opts = {}) {
  let drive = 0;
  let aux = 0;
  let t = 0;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    const s = segmentEnergy(1000 * (b.s_km - a.s_km), b.grade_deg, b.rough, { z_m: 0.5 * (a.z_m + b.z_m), ...opts });
    drive += s.E_drive_J;
    aux += s.E_aux_J;
    t += s.t_s;
  }
  return { E_total_kWh: (drive + aux) / J_PER_KWH, E_drive_kWh: drive / J_PER_KWH, E_aux_kWh: aux / J_PER_KWH, time_h: t / 3600 };
}

/** Summary of a route for the panel. */
export function routeSummary(route, opts = {}) {
  const pts = route.points;
  const e = routeEnergy(pts, opts);
  let asc = 0;
  let desc = 0;
  let gmax = 0;
  for (let k = 1; k < pts.length; k++) {
    const dz = pts[k].z_m - pts[k - 1].z_m;
    if (dz > 0) asc += dz; else desc -= dz;
    gmax = Math.max(gmax, Math.abs(pts[k].grade_deg));
  }
  const km = pts[pts.length - 1].s_km - pts[0].s_km;
  return {
    ...e, length_km: km, kWh_per_100km: km > 0 ? (100 * e.E_total_kWh) / km : 0,
    battery_pct: (100 * e.E_total_kWh) / C.rover.battery_usable_kWh,
    ascent_m: asc, descent_m: desc, max_grade_deg: gmax,
  };
}

/** Verdict (spec §6.3) and battery left on arrival (kWh). */
export function verdict(E_out_kWh, E_back_kWh) {
  const cap = C.rover.battery_usable_kWh;
  const left = cap - E_out_kWh;
  if (E_out_kWh > cap) return { verdict: 'NOT REACHABLE', left_kWh: left };
  if (E_out_kWh + E_back_kWh <= (1 - C.rover.reserve_frac) * cap) return { verdict: 'ROUND TRIP OK', left_kWh: left };
  return { verdict: 'ONE-WAY ONLY', left_kWh: left };
}

/** Payload validation (D-D3): 0 … GVWR − curb. Returns {ok, value, message}. */
export function validatePayload(raw) {
  const max = C.rover.payload_max_kg;
  const v = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (String(raw).trim() === '' || !Number.isFinite(v)) return { ok: false, value: null, message: 'Enter a payload in kilograms.' };
  if (v < 0 || v > max) {
    return { ok: false, value: v, message: `Payload must be between 0 and ${max} kg (GVWR ${C.rover.gvwr_kg} kg − curb ${C.rover.m_curb_kg} kg).` };
  }
  return { ok: true, value: v, message: '' };
}

/** State at simulation time t_s along a timeline (constant power within a segment). */
export function stateAt(segs, t_s) {
  if (!segs.length) return null;
  const last = segs[segs.length - 1];
  const t = Math.min(Math.max(t_s, 0), last.t1);
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].t1 < t) lo = mid + 1; else hi = mid;
  }
  const g = segs[lo];
  const f = g.t1 > g.t0 ? (t - g.t0) / (g.t1 - g.t0) : 1;
  return {
    t_s: t, s_km: g.s0 + f * (g.s1 - g.s0), E_J: g.e0 + f * (g.e1 - g.e0), P_W: g.P_W, grade_deg: g.grade_deg,
    z_m: g.z0 + f * (g.z1 - g.z0), done: t >= last.t1, total_t_s: last.t1, total_s_km: last.s1,
  };
}

export {
  segmentEnergy as segment_energy, routeEnergy as route_energy, rhoAt as rho_at,
};
