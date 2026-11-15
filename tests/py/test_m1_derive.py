"""M1 pipeline tests on SYNTHETIC source rasters (always run; no network, no real data).

Covers T-M1-02 (vectorised grid lat/lon), T-M1-07 (georeferencing), T-M1-06 (layers.json schema +
files), T-M1-08 (source_report entries), and correctness of the derivatives with the k_x factor.
Synthetic sources mimic USGS products: equirectangular on a 3 396 190 m sphere, lon -180..180, Int16."""
import json
import math
import pathlib
import random
import shutil

import jsonschema
import numpy as np
import pytest
import rasterio
from rasterio.crs import CRS

from pipeline import derive_layers as dl
from pipeline import fetch_data as fd
from pipeline import geo

ROOT = pathlib.Path(__file__).resolve().parents[2]
R_SRC = 3396190.0
SRC_WKT = ('PROJCS["Equirectangular Mars",GEOGCS["GCS_Mars",DATUM["D_Mars",SPHEROID["Mars",3396190,0]],'
           'PRIMEM["Reference_Meridian",0],UNIT["degree",0.0174532925199433]],PROJECTION["Equirectangular"],'
           'PARAMETER["standard_parallel_1",0],PARAMETER["central_meridian",0],PARAMETER["false_easting",0],'
           'PARAMETER["false_northing",0],UNIT["metre",1]]')
LON0, LON1, LAT0, LAT1 = -160.0, -154.0, 38.0, 42.0
PX = 200.0


def make_source(path, zfun, px=PX, dtype="int16", nodata=-32768):
    """Write a synthetic source DEM. zfun(lat, lon_180) -> metres."""
    x0 = R_SRC * math.radians(LON0)
    y1 = R_SRC * math.radians(LAT1)
    w = int(R_SRC * math.radians(LON1 - LON0) / px)
    h = int(R_SRC * math.radians(LAT1 - LAT0) / px)
    xs = x0 + px * (np.arange(w) + 0.5)
    ys = y1 - px * (np.arange(h) + 0.5)
    lon = np.degrees(xs / R_SRC)
    lat = np.degrees(ys / R_SRC)
    LAT, LON = np.meshgrid(lat, lon, indexing="ij")
    z = zfun(LAT, LON)
    if dtype == "int16":
        z = np.round(z).astype("int16")
    with rasterio.open(path, "w", driver="GTiff", width=w, height=h, count=1, dtype=dtype, crs=CRS.from_wkt(SRC_WKT),
                       transform=rasterio.Affine(px, 0, x0, 0, -px, y1), nodata=nodata, tiled=True) as d:
        d.write(z, 1)
    return path


def run_pipeline(tmp_path, zfun, dtype="int16"):
    raw = tmp_path / "raw"
    proc = tmp_path / "processed"
    lay = tmp_path / "layers"
    raw.mkdir()
    make_source(tmp_path / "src.tif", zfun, dtype=dtype)
    # fetch step on a local file (same code path as the URL read, minus HTTP)
    old = fd.RAW
    fd.RAW = raw  # fetch_dem writes to fd.RAW at call time
    try:
        rep = fd.Report(proc / "source_report.json")
        assert fd.fetch_dem(rep, str(tmp_path / "src.tif"))
        rep.set("S-ENV", status="ok")
    finally:
        fd.RAW = old
    pois = tmp_path / "pois.json"
    shutil.copy(ROOT / "web" / "data" / "pois.json", pois)
    doc = dl.derive(raw, proc, lay, pois)
    return doc, raw, proc, lay, pois


@pytest.fixture(scope="module")
def plain(tmp_path_factory):
    """Realistic-ish plain: -3900 m, gentle tilt, hills, a knob, noise."""
    rng = np.random.default_rng(7)

    def z(lat, lon):
        base = -3900 + 20 * (lat - 40) + 8 * (lon + 157)
        hills = 30 * np.sin(lat * 9) * np.cos(lon * 7)
        knob = 150 * np.exp(-(((lat - 40.4) / 0.03) ** 2 + ((lon + 156.0) / 0.04) ** 2))
        return base + hills + knob + rng.normal(0, 1.5, lat.shape)

    return run_pipeline(tmp_path_factory.mktemp("plain"), z)


# --- T-M1-02 (vectorised grid conversion) ------------------------------------------
def test_grid_latlon_matches_geo():
    g = dl.Grid.regional()
    lat, lon = g.latlon()
    rng = random.Random(1)
    for _ in range(1000):
        i, j = rng.randrange(g.nrows), rng.randrange(g.ncols)
        la, lo = geo.xy_to_ll(*(v * 1000 for v in geo.cell_center(i, j)))
        assert abs(lat[i, j] - la) < 1e-9 and abs(lon[i, j] - lo) < 1e-9


