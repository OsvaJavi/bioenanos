"""Fase 4: rasters procesados, pendiente de Horn propia, rugosidad propia, blindaje propio, PNGs."""
import json, math, sys, pathlib
import numpy as np, rasterio
from PIL import Image
repo = pathlib.Path(sys.argv[1])
P = repo / "data/processed"
R = {}
for f in ("dem_200m", "slope_deg", "roughness", "shield_col"):
    with rasterio.open(P / f"{f}.tif") as ds:
        a = ds.read(1).astype("float64"); R[f] = a
        print(f"{f}: shape={a.shape} dtype={ds.dtypes[0]} nodata={ds.nodata} NaN={np.isnan(a).sum()} "
              f"min={np.nanmin(a):.4f} max={np.nanmax(a):.4f} mean={np.nanmean(a):.4f} transform={tuple(ds.transform)[:6]} tags={list(ds.tags())[:6]}")
z = R["dem_200m"]
lat_rows = 40.0 + np.degrees((77.0 - 0.2 * (np.arange(770) + 0.5)) * 1000 / 3388e3)
kx = np.cos(np.radians(lat_rows)) / math.cos(math.radians(40))
dx = (200.0 * kx)[:, None]; dy = 200.0
a, b, c = z[:-2, :-2], z[:-2, 1:-1], z[:-2, 2:]
d, f = z[1:-1, :-2], z[1:-1, 2:]
g, h, i = z[2:, :-2], z[2:, 1:-1], z[2:, 2:]
dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * dx[1:-1])
dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * dy)
my_slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
diff = np.abs(my_slope - R["slope_deg"][1:-1, 1:-1])
print(f"Horn propia vs slope_deg.tif (interior): max|d|={np.nanmax(diff):.3e}°  mean={np.nanmean(diff):.3e}°")
# sin kx (para mostrar sensibilidad)
dzdx0 = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * 200.0)
print(f"  (sin kx la diferencia sería max {np.nanmax(np.abs(np.degrees(np.arctan(np.hypot(dzdx0, dzdy))) - R['slope_deg'][1:-1,1:-1])):.3e}°)")
edge = np.concatenate([R["slope_deg"][0], R["slope_deg"][-1], R["slope_deg"][:, 0], R["slope_deg"][:, -1]])
print(f"  bordes slope: NaN={np.isnan(edge).sum()} de {edge.size}")
# rugosidad propia: std de residuos de plano LSQ en 3x3, coordenadas reales
xs = np.array([-1, 0, 1] * 3, float); ys = np.repeat([1, 0, -1], 3).astype(float)
raw = np.full(z.shape, np.nan)
for r in range(1, 769):
    X = np.c_[xs * 200 * kx[r], ys * 200, np.ones(9)]
    Pm = X @ np.linalg.pinv(X)
    W = np.lib.stride_tricks.sliding_window_view(z[r-1:r+2], (3, 3))[0]  # (1132,3,3)
    V = W.reshape(-1, 9); res = V - V @ Pm.T
    raw[r, 1:-1] = res.std(axis=1, ddof=0)
p95 = np.nanpercentile(raw, 95)
my_r = np.clip(raw / p95, 0, 1)
dr = np.abs(my_r - R["roughness"])
print(f"rugosidad propia (ddof=0) vs roughness.tif interior: max|d|={np.nanmax(dr[1:-1,1:-1]):.3e} mean={np.nanmean(dr[1:-1,1:-1]):.3e}; P95 raw={p95:.3f} m")
# blindaje propio
H = 188.92 * 210 / 3.72076
my_sh = 0.1 * 610 * np.exp(-z / H) / 3.72076
print(f"shield propia vs shield_col.tif: max|d|={np.nanmax(np.abs(my_sh - R['shield_col'])):.3e} g/cm2")
# PNG
L = json.loads((repo / "web/data/layers/layers.json").read_text(encoding="utf-8"))
for l in L["layers"]:
    files = [l["file"]] + [v for v in (l.get("subfiles") or {}).values() if v and v != l["file"]]
    for fn in files:
        if not fn: print(f"  {l['id']}: sin archivo (available={l['available']})"); continue
        im = Image.open(repo / "web/data" / fn)
        bk = l["bounds_km"]; w_km, h_km = bk["x_max"] - bk["x_min"], bk["y_max"] - bk["y_min"]
        print(f"  {l['id']:10s} {fn:32s} {im.size} mode={im.mode} aspecto_px={im.size[0]/im.size[1]:.4f} aspecto_km={w_km/h_km:.4f} "
              f"min={l['min']} max={l['max']} unit='{l['unit']}' src={l['source']} avail={l['available']} proxy={l['proxy']}")
print("detail:", {k: L["layers"][-1].get(k) for k in ("subfiles", "location_label", "note", "legend", "source")})
