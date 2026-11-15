"""Astronaut-on-foot model (spec §6.4–6.6). Python twin of web/js/models/walker.js.

P_total = P_rest + f_g*k_suit*C_w(G)*(W + L_suit + L_gear)*v*(1 + k_rough_walk*r),   G = tan(theta)
C_w is Minetti (2002) NET cost (J kg^-1 m^-1), valid |G| <= 0.45 (20° cut -> 0.364). VO2 from the NASA
kcal/L relation with RQ 0.85. All functions accept scalars or numpy arrays.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from pipeline.constants import C


@dataclass
class Walker:
    """Astronaut + suit parameters. Defaults = P-11 reference astronaut used for routing
    (80 kg, 180 cm, 30 y, M, suit 170 kg, gear 10 kg, 1.0 m/s, VO2max 'Good' 47, HR rest 60)."""
    W: float = field(default_factory=lambda: C.walker.ref_mass_kg)
    H_cm: float = field(default_factory=lambda: C.walker.ref_height_cm)
    age: float = field(default_factory=lambda: C.walker.ref_age)
    sex: str = field(default_factory=lambda: C.walker.ref_sex)
    L_suit: float = field(default_factory=lambda: C.walker.suit_kg_default)
    L_gear: float = field(default_factory=lambda: C.walker.gear_kg_default)
    v: float = field(default_factory=lambda: C.walker.v_ms_default)
    f_g: float = field(default_factory=lambda: C.walker.f_g)
    k_suit: float = field(default_factory=lambda: C.walker.k_suit)
    RQ: float = field(default_factory=lambda: C.o2.RQ)
    vo2max: float = field(default_factory=lambda: C.walker.vo2max_levels[C.walker.vo2max_default_level])
    hr_rest: float = field(default_factory=lambda: C.walker.hr_rest_default)

    @property
    def total_mass(self):
        return self.W + self.L_suit + self.L_gear


def C_w(G):
    """Minetti 2002 net cost of walking (J kg^-1 m^-1) at grade G = tan(theta)."""
    a5, a4, a3, a2, a1, a0 = C.walker.minetti_coeffs_hi_to_lo
    G = np.asarray(G, dtype="float64") if np.ndim(G) else float(G)
    return ((((a5 * G + a4) * G + a3) * G + a2) * G + a1) * G + a0


def bmr_kcal_day(w: Walker):
    """Mifflin–St Jeor."""
    return 10 * w.W + 6.25 * w.H_cm - 5 * w.age + (5 if w.sex == "M" else -161)


def p_rest_W(w: Walker):
    return bmr_kcal_day(w) * C.units.kcal_day_to_W


def power_W(w: Walker, G, r=0.0):
    """(P_rest, P_loco, P_total) in W for grade G and roughness r."""
    pr = p_rest_W(w)
    pl = w.f_g * w.k_suit * C_w(G) * w.total_mass * w.v * (1 + C.walker.k_rough_walk * np.asarray(r, dtype="float64"))
    if np.ndim(pl) == 0:
        pl = float(pl)
    return pr, pl, pr + pl


def vo2_Lmin(P_total_W, RQ=None):
    RQ = C.o2.RQ if RQ is None else RQ
    return P_total_W * C.units.W_to_kcal_min / (C.o2.kcal_per_L_a + C.o2.kcal_per_L_b * RQ)


def heart_rate(w: Walker, vo2_mlkgmin):
    hrmax = C.bio.hrmax_a - C.bio.hrmax_b * w.age
    frac = np.clip((vo2_mlkgmin - 3.5) / (w.vo2max - 3.5), 0, 1)
    return w.hr_rest + (hrmax - w.hr_rest) * frac


def sweat_L_h(P_total_W):
    return C.bio.q_heat_frac * P_total_W * C.bio.phi_evap / C.bio.latent_J_per_g * 3600 / 1000


def metabolic(w: Walker, G=0.0, r=0.0) -> dict:
    """Full metabolic state at constant G, r (golden G-WLK-2 / G-WLK-7)."""
    pr, pl, pt = power_W(w, G, r)
    vo2 = vo2_Lmin(pt, w.RQ)
    vk = vo2 * 1000 / w.W
    return {"BMR_kcal_day": bmr_kcal_day(w), "P_rest_W": pr, "P_loco_W": pl, "P_total_W": pt,
            "kcal_per_min": pt * C.units.W_to_kcal_min, "VO2_Lmin": vo2, "VO2_mlkgmin": vk,
            "HR_bpm": heart_rate(w, vk), "sweat_L_h": sweat_L_h(pt)}


def segment(w: Walker, d_m, theta_deg, r=0.0) -> dict:
    """Energy of one (or many) segments of 3-D length d_m. G = tan(theta)."""
    G = np.tan(np.radians(theta_deg))
    _, _, pt = power_W(w, G, r)
    t = np.asarray(d_m, dtype="float64") / w.v
    e = pt * t
    out = {"t_s": t, "P_total_W": pt, "E_J": e, "E_kcal": e * C.units.J_to_kcal,
           "O2_L": vo2_Lmin(pt, w.RQ) * t / 60.0}
    if np.ndim(d_m) == 0 and np.ndim(theta_deg) == 0 and np.ndim(r) == 0:
        out = {k: float(v) for k, v in out.items()}
    return out


def route_energy(points, w: Walker = None):
    """Walk exported `points` exactly as web/js/models/walker.js will (see models_rover.route_energy)."""
    w = w or Walker()
    e = o2 = t = 0.0
    for a, b in zip(points, points[1:]):
        s = segment(w, 1000.0 * (b["s_km"] - a["s_km"]), b["grade_deg"], b["rough"])
        e += s["E_J"]
        o2 += s["O2_L"]
        t += s["t_s"]
    return {"E_kcal": e * C.units.J_to_kcal, "O2_metabolic_L": o2, "time_h": t / 3600.0}


def _split_by_eva(segments, lim, n_evas):
    """Metabolic O2 per EVA: each segment [t0, t1) is shared pro rata with the EVA windows [k*lim, (k+1)*lim)
    it overlaps (the last window is open-ended). Pure interval overlap with a bounded loop, so it always
    terminates (audit H-05: the old clock-stepping loop could stall on a float boundary). Twin of walker.js."""
    per = [0.0] * n_evas
    t0 = 0.0
    for t, o in segments:
        t1 = t0 + t
        if t <= 0:
            per[min(max(int(t0 / lim), 0), n_evas - 1)] += o
            t0 = t1
            continue
        k_lo = min(max(math.floor(t0 / lim) - 1, 0), n_evas - 1)
        k_hi = min(math.floor(t1 / lim) + 1, n_evas - 1)
        given = 0.0
        for k in range(k_lo, k_hi + 1):
            lo = k * lim
            hi = (k + 1) * lim if k < n_evas - 1 else math.inf
            share = o * max(0.0, min(t1, hi) - max(t0, lo)) / t
            per[k] += share
            given += share
        per[k_hi] += o - given  # float residue (~1e-16 relative) goes to the last window touched: O2 is conserved
        t0 = t1
    return per


def o2_plan(segments, eva_limit_h=None, reserve_min=None, contingency=None) -> dict:
    """O2 for a round trip given its segments in order (out then back): list of (t_s, O2_L).
    EVAs are consecutive blocks of eva_limit_h; the last one may be partial (spec §6.5)."""
    eva_limit_h = C.o2.eva_limit_h if eva_limit_h is None else eva_limit_h
    reserve_min = C.o2.reserve_min if reserve_min is None else reserve_min
    contingency = C.o2.contingency if contingency is None else contingency
    t_total = sum(t for t, _ in segments)
    o2_total = sum(o for _, o in segments)
    t_round_h = t_total / 3600.0
    n_evas = max(1, math.ceil(round(t_round_h / eva_limit_h, 9)))
    vo2_mean = o2_total / (t_total / 60.0) if t_total > 0 else 0.0
    per = _split_by_eva(segments, eva_limit_h * 3600.0, n_evas)
    req = (o2_total + n_evas * reserve_min * vo2_mean) * (1 + contingency)
    per_eva = [(p + reserve_min * vo2_mean) * (1 + contingency) for p in per]
    return {"t_round_h": t_round_h, "n_evas": n_evas, "single_eva_feasible": n_evas == 1,
            "O2_metabolic_L": o2_total, "VO2_mean_Lmin": vo2_mean, "O2_required_L": req,
            "O2_required_kg": req * C.o2.O2_kg_per_L, "O2_max_per_EVA_L": max(per_eva)}


def core_temp_C(P_total_W, W, t_s, Tc0=None):
    """Core temperature after t_s at constant P_total (LCVG removes up to 500 W)."""
    Tc0 = C.bio.Tc0_C if Tc0 is None else Tc0
    q = C.bio.q_heat_frac * P_total_W
    q_rem = min(q, C.bio.LCVG_cap_W)
    return Tc0 + (q - q_rem) / (W * C.bio.body_cp_J_per_kgK) * t_s
