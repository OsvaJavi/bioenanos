"""M1 — reprojection to the LEQ grid and derived layers (spec §3.3, §6.7, M1 tasks 2, 3, 4, 6, 7).

Input  (from pipeline/fetch_data.py, source CRS):  data/raw/{dem_src, detail_dtm, detail_ortho,
        thermal_src, optical_src, ti_tes}.tif, data/raw/detail_meta.json, data/processed/source_report.json
Output: data/processed/{dem_200m, slope_deg, roughness, shield_col}.tif (+ ti_tes.tif if present)
        web/data/layers/{<id>.png, layers.json}, web/data/pois.json (elev_m filled)

    python -m pipeline.derive_layers

Reprojection is our own (no rasterio.warp, spec M1 task 2): for every grid cell centre,
LEQ (R = 3388 km) -> lat/lon -> source pixel through the source's own sphere (R_src = 3 396 190 m)
and geotransform, then bilinear interpolation (scipy.ndimage.map_coordinates, order=1).
Derivatives use dx_real = cell * k_x(lat_row) and dy = cell (spec §3.3, C-04).
"""
from __future__ import annotations

import json
import math
import pathlib
import sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline import geo  # noqa: E402
from pipeline.atmos import shield_column_gcm2  # noqa: E402
from pipeline.constants import C  # noqa: E402
from pipeline.fetch_data import SrcGeo  # noqa: E402

RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB_LAYERS = ROOT / "web" / "data" / "layers"
POIS_PATH = ROOT / "web" / "data" / "pois.json"

HILLSHADE_AZ_DEG = 315.0       # spec M1 task 3
HILLSHADE_ALT_DEG = 45.0
HILLSHADE_ZFACTOR = 1.0
SLOPE_DISPLAY_MAX_DEG = 25.0   # ASSUMPTION: colour-ramp ceiling (above the 20° walker cut so cuts are visible)
ELEV_DISPLAY_PCT = (1, 99)
HILLSHADE_STRETCH_PCT = (0.5, 99.5)  # ASSUMPTION: display-only stretch (the plain is very flat; data unchanged)     # ASSUMPTION: elevation colour ramp spans P1–P99 of the region
POI_Z_REPORT_M = 400.0         # spec T-M1-04: |z_DEM − z_context| > 400 m is reported
LEQ_PROJ4 = (f"+proj=eqc +lat_ts={C.grid.phi0_deg} +lat_0={C.grid.phi0_deg} +lon_0={C.grid.lam0_deg} "
             f"+x_0=0 +y_0=0 +R={C.geo.R_km * 1000:.0f} +units=m +no_defs")  # LEQ written as a proj string

# Colour ramps (position 0..1 -> hex). Viridis/cividis/magma stops are sampled from the matplotlib
# colormaps (CC0); hillshade is grey. Transparent where data is NaN.
PALETTES = {
    "elevation": [(0.0, "#440154"), (0.25, "#3b528b"), (0.5, "#21918c"), (0.75, "#5ec962"), (1.0, "#fde725")],
    "slope": [(0.0, "#000004"), (0.2, "#3b0f70"), (0.4, "#8c2981"), (0.6, "#de4968"), (0.8, "#fe9f6d"), (1.0, "#fcfdbf")],
    "roughness": [(0.0, "#00204d"), (0.25, "#414d6b"), (0.5, "#7c7b78"), (0.75, "#bcaf6f"), (1.0, "#ffea46")],
    "shielding": [(0.0, "#08306b"), (0.33, "#2171b5"), (0.66, "#6baed6"), (1.0, "#deebf7")],
    "hillshade": [(0.0, "#000000"), (1.0, "#ffffff")],
}


