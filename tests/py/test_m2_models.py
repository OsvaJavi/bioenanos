"""T-M2-01: G-ROV-1…6, G-WLK-1…7 and G-BIO-1 in Python (same JSON as JS)."""
import json
import math
import pathlib

import numpy as np
import pytest

from pipeline import models_rover as mr
from pipeline import models_walker as mw
from pipeline.constants import C

G = pathlib.Path(__file__).resolve().parents[2] / "tests" / "golden"
ROV = {c["id"]: c for c in json.loads((G / "rover.json").read_text())["cases"]}
WLK = {c["id"]: c for c in json.loads((G / "walker.json").read_text())["cases"]}
K = mr.J_PER_KWH


def rover(inp):
    kw = {k: inp[k] for k in ("g", "crr", "aux") if k in inp}
    return mr.segment_energy(inp["d_m"], inp["theta_deg"], inp["r"], rho=inp["rho"], payload_kg=inp["payload_kg"],
                             v_ms=inp["v_ms"], **kw)


def kwh(e):
    return {k.replace("_J", "_kWh"): v / K for k, v in e.items() if k.endswith("_J")}


@pytest.mark.parametrize("cid", ["G-ROV-1", "G-ROV-4", "G-ROV-5"])
def test_rover_single(cid):
    c = ROV[cid]
    got = kwh(rover(c["input"]))
    for k, exp in c["expect"].items():
        assert abs(got[k] - exp) <= c["tol"][k], (cid, k, got[k], exp)


def test_g_rov_2_earth_calibration():
    c = ROV["G-ROV-2"]
    per100 = rover(c["input"])["E_total_J"] / K * (100_000 / c["input"]["d_m"])
    assert abs(per100 - c["expect"]["kWh_per_100km"]) <= c["tol"]["kWh_per_100km"]
    lo, hi = c["expect"]["range"]
    assert lo <= per100 <= hi


@pytest.mark.parametrize("cid", ["G-ROV-3", "G-ROV-6"])
def test_rover_lists(cid):
    c = ROV[cid]
    got = [rover(i)["E_total_J"] / K for i in c["input"]]
    for g_, e in zip(got, c["expect"]["E_total_kWh"]):
        assert abs(g_ - e) <= c["tol"]["E_total_kWh"]
    if cid == "G-ROV-3":
        assert got[0] > got[1] > got[2]
    else:
        assert got[0] < got[1]


def test_rover_weights_always_positive():
    th = np.linspace(-89, 89, 1001)
    e = mr.segment_energy(np.full_like(th, 200.0), th, np.zeros_like(th), rho=0.0222)
    assert (e["E_total_J"] > 0).all()


def test_rover_vectorised_equals_scalar():
    d = np.array([100.0, 200.0, 283.0])
    th = np.array([-3.0, 0.5, 7.0])
    r = np.array([0.0, 0.3, 1.0])
    z = np.array([-3900.0, -4000.0, -3800.0])
    vec = mr.segment_energy(d, th, r, z_m=z)
    for k in range(3):
        s = mr.segment_energy(float(d[k]), float(th[k]), float(r[k]), z_m=float(z[k]))
        assert vec["E_total_J"][k] == pytest.approx(s["E_total_J"], rel=1e-12)


def test_rover_verdicts():
    cap = C.rover.battery_usable_kWh
    assert mr.verdict(30, 30)[0] == "ROUND TRIP OK"
    assert mr.verdict(56.8, 56.8)[0] == "ONE-WAY ONLY"
    assert mr.verdict(cap + 1, 1)[0] == "NOT REACHABLE"
    assert mr.verdict(38.4, 38.4)[0] == "ROUND TRIP OK"  # exactly at the 76.8 kWh limit


# --- walker ---------------------------------------------------------------------------
def walker_from(inp):
    keys = ("W", "H_cm", "age", "sex", "L_suit", "L_gear", "v", "f_g", "k_suit", "RQ", "vo2max", "hr_rest")
    return mw.Walker(**{k: inp[k] for k in keys if k in inp})


@pytest.mark.parametrize("cid", ["G-WLK-1", "G-WLK-4"])
def test_c_w(cid):
    c = WLK[cid]
    for g_, e in zip(c["input"], c["expect"]):
        assert abs(mw.C_w(g_) - e) <= c["tol"]
    if "also" in c:
        a = c["also"]["min_over_range"]
        xs = np.linspace(*a["range"], 200001)
        mn = float(mw.C_w(xs).min())
        assert abs(mn - a["expect_min"]) <= a["tol"] and mn > 0


@pytest.mark.parametrize("cid", ["G-WLK-2", "G-WLK-7"])
def test_metabolic(cid):
    c = WLK[cid]
    got = mw.metabolic(walker_from(c["input"]), c["input"]["G"], c["input"]["r"])
    for k, exp in c["expect"].items():
        assert abs(got[k] - exp) <= c["tol"][k], (cid, k, got[k], exp)


def test_g_wlk_3_segment():
    c = WLK["G-WLK-3"]
    w = walker_from(WLK["G-WLK-2"]["input"])
    s = mw.segment(w, c["input"]["d_m"], 0.0, 0.0)
    assert abs(s["t_s"] - c["expect"]["t_s"]) <= c["tol"]["t_s"]
    assert abs(s["O2_L"] - c["expect"]["O2_metabolic_L"]) <= c["tol"]["O2_metabolic_L"]
    assert abs(s["E_kcal"] - c["expect"]["kcal"]) <= c["tol"]["kcal"]


@pytest.mark.parametrize("cid", ["G-WLK-5", "G-WLK-6"])
def test_o2_plan(cid):
    c = WLK[cid]
    w = walker_from(WLK["G-WLK-2"]["input"])
    # round trip as many 200 m flat segments (as a route would be), then the plan
    n = int(c["input"]["round_trip_m"] // 200)
    s = mw.segment(w, 200.0, 0.0, 0.0)
    got = mw.o2_plan([(s["t_s"], s["O2_L"])] * n)
    for k, exp in c["expect"].items():
        if isinstance(exp, bool) or isinstance(exp, int):
            assert got[k] == exp, (cid, k)
        else:
            assert abs(got[k] - exp) <= c["tol"][k], (cid, k, got[k], exp)


def test_o2_plan_edge_exactly_8h_is_one_eva():
    got = mw.o2_plan([(8 * 3600.0, 100.0)])
    assert got["n_evas"] == 1 and got["single_eva_feasible"]
    got = mw.o2_plan([(8 * 3600.0 + 1, 100.0)])
    assert got["n_evas"] == 2


def test_o2_per_eva_splits_segments():
    # 10 h at constant VO2 -> EVA1 8 h, EVA2 2 h; max per EVA is the 8 h block
    plan = mw.o2_plan([(36000.0, 1000.0)])
    vo2 = 1000.0 / 600.0
    assert plan["O2_max_per_EVA_L"] == pytest.approx((800.0 + 30 * vo2) * 1.1)


def test_g_bio_1():
    c = WLK["G-BIO-1"]["input"]
    tc = mw.core_temp_C(c["P_total_W"], c["W"], c["t_s"])
    assert abs(tc - 40.242) <= 0.005 and tc > C.bio.Tc_alert_C


def test_walker_weights_positive_within_cut():
    th = np.linspace(-20, 20, 4001)
    s = mw.segment(mw.Walker(), np.full_like(th, 200.0), th, np.zeros_like(th))
    assert (s["E_J"] > 0).all()
    assert math.isclose(mw.C_w(0.0), 2.5)
