"""M1 — data acquisition (spec §4, M1 tasks 1, 4, 5).

Reads ONLY the windows needed (HTTP range requests through GDAL /vsicurl/; spec D-A4) and writes them,
in their NATIVE source CRS, to data/raw/. Reprojection to the LEQ grid is done later by
pipeline/derive_layers.py (no network needed there).

Run from the repo root, on a machine with internet access:
    python -m pipeline.fetch_data                 # everything
    python -m pipeline.fetch_data --only dem      # just the DEM
    python -m pipeline.fetch_data --dem-file path/to/local.tif   # use a file downloaded by hand

Outputs
    data/raw/dem_src.tif            float32 m (scale/offset applied, nodata -> NaN), source CRS
    data/raw/detail_dtm.tif         float32 m, block-averaged to ~20 m (P-14), source CRS   (if found)
    data/raw/detail_ortho.tif       uint8, ortho image, <= 2048 px                           (if found)
    data/raw/detail_meta.json       product id, location, P-14 rule applied
    data/raw/thermal_src.tif        THEMIS IR / TI window (visual only, P-15)                 (if found)
    data/raw/optical_src.tif        Viking colour / optical window                            (if found)
    data/raw/ti_tes.tif             TES TI (quantitative)                                     (only with --tes-url)
    data/processed/source_report.json   one entry per source of spec §4 (T-M1-08)

Nothing here is verified against live endpoints by its author (the build sandbox had no access to USGS);
every failure is caught and recorded instead of stopping the run.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import pathlib
import re
import sys
import time
import traceback
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline import geo  # noqa: E402
from pipeline.constants import C  # noqa: E402

RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
REPORT = PROCESSED / "source_report.json"

# GDAL settings for range reads (spec §3.7)
GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.TIF,.cub,.IMG,.img",
    "GDAL_HTTP_MAX_RETRY": "5",
    "GDAL_HTTP_RETRY_DELAY": "2",
    "VSI_CACHE": "TRUE",
    "GDAL_HTTP_MULTIRANGE": "YES",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
}

# --- source endpoints [FUENTE: spec §4] --------------------------------------
URL_DEM1 = "https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif"
URL_DEM2 = "https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"
STAC_API = "https://stac.astrogeology.usgs.gov/api/"
STAC_HIRISE_COLLECTIONS = ["mro_hirise_controlled_socet_dtms"]  # [FUENTE: spec §4]; discovery fallback below
# ASSUMPTION: candidate mosaic URLs for the visual layers (same products the spec names for Trek, read as
# USGS GeoTIFF windows instead of WMTS tiles). Unverified; first one that opens wins. Override with CLI flags.
THERMAL_CANDIDATES = [
    ("S-TI2", "https://planetarymaps.usgs.gov/mosaic/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12.tif",
     "THEMIS IR day mosaic 100 m v12"),
]
OPTICAL_CANDIDATES = [
    ("S-OPT2", "https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif",
     "Viking MDIM 2.1 colour mosaic 232 m"),
]
TREK_WMTS = "https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/WMTSCapabilities.xml"
TREK_THERMAL_LAYERS = ["Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12"]  # ASSUMPTION (layer ids unverified)
TREK_OPTICAL_LAYERS = ["Mars_Viking_MDIM21_ClrMosaic_global_232m"]      # ASSUMPTION

SOURCE_IDS = ["S-DEM1", "S-DEM2", "S-DEM3", "S-DEM4", "S-TI1", "S-TI2", "S-TI3",
              "S-OPT1", "S-OPT2", "S-ENV", "S-META"]

MARGIN_KM = 2.0            # spec M1 task 1: BBOX + 2 km
DETAIL_RADIUS_KM = C.routing.detail_radius_km
DETAIL_CELL_M = C.routing.detail_cell_m
ORTHO_MAX_PX = 2048        # spec M1 task 6
PROBE_PX = 8               # ~1 km² probe read at 100–200 m/px


# --- small helpers -------------------------------------------------------------
def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def bbox_ll(margin_km: float = MARGIN_KM):
    """Grid bbox + margin, as (lon_min_180, lat_min, lon_max_180, lat_max)."""
    g = C.grid
    dlat = math.degrees(margin_km / C.geo.R_km)
    dlon = math.degrees(margin_km / (C.geo.R_km * math.cos(math.radians(g.bbox_lat_max))))
    return (geo.lon_to_180(g.bbox_lon_min) - dlon, g.bbox_lat_min - dlat,
            geo.lon_to_180(g.bbox_lon_max) + dlon, g.bbox_lat_max + dlat)


def circle_bbox_ll(lat, lon, radius_km):
    dlat = math.degrees(radius_km / C.geo.R_km)
    dlon = math.degrees(radius_km / (C.geo.R_km * math.cos(math.radians(lat))))
    lon180 = geo.lon_to_180(lon)
    return (lon180 - dlon, lat - dlat, lon180 + dlon, lat + dlat)


def vsi(url_or_path: str) -> str:
    if url_or_path.startswith(("http://", "https://")):
        return "/vsicurl/" + url_or_path
    return url_or_path


# --- source CRS handling (shared with derive_layers) ----------------------------
class SrcGeo:
    """lon/lat (deg, any convention) -> source pixel (col, row) for a raster's CRS + geotransform.

    Supports the two CRS kinds used by USGS Mars products:
      * equirectangular (proj=eqc) on a sphere:  x = R*cos(lat_ts)*(lam - lon_0),  y = R*(phi - lat_0)
      * geographic (degrees):                    x = lon,  y = lat
    The radius comes from the source CRS (USGS: 3 396 190 m) — never from the project's R = 3388 km
    (spec M1 task 2: mixing radii shifts everything by kilometres).
    """

    def __init__(self, crs, transform):
        self.transform = transform
        self.inv = ~transform
        self.kind, self.R, self.lat_ts, self.lon_0, self.lat_0 = self._parse(crs)
        # Longitude convention of the raster: if its x range is centred past 180°, use 0–360.
        self.lon360 = False

    @staticmethod
    def _parse(crs):
        if crs is None:
            raise ValueError("source raster has no CRS")
        if crs.is_geographic:
            return "geographic", None, 0.0, 0.0, 0.0
        d = crs.to_dict()
        if d.get("proj") != "eqc":
            raise ValueError(f"unsupported source projection {d.get('proj')!r} (expected eqc)")
        R = d.get("R") or d.get("a")
        if R is None:  # WKT-only CRS: take the semi-major axis from SPHEROID/ELLIPSOID[...]
            m = re.search(r'(?:SPHEROID|ELLIPSOID)\["[^"]*",\s*([0-9.eE+]+)', crs.to_wkt())
            R = float(m.group(1)) if m else None
        if R is None:
            raise ValueError("cannot determine sphere radius of source CRS")
        return "eqc", float(R), float(d.get("lat_ts", 0.0)), float(d.get("lon_0", 0.0)), float(d.get("lat_0", 0.0))

    def lonlat_to_xy(self, lon, lat):
        import numpy as np
        lon = np.asarray(lon, dtype="float64")
        lat = np.asarray(lat, dtype="float64")
        if self.kind == "geographic":
            lon_c = np.where(lon > 180, lon - 360, lon) if not self.lon360 else np.mod(lon, 360)
            return lon_c, lat
        dl = (lon - self.lon_0 + 180.0) % 360.0 - 180.0          # wrap to (-180, 180]
        x = self.R * math.cos(math.radians(self.lat_ts)) * np.radians(dl)
        y = self.R * np.radians(lat - self.lat_0)
        return x, y

    def lonlat_to_colrow(self, lon, lat):
        """Continuous pixel coordinates (col, row); pixel centres are at integer + 0.5."""
        x, y = self.lonlat_to_xy(lon, lat)
        a, b, c, d, e, f = self.inv.a, self.inv.b, self.inv.c, self.inv.d, self.inv.e, self.inv.f
        return a * x + b * y + c, d * x + e * y + f

    def window_for_bbox(self, lon_min, lat_min, lon_max, lat_max, width, height, pad_px=2):
        """rasterio Window covering a lon/lat bbox (lon in -180..180), clipped to the raster."""
        import numpy as np
        from rasterio.windows import Window
        lons = np.array([lon_min, lon_max, lon_min, lon_max, 0.5 * (lon_min + lon_max)])
        lats = np.array([lat_min, lat_min, lat_max, lat_max, 0.5 * (lat_min + lat_max)])
        cols, rows = self.lonlat_to_colrow(lons, lats)
        c0 = max(0, int(math.floor(cols.min())) - pad_px)
        r0 = max(0, int(math.floor(rows.min())) - pad_px)
        c1 = min(width, int(math.ceil(cols.max())) + pad_px)
        r1 = min(height, int(math.ceil(rows.max())) + pad_px)
        if c1 <= c0 or r1 <= r0:
            raise ValueError("bbox does not intersect the raster")
        return Window(c0, r0, c1 - c0, r1 - r0)


# --- report ---------------------------------------------------------------------
class Report:
    def __init__(self, path=REPORT):
        self.path = path
        self.entries = {}
        if path.exists():
            try:
                old = json.loads(path.read_text(encoding="utf-8"))
                self.entries = {e["id"]: e for e in old.get("sources", [])}
            except Exception:  # noqa: BLE001
                self.entries = {}

    def set(self, sid, **kw):
        e = {"id": sid, "checked_utc": now_iso()}
        e.update(kw)
        self.entries[sid] = e
        status = kw.get("status")
        print(f"[{sid}] {status}" + (f" — {kw.get('error')}" if kw.get("error") else ""))
        self.save()

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        for sid in SOURCE_IDS:
            self.entries.setdefault(sid, {"id": sid, "status": "not_attempted"})
        doc = {
            "generated_utc": now_iso(),
            "generator": "pipeline/fetch_data.py",
            "statuses": "ok | failed | not_located | not_needed | not_attempted | local_file",
            "sources": [self.entries[s] for s in SOURCE_IDS] +
                       [e for k, e in self.entries.items() if k not in SOURCE_IDS],
        }
        self.path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def describe(ds):
    """Metadata block for the report (spec §4 validation procedure)."""
    return {
        "crs_wkt": ds.crs.to_wkt() if ds.crs else None,
        "crs_proj4": ds.crs.to_proj4() if ds.crs else None,
        "res": list(ds.res),
        "size_px": [ds.width, ds.height],
        "count": ds.count,
        "dtype": ds.dtypes[0],
        "nodata": ds.nodata,
        "scale": list(ds.scales) if ds.scales else None,
        "offset": list(ds.offsets) if ds.offsets else None,
        "tiled": bool(ds.profile.get("tiled", False)),
        "blockshapes": [list(b) for b in ds.block_shapes[:1]],
        "transform": list(ds.transform)[:6],
    }


# --- core window read -------------------------------------------------------------
def read_window(src_path, bbox, out_path, *, target_res_m=None, as_float=True, band_indexes=None,
                max_px=None):
    """Read a lon/lat window from a raster (URL or local), write it (source CRS) to out_path.
    Returns (meta, seconds). Applies scale/offset and nodata->NaN when as_float."""
    import numpy as np
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.windows import transform as win_transform

    t0 = time.time()
    with rasterio.Env(**GDAL_ENV), rasterio.open(vsi(src_path)) as ds:
        meta = describe(ds)
        sg = SrcGeo(ds.crs, ds.transform)
        if sg.kind == "geographic" and ds.bounds.left >= -1e-6 and ds.bounds.right > 180.5:
            sg.lon360 = True
        # probe: ~1 km² read at the centre (spec §4 validation procedure)
        tp = time.time()
        cx, cy = 0.5 * (bbox[0] + bbox[2]), 0.5 * (bbox[1] + bbox[3])
        pc, pr = sg.lonlat_to_colrow(np.array([cx]), np.array([cy]))
        from rasterio.windows import Window
        probe = ds.read(1, window=Window(int(pc[0]) - PROBE_PX // 2, int(pr[0]) - PROBE_PX // 2, PROBE_PX, PROBE_PX))
        meta["probe_seconds"] = round(time.time() - tp, 2)
        meta["probe_sample"] = [float(probe.min()), float(probe.max())]

        win = sg.window_for_bbox(*bbox, ds.width, ds.height)
        bands = band_indexes or list(range(1, ds.count + 1))
        px_m = abs(ds.res[0]) if sg.kind == "eqc" else abs(ds.res[0]) * math.pi / 180 * 3396190.0
        factor = 1
        if target_res_m and target_res_m > px_m * 1.5:
            factor = max(1, int(round(target_res_m / px_m)))
        if max_px:
            factor = max(factor, int(math.ceil(max(win.width, win.height) / max_px)))
        out_h, out_w = max(1, int(win.height // factor)), max(1, int(win.width // factor))
        data = ds.read(bands, window=win, out_shape=(len(bands), out_h, out_w),
                       resampling=Resampling.average if factor > 1 else Resampling.nearest,
                       masked=True)
        wt = win_transform(win, ds.transform) * rasterio.Affine.scale(win.width / out_w, win.height / out_h)
        profile = {"driver": "GTiff", "width": out_w, "height": out_h, "count": len(bands),
                   "crs": ds.crs, "transform": wt, "compress": "deflate"}
        if as_float:
            arr = data.astype("float64")
            for k, b in enumerate(bands):
                s = (ds.scales[b - 1] if ds.scales else 1.0) or 1.0
                o = (ds.offsets[b - 1] if ds.offsets else 0.0) or 0.0
                arr[k] = arr[k] * s + o
            arr = arr.filled(np.nan).astype("float32")
            profile.update(dtype="float32", nodata=float("nan"), predictor=3)
        else:
            arr = data.filled(0).astype(ds.dtypes[0])
            profile.update(dtype=ds.dtypes[0], nodata=None)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(out_path, "w", **profile) as dst:
            dst.write(arr)
            dst.update_tags(source=str(src_path), fetched_utc=now_iso(), decimation=str(factor))
        meta.update(window_px=[int(win.col_off), int(win.row_off), int(win.width), int(win.height)],
                    out_px=[out_w, out_h], decimation=factor, out_file=str(out_path.relative_to(ROOT)),
                    nan_fraction=float(np.isnan(arr).mean()) if as_float else None)
    return meta, round(time.time() - t0, 1)


# --- DEM --------------------------------------------------------------------------
def fetch_dem(rep: Report, dem_file: str | None):
    out = RAW / "dem_src.tif"
    bbox = bbox_ll()
    if dem_file:
        meta, sec = read_window(dem_file, bbox, out)
        rep.set("S-DEM1", status="local_file", url=dem_file, seconds=sec, **meta)
        rep.set("S-DEM2", status="not_needed")
        return True
    for sid, url in (("S-DEM1", URL_DEM1), ("S-DEM2", URL_DEM2)):
        try:
            print(f"[{sid}] reading window {bbox} from {url} (may download ~100–300 MB if the file is striped)")
            meta, sec = read_window(url, bbox, out)
            rep.set(sid, status="ok", url=url, seconds=sec, **meta)
            if sid == "S-DEM1":
                rep.set("S-DEM2", status="not_needed", url=URL_DEM2, note="Plan B not needed")
            return True
        except Exception as exc:  # noqa: BLE001
            rep.set(sid, status="failed", url=url, error=f"{type(exc).__name__}: {exc}")
    return False


# --- detail (P-14) -----------------------------------------------------------------
def _stac_collections(client, want: list[str], must: tuple[str, ...]):
    ids = [c.id for c in client.get_collections()]
    chosen = [w for w in want if w in ids]
    if not chosen:
        chosen = [i for i in ids if all(m in i.lower() for m in must)]
    return chosen, ids


def _pick_assets(item):
    dtm = ortho = None
    for key, a in item.assets.items():
        k = key.lower()
        href = a.href.lower()
        if not href.endswith((".tif", ".tiff")):
            continue
        if "ortho" in k:
            if ortho is None or "8bit" in k or "uint8" in k:
                ortho = (key, a.href)
        elif any(t in k for t in ("fom", "hillshade", "shade", "err", "thumb", "browse", "intersection")):
            continue
        elif dtm is None and ("dtm" in k or "dem" in k or k in ("image", "data")):
            dtm = (key, a.href)
    return dtm, ortho


def _dist_point_bbox_km(lat, lon180, bb):
    clon = min(max(lon180, bb[0]), bb[2])
    clat = min(max(lat, bb[1]), bb[3])
    return geo.dist_az((lat, lon180), (clat, clon))[0]


def fetch_detail(rep: Report):
    from pystac_client import Client

    pois = json.loads((ROOT / "web" / "data" / "pois.json").read_text(encoding="utf-8"))
    base = pois["base"]
    # P-14 step (3): POIs ordered by distance from AP-1
    targets_poi = sorted(((p["id"], p["lat"], p["lon"]) for p in pois["pois"]),
                         key=lambda t: geo.dist_az((base["lat"], base["lon"]), (t[1], t[2]))[0])

    client = Client.open(STAC_API)
    hir, all_ids = _stac_collections(client, STAC_HIRISE_COLLECTIONS, ("hirise", "dtm"))
    ctx, _ = _stac_collections(client, [], ("ctx", "dtm"))
    found = {"hirise_collections": hir, "ctx_collections": ctx, "all_collections": all_ids}

    def search(colls, name, lat, lon):
        if not colls:
            return []
        bb = circle_bbox_ll(lat, lon, DETAIL_RADIUS_KM)
        items = list(client.search(collections=colls, bbox=list(bb), max_items=50).items())
        out = []
        for it in items:
            d = _dist_point_bbox_km(lat, geo.lon_to_180(lon), it.bbox)
            if d <= DETAIL_RADIUS_KM:
                out.append((d, it))
        return sorted(out, key=lambda t: t[0])

    plan = [("1", hir, "HiRISE", [("AP-1", base["lat"], base["lon"])]),
            ("2", ctx, "CTX", [("AP-1", base["lat"], base["lon"])]),
            ("3", hir, "HiRISE", targets_poi)]
    tried = []
    for rule, colls, kind, tlist in plan:
        for name, lat, lon in tlist:
            cands = search(colls, kind, lat, lon)
            tried.append({"rule": rule, "kind": kind, "near": name, "n_items": len(cands),
                          "items": [it.id for _, it in cands[:10]]})
            for d, it in cands:
                dtm, ortho = _pick_assets(it)
                if not dtm:
                    continue
                bb = circle_bbox_ll(lat, lon, DETAIL_RADIUS_KM)
                try:
                    meta, sec = read_window(dtm[1], bb, RAW / "detail_dtm.tif", target_res_m=DETAIL_CELL_M)
                except Exception as exc:  # noqa: BLE001
                    tried[-1].setdefault("errors", []).append(f"{it.id}: {type(exc).__name__}: {exc}")
                    continue
                sid = "S-DEM3" if kind == "HiRISE" else "S-DEM4"
                rep.set(sid, status="ok", url=dtm[1], item_id=it.id, asset=dtm[0], collection=it.collection_id,
                        p14_rule=rule, near=name, dist_km=round(d, 2), seconds=sec, assets=list(it.assets), **meta)
                if kind == "HiRISE":
                    rep.set("S-DEM4", status="not_needed", note=f"P-14 rule {rule} satisfied by HiRISE")
                else:
                    rep.set("S-DEM3", status="not_located", note="No HiRISE DTM within 15 km of AP-1",
                            search=tried, **found)
                ortho_meta = None
                if ortho:
                    try:
                        om, osec = read_window(ortho[1], bb, RAW / "detail_ortho.tif", as_float=False,
                                               band_indexes=[1], max_px=ORTHO_MAX_PX)
                        ortho_meta = {"asset": ortho[0], "url": ortho[1], "seconds": osec, **om}
                        rep.set("S-OPT1", status="ok", item_id=it.id, **ortho_meta)
                    except Exception as exc:  # noqa: BLE001
                        rep.set("S-OPT1", status="failed", url=ortho[1], error=f"{type(exc).__name__}: {exc}")
                else:
                    rep.set("S-OPT1", status="not_located", note=f"item {it.id} has no ortho asset",
                            assets=list(it.assets))
                (RAW / "detail_meta.json").write_text(json.dumps({
                    "item_id": it.id, "collection": it.collection_id, "kind": kind, "p14_rule": rule,
                    "near": name, "near_lat": lat, "near_lon": lon, "dist_km": round(d, 2),
                    "dtm_asset": dtm[0], "ortho": bool(ortho_meta), "item_bbox": it.bbox,
                    "properties": {k: v for k, v in it.properties.items() if isinstance(v, (str, int, float))},
                }, indent=1) + "\n", encoding="utf-8")
                return True
    rep.set("S-DEM3", status="not_located", note="P-14 rules 1 and 3 found no readable HiRISE DTM",
            search=tried, **found)
    rep.set("S-DEM4", status="not_located", note="P-14 rule 2 found no readable CTX DTM")
    rep.set("S-OPT1", status="not_located", note="No DTM item -> no ortho")
    return False


# --- visual layers (thermal / optical) -------------------------------------------
def _trek_fetch(layer, bbox, out_path, target_res_m):
    """Download Mars Trek WMTS tiles covering bbox (geographic tile matrix) and mosaic to a GeoTIFF."""
    import io
    import xml.etree.ElementTree as ET

    import numpy as np
    import rasterio
    import requests
    from PIL import Image
    from rasterio.crs import CRS

    cap_url = TREK_WMTS.format(layer=layer)
    r = requests.get(cap_url, timeout=60)
    r.raise_for_status()
    ns = {"w": "http://www.opengis.net/wmts/1.0", "ows": "http://www.opengis.net/ows/1.1"}
    root = ET.fromstring(r.content)
    lay = root.find(".//w:Contents/w:Layer", ns)
    tmpl = lay.find("w:ResourceURL", ns).attrib["template"]
    tms_id = lay.find(".//w:TileMatrixSetLink/w:TileMatrixSet", ns).text
    tms = [t for t in root.findall(".//w:Contents/w:TileMatrixSet", ns)
           if t.find("ows:Identifier", ns).text == tms_id][0]
    deg_per_m = 180.0 / (math.pi * 3396190.0)
    best = None
    for tm in tms.findall("w:TileMatrix", ns):
        tw = int(tm.find("w:TileWidth", ns).text)
        th = int(tm.find("w:TileHeight", ns).text)
        mw = int(tm.find("w:MatrixWidth", ns).text)
        mh = int(tm.find("w:MatrixHeight", ns).text)
        x0, y0 = map(float, tm.find("w:TopLeftCorner", ns).text.split())
        dpp = 360.0 / (mw * tw)  # ASSUMPTION: global equirectangular matrix
        cand = (tm.find("ows:Identifier", ns).text, tw, th, mw, mh, x0, y0, dpp)
        if best is None or dpp >= target_res_m * deg_per_m * 0.7:
            best = cand
    ident, tw, th, mw, mh, x0, y0, dpp = best
    lon_min, lat_min, lon_max, lat_max = bbox
    c0 = int((lon_min - x0) / (dpp * tw)); c1 = int((lon_max - x0) / (dpp * tw))
    r0 = int((y0 - lat_max) / (dpp * th)); r1 = int((y0 - lat_min) / (dpp * th))
    canvas = None
    for row in range(r0, r1 + 1):
        for col in range(c0, c1 + 1):
            url = (tmpl.replace("{TileMatrixSet}", tms_id).replace("{TileMatrix}", ident)
                   .replace("{TileRow}", str(row)).replace("{TileCol}", str(col)).replace("{Style}", "default"))
            tr = requests.get(url, timeout=60)
            if tr.status_code != 200:
                continue  # missing tile = no coverage (spec §4)
            img = np.asarray(Image.open(io.BytesIO(tr.content)).convert("RGB"))
            if canvas is None:
                canvas = np.zeros(((r1 - r0 + 1) * th, (c1 - c0 + 1) * tw, 3), dtype="uint8")
            canvas[(row - r0) * th:(row - r0 + 1) * th, (col - c0) * tw:(col - c0 + 1) * tw] = img[:th, :tw]
    if canvas is None:
        raise RuntimeError("no tiles returned")
    tf = rasterio.Affine(dpp, 0, x0 + c0 * tw * dpp, 0, -dpp, y0 - r0 * th * dpp)
    crs = CRS.from_proj4("+proj=longlat +R=3396190 +no_defs")
    with rasterio.open(out_path, "w", driver="GTiff", width=canvas.shape[1], height=canvas.shape[0], count=3,
                       dtype="uint8", crs=crs, transform=tf, compress="deflate") as dst:
        dst.write(np.moveaxis(canvas, 2, 0))
    return {"trek_layer": layer, "tile_matrix": ident, "deg_per_px": dpp, "tiles": [c0, c1, r0, r1],
            "out_file": str(out_path.relative_to(ROOT))}


def fetch_visual(rep: Report, kind: str, override: str | None):
    out = RAW / f"{kind}_src.tif"
    bbox = bbox_ll()
    cands = THERMAL_CANDIDATES if kind == "thermal" else OPTICAL_CANDIDATES
    trek_layers = TREK_THERMAL_LAYERS if kind == "thermal" else TREK_OPTICAL_LAYERS
    if override:
        sid = "S-TI1" if kind == "thermal" else "S-OPT2"
        cands = [(sid, override, "user-provided")]
    errors = []
    for sid, url, label in cands:
        try:
            meta, sec = read_window(url, bbox, out, target_res_m=200, as_float=False)
            rep.set(sid, status="ok" if url.startswith("http") else "local_file", url=url, product=label,
                    seconds=sec, **meta)
            return sid
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{url}: {type(exc).__name__}: {exc}")
    for layer in trek_layers:
        try:
            t0 = time.time()
            m = _trek_fetch(layer, bbox, out, 200)
            sid = "S-TI2" if kind == "thermal" else "S-OPT2"
            rep.set(sid, status="ok", url=TREK_WMTS.format(layer=layer), seconds=round(time.time() - t0, 1),
                    earlier_errors=errors, **m)
            return sid
        except Exception as exc:  # noqa: BLE001
            errors.append(f"trek {layer}: {type(exc).__name__}: {exc}")
    sid = "S-TI2" if kind == "thermal" else "S-OPT2"
    rep.set(sid, status="failed", error="; ".join(errors)[-2000:])
    return None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="dem,detail,thermal,optical",
                    help="comma list of: dem, detail, thermal, optical, tes")
    ap.add_argument("--dem-file", help="local DEM GeoTIFF (or URL) instead of S-DEM1/S-DEM2")
    ap.add_argument("--thermal-url", help="THEMIS TI qualitative mosaic (S-TI1) URL or file, if located")
    ap.add_argument("--optical-url", help="optical mosaic URL or file")
    ap.add_argument("--tes-url", help="TES quantitative TI raster (S-TI3) URL or file")
    args = ap.parse_args(argv)
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    for k, v in GDAL_ENV.items():
        os.environ.setdefault(k, v)
    RAW.mkdir(parents=True, exist_ok=True)
    rep = Report()
    rep.set("S-ENV", status="ok", url="docs/arcadia_planitia_contexto_LLM.md §5",
            note="Fixed environment values from the user's context (primary source)")
    rep.entries.setdefault("S-META", {"id": "S-META", "status": "not_needed",
                                      "note": "Optional; products located via STAC instead"})
    ok = True
    steps = [("dem", lambda: fetch_dem(rep, args.dem_file)),
             ("detail", lambda: fetch_detail(rep)),
             ("thermal", lambda: fetch_visual(rep, "thermal", args.thermal_url)),
             ("optical", lambda: fetch_visual(rep, "optical", args.optical_url))]
    for name, fn in steps:
        if name not in only:
            continue
        try:
            res = fn()
            if name == "dem" and not res:
                ok = False
        except Exception as exc:  # noqa: BLE001
            print(f"[{name}] unexpected error: {exc}")
            traceback.print_exc()
            rep.set(f"step:{name}", status="failed", error=f"{type(exc).__name__}: {exc}")
            if name == "dem":
                ok = False
    if "thermal" in only and not args.thermal_url and rep.entries.get("S-TI1", {}).get("status") != "ok":
        rep.set("S-TI1", status="not_located",
                note="Qualitative THEMIS TI quadrangle covering 200.5-205.5E x 38.7-41.3N not located automatically; "
                     "pass --thermal-url if found (spec §4 S-TI1)")
    if args.tes_url:
        try:
            meta, sec = read_window(args.tes_url, bbox_ll(), RAW / "ti_tes.tif")
            rep.set("S-TI3", status="ok", url=args.tes_url, seconds=sec, **meta)
        except Exception as exc:  # noqa: BLE001
            rep.set("S-TI3", status="failed", url=args.tes_url, error=f"{type(exc).__name__}: {exc}")
    elif rep.entries.get("S-TI3", {}).get("status") in (None, "not_attempted"):
        rep.set("S-TI3", status="not_located", note="TES TI product not located; ENABLE_TI_EXCLUSION stays false (P-15)")
    rep.save()
    print(f"\nReport: {REPORT.relative_to(ROOT)}")
    print("Raw files:", ", ".join(sorted(p.name for p in RAW.glob("*"))))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