# --- grid --------------------------------------------------------------------------
class Grid:
    """A LEQ grid (regional 200 m or a detail sub-grid). Row 0 = north."""

    def __init__(self, x_min_km, y_max_km, cell_m, ncols, nrows):
        self.x_min_km, self.y_max_km, self.cell_m = x_min_km, y_max_km, cell_m
        self.ncols, self.nrows = ncols, nrows
        self.cell_km = cell_m / 1000.0
        self.x_max_km = x_min_km + ncols * self.cell_km
        self.y_min_km = y_max_km - nrows * self.cell_km

    @classmethod
    def regional(cls):
        g = C.grid
        return cls(g.x_min_km, g.y_max_km, g.cell_m, g.ncols, g.nrows)

    def centers_km(self):
        x = self.x_min_km + self.cell_km * (np.arange(self.ncols) + 0.5)
        y = self.y_max_km - self.cell_km * (np.arange(self.nrows) + 0.5)
        return x, y

    def latlon(self):
        """2-D arrays (lat, lon °E) of cell centres — vectorised geo.xy_to_ll."""
        x, y = self.centers_km()
        R_m = geo.R_M
        lat_row = geo.PHI0_DEG + np.degrees(y * 1000.0 / R_m)
        lon_col = np.mod(geo.LAM0_DEG + np.degrees(x * 1000.0 / (R_m * math.cos(math.radians(geo.PHI0_DEG)))), 360)
        lat, lon = np.meshgrid(lat_row, lon_col, indexing="ij")
        return lat, lon

    def kx_rows(self):
        _, y = self.centers_km()
        lat_row = geo.PHI0_DEG + np.degrees(y * 1000.0 / geo.R_M)
        return np.cos(np.radians(lat_row)) / math.cos(math.radians(geo.PHI0_DEG))

    def bounds(self):
        r = lambda v: round(v, 6)  # noqa: E731
        return {"x_min": r(self.x_min_km), "x_max": r(self.x_max_km), "y_min": r(self.y_min_km), "y_max": r(self.y_max_km)}

    def transform(self):
        import rasterio
        return rasterio.Affine(self.cell_m, 0, self.x_min_km * 1000.0, 0, -self.cell_m, self.y_max_km * 1000.0)

    def xy_to_frac(self, x_km, y_km):
        """Continuous (row, col) index for map_coordinates (cell centre = integer)."""
        return (self.y_max_km - y_km) / self.cell_km - 0.5, (x_km - self.x_min_km) / self.cell_km - 0.5


# --- reprojection ------------------------------------------------------------------
def reproject_to_grid(src_path, grid: Grid, band=1, order=1, nodata_zero=False):
    """Sample a source raster (its own CRS) at the grid's cell centres. Returns float64 array (NaN = no data)."""
    import rasterio
    from scipy.ndimage import map_coordinates

    with rasterio.open(src_path) as ds:
        arr = ds.read(band, masked=True).astype("float64").filled(np.nan)
        if nodata_zero:
            arr[arr == 0] = np.nan
        sg = SrcGeo(ds.crs, ds.transform)
        if sg.kind == "geographic" and ds.bounds.left >= -1e-6 and ds.bounds.right > 180.5:
            sg.lon360 = True
    lat, lon = grid.latlon()
    col, row = sg.lonlat_to_colrow(lon.ravel(), lat.ravel())
    vals = map_coordinates(arr, [row - 0.5, col - 0.5], order=order, mode="constant", cval=np.nan, prefilter=False)
    return vals.reshape(grid.nrows, grid.ncols)


# --- derivatives -----------------------------------------------------------------------
def _neighbors(z):
    """3x3 neighbourhood views with edge replication. Returns dict a..i (a b c = north row)."""
    p = np.pad(z, 1, mode="edge")
    n = {}
    for k, (di, dj) in zip("abcdefghi", [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 0), (0, 1), (1, -1), (1, 0), (1, 1)]):
        n[k] = p[1 + di:1 + di + z.shape[0], 1 + dj:1 + dj + z.shape[1]]
    return n


