"""Fase 3: geodesia independiente (desde el spec §3.2-3.3) vs pipeline/geo.py y web/js/geo.js."""
import json, math, random, subprocess, sys, pathlib, tempfile, os
repo = pathlib.Path(sys.argv[1]); A = pathlib.Path(sys.argv[2])
sys.path.insert(0, str(repo))
from pipeline import geo as G  # noqa: repo implementation (solo para comparar)
# --- implementación propia ---
R = 3388.0e3; PHI0 = 40.0; LAM0 = 203.0
def my_ll_to_xy(lat, lon):
    dl = ((lon - LAM0 + 540.0) % 360.0) - 180.0
    return R * math.cos(math.radians(PHI0)) * math.radians(dl), R * math.radians(lat - PHI0)
def my_xy_to_ll(x, y):
    return PHI0 + math.degrees(y / R), (LAM0 + math.degrees(x / (R * math.cos(math.radians(PHI0))))) % 360.0
def my_cell(xk, yk): return math.floor((77.0 - yk) / 0.2), math.floor((xk + 113.4) / 0.2)
def my_hav(p1, p2, Rk=3388.0):
    f1, l1, f2, l2 = map(math.radians, (*p1, *p2))
    a = math.sin((f2-f1)/2)**2 + math.cos(f1)*math.cos(f2)*math.sin((l2-l1)/2)**2
    return 2*Rk*math.asin(math.sqrt(a))
random.seed(20261115)
lat_lo, lat_hi = 40 + math.degrees(-77e3 / R), 40 + math.degrees(77e3 / R)
lon_half = math.degrees(113.4e3 / (R * math.cos(math.radians(40))))
pts = [(random.uniform(lat_lo, lat_hi), random.uniform(203 - lon_half, 203 + lon_half)) for _ in range(9000)]
pts += [(random.choice([lat_lo, lat_hi]), random.uniform(203 - lon_half, 203 + lon_half)) for _ in range(500)]
pts += [(random.uniform(lat_lo, lat_hi), random.choice([203 - lon_half, 203 + lon_half])) for _ in range(500)]
print("extremos de la rejilla: lat", lat_lo, lat_hi, "lon", 203 - lon_half, 203 + lon_half)
tmp = A / "p3_pts.json"; tmp.write_text(json.dumps(pts))
js = json.loads(subprocess.check_output(["node", str(A / "scripts/p3_geo_js.mjs"), str(repo), str(tmp)]))
err_rt_repo = err_rt_mine = err_py_mine = err_py_js = err_ll_js = 0.0; cell_mis = cell_mis_js = 0
for (lat, lon), j in zip(pts, js):
    xm, ym = my_ll_to_xy(lat, lon); xp, yp = G.ll_to_xy(lat, lon)
    err_py_mine = max(err_py_mine, abs(xm - xp), abs(ym - yp))
    err_py_js = max(err_py_js, abs(xp - j[0]), abs(yp - j[1]))
    la, lo = G.xy_to_ll(xp, yp); err_rt_repo = max(err_rt_repo, abs(la - lat), abs(lo - lon % 360))
    la2, lo2 = my_xy_to_ll(xm, ym); err_rt_mine = max(err_rt_mine, abs(la2 - lat), abs(lo2 - lon % 360))
    err_ll_js = max(err_ll_js, abs(j[2] - la), abs(j[3] - lo))
    c_my = my_cell(xm / 1000, ym / 1000); c_py = G.ll_to_cell(lat, lon)
    cell_mis += c_my != tuple(c_py); cell_mis_js += tuple(j[4:6]) != tuple(c_py)
print(f"N={len(pts)}  ida/vuelta repo max err {err_rt_repo:.3e}°  propia {err_rt_mine:.3e}°")
print(f"xy repo vs propia max {err_py_mine:.3e} m ; Python vs JS xy {err_py_js:.3e} m ; ll JS vs Py {err_ll_js:.3e}°")
print(f"celdas distintas propia vs repo: {cell_mis} ; JS vs Py: {cell_mis_js}")
# Wrapping de longitudes
for lon in (203.0, -157.0, 563.0, 202.10, -157.90, 0.0, 360.0):
    print("  lon", lon, "->", G.ll_to_xy(40.0, lon)[0] / 1000, "km   propia", my_ll_to_xy(40.0, lon)[0] / 1000)
# Extremos de rejilla vs bounds_km
L = json.loads((repo / "web/data/layers/layers.json").read_text(encoding="utf-8"))
print("cell_center(0,0)", G.cell_center(0, 0), " cell_center(769,1133)", G.cell_center(769, 1133))
print("bounds_km de capas:", {l["id"]: l["bounds_km"] for l in L["layers"]})
# POIs
P = json.loads((repo / "web/data/pois.json").read_text(encoding="utf-8"))
import rasterio, numpy as np
with rasterio.open(repo / "data/processed/dem_200m.tif") as ds:
    dem = ds.read(1); T = ds.transform
    print("DEM transform", T, ds.crs, ds.nodata)
readme = {"HCP_ESP_037655_2210": 47.0, "US1_FRONT": 49.6, "AP-9": 58.2, "AP-8": 66.8, "APMR": 118.2}
b = P["base"]
for s in [b] + P["pois"]:
    xm, ym = my_ll_to_xy(s["lat"], s["lon"]); xk, yk = xm / 1000, ym / 1000
    # bilineal propia sobre centros de celda
    fj = (xk + 113.4) / 0.2 - 0.5; fi = (77.0 - yk) / 0.2 - 0.5
    i0, j0 = int(math.floor(fi)), int(math.floor(fj)); di, dj = fi - i0, fj - j0
    z = (dem[i0, j0]*(1-di)*(1-dj) + dem[i0, j0+1]*(1-di)*dj + dem[i0+1, j0]*di*(1-dj) + dem[i0+1, j0+1]*di*dj)
    cell = my_cell(xk, yk)
    d = my_hav((b["lat"], b["lon"]), (s["lat"], s["lon"])) if s is not b else 0
    print(f"{s['id']:22s} xy=({xk:9.3f},{yk:8.3f}) celda={cell} elev_json={s['elev_m']} bilineal_propia={z:.1f} celda={dem[cell]:.1f} "
          f"d_gc={d:.3f} md={s.get('md_straight_km')} README={readme.get(s['id'])}")
