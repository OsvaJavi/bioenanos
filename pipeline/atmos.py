"""Isothermal barometric model and fixed environment (spec §6.2, context §5.1, §5.4).

Declared limitation: isothermal model; surface irradiances (C.env.irr_*) come from the context and
cannot be reproduced because the source does not state its radiative model.
"""
from __future__ import annotations

from math import exp

from pipeline.constants import C


def atmos(z_km: float, T: float = None, P0: float = None) -> dict:
    """Pressure/density/column at elevation z_km (MOLA areoid, km).
    atmos(-3.9) -> {'H_km': 10.6627, 'P_Pa': 879.38, 'rho': 0.022166, 'Mcol_gcm2': 23.634}
    """
    T = C.atmos.T_K if T is None else T
    P0 = C.atmos.P0_Pa if P0 is None else P0
    rgas, g = C.atmos.RGAS, C.atmos.G
    H = rgas * T / g / 1000.0
    P = P0 * exp(-z_km / H)
    return {"H_km": H, "P_Pa": P, "rho": P / (rgas * T), "Mcol_gcm2": 0.1 * P / g}


def shield_column_gcm2(z_m) -> "float | numpy.ndarray":
    """Atmospheric column (g/cm^2) at elevation z_m (metres; scalar or numpy array). [PROXY] for GCR
    shielding (spec §6.7) — relative proxy, NOT a dose map. NaN in -> NaN out."""
    import numpy as np

    T, P0 = C.atmos.T_K, C.atmos.P0_Pa
    rgas, g = C.atmos.RGAS, C.atmos.G
    H_m = rgas * T / g
    P = P0 * np.exp(-np.asarray(z_m, dtype="float64") / H_m)
    out = 0.1 * P / g
    return float(out) if np.ndim(out) == 0 else out


def dose_mGy(t_h: float, rate_mGy_day: float = None) -> float:
    """Accumulated surface dose (mGy) over t_h hours, no shielding. dose_mGy(8) -> 0.071."""
    rate = C.env.dose_rate_mGy_day if rate_mGy_day is None else rate_mGy_day
    return rate * t_h / 24.0


def env_fixed(z_km: float) -> dict:
    """Fixed dashboard environment (P-08, D-F2) at elevation z_km."""
    a = atmos(z_km)
    return {
        "T_K": C.atmos.T_K,
        "P_Pa": a["P_Pa"],
        "rho": a["rho"],
        "Mcol_gcm2": a["Mcol_gcm2"],
        "Ls_deg": C.env.Ls_deg,
        "irr_tau04_Wm2": C.env.irr_tau04_Wm2,
        "irr_tau20_Wm2": C.env.irr_tau20_Wm2,
        "dose_rate_mGy_day": C.env.dose_rate_mGy_day,
    }