def horn_gradients(z, cell_m, kx_rows):
    """Horn (1981) dz/dx (east) and dz/dy (north), real metres. NaN propagates."""
    n = _neighbors(z)
    dx = (cell_m * kx_rows)[:, None]
    dy = cell_m
    p = ((n["c"] + 2 * n["f"] + n["i"]) - (n["a"] + 2 * n["d"] + n["g"])) / (8 * dx)
    q = ((n["a"] + 2 * n["b"] + n["c"]) - (n["g"] + 2 * n["h"] + n["i"])) / (8 * dy)
    return p, q


def slope_deg(z, cell_m, kx_rows):
    p, q = horn_gradients(z, cell_m, kx_rows)
    out = np.degrees(np.arctan(np.hypot(p, q)))
    out[np.isnan(z)] = np.nan  # Horn ignores the centre cell; a no-data cell has no slope
    return out


def hillshade(z, cell_m, kx_rows, az_deg=HILLSHADE_AZ_DEG, alt_deg=HILLSHADE_ALT_DEG, zf=HILLSHADE_ZFACTOR):
    """0..1 shaded relief: max(0, n·L), light from az (clockwise from N) and alt."""
    p, q = horn_gradients(z * zf, cell_m, kx_rows)
    az, alt = math.radians(az_deg), math.radians(alt_deg)
    lx, ly, lz = math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)
    hs = np.clip((-p * lx - q * ly + lz) / np.sqrt(1 + p * p + q * q), 0, 1)
    hs[np.isnan(z)] = np.nan
    return hs


def roughness_raw(z):
    """Std of residuals of a least-squares plane in each 3x3 window (m). [PROXY] for rock hazard.
    With symmetric x, y in {-1,0,1}: SS_res = Σz² − (Σz)²/9 − (Σxz)²/6 − (Σyz)²/6 (independent of dx)."""
    n = _neighbors(z)
    vals = [n[k] for k in "abcdefghi"]
    s = sum(vals)
    s2 = sum(v * v for v in vals)
    sx = (n["c"] + n["f"] + n["i"]) - (n["a"] + n["d"] + n["g"])
    sy = (n["a"] + n["b"] + n["c"]) - (n["g"] + n["h"] + n["i"])
    ss = s2 - s * s / 9 - sx * sx / 6 - sy * sy / 6
    out = np.sqrt(np.clip(ss, 0, None) / 9)
    out[np.isnan(z)] = np.nan
    return out


def normalize_roughness(raw, pct=None):
    pct = C.routing.rough_ref_percentile if pct is None else pct
    ref = float(np.nanpercentile(raw, pct))
    if not np.isfinite(ref) or ref <= 0:
        return np.where(np.isnan(raw), np.nan, 0.0), ref
    return np.clip(raw / ref, 0, 1), ref


# --- I/O -------------------------------------------------------------------------------
def write_grid_tif(path, arr, grid: Grid, **tags):
    import rasterio
    from rasterio.crs import CRS

    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(path, "w", driver="GTiff", width=grid.ncols, height=grid.nrows, count=1, dtype="float32",
                       crs=CRS.from_proj4(LEQ_PROJ4), transform=grid.transform(), nodata=float("nan"),
                       compress="deflate", predictor=3) as dst:
        dst.write(arr.astype("float32"), 1)
        dst.update_tags(grid=json.dumps({"x_min_km": grid.x_min_km, "y_max_km": grid.y_max_km, "cell_m": grid.cell_m,
                                         "ncols": grid.ncols, "nrows": grid.nrows, "row0": "north",
                                         "crs": "LEQ", "R_km": C.geo.R_km}),
                        **{k: (v if isinstance(v, str) else json.dumps(v)) for k, v in tags.items()})


def read_grid_tif(path):
    import rasterio
    with rasterio.open(path) as ds:
        return ds.read(1).astype("float64"), ds.tags()


def _hex(h):
    return tuple(int(h[k:k + 2], 16) for k in (1, 3, 5))


