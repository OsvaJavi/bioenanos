// Isothermal barometric model and fixed environment — port of pipeline/atmos.py (spec §6.2).
import { C } from './constants.js';

/** atmos(-3.9) -> {H_km: 10.6627, P_Pa: 879.38, rho: 0.022166, Mcol_gcm2: 23.634} */
export function atmos(z_km, T = C.atmos.T_K, P0 = C.atmos.P0_Pa) {
  const { RGAS, G } = C.atmos;
  const H = (RGAS * T) / G / 1000;
  const P = P0 * Math.exp(-z_km / H);
  return { H_km: H, P_Pa: P, rho: P / (RGAS * T), Mcol_gcm2: (0.1 * P) / G };
}

/** Accumulated surface dose (mGy) over t_h hours, no shielding. dose_mGy(8) -> 0.071 */
export function dose_mGy(t_h, rate = C.env.dose_rate_mGy_day) {
  return (rate * t_h) / 24;
}

/** Fixed dashboard environment (P-08, D-F2) at elevation z_km. */
export function env_fixed(z_km) {
  const a = atmos(z_km);
  return {
    T_K: C.atmos.T_K, P_Pa: a.P_Pa, rho: a.rho, Mcol_gcm2: a.Mcol_gcm2, Ls_deg: C.env.Ls_deg,
    irr_tau04_Wm2: C.env.irr_tau04_Wm2, irr_tau20_Wm2: C.env.irr_tau20_Wm2,
    dose_rate_mGy_day: C.env.dose_rate_mGy_day,
  };
}

export { dose_mGy as doseMGy, env_fixed as envFixed };