def test_srcgeo_roundtrip_against_rasterio_transform():
    """Our lon/lat -> source pixel equals the source geotransform applied to R_src·λ, R_src·φ."""
    with rasterio.Env():
        crs = CRS.from_wkt(SRC_WKT)
    tf = rasterio.Affine(PX, 0, R_SRC * math.radians(LON0), 0, -PX, R_SRC * math.radians(LAT1))
    sg = fd.SrcGeo(crs, tf)
    assert sg.kind == "eqc" and sg.R == R_SRC
    col, row = sg.lonlat_to_colrow(np.array([202.10]), np.array([39.80]))  # lon °E accepted
    exp_col = (R_SRC * math.radians(-157.90) - tf.c) / PX
    exp_row = (tf.f - R_SRC * math.radians(39.80)) / PX
    assert col[0] == pytest.approx(exp_col) and row[0] == pytest.approx(exp_row)


# --- T-M1-07 georeferencing -------------------------------------------------------------
@pytest.mark.parametrize("lat,lon", [(40.4, 204.0), (39.1, 201.5), (41.1, 205.2), (38.9, 200.7)])
def test_peak_lands_in_expected_cell(tmp_path, lat, lon):
    lon180 = geo.lon_to_180(lon)

    def z(la, lo):
        d2 = ((la - lat) * math.pi / 180 * R_SRC) ** 2 + ((lo - lon180) * math.pi / 180 * R_SRC * math.cos(math.radians(lat))) ** 2
        return -3900 + 500 * np.exp(-d2 / (2 * 250.0 ** 2))

    _, _, proc, _, _ = run_pipeline(tmp_path, z, dtype="float32")
    dem, _ = dl.read_grid_tif(proc / "dem_200m.tif")
    i, j = np.unravel_index(np.nanargmax(dem), dem.shape)
    ei, ej = geo.ll_to_cell(lat, lon)
    assert abs(i - ei) <= 1 and abs(j - ej) <= 1, ((i, j), (ei, ej))


def test_wrong_radius_would_be_caught():
    """Sanity of T-M1-07's sensitivity: using R = 3388 km for the source shifts a point by > 1 cell."""
    lon = math.radians(-157.9)
    shift_m = abs(R_SRC * lon - 3388000.0 * lon)
    assert shift_m > 3 * PX


# --- derivative correctness ---------------------------------------------------------------
def test_gradients_of_tilted_surfaces(tmp_path):
    """z = g_n·(north metres) + g_e·(east metres along each parallel), in the PROJECT metric (R = 3388 km).
    After regridding, Horn's east component must equal g_e and the slope of a north-only tilt atan(g_n).
    (The east term is not a plane on the sphere: its north derivative is −g_e·sinφ·Δλ, so only p is checked.)"""
    g_n, g_e = 0.05, 0.03

    def z(la, lo):
        north = g_n * 3388000.0 * np.radians(la - 40.0)
        east = g_e * 3388000.0 * np.cos(np.radians(la)) * np.radians(lo + 157.0)
        return north + east

    _, _, proc, _, _ = run_pipeline(tmp_path, z, dtype="float32")
    dem, _ = dl.read_grid_tif(proc / "dem_200m.tif")
    g = dl.Grid.regional()
    p, q = dl.horn_gradients(dem, 200.0, g.kx_rows())
    inner = (slice(5, -5), slice(5, -5))
    # The only residual error is source sphere (3396.19 km) vs project sphere (3388 km): 0.24 %.
    assert np.nanmax(np.abs(p[inner] / g_e - 1)) < 0.004
    assert np.nanmax(np.abs(q[inner] - g_n)) < 0.002

    def zn(la, lo):
        return g_n * 3388000.0 * np.radians(la - 40.0)

    (tmp_path / "n").mkdir()
    _, _, proc2, _, _ = run_pipeline(tmp_path / "n", zn, dtype="float32")
    s, _ = dl.read_grid_tif(proc2 / "slope_deg.tif")
    r, _ = dl.read_grid_tif(proc2 / "roughness.tif")
    assert np.nanmax(np.abs(s[inner] - math.degrees(math.atan(g_n)))) < 0.02
    rraw = dl.roughness_raw(dl.read_grid_tif(proc2 / "dem_200m.tif")[0])
    assert np.nanmax(rraw[inner]) < 0.05  # a plane has ~zero roughness (bilinear resampling noise only)


def test_slope_without_kx_would_be_wrong():
    """East-only plane: ignoring k_x at the south edge errs by ~1.9 % — k_x must be applied."""
    g = dl.Grid.regional()
    kx = g.kx_rows()
    assert kx[-1] > 1.018 and kx[0] < 0.982
    z = 0.1 * 200.0 * kx[:, None] * np.arange(g.ncols)[None, :]  # dz = 0.1 per real metre in x
    p, _ = dl.horn_gradients(z, 200.0, kx)
    assert np.allclose(p[:, 1:-1], 0.1, rtol=1e-4)  # Horn mixes the k_x of 3 rows: ~1e-6 error
    p_wrong, _ = dl.horn_gradients(z, 200.0, np.ones_like(kx))
    assert abs(p_wrong[-1, 5] / 0.1 - 1) > 0.018


