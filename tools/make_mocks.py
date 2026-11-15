"""Generate MOCK data so M2–M5 can work before M1/M2 deliver (spec M0 task 5).

Writes web/data/mock/{routes.json, layers.json, layers/*.png}. Every file declares "mock": true.
- Routes: great circles AP-1 <-> each POI, sampled every 200 m (last step shorter), z_m = -3900,
  grade 0, rough 0; 20 routes (5 POI x {rover, walker} x {out, back}). Rover and walker mocks share
  geometry (the spec asks for great circles), so mock distances are identical across modes.
- `ref` uses MINIMAL FLAT-TERRAIN energy (theta = 0, r = 0) with spec §6.3/§6.4 formulas and the P-11
  default parameters. These helpers are mock-only; the real models are M2 (Python) and M4/M5 (JS).
- Layers: grey gradients over the full grid, one PNG per layer id (all 8 ids, available: true).

`file` paths in layers.json are RELATIVE TO web/data/ (see HANDOFF_M0 §7, D-M0-04), so the mock
layers use "mock/layers/<id>.png".

Usage: python tools/make_mocks.py   (deterministic; safe to re-run)
"""
from __future__ import annotations

import json
import math
import pathlib
import sys

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.atmos import atmos  # noqa: E402
from pipeline.constants import C  # noqa: E402
from pipeline.geo import dist_az, gc_interpolate, ll_to_xy  # noqa: E402

OUT = ROOT / "web" / "data" / "mock"
POIS = json.loads((ROOT / "web" / "data" / "pois.json").read_text(encoding="utf-8"))
Z_MOCK_M = -3900.0
STEP_KM = C.grid.cell_m / 1000.0


# --- mock-only flat energy helpers ------------------------------------------
def rover_flat_segment_J(d_m: float, rho: float):
    r = C.rover
    m = r.m_curb_kg + r.payload_default_kg
    F = m * C.atmos.G * r.crr + 0.5 * rho * r.Cd * r.A_m2 * r.v_ms**2
    e_drive = max(F * d_m, 0.0) / r.eta_dt
    e_aux = (r.UA_W_per_K * (r.T_batt_set_K - r.T_amb_K) + r.p_aux_W) * d_m / r.v_ms
    return e_drive, e_aux


def walker_flat_power_W():
    w = C.walker
    W, H, age = w.ref_mass_kg, w.ref_height_cm, w.ref_age
    bmr = 10 * W + 6.25 * H - 5 * age + (5 if w.ref_sex == "M" else -161)
    p_rest = bmr * C.units.kcal_day_to_W
    cw0 = w.minetti_coeffs_hi_to_lo[-1]  # C_w(0) = constant term
    p_loco = w.f_g * w.k_suit * cw0 * (W + w.suit_kg_default + w.gear_kg_default) * w.v_ms_default
    return p_rest + p_loco


def vo2_Lmin(p_total_W: float):
    return p_total_W * C.units.W_to_kcal_min / (C.o2.kcal_per_L_a + C.o2.kcal_per_L_b * C.o2.RQ)


# --- routes -------------------------------------------------------------------
def great_circle_points(a, b):
    d_km, _ = dist_az(a, b)
    n = max(1, math.ceil(d_km / STEP_KM - 1e-9))
    pts = []
    for k in range(n + 1):
        s = min(k * STEP_KM, d_km)
        lat, lon = gc_interpolate(a, b, s / d_km)
        x_m, y_m = ll_to_xy(lat, lon)
        pts.append({"x_km": round(x_m / 1000, 6), "y_km": round(y_m / 1000, 6), "lat": round(lat, 7),
                    "lon": round(lon, 7), "z_m": Z_MOCK_M, "s_km": round(s, 6), "grade_deg": 0.0, "rough": 0.0})
    return pts, d_km


def build_route(poi, mode, direction):
    base = POIS["base"]
    a, b = (base["lat"], base["lon"]), (poi["lat"], poi["lon"])
    if direction == "back":
        a, b = b, a
    pts, d_km = great_circle_points(a, b)
    rho = atmos(Z_MOCK_M / 1000)["rho"]
    seg_m = [1000 * (pts[k]["s_km"] - pts[k - 1]["s_km"]) for k in range(1, len(pts))]
    if mode == "rover":
        e_drive = e_aux = 0.0
        for d in seg_m:
            ed, ea = rover_flat_segment_J(d, rho)
            e_drive += ed
            e_aux += ea
        ref = {"E_total_kWh": (e_drive + e_aux) / 3.6e6, "E_drive_kWh": e_drive / 3.6e6, "E_aux_kWh": e_aux / 3.6e6}
        v = C.rover.v_ms
    else:
        v = C.walker.v_ms_default
        p = walker_flat_power_W()
        t_s = sum(d / v for d in seg_m)
        ref = {"E_kcal": p * t_s * C.units.J_to_kcal, "O2_metabolic_L": vo2_Lmin(p) * t_s / 60}
    return {
        "poi": poi["id"], "mode": mode, "direction": direction, "mock": True,
        "length_km_3d": round(d_km, 6), "length_km_2d": round(d_km, 6),
        "ascent_m": 0.0, "descent_m": 0.0, "max_grade_deg": 0.0, "mean_grade_deg": 0.0,
        "time_h": d_km * 1000 / v / 3600,
        "ref": ref, "points": pts,
    }