def colorize(arr, vmin, vmax, palette, alpha=255):
    stops = PALETTES[palette]
    t = np.clip((arr - vmin) / (vmax - vmin if vmax > vmin else 1.0), 0, 1)
    pos = np.array([s[0] for s in stops])
    cols = np.array([_hex(s[1]) for s in stops], dtype="float64")
    tt = np.nan_to_num(t, nan=0.0)
    rgb = np.stack([np.interp(tt, pos, cols[:, k]) for k in range(3)], axis=-1)
    a = np.where(np.isnan(arr), 0, alpha).astype("uint8")
    return np.dstack([rgb.astype("uint8"), a])


def save_png(path, rgba, quantize=True):
    """RGBA PNG. quantize=True stores a 256-colour palette PNG (ramps have <= 256 visible steps anyway);
    keeps web/data/layers/ well under the 15 MB budget (T-M1-09)."""
    from PIL import Image
    path.parent.mkdir(parents=True, exist_ok=True)
    im = Image.fromarray(rgba, "RGBA")
    if quantize:
        im = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    im.save(path, optimize=True)


def _r(v, nd=1):
    return None if v is None or not np.isfinite(v) else round(float(v), nd)


# --- detail (P-14) ------------------------------------------------------------------
def build_detail(raw_dir, out_layers, meta):
    """20 m LEQ sub-grid around the chosen point; hillshade + slope (+ ortho) PNGs. Returns layer dict."""
    cell = C.routing.detail_cell_m
    radius = C.routing.detail_radius_km
    x_c, y_c = (v / 1000 for v in geo.ll_to_xy(meta["near_lat"], meta["near_lon"]))
    ck = cell / 1000
    x0 = math.floor((x_c - radius) / ck) * ck
    y1 = math.ceil((y_c + radius) / ck) * ck
    n = int(round(2 * radius / ck)) + 1
    full = Grid(x0, y1, cell, n, n)
    z = reproject_to_grid(raw_dir / "detail_dtm.tif", full)
    valid = ~np.isnan(z)
    if valid.sum() < 100:
        raise RuntimeError("detail DTM does not overlap the detail window")
    rows, cols = np.where(valid)
    r0, r1, c0, c1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
    # largest side <= 2048 px (spec M1 task 6); a 30 km window at 20 m is 1501 px, so no clipping needed
    sub = Grid(x0 + c0 * ck, y1 - r0 * ck, cell, c1 - c0, r1 - r0)
    z = z[r0:r1, c0:c1]
    kx = sub.kx_rows()
    hs = hillshade(z, cell, kx)
    hs[np.isnan(z)] = np.nan
    sl = slope_deg(z, cell, kx)
    h_lo, h_hi = np.nanpercentile(hs, HILLSHADE_STRETCH_PCT)
    save_png(out_layers / "detail_hillshade.png", colorize(hs, h_lo, h_hi, "hillshade"))
    save_png(out_layers / "detail_slope.png", colorize(sl, 0, SLOPE_DISPLAY_MAX_DEG, "slope"))
    ortho = None
    if (raw_dir / "detail_ortho.tif").exists():
        o = reproject_to_grid(raw_dir / "detail_ortho.tif", sub, nodata_zero=True)  # 0 = no ortho data
        lo, hi = np.nanpercentile(o, [1, 99]) if np.isfinite(o).any() else (0, 255)
        save_png(out_layers / "detail_ortho.png", colorize(o, lo, hi, "hillshade"))
        ortho = "layers/detail_ortho.png"
    near = meta.get("near", "AP-1")
    label = f"{meta.get('kind', 'HiRISE')} DTM {meta['item_id']} — near {near}"
    return {
        "id": "detail", "label": "HiRISE detail" if meta.get("kind", "HiRISE") == "HiRISE" else "CTX detail",
        "file": "layers/detail_hillshade.png", "bounds_km": sub.bounds(), "unit": "deg",
        "min": 0.0, "max": SLOPE_DISPLAY_MAX_DEG,
        "legend": f"{meta.get('kind', 'HiRISE')} DTM detail at {cell} m (hillshade; slope 0–{SLOPE_DISPLAY_MAX_DEG:g}°). "
                  "Visual only — not used for routing (P-12).",
        "source": "S-DEM3" if meta.get("kind", "HiRISE") == "HiRISE" else "S-DEM4",
        "available": True, "proxy": False,
        "subfiles": {"hillshade": "layers/detail_hillshade.png", "slope": "layers/detail_slope.png", "ortho": ortho},
        "location_label": label,
        "note": f"P-14 rule {meta.get('p14_rule')}; product {meta['item_id']} ({meta.get('collection')}); "
                f"{meta.get('dist_km')} km from {near}. Elevation datum may differ from MOLA (visual only).",
        "z_range_m": [_r(np.nanmin(z)), _r(np.nanmax(z))],
        "slope_max_deg": _r(np.nanmax(sl)),
    }