def test_roughness_zero_on_plane_and_positive_on_bumps():
    z = 3.0 * np.arange(50)[None, :] + 2.0 * np.arange(40)[:, None]
    assert np.allclose(dl.roughness_raw(z)[1:-1, 1:-1], 0, atol=1e-9)
    z2 = z.copy()
    z2[20, 25] += 9.0
    rr = dl.roughness_raw(z2)
    assert rr[20, 25] > 1 and rr[5, 5] < 1e-9


def test_hillshade_flat_and_facing_light():
    kx = np.ones(10)
    flat = np.zeros((10, 10))
    assert np.allclose(dl.hillshade(flat, 200, kx), math.sin(math.radians(45)))
    # A slope facing NW (towards the 315° light) is brighter than one facing SE.
    x = np.arange(10)[None, :] * 200.0
    y = np.arange(10)[:, None] * 200.0  # row index grows southwards
    faces_west = 0.2 * x + 0.0 * y   # rises to the east -> its normal tilts west (towards the light)
    faces_east = -0.2 * x + 0.0 * y
    assert dl.hillshade(faces_west, 200, kx)[5, 5] > dl.hillshade(faces_east, 200, kx)[5, 5]


def test_nan_propagates_and_shield_matches():
    z = np.full((6, 6), -3900.0)
    z[2, 2] = np.nan
    s = dl.slope_deg(z, 200, np.ones(6))
    assert np.isnan(s[2, 2]) and np.isnan(s[1, 1]) and not np.isnan(s[5, 5])


# --- outputs of the synthetic run ----------------------------------------------------------
def test_outputs_and_schema(plain):
    doc, raw, proc, lay, pois = plain
    for f in ("dem_200m.tif", "slope_deg.tif", "roughness.tif", "shield_col.tif"):
        with rasterio.open(proc / f) as ds:
            assert ds.shape == (770, 1134) and ds.dtypes[0] == "float32"
            assert ds.transform.c == -113400.0 and ds.transform.f == 77000.0 and ds.res == (200.0, 200.0)
    schema = json.loads((ROOT / "schemas" / "layers.schema.json").read_text())
    jsonschema.Draft202012Validator(schema).validate(doc)
    assert doc["mock"] is False
    ids = [lay_["id"] for lay_ in doc["layers"]]
    assert ids == ["hillshade", "elevation", "slope", "roughness", "thermal", "optical", "shielding", "detail"]
    for lay_ in doc["layers"]:
        if lay_["available"]:
            assert (lay.parent / lay_["file"]).is_file() or (lay / pathlib.Path(lay_["file"]).name).is_file()
        else:
            assert lay_["file"] is None and lay_["note"]
    from PIL import Image
    im = Image.open(lay / "elevation.png")
    assert im.size == (1134, 770) and im.mode == "RGBA"


def test_synthetic_stats(plain):
    doc, _, proc, _, pois = plain
    st = doc["stats"]
    assert st["dem_valid_fraction"] >= 0.99
    assert 0 <= st["slope_max_deg"] <= 45 and st["slope_mean_deg"] < 10
    p = json.loads(pois.read_text())
    jsonschema.Draft202012Validator(json.loads((ROOT / "schemas/pois.schema.json").read_text())).validate(p)
    assert -4500 <= p["base"]["elev_m"] <= -3300
    roughness, _ = dl.read_grid_tif(proc / "roughness.tif")
    assert np.nanmin(roughness) >= 0 and np.nanmax(roughness) <= 1
    i, j = geo.ll_to_cell(40.4, geo.lon_to_360(-156.0))
    assert roughness[i - 3:i + 4, j - 3:j + 4].max() == 1.0  # the knob is among the roughest cells


def test_source_report_has_all_sources(plain):
    _, _, proc, _, _ = plain
    rep = json.loads((proc / "source_report.json").read_text())
    assert [e["id"] for e in rep["sources"]][:11] == fd.SOURCE_IDS


def test_pick_assets_ctx_layout():
    """USGS CTX items: 'image' is the hillshade; the elevation asset is 'dtm' (bug found on real data)."""
    from types import SimpleNamespace as N
    b = "https://x/J20/J20"
    item = N(assets={"image": N(href=b + "_hillshade.tif"), "thumbnail": N(href=b + "_thumb.png"),
                     "orthoimage": N(href=b + "_orthoimage.tif"), "qa_metrics": N(href=b + "_qa.tif"),
                     "dtm": N(href=b + "_dem.tif"), "intersection_error": N(href=b + "_IntersectionErr.tif")})
    dtm, ortho = fd._pick_assets(item)
    assert dtm[0] == "dtm" and ortho[0] == "orthoimage"
