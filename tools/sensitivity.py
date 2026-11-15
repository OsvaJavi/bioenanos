"""Sensitivity analysis for the README (spec M6): ± crr, eta_dt (rover) and f_g (on foot) on the AP-9 routes.

    python tools/sensitivity.py            # prints a Markdown table

The route geometry stays fixed (P-11: routes are pre-computed with default parameters); only the energy / oxygen
along the exported AP-9 points is recomputed, exactly as the web app does.
"""
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline import models_rover as mr  # noqa: E402
from pipeline import models_walker as mw  # noqa: E402
from pipeline.constants import C  # noqa: E402

POI = "AP-9"
ROUTES = json.loads((ROOT / "web" / "data" / "routes.json").read_text(encoding="utf-8"))


def route(mode, direction):
    return next(r for r in ROUTES["routes"] if r["poi"] == POI and r["mode"] == mode and r["direction"] == direction)


def rover_round_trip(crr=None, eta=None):
    old = C.rover.eta_dt
    if eta is not None:
        C.rover.eta_dt = eta
    try:
        e = []
        for d in ("out", "back"):
            p = route("rover", d)["points"]
            tot = 0.0
            for a, b in zip(p, p[1:]):
                tot += mr.segment_energy(1000 * (b["s_km"] - a["s_km"]), b["grade_deg"], b["rough"],
                                         z_m=0.5 * (a["z_m"] + b["z_m"]), crr=crr)["E_total_J"]
            e.append(tot / mr.J_PER_KWH)
    finally:
        C.rover.eta_dt = old
    v, left = mr.verdict(e[0], e[1])
    return e[0] + e[1], v


def walker_plan(f_g):
    w = mw.Walker(f_g=f_g)
    segs = []
    for d in ("out", "back"):
        p = route("walker", d)["points"]
        for a, b in zip(p, p[1:]):
            s = mw.segment(w, 1000 * (b["s_km"] - a["s_km"]), b["grade_deg"], b["rough"])
            segs.append((s["t_s"], s["O2_L"]))
    return mw.o2_plan(segs)


def table():
    rows = []
    base_e, _ = rover_round_trip()
    for label, vals, fn in (("crr (rolling resistance)", (0.08, C.rover.crr, 0.30), lambda v: rover_round_trip(crr=v)),
                            ("eta_dt (drivetrain efficiency)", (0.80, C.rover.eta_dt, 0.95), lambda v: rover_round_trip(eta=v))):
        for v in vals:
            e, verdict = fn(v)
            rows.append((f"Rover · {label}", f"{v:g}" + (" (default)" if v in (C.rover.crr, C.rover.eta_dt) and abs(e - base_e) < 1e-9 else ""),
                         f"{e:.1f} kWh round trip", f"{100 * (e / base_e - 1):+.0f} %", verdict))
    base = walker_plan(C.walker.f_g)
    for v in (round(C.walker.f_g * 0.8, 3), C.walker.f_g, round(C.walker.f_g * 1.2, 3)):
        p = walker_plan(v)
        rows.append(("On foot · f_g (Mars gravity factor)", f"{v:g}" + (" (default)" if v == C.walker.f_g else ""),
                     f"{p['O2_required_L']:.0f} L O₂", f"{100 * (p['O2_required_L'] / base['O2_required_L'] - 1):+.0f} %",
                     f"{p['n_evas']} EVAs"))
    out = ["| Parameter | Value | Result (AP-9) | Change | Verdict / EVAs |", "|---|---|---|---|---|"]
    out += [f"| {a} | {b} | {c} | {d} | {e} |" for a, b, c, d, e in rows]
    return "\n".join(out)


if __name__ == "__main__":
    print(table())
