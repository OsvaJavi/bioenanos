"""T-M0-05: mocks validate against schemas/*.json; also pois.json; mock refs are self-consistent."""
import json
import pathlib

import jsonschema
import pytest

from pipeline.geo import dist_az, in_grid, ll_to_cell

ROOT = pathlib.Path(__file__).resolve().parents[2]
WEB_DATA = ROOT / "web" / "data"
load = lambda p: json.loads(pathlib.Path(p).read_text(encoding="utf-8"))  # noqa: E731


def validate(doc, schema_name):
    schema = load(ROOT / "schemas" / schema_name)
    jsonschema.Draft202012Validator.check_schema(schema)
    jsonschema.Draft202012Validator(schema).validate(doc)


def test_mock_routes_schema():
    doc = load(WEB_DATA / "mock" / "routes.json")
    validate(doc, "routes.schema.json")
    assert doc["mock"] is True


def test_mock_layers_schema_and_files():
    doc = load(WEB_DATA / "mock" / "layers.json")
    validate(doc, "layers.schema.json")
    assert doc["mock"] is True
    assert {lay["id"] for lay in doc["layers"]} == {
        "hillshade", "elevation", "slope", "roughness", "thermal", "optical", "shielding", "detail"}
    for lay in doc["layers"]:
        if lay["available"]:
            assert (WEB_DATA / lay["file"]).is_file(), lay["file"]  # files are relative to web/data/


def test_pois_schema_and_inside_grid():
    doc = load(WEB_DATA / "pois.json")
    validate(doc, "pois.schema.json")
    for s in [doc["base"], *doc["pois"]]:
        assert in_grid(*ll_to_cell(s["lat"], s["lon"])), s["id"]


def test_pois_straight_lines_match_geo():
    doc = load(WEB_DATA / "pois.json")
    b = doc["base"]
    for p in doc["pois"]:
        d, az = dist_az((b["lat"], b["lon"]), (p["lat"], p["lon"]))
        assert abs(d - p["md_straight_km"]) <= 0.01 and abs(az - p["md_az_deg"]) <= 0.01, p["id"]


def test_mock_routes_cover_all_combinations_and_are_consistent():
    doc = load(WEB_DATA / "mock" / "routes.json")
    pois = load(WEB_DATA / "pois.json")
    combos = {(r["poi"], r["mode"], r["direction"]) for r in doc["routes"]}
    assert len(combos) == 20
    base = (pois["base"]["lat"], pois["base"]["lon"])
    for r in doc["routes"]:
        poi = next(p for p in pois["pois"] if p["id"] == r["poi"])
        start, end = r["points"][0], r["points"][-1]
        a, b = (base, (poi["lat"], poi["lon"])) if r["direction"] == "out" else ((poi["lat"], poi["lon"]), base)
        assert dist_az((start["lat"], start["lon"]), a)[0] < 0.001
        assert dist_az((end["lat"], end["lon"]), b)[0] < 0.001
        assert end["s_km"] == pytest.approx(r["length_km_3d"], abs=1e-6)
        steps = [q["s_km"] - p["s_km"] for p, q in zip(r["points"], r["points"][1:])]
        assert max(steps) <= 0.2 + 1e-9 and min(steps) > 0
        if r["mode"] == "rover":
            # 0.48069 kWh/km on flat ground at payload 350 (G-ROV-1 rate, rho at -3.9 km).
            assert r["ref"]["E_total_kWh"] == pytest.approx(0.48069 * r["length_km_3d"], rel=1e-3)
            assert r["ref"]["E_total_kWh"] == pytest.approx(r["ref"]["E_drive_kWh"] + r["ref"]["E_aux_kWh"])
        else:
            # 1 m/s flat, ref astronaut + 10 kg gear: P_total = 86.198 + 0.7*2.5*260 = 541.198 W
            t_s = r["length_km_3d"] * 1000
            assert r["ref"]["E_kcal"] == pytest.approx(541.198 * t_s / 4184, rel=1e-5)