# --- main -------------------------------------------------------------------------------
def unavailable(lid, label, source, note, unit="", proxy=False, legend=None):
    return {"id": lid, "label": label, "file": None, "bounds_km": None, "unit": unit, "min": None, "max": None,
            "legend": legend or label, "source": source, "available": False, "proxy": proxy, "note": note}


def derive(raw_dir=RAW, processed_dir=PROCESSED, layers_dir=WEB_LAYERS, pois_path=POIS_PATH, grid: Grid = None):
    raw_dir, processed_dir, layers_dir = map(pathlib.Path, (raw_dir, processed_dir, layers_dir))
    grid = grid or Grid.regional()
    report_path = processed_dir / "source_report.json"
    report = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {"sources": []}
    rep = {e["id"]: e for e in report.get("sources", [])}
    dem_src_id = "S-DEM1" if rep.get("S-DEM1", {}).get("status") in ("ok", "local_file") else (
        "S-DEM2" if rep.get("S-DEM2", {}).get("status") == "ok" else "S-DEM1")

    # 1) DEM + derivatives
    dem = reproject_to_grid(raw_dir / "dem_src.tif", grid)
    kx = grid.kx_rows()
    cell = grid.cell_m
    slope = slope_deg(dem, cell, kx)
    hs = hillshade(dem, cell, kx)
    hs[np.isnan(dem)] = np.nan
    rraw = roughness_raw(dem)
    rough, rref = normalize_roughness(rraw)
    shield = shield_column_gcm2(dem)
    stats = {
        "dem_valid_fraction": float(np.isfinite(dem).mean()),
        "dem_min_m": _r(np.nanmin(dem)), "dem_max_m": _r(np.nanmax(dem)), "dem_mean_m": _r(np.nanmean(dem)),
        "slope_mean_deg": _r(np.nanmean(slope), 3), "slope_p99_deg": _r(np.nanpercentile(slope, 99), 2),
        "slope_max_deg": _r(np.nanmax(slope), 2),
        "rough_ref_m": _r(rref, 4), "rough_ref_percentile": C.routing.rough_ref_percentile,
    }
    common = {"source_dem": dem_src_id}
    write_grid_tif(processed_dir / "dem_200m.tif", dem, grid, unit="m", **common)
    write_grid_tif(processed_dir / "slope_deg.tif", slope, grid, unit="deg", method="Horn, no smoothing", **common)
    write_grid_tif(processed_dir / "roughness.tif", rough, grid, unit="", method="3x3 plane-residual std / P95",
                   rough_ref_m=rref, **common)
    write_grid_tif(processed_dir / "shield_col.tif", shield, grid, unit="g/cm2", method="spec §6.7", **common)

    # 2) regional PNGs
    bnd = grid.bounds()
    e_lo, e_hi = (float(v) for v in np.nanpercentile(dem, ELEV_DISPLAY_PCT))
    s_lo, s_hi = float(np.nanmin(shield)), float(np.nanmax(shield))
    dem_note = "" if dem_src_id == "S-DEM1" else "MOLA 463 m DEM (plan B): effective resolution 463 m. "
    lay = []

    def add(lid, label, arr, vmin, vmax, pal, unit, legend, proxy=False, source=dem_src_id, nd=1):
        save_png(layers_dir / f"{lid}.png", colorize(arr, vmin, vmax, pal))
        lay.append({"id": lid, "label": label, "file": f"layers/{lid}.png", "bounds_km": dict(bnd), "unit": unit,
                    "min": _r(vmin, nd), "max": _r(vmax, nd), "legend": legend, "source": source, "available": True,
                    "proxy": proxy, "palette": PALETTES[pal], "note": dem_note.strip() or "Derived from the regional DEM"})

    h_lo, h_hi = (float(v) for v in np.nanpercentile(hs, HILLSHADE_STRETCH_PCT))
    add("hillshade", "Hillshade", hs, h_lo, h_hi, "hillshade", "",
        f"Shaded relief (light az {HILLSHADE_AZ_DEG:g}°, alt {HILLSHADE_ALT_DEG:g}°, z ×1); "
        f"contrast stretched P{HILLSHADE_STRETCH_PCT[0]:g}–P{HILLSHADE_STRETCH_PCT[1]:g} for display", nd=3)
    add("elevation", "Elevation", dem, e_lo, e_hi, "elevation", "m", "Elevation above MOLA areoid (m)", nd=0)
    add("slope", "Slope", slope, 0, SLOPE_DISPLAY_MAX_DEG, "slope", "deg",
        f"Slope (deg), Horn on the 200 m DEM; ramp capped at {SLOPE_DISPLAY_MAX_DEG:g}° (rover cut 10°, on foot 20°)")
    add("roughness", "Roughness (proxy)", rough, 0, 1, "roughness", "",
        "Normalized DEM roughness r ∈ [0,1] (3×3 plane residual / P95) — relative rock-hazard proxy", proxy=True, nd=2)
    add("shielding", "Radiation shielding (proxy)", shield, s_lo, s_hi, "shielding", "g/cm2",
        "Atmospheric shielding column (g/cm²) — relative proxy, not a dose map", proxy=True, nd=2)

    # 3) thermal / optical (visual only)
    for lid, label, fname, sids, unit in (("thermal", "Thermal (THEMIS)", "thermal_src.tif", ("S-TI1", "S-TI2"), ""),
                                          ("optical", "Optical", "optical_src.tif", ("S-OPT2",), "")):
        sid = next((s for s in sids if rep.get(s, {}).get("status") in ("ok", "local_file")), None)
        path = raw_dir / fname
        if sid and path.exists():
            import rasterio
            with rasterio.open(path) as ds:
                nb = ds.count
            bands = [reproject_to_grid(path, grid, band=b, nodata_zero=True) for b in range(1, min(nb, 3) + 1)]
            valid = np.all([np.isfinite(b) for b in bands], axis=0)
            if valid.mean() < 0.05:
                lay.append(unavailable(lid, label, sid, f"Source {sid} read but covers <5 % of the region"))
                continue
            if len(bands) == 3:
                rgb = np.dstack([np.nan_to_num(b, nan=0).clip(0, 255).astype("uint8") for b in bands])
                rgba = np.dstack([rgb, np.where(valid, 255, 0).astype("uint8")])
            else:
                lo, hi = np.nanpercentile(bands[0], [1, 99])
                rgba = colorize(bands[0], lo, hi, "hillshade")
            save_png(layers_dir / f"{lid}.png", rgba)
            prod = rep[sid].get("product") or rep[sid].get("trek_layer") or rep[sid].get("url", "")
            lay.append({"id": lid, "label": label, "file": f"layers/{lid}.png", "bounds_km": dict(bnd), "unit": unit,
                        "min": None, "max": None,
                        "legend": f"{prod} — image only, relative values (not used for routing)",
                        "source": sid, "available": True, "proxy": False, "note": f"Visual layer from {sid}"})
        else:
            lay.append(unavailable(lid, label, "/".join(sids), "Source not available (see source_report.json)"))

    # 4) detail
    meta_path = raw_dir / "detail_meta.json"
    if meta_path.exists() and (raw_dir / "detail_dtm.tif").exists():
        try:
            lay.append(build_detail(raw_dir, layers_dir, json.loads(meta_path.read_text(encoding="utf-8"))))
        except Exception as exc:  # noqa: BLE001
            lay.append(unavailable("detail", "HiRISE detail", "S-DEM3", f"Detail build failed: {exc}"))
    else:
        lay.append(unavailable("detail", "HiRISE detail", "S-DEM3",
                               "No HiRISE/CTX DTM found under P-14 (see source_report.json)"))

    # 5) optional TES TI on the grid
    if (raw_dir / "ti_tes.tif").exists():
        ti = reproject_to_grid(raw_dir / "ti_tes.tif", grid)
        write_grid_tif(processed_dir / "ti_tes.tif", ti, grid, unit="J m-2 K-1 s-1/2", source="S-TI3")
        stats["ti_tes_valid_fraction"] = float(np.isfinite(ti).mean())

    order = ["hillshade", "elevation", "slope", "roughness", "thermal", "optical", "shielding", "detail"]
    lay.sort(key=lambda d: order.index(d["id"]))
    g = C.grid
    layers_doc = {
        "schema_version": "1.1", "mock": False,
        "crs": {"name": "LEQ", "phi0_deg": g.phi0_deg, "lam0_deg": g.lam0_deg, "R_km": C.geo.R_km, "units": "km"},
        "grid": {"cell_m": grid.cell_m, "x_min_km": grid.x_min_km, "x_max_km": grid.x_max_km,
                 "y_min_km": grid.y_min_km, "y_max_km": grid.y_max_km, "ncols": grid.ncols, "nrows": grid.nrows},
        "file_base": "web/data/",
        "stats": stats,
        "layers": lay,
    }
    layers_dir.mkdir(parents=True, exist_ok=True)
    (layers_dir / "layers.json").write_text(json.dumps(layers_doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    # 6) pois.json elev_m (bilinear on the 200 m DEM)
    from scipy.ndimage import map_coordinates
    pois = json.loads(pathlib.Path(pois_path).read_text(encoding="utf-8"))
    poi_report = []
    for s in [pois["base"], *pois["pois"]]:
        x_m, y_m = geo.ll_to_xy(s["lat"], s["lon"])
        fr, fc = grid.xy_to_frac(x_m / 1000, y_m / 1000)
        z = float(map_coordinates(dem, [[fr], [fc]], order=1, mode="constant", cval=np.nan, prefilter=False)[0])
        s["elev_m"] = None if not np.isfinite(z) else round(z, 1)
        dz = None if s["elev_m"] is None else round(s["elev_m"] - (-3900.0), 1)
        poi_report.append({"id": s["id"], "elev_m": s["elev_m"], "dz_vs_context_m": dz,
                           "flag": dz is not None and abs(dz) > POI_Z_REPORT_M})
    pathlib.Path(pois_path).write_text(json.dumps(pois, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    stats["poi_elevations"] = poi_report
    (layers_dir / "layers.json").write_text(json.dumps(layers_doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return layers_doc


def main():
    if not (RAW / "dem_src.tif").exists():
        print("data/raw/dem_src.tif not found. Run `python -m pipeline.fetch_data` first (needs internet).")
        return 1
    doc = derive()
    print(json.dumps(doc["stats"], indent=1))
    for lay in doc["layers"]:
        print(f"  {lay['id']:10s} available={lay['available']}  {lay.get('note', '')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
