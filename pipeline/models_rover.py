"""Rover energy model — Tesla Model S AWD MY2026 on Mars (spec §6.3). Python twin of web/js/models/rover.js.

All functions accept scalars or numpy arrays (vectorised for the routing graph).
Units: metres, seconds, joules internally; *_kWh / *_Wh helpers for output.

Per segment (3-D length d, signed angle theta, roughness r, air density rho):
    m       = m_curb + payload
    F       = m*g*crr*(1 + k_rough*r)*cos(theta) + m*g*sin(theta) + 0.5*rho*Cd*A*v^2
    E_wheel = F*d
    E_drive = E_wheel/eta_dt if E_wheel > 0 else 0        (no regeneration, D-D2 rev.)
    E_aux   = (UA*(T_batt_set - T_amb) + p_aux) * d/v       (1080 W by default)
    E_total = E_drive + E_aux                               (always > 0 for d > 0)
"""
from __future__ import annotations


import numpy as np

from pipeline.atmos import atmos
from pipeline.constants import C

J_PER_KWH = 3.6e6
J_PER_WH = 3600.0


def aux_power_W(T_amb_K: float = None) -> float:
    r = C.rover
    T_amb = r.T_amb_K if T_amb_K is None else T_amb_K
    return r.UA_W_per_K * (r.T_batt_set_K - T_amb) + r.p_aux_W


def rho_at(z_m):
    """Air density (kg/m^3) at elevation z_m (metres; scalar or array) — spec §6.2."""
    if np.ndim(z_m) == 0:
        return atmos(float(z_m) / 1000.0)["rho"]
    a = C.atmos
    H_m = a.RGAS * a.T_K / a.G
    return a.P0_Pa * np.exp(-np.asarray(z_m, dtype="float64") / H_m) / (a.RGAS * a.T_K)


def segment_energy(d_m, theta_deg, r, *, rho=None, z_m=None, payload_kg=None, v_ms=None,
                   g=None, crr=None, aux=True):
    """Energy of one (or many) segments. Give either rho or z_m (mean elevation of the segment).
    Returns dict of arrays/scalars: E_wheel_J, E_drive_J, E_aux_J, E_total_J, t_s."""
    rv = C.rover
    payload = rv.payload_default_kg if payload_kg is None else payload_kg
    v = rv.v_ms if v_ms is None else v_ms
    g = C.atmos.G if g is None else g
    crr = rv.crr if crr is None else crr
    if rho is None:
        if z_m is None:
            raise ValueError("segment_energy needs rho or z_m")
        rho = rho_at(z_m)
    th = np.radians(theta_deg)
    m = rv.m_curb_kg + payload
    F = m * g * crr * (1 + rv.k_rough * np.asarray(r, dtype="float64")) * np.cos(th) \
        + m * g * np.sin(th) + 0.5 * rho * rv.Cd * rv.A_m2 * v * v
    e_wheel = F * np.asarray(d_m, dtype="float64")
    e_drive = np.where(e_wheel > 0, e_wheel / rv.eta_dt, 0.0)  # regen_enabled = false (D-D2 rev.)
    t = np.asarray(d_m, dtype="float64") / v
    e_aux = aux_power_W() * t if aux else np.zeros_like(t)
    out = {"E_wheel_J": e_wheel, "E_drive_J": e_drive, "E_aux_J": e_aux, "E_total_J": e_drive + e_aux, "t_s": t}
    if np.ndim(d_m) == 0 and np.ndim(theta_deg) == 0 and np.ndim(r) == 0 and np.ndim(rho) == 0:
        out = {k: float(v_) for k, v_ in out.items()}
    return out


def route_energy(points, payload_kg=None, v_ms=None):
    """Walk an exported route (`points` of routes.json) exactly as web/js/models/rover.js will:
    per segment k (k >= 1): d = 1000*(s_k − s_{k−1}), theta = grade_deg_k, r = rough_k,
    z = (z_{k−1} + z_k)/2, rho = atmos(z). Returns kWh totals and time."""
    e_drive = e_aux = t = 0.0
    for a, b in zip(points, points[1:]):
        d = 1000.0 * (b["s_km"] - a["s_km"])
        e = segment_energy(d, b["grade_deg"], b["rough"], z_m=0.5 * (a["z_m"] + b["z_m"]),
                           payload_kg=payload_kg, v_ms=v_ms)
        e_drive += e["E_drive_J"]
        e_aux += e["E_aux_J"]
        t += e["t_s"]
    return {"E_total_kWh": (e_drive + e_aux) / J_PER_KWH, "E_drive_kWh": e_drive / J_PER_KWH,
            "E_aux_kWh": e_aux / J_PER_KWH, "time_h": t / 3600.0}


def verdict(E_out_kWh: float, E_back_kWh: float):
    """ROUND TRIP OK / ONE-WAY ONLY / NOT REACHABLE (spec §6.3) and battery left on arrival (kWh)."""
    cap = C.rover.battery_usable_kWh
    if E_out_kWh > cap:
        return "NOT REACHABLE", cap - E_out_kWh
    if E_out_kWh + E_back_kWh <= (1 - C.rover.reserve_frac) * cap:
        return "ROUND TRIP OK", cap - E_out_kWh
    return "ONE-WAY ONLY", cap - E_out_kWh


def theta_deg_from(dz_m, dh_m):
    return np.degrees(np.arctan2(dz_m, dh_m))


__all__ = ["segment_energy", "route_energy", "verdict", "rho_at", "aux_power_W", "J_PER_KWH", "J_PER_WH",
           "theta_deg_from"]
