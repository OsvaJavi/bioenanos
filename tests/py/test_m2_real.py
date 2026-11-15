"""M2 tests on the REAL routes (web/data/routes.json built from M1's DEM).
T-M2-02, 03, 04, 05 (report), 06, 07, 08, 09, 10."""
import json
import math
import pathlib
import time

import jsonschema
import pytest

from pipeline import export_routes as er
from pipeline import geo
from pipeline import models_rover as mr
from pipeline import models_walker as mw
from pipeline import routing as rt

ROOT = pathlib.Path(__file__).resolve().parents[2]
ROUTES = ROOT / "web" / "data" / "routes.json"
HAVE = ROUTES.exists() and (ROOT / "data/processed/dem_200m.tif").exists()
pytestmark = pytest.mark.skipif(not HAVE, reason="real routes not generated yet")


@pytest.fixture(scope="module")
def doc():
    return json.loads(ROUTES.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def pois():
    p = json.loads((ROOT / "web/data/pois.json").read_text(encoding="utf-8"))
    return p["base"], {q["id"]: q for q in p["pois"]}


@pytest.fixture(scope="module")
def terrain():
    return er.load_terrain()


def test_t_m2_08_schema(doc):
    schema = json.loads((ROOT / "schemas/routes.schema.json").read_text())
    jsonschema.Draft202012Validator(schema).validate(doc)
    assert doc["mock"] is False
    combos = {(r["poi"], r["mode"], r["direction"]) for r in doc["routes"]}
    assert len(combos) == 20


def test_t_m2_02_endpoints(doc, pois):
    base, by_id = pois
    for r in doc["routes"]:
        a, b = (base, by_id[r["poi"]]) if r["direction"] == "out" else (by_id[r["poi"]], base)
        p0, p1 = r["points"][0], r["points"][-1]
        assert geo.dist_az((p0["lat"], p0["lon"]), (a["lat"], a["lon"]))[0] * 1000 < 150
        assert geo.dist_az((p1["lat"], p1["lon"]), (b["lat"], b["lon"]))[0] * 1000 < 150
        assert geo.ll_to_cell(p0["lat"], p0["lon"]) == geo.ll_to_cell(a["lat"], a["lon"])
        assert geo.ll_to_cell(p1["lat"], p1["lon"]) == geo.ll_to_cell(b["lat"], b["lon"])


def test_t_m2_03_length_vs_straight(doc, pois):
    _, by_id = pois
    for r in doc["routes"]:
        straight = by_id[r["poi"]]["md_straight_km"]
        assert r["length_km_2d"] >= 0.995 * straight, (r["poi"], r["mode"], r["direction"])
        assert r["length_km_2d"] <= 3 * straight
        assert r["length_km_3d"] >= r["length_km_2d"]


def test_t_m2_04_cuts(doc, terrain):
    t, grid = terrain
    for r in doc["routes"]:
        smax = rt.slope_max(r["mode"])
        ok = rt.cell_ok(t, smax)
        cells = [geo.xy_to_cell(p["x_km"], p["y_km"]) for p in r["points"]]
        for (ia, ja), (ib, jb), p in zip(cells, cells[1:], r["points"][1:]):
            di, dj = ib - ia, jb - ja
            assert (di, dj) in rt.offsets()
            touched = [(ia, ja), (ib, jb)]
            if abs(di) + abs(dj) == 3:
                touched += [(ia + x, ja + y) for x, y in rt.knight_intermediates(di, dj)]
            assert all(ok[c] for c in touched), (r["poi"], r["mode"], touched)
            assert abs(p["grade_deg"]) <= smax + 1e-9
        assert r["max_grade_deg"] <= smax


def test_t_m2_05_report_rover_vs_walker(doc):
    same = {pid: s["same_path_rover_walker"] for pid, s in doc["summary"].items()}
    print("rover/walker identical paths [out, back]:", same)  # reported, not asserted (spec T-M2-05)
    assert all(isinstance(v, list) and len(v) == 2 for v in same.values())


def test_t_m2_06_determinism():
    a, _ = er.compute()
    b, _ = er.compute()
    dump = lambda d: json.dumps(d, separators=(",", ":"), ensure_ascii=False)  # noqa: E731
    assert dump(a) == dump(b)
    assert dump(a) + "\n" == ROUTES.read_text(encoding="utf-8"), "routes.json is stale: re-run export_routes"


def test_t_m2_07_optimum_vs_bresenham(doc, terrain, pois):
    t, grid = terrain
    base, by_id = pois
    nc = t.shape[1]
    for r in doc["routes"]:
        if r["direction"] != "out":
            continue
        a = geo.ll_to_cell(base["lat"], base["lon"])
        b = geo.ll_to_cell(by_id[r["poi"]]["lat"], by_id[r["poi"]]["lon"])
        line = [i * nc + j for i, j in rt.bresenham(*a, *b)]
        c_line, bad = rt.path_cost(t, r["mode"], line)
        if not bad:
            assert r["graph_cost"] <= c_line * (1 + 1e-9), (r["poi"], r["mode"], r["graph_cost"], c_line)


def test_t_m2_09_ref_reproducible(doc):
    for r in doc["routes"]:
        got = mr.route_energy(r["points"]) if r["mode"] == "rover" else mw.route_energy(r["points"])
        got.pop("time_h")
        for k, v in r["ref"].items():
            assert abs(got[k] - v) <= 1e-9 * abs(v), (r["poi"], r["mode"], k)


def test_t_m2_10_runtime():
    t0 = time.time()
    _, stats = er.compute()
    dt = time.time() - t0
    print(f"T-M2-10 export_routes.compute: {dt:.1f} s", stats)
    assert dt < 600


def test_expected_outcomes_appendix_e(doc):
    """Sanity vs spec Appendix E (not a spec test): APMR one-way for the rover, every POI multi-EVA on foot."""
    s = doc["summary"]
    assert s["APMR"]["rover"]["verdict"] == "ONE-WAY ONLY"
    for pid in ("HCP_ESP_037655_2210", "US1_FRONT", "AP-9"):
        assert s[pid]["rover"]["verdict"] == "ROUND TRIP OK"
    assert all(v["walker"]["n_evas"] > 1 for v in s.values())
    for r in doc["routes"]:
        assert r["length_km_2d"] <= 1.3 * s[r["poi"]]["straight_km"]  # Appendix E: > 1.3x would signal a bug
        assert math.isfinite(r["time_h"]) and r["time_h"] > 0
