"""T-M0-02: G-GEO-1/2/3 and G-LEQ-1..4 in Python, plus grid/longitude helpers."""
import json
import pathlib
import random

import pytest

from pipeline import geo

GOLDEN = json.loads((pathlib.Path(__file__).resolve().parents[2] / "tests/golden/geo.json").read_text())
CASES = {c["id"]: c for c in GOLDEN["cases"]}


def _check(got: dict, case):
    for k, exp in case["expect"].items():
        assert abs(got[k] - exp) <= case["tol"][k], f'{case["id"]} {k}: got {got[k]}, expected {exp}'


@pytest.mark.parametrize("cid", [c for c, v in CASES.items() if v["fn"] in ("dist_az", "r_local", "ll_to_xy", "kx")])
def test_golden(cid):
    c = CASES[cid]
    if c["fn"] == "dist_az":
        d, az = geo.dist_az(c["p1"], c["p2"], R=GOLDEN["R_km"])
        got = {"d_km": d, "az_deg": az}
    elif c["fn"] == "r_local":
        got = {"r_km": geo.r_local(c["lat"])}
    elif c["fn"] == "ll_to_xy":
        x, y = geo.ll_to_xy(c["lat"], c["lon"])
        got = {"x_km": x / 1000, "y_km": y / 1000}
    else:
        got = {"kx": geo.kx(c["lat"])}
    _check(got, c)


def test_R_matches_golden():
    assert geo.R_KM == GOLDEN["R_km"]


def test_leq_roundtrip_1000_points():
    """G-LEQ-4: ll->xy->ll error < 1 m over 1000 random points in the bbox (seeded)."""
    c = CASES["G-LEQ-4"]
    rng = random.Random(20261114)
    worst = 0.0
    for _ in range(1000):
        lat = rng.uniform(38.7, 41.3)
        lon = rng.uniform(200.5, 205.5)
        lat2, lon2 = geo.xy_to_ll(*geo.ll_to_xy(lat, lon))
        worst = max(worst, geo.dist_az((lat, lon), (lat2, lon2))[0] * 1000)
    assert worst <= c["expect"]["max_err_m"] + c["tol"]["max_err_m"]


def test_ll_to_xy_accepts_both_longitude_conventions():
    assert geo.ll_to_xy(39.8, 202.10) == pytest.approx(geo.ll_to_xy(39.8, -157.90), abs=1e-6)


def test_lon_conversions():
    assert geo.lon_to_180(202.10) == pytest.approx(-157.90)
    assert geo.lon_to_180(180.0) == 180.0
    assert geo.lon_to_360(-157.90) == pytest.approx(202.10)
    assert geo.xy_to_ll(0, 0) == (40.0, 203.0)


def test_grid_corners_and_cells():
    assert geo.cell_center(0, 0) == pytest.approx((-113.3, 76.9))
    assert geo.cell_center(geo.NROWS - 1, geo.NCOLS - 1) == pytest.approx((113.3, -76.9))
    for i, j in [(0, 0), (444, 363), (769, 1133), (123, 987)]:
        assert geo.xy_to_cell(*geo.cell_center(i, j)) == (i, j)
    assert geo.xy_to_cell(-113.4, 77.0) == (0, 0)  # NW edge belongs to cell (0, 0)
    assert not geo.in_grid(*geo.xy_to_cell(113.4, 0.0))  # E edge is outside (half-open)
    assert round((geo.X_MAX_KM - geo.X_MIN_KM) / geo.CELL_KM) == geo.NCOLS
    assert round((geo.Y_MAX_KM - geo.Y_MIN_KM) / geo.CELL_KM) == geo.NROWS


def test_bbox_inside_grid():
    for lat in (38.7, 41.3):
        for lon in (200.5, 205.5):
            assert geo.in_grid(*geo.ll_to_cell(lat, lon)), (lat, lon)


def test_kx_and_horizontal_distance():
    assert geo.kx(40.0) == pytest.approx(1.0)
    assert 1.018 < geo.kx(38.7) < 1.020
    # Pure-x LEQ step at y=0 (lat 40) has real length = LEQ length.
    assert geo.horizontal_distance_m(0, 0, 200, 0) == pytest.approx(200.0)
    # Near the south edge one 200 m LEQ x-step is ~1.9 % longer in reality.
    y = -76_000.0
    assert geo.horizontal_distance_m(0, y, 200, y) == pytest.approx(200 * geo.kx(geo.xy_to_ll(0, y)[0]))


def test_leq_horizontal_distance_matches_great_circle():
    """LEQ + kx should reproduce haversine for the AP-1 -> POI straight lines to < 0.3 %."""
    pois = json.loads((pathlib.Path(__file__).resolve().parents[2] / "web/data/pois.json").read_text())
    b = pois["base"]
    xb, yb = geo.ll_to_xy(b["lat"], b["lon"])
    for p in pois["pois"]:
        xp, yp = geo.ll_to_xy(p["lat"], p["lon"])
        d_leq = geo.horizontal_distance_m(xb, yb, xp, yp) / 1000
        d_gc = geo.dist_az((b["lat"], b["lon"]), (p["lat"], p["lon"]))[0]
        assert abs(d_leq - d_gc) / d_gc < 0.003, (p["id"], d_leq, d_gc)


def test_gc_interpolate_endpoints_and_midpoint():
    a, b = (39.80, 202.10), (39.90, 204.70)
    assert geo.gc_interpolate(a, b, 0) == pytest.approx(a)
    assert geo.gc_interpolate(a, b, 1) == pytest.approx(b)
    m = geo.gc_interpolate(a, b, 0.5)
    d = geo.dist_az(a, b)[0]
    assert geo.dist_az(a, m)[0] == pytest.approx(d / 2, rel=1e-9)
