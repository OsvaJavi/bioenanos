"""Audit H-02 (team decision, spec v1.3): an EVA ends when the estimated core temperature reaches Tc_alert_C
(38.5 °C); the next EVA starts at Tc0 (37 °C). If a heat-limited EVA would last less than bio.min_eva_h (1 h), the
traverse is NOT FEASIBLE on foot. Without per-segment power (old 2-tuple input) the plan is purely time-based.

Hand-computed case: W = 80 kg, P = 800 W -> heat 600 W, LCVG removes 500 W, excess 100 W;
dTc/dt = 100 / (80 * 3470) K/s, so 37 -> 38.5 °C takes 1.5 * 277600 / 100 = 4164 s."""
import json
import math
import pathlib

import pytest

from pipeline import models_walker as mw
from pipeline.constants import C

ROOT = pathlib.Path(__file__).resolve().parents[2]
ROUTES = json.loads((ROOT / "web" / "data" / "routes.json").read_text(encoding="utf-8"))


def test_min_eva_constant_exists():
    assert C.bio.min_eva_h == 1.0


def test_heat_cuts_eva_at_tc_alert():
    # 3 h at 800 W, split in 10 segments of 1080 s, O2 1 L per segment
    segs = [(1080.0, 1.0, 800.0)] * 10
    p = mw.o2_plan(segs, W=80, reserve_min=0, contingency=0)
    assert p["feasible"] is True
    assert p["n_evas"] == 3 and p["heat_limited_evas"] == 2
    assert p["eva_starts_s"] == pytest.approx([0.0, 4164.0, 8328.0], abs=1e-6)
    assert p["O2_max_per_EVA_L"] == pytest.approx(4164.0 / 1080.0, rel=1e-9)
    assert sum(p["O2_per_EVA_L"]) == pytest.approx(10.0, rel=1e-12)


def test_heat_limited_eva_shorter_than_min_is_not_feasible():
    # 1000 W -> excess 250 W -> 38.5 °C after 1665.6 s < 1 h
    p = mw.o2_plan([(3600.0, 1.0, 1000.0)] * 3, W=80)
    assert p["feasible"] is False
    assert p["n_evas"] is None and p["O2_required_L"] is None and p["single_eva_feasible"] is False
    assert p["O2_metabolic_L"] == pytest.approx(3.0)


def test_no_heating_keeps_time_based_split():
    # 500 W -> heat 375 W < 500 W cooling: Tc stays at 37 °C, EVAs are 8 h blocks as before
    p = mw.o2_plan([(3600.0, 1.0, 500.0)] * 20, W=80)
    assert p["feasible"] and p["n_evas"] == 3 and p["heat_limited_evas"] == 0


def test_two_tuples_without_power_are_unchanged():
    p = mw.o2_plan([(8 * 3600.0 + 1, 100.0)])
    assert p["n_evas"] == 2 and p["feasible"] and p["heat_limited_evas"] == 0


def _walker_segs(poi, w):
    segs = []
    for d in ("out", "back"):
        pts = next(r for r in ROUTES["routes"] if r["poi"] == poi and r["mode"] == "walker" and r["direction"] == d)["points"]
        for a, b in zip(pts, pts[1:]):
            s = mw.segment(w, 1000.0 * (b["s_km"] - a["s_km"]), b["grade_deg"], b["rough"])
            segs.append((s["t_s"], s["O2_L"], s["P_total_W"]))
    return segs


def test_real_ap9_default_and_fast_walker():
    p = mw.o2_plan(_walker_segs("AP-9", mw.Walker()), W=80)
    assert p["feasible"] and p["n_evas"] == 5 and p["heat_limited_evas"] == 1
    # at 1.3 m/s one heat-limited EVA on AP-9 would last ~22 min (< 1 h): not feasible on foot
    assert mw.o2_plan(_walker_segs("AP-9", mw.Walker(v=1.3)), W=80)["feasible"] is False
    ap8 = mw.o2_plan(_walker_segs("AP-8", mw.Walker(v=1.3)), W=80)
    assert ap8["feasible"] and ap8["n_evas"] == 8 and ap8["heat_limited_evas"] == 7


def test_exported_summary_uses_the_heat_rule():
    for poi, s in ROUTES["summary"].items():
        p = mw.o2_plan(_walker_segs(poi, mw.Walker()), W=mw.Walker().W)
        assert s["walker"]["n_evas"] == p["n_evas"]
        assert s["walker"]["heat_limited_evas"] == p["heat_limited_evas"]
        assert s["walker"]["O2_max_per_EVA_L"] == round(p["O2_max_per_EVA_L"], 1)
        assert math.isclose(s["walker"]["O2_required_L"], round(p["O2_required_L"], 1))
