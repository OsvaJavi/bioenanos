"""M1 tests on the REAL committed outputs (data/processed/*, web/data/layers/*, web/data/pois.json).
Skipped until `python -m pipeline.fetch_data && python -m pipeline.derive_layers` has produced them.
T-M1-01, 03, 04, 05, 06, 08, 09 (T-M1-02 and T-M1-07 live in test_m1_derive.py, on synthetic data)."""
import json
import math
import pathlib

import jsonschema
import numpy as np
import pytest

from pipeline import geo
from pipeline.fetch_data import SOURCE_IDS

ROOT = pathlib.Path(__file__).resolve().parents[2]
PROC = ROOT / "data" / "processed"
LAYERS = ROOT / "web" / "data" / "layers"
HAVE = (PROC / "dem_200m.tif").exists() and (LAYERS / "layers.json").exists()
pytestmark = pytest.mark.skipif(not HAVE, reason="real M1 outputs not generated yet (needs fetch_data on a networked machine)")


def load(p):
    return json.loads(pathlib.Path(p).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def dem():
    from pipeline.derive_layers import read_grid_tif
    return read_grid_tif(PROC / "dem_200m.tif")[0]


def test_t_m1_01_geo_golden_reuse():
    for c in load(ROOT / "tests/golden/geo.json")["cases"]:
        if c["fn"] == "dist_az":
            d, az = geo.dist_az(c["p1"], c["p2"])
            assert abs(d - c["expect"]["d_km"]) <= c["tol"]["d_km"]


def test_t_m1_03_pois_on_valid_cells(dem):
    p = load(ROOT / "web/data/pois.json")
    for s in [p["base"], *p["pois"]]:
        i, j = geo.ll_to_cell(s["lat"], s["lon"])
        assert geo.in_grid(i, j), s["id"]
        assert np.isfinite(dem[i, j]), s["id"]
        assert s["elev_m"] is not None, s["id"]


def test_t_m1_04_dem_coverage_and_ap1(dem):
    assert np.isfinite(dem).mean() >= 0.99
    p = load(ROOT / "web/data/pois.json")
    assert -4500 <= p["base"]["elev_m"] <= -3300
    flagged = [e for e in load(LAYERS / "layers.json")["stats"]["poi_elevations"] if e["flag"]]
    if flagged:  # reported, not a failure (spec T-M1-04)
        print("POIs with |z_DEM − z_context| > 400 m:", flagged)


def test_t_m1_05_slopes(dem):
    from pipeline.derive_layers import read_grid_tif
    s = read_grid_tif(PROC / "slope_deg.tif")[0]
    assert np.nanmin(s) >= 0 and np.nanmax(s) <= 45
    assert np.nanmean(s) < 10


def test_t_m1_06_layers_schema_and_files():
    doc = load(LAYERS / "layers.json")
    jsonschema.Draft202012Validator(load(ROOT / "schemas/layers.schema.json")).validate(doc)
    assert doc["mock"] is False
    for lay in doc["layers"]:
        if lay["available"]:
            assert (ROOT / "web/data" / lay["file"]).is_file(), lay["file"]
            for f in (lay.get("subfiles") or {}).values():
                if f:
                    assert (ROOT / "web/data" / f).is_file(), f
        else:
            assert lay["file"] is None


def test_t_m1_08_source_report_complete():
    rep = load(PROC / "source_report.json")
    ids = {e["id"] for e in rep["sources"]}
    assert set(SOURCE_IDS) <= ids
    for e in rep["sources"]:
        assert e.get("status") and e["status"] != "not_attempted" or e["id"] not in ("S-DEM1",), e
    assert any(rep_e["status"] in ("ok", "local_file") for rep_e in rep["sources"] if rep_e["id"] in ("S-DEM1", "S-DEM2"))


def test_t_m1_09_layers_size():
    total = sum(f.stat().st_size for f in LAYERS.rglob("*") if f.is_file())
    assert total < 15 * 1024 * 1024, total


def test_processed_grid_definition():
    import rasterio
    for f in ("dem_200m.tif", "slope_deg.tif", "roughness.tif", "shield_col.tif"):
        with rasterio.open(PROC / f) as ds:
            assert ds.shape == (geo.NROWS, geo.NCOLS)
            assert ds.transform.c == geo.X_MIN_KM * 1000 and ds.transform.f == geo.Y_MAX_KM * 1000
            assert math.isnan(ds.nodata)