def make_routes():
    w = C.walker
    routes = [build_route(p, m, d) for p in POIS["pois"] for m in ("rover", "walker") for d in ("out", "back")]
    return {
        "schema_version": "1.1", "mock": True,
        "grid": {"cell_m": C.grid.cell_m, "neighbors": C.routing.neighbors},
        "params_used": {
            "rover": {"payload_kg": C.rover.payload_default_kg, "v_ms": C.rover.v_ms},
            "walker": {"mass_kg": w.ref_mass_kg, "height_cm": w.ref_height_cm, "age": w.ref_age, "sex": w.ref_sex,
                       "suit_kg": w.suit_kg_default, "gear_kg": w.gear_kg_default, "v_ms": w.v_ms_default},
        },
        "note": "MOCK: great circles on flat terrain (z = -3900 m). Replace with M2 output.",
        "routes": routes,
    }


# --- layers ---------------------------------------------------------------------
LAYER_DEFS = [
    ("hillshade", "Hillshade", "", "Shaded relief (az 315°, alt 45°)", "S-DEM1", False),
    ("elevation", "Elevation", "m", "Elevation above MOLA areoid (m)", "S-DEM1", False),
    ("slope", "Slope", "deg", "Horn slope (deg)", "S-DEM1", False),
    ("roughness", "Roughness (proxy)", "", "Normalized DEM roughness r ∈ [0,1] — rock-hazard proxy", "S-DEM1", True),
    ("thermal", "Thermal (THEMIS)", "", "THEMIS thermal inertia (qualitative)", "S-TI1", False),
    ("optical", "Optical", "", "Optical mosaic", "S-OPT2", False),
    ("shielding", "Radiation shielding (proxy)", "g/cm2", "Atmospheric shielding column (g/cm²) — relative proxy", "S-DEM1", True),
    ("detail", "HiRISE detail", "", "HiRISE DTM detail around AP-1", "S-DEM3", False),
]
PNG_W, PNG_H = 227, 154  # 1/5 of the 1134 x 770 grid: mocks stay small.


def gradient_png(path: pathlib.Path, k: int):
    yy, xx = np.mgrid[0:PNG_H, 0:PNG_W]
    ang = math.radians(20 * k)
    t = (np.cos(ang) * xx / PNG_W + np.sin(ang) * yy / PNG_H)
    t = (t - t.min()) / (t.max() - t.min())
    grey = (40 + 160 * t).astype(np.uint8)
    rgba = np.dstack([grey, grey, grey, np.full_like(grey, 200)])
    Image.fromarray(rgba, "RGBA").save(path, optimize=True)


def make_layers():
    g = C.grid
    bounds = {"x_min": g.x_min_km, "x_max": g.x_max_km, "y_min": g.y_min_km, "y_max": g.y_max_km}
    (OUT / "layers").mkdir(parents=True, exist_ok=True)
    layers = []
    for k, (lid, label, unit, legend, src, proxy) in enumerate(LAYER_DEFS):
        gradient_png(OUT / "layers" / f"{lid}.png", k)
        layer = {"id": lid, "label": label, "file": f"mock/layers/{lid}.png", "bounds_km": dict(bounds),
                 "unit": unit, "min": 0.0, "max": 1.0, "legend": f"MOCK — {legend}", "source": src,
                 "available": True, "proxy": proxy, "note": "Mock grey gradient", "mock": True}
        if lid == "detail":
            layer["subfiles"] = {"hillshade": f"mock/layers/{lid}.png", "slope": f"mock/layers/{lid}.png", "ortho": None}
            layer["location_label"] = "MOCK — around AP-1"
        layers.append(layer)
    return {
        "schema_version": "1.1", "mock": True,
        "crs": {"name": "LEQ", "phi0_deg": g.phi0_deg, "lam0_deg": g.lam0_deg, "R_km": C.geo.R_km, "units": "km"},
        "grid": {"cell_m": g.cell_m, "x_min_km": g.x_min_km, "x_max_km": g.x_max_km, "y_min_km": g.y_min_km,
                 "y_max_km": g.y_max_km, "ncols": g.ncols, "nrows": g.nrows},
        "file_base": "web/data/",
        "layers": layers,
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "routes.json").write_text(json.dumps(make_routes(), separators=(",", ":")) + "\n", encoding="utf-8")
    (OUT / "layers.json").write_text(json.dumps(make_layers(), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"mocks written to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
