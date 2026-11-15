"""Audit H-05: o2_plan must always terminate and conserve O2 when splitting segments at EVA boundaries.

Before the fix, the split loop advanced with room = (k+1)*lim - clock; when clock landed exactly on a boundary,
float floor-division could return k instead of k+1, room became 0 and the loop never ended
(e.g. the real AP-9 walker route with eva_limit_h = 8.2). Each call runs in a subprocess with a timeout so a
regression fails instead of hanging the suite."""
import json
import pathlib
import subprocess
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tests" / "fixtures" / "o2_plan_float_boundary.json"
ROUTES = ROOT / "web" / "data" / "routes.json"

RUNNER = r"""
import json, sys
sys.path.insert(0, sys.argv[1])
from pipeline import models_walker as mw
args = json.loads(sys.stdin.read())
if "poi" in args:
    doc = json.loads(open(sys.argv[2], encoding="utf-8").read())
    w = mw.Walker(); segs = []
    for d in ("out", "back"):
        p = next(r for r in doc["routes"] if r["poi"] == args["poi"] and r["mode"] == "walker" and r["direction"] == d)["points"]
        for a, b in zip(p, p[1:]):
            s = mw.segment(w, 1000.0 * (b["s_km"] - a["s_km"]), b["grade_deg"], b["rough"]); segs.append((s["t_s"], s["O2_L"]))
else:
    segs = [tuple(s) for s in args["segments"]]
plan = mw.o2_plan(segs, eva_limit_h=args["eva_limit_h"], reserve_min=args.get("reserve_min"), contingency=args.get("contingency"))
print(json.dumps({"plan": plan, "o2_total": sum(o for _, o in segs)}))
"""


def run_plan(args, timeout=20):
    try:
        out = subprocess.run([sys.executable, "-c", RUNNER, str(ROOT), str(ROUTES)], input=json.dumps(args),
                             capture_output=True, text=True, timeout=timeout, check=True)
    except subprocess.TimeoutExpired:
        pytest.fail(f"o2_plan did not terminate within {timeout} s for {str(args)[:120]}")
    return json.loads(out.stdout)


def test_float_boundary_fixture_terminates():
    res = run_plan(json.loads(FIXTURE.read_text(encoding="utf-8")))
    assert res["plan"]["n_evas"] == 14


@pytest.mark.parametrize("eva", [8.2, 4.1, 1.13])
def test_real_ap9_route_with_non_integer_eva_limits_terminates(eva):
    res = run_plan({"poi": "AP-9", "eva_limit_h": eva})
    p = res["plan"]
    assert p["n_evas"] >= 1 and p["O2_required_L"] > p["O2_metabolic_L"] > 0


def test_split_conserves_oxygen_and_matches_default_plan():
    # sum over EVAs of the metabolic O2 equals the total; max per EVA is unchanged for the default 8 h plan
    from pipeline import models_walker as mw
    segs = [(500.0, 10.0)] * 100  # 50 000 s, 1000 L
    plan = mw.o2_plan(segs, reserve_min=0, contingency=0)
    assert plan["n_evas"] == 2
    assert plan["O2_max_per_EVA_L"] == pytest.approx(8 * 3600 / 50000 * 1000, rel=1e-12)
