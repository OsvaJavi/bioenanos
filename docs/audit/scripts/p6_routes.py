"""Fase 6: integridad, P-13, optimalidad (grafo y Dijkstra propios, pesos con mymodels) y coherencia de resúmenes.
No usa pipeline/routing.py ni los modelos del repo para construir el grafo. Uso: python -I p6_routes.py <repo>"""
import json, math, sys, pathlib
import numpy as np, rasterio
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
HERE = pathlib.Path(__file__).parent; sys.path.insert(0, str(HERE)); import mymodels as M
repo = pathlib.Path(sys.argv[1])
rd = lambda f: rasterio.open(repo / "data/processed" / f).read(1).astype("float64")
Z, S, RG = rd("dem_200m.tif"), rd("slope_deg.tif"), rd("roughness.tif")
NR, NC = Z.shape
R_M = 3388e3
lat_rows = 40.0 + np.degrees((77.0 - 0.2 * (np.arange(NR) + 0.5)) * 1000 / R_M)
kx = lambda lat: np.cos(np.radians(lat)) / math.cos(math.radians(40))
doc = json.loads((repo / "web/data/routes.json").read_text(encoding="utf-8"))
P = json.loads((repo / "web/data/pois.json").read_text(encoding="utf-8"))
sites = {P["base"]["id"]: P["base"], **{p["id"]: p for p in P["pois"]}}
def cell_of(lat, lon):
    x = R_M * math.cos(math.radians(40)) * math.radians(((lon - 203 + 540) % 360) - 180) / 1000; y = R_M * math.radians(lat - 40) / 1000
    return math.floor((77 - y) / 0.2 + 1e-9), math.floor((x + 113.4) / 0.2 + 1e-9)
OFF = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1), (-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)]
def knight_mid(di, dj):  # celdas que cruza un salto de caballo (según P-13: las dos intermedias)
    if abs(di) == 1: s = 1 if dj > 0 else -1; return [(0, s), (di, s)]
    s = 1 if di > 0 else -1; return [(s, 0), (s, dj)]
SMAX = {"rover": 10.0, "walker": 20.0}
problems = []
print("== Integridad y P-13 (recalculado) ==")
for r in doc["routes"]:
    pts = r["points"]; tag = f"{r['poi']}/{r['mode']}/{r['direction']}"
    a, b = (P["base"], sites[r["poi"]]) if r["direction"] == "out" else (sites[r["poi"]], P["base"])
    c0, c1 = cell_of(pts[0]["lat"], pts[0]["lon"]), cell_of(pts[-1]["lat"], pts[-1]["lon"])
    if c0 != cell_of(a["lat"], a["lon"]) or c1 != cell_of(b["lat"], b["lon"]): problems.append(f"{tag}: extremos no coinciden con las celdas de {a['id']}/{b['id']}")
    s = [p["s_km"] for p in pts]
    if any(y <= x for x, y in zip(s, s[1:])): problems.append(f"{tag}: s_km no estrictamente creciente")
    if any(not math.isfinite(v) for p in pts for v in p.values()): problems.append(f"{tag}: NaN/inf")
    L3 = 0.0; viol = 0; max_edge = 0.0; max_horn = 0.0
    for p, q in zip(pts, pts[1:]):
        i0, j0 = cell_of(p["lat"], p["lon"]); i1, j1 = cell_of(q["lat"], q["lon"]); di, dj = i1 - i0, j1 - j0
        if (di, dj) not in OFF: problems.append(f"{tag}: salto ({di},{dj}) fuera de 16 vecinos"); continue
        # coherencia x/y vs lat/lon
        xq = -113.4 + 0.2 * (j1 + 0.5); yq = 77.0 - 0.2 * (i1 + 0.5)
        if abs(xq - q["x_km"]) > 1e-3 or abs(yq - q["y_km"]) > 1e-3: problems.append(f"{tag}: x/y no coinciden con lat/lon")
        if abs(Z[i1, j1] - q["z_m"]) > 0.006: problems.append(f"{tag}: z_m difiere del DEM")
        dh = math.hypot(dj * 200 * kx(0.5 * (lat_rows[i0] + lat_rows[i1])), di * 200); dz = Z[i1, j1] - Z[i0, j0]
        L3 += math.hypot(dh, dz); th = math.degrees(math.atan2(dz, dh)); max_edge = max(max_edge, abs(th))
        cells = [(i0, j0), (i1, j1)] + ([(i0 + x, j0 + y) for x, y in knight_mid(di, dj)] if abs(di) + abs(dj) == 3 else [])
        hs = max(S[c] for c in cells); max_horn = max(max_horn, hs)
        if abs(th) > SMAX[r["mode"]] or hs > SMAX[r["mode"]]: viol += 1
        if abs(th - q["grade_deg"]) > 1e-3: problems.append(f"{tag}: grade_deg difiere de mi θ ({th:.4f} vs {q['grade_deg']})")
    if abs(L3 / 1000 - r["length_km_3d"]) > 1e-4: problems.append(f"{tag}: length_km_3d {r['length_km_3d']} vs suma propia {L3/1000:.6f}")
    if abs(s[-1] - r["length_km_3d"]) > 1e-9: problems.append(f"{tag}: s_km final != length_km_3d")
    print(f"  {tag:32s} pts={len(pts):4d} L3={L3/1000:8.3f} km (json {r['length_km_3d']:.3f}) |θ|max={max_edge:5.2f}° Horn max={max_horn:5.2f}° violaciones P-13={viol}")
print("problemas:", problems or "ninguno")

print("\n== Optimalidad: grafo y Dijkstra propios (pesos de mymodels) ==")
def weights(mode, d, th, r, zmid):
    if mode == "rover":
        rho = 610 * np.exp(-zmid / (M.RGAS * M.T_K / M.G_MARS)) / (M.RGAS * M.T_K)
        m = M.M_CURB + M.PAYLOAD; t = np.radians(th)
        F = m * M.G_MARS * M.CRR * (1 + M.K_ROUGH * r) * np.cos(t) + m * M.G_MARS * np.sin(t) + 0.5 * rho * M.CD * M.AREA * M.V_R ** 2
        ew = F * d; return (np.where(ew > 0, ew / M.ETA, 0) + (M.UA * (M.T_SET - M.T_AMB) + M.P_AUX) * d / M.V_R) / 3600  # Wh
    G = np.tan(np.radians(th)); bmr = 10 * 80 + 6.25 * 180 - 5 * 30 + 5
    P = bmr * 0.048426 + M.F_G * 1.0 * (((((280.5 * G - 58.7) * G - 76.8) * G + 51.9) * G + 19.6) * G + 2.5) * 260 * 1.0 * (1 + 0.5 * r)
    return P * d / 1.0 * 0.000239006  # kcal (factores del contrato, igual que el repo)
def graph(mode):
    ok = np.isfinite(Z) & (S <= SMAX[mode]); src, dst, w = [], [], []
    for di, dj in OFF:
        ia = np.arange(max(0, -di), NR - max(0, di))[:, None]; ja = np.arange(max(0, -dj), NC - max(0, dj))[None, :]
        v = ok[ia, ja] & ok[ia + di, ja + dj]
        if abs(di) + abs(dj) == 3:
            for x, y in knight_mid(di, dj): v &= ok[ia + x, ja + y]
        I, J = np.nonzero(v); I += max(0, -di); J += max(0, -dj)
        za, zb = Z[I, J], Z[I + di, J + dj]
        dh = np.hypot(dj * 200 * kx(0.5 * (lat_rows[I] + lat_rows[I + di])), di * 200); dz = zb - za
        th = np.degrees(np.arctan2(dz, dh)); keep = np.abs(th) <= SMAX[mode]
        ww = weights(mode, np.hypot(dh, dz)[keep], th[keep], 0.5 * (RG[I, J] + RG[I + di, J + dj])[keep], 0.5 * (za + zb)[keep])
        src.append((I * NC + J)[keep]); dst.append(((I + di) * NC + J + dj)[keep]); w.append(ww)
    return csr_matrix((np.concatenate(w), (np.concatenate(src), np.concatenate(dst))), shape=(NR * NC, NR * NC))
base = cell_of(P["base"]["lat"], P["base"]["lon"]); bnode = base[0] * NC + base[1]
summ = {}
for mode in ("rover", "walker"):
    g = graph(mode)
    d_out = dijkstra(g, indices=bnode)                 # base -> POI
    d_back = dijkstra(g.T.tocsr(), indices=bnode)      # POI -> base (grafo transpuesto)
    d_back_wrong = dijkstra(g, indices=bnode)          # lo que daría usar el grafo sin transponer
    for r in [x for x in doc["routes"] if x["mode"] == mode]:
        c = cell_of(sites[r["poi"]]["lat"], sites[r["poi"]]["lon"]); n = c[0] * NC + c[1]
        mine = (d_out if r["direction"] == "out" else d_back)[n]
        # costo de la ruta exportada con MIS pesos, sobre las celdas exactas
        cost = 0.0
        for p, q in zip(r["points"], r["points"][1:]):
            i0, j0 = cell_of(p["lat"], p["lon"]); i1, j1 = cell_of(q["lat"], q["lon"])
            dh = math.hypot((j1 - j0) * 200 * kx(0.5 * (lat_rows[i0] + lat_rows[i1])), (i1 - i0) * 200); dz = Z[i1, j1] - Z[i0, j0]
            cost += float(weights(mode, np.array(math.hypot(dh, dz)), np.array(math.degrees(math.atan2(dz, dh))), np.array(0.5 * (RG[i0, j0] + RG[i1, j1])), np.array(0.5 * (Z[i0, j0] + Z[i1, j1]))))
        flag = "OK" if cost <= mine * (1 + 1e-9) + 1e-6 else "NO ÓPTIMA"
        extra = f" (sin transponer daría {d_back_wrong[n]:.4f})" if r["direction"] == "back" else ""
        print(f"  {r['poi']:20s} {mode:6s} {r['direction']:4s} costo exportado(mis pesos)={cost:.6f} óptimo propio={mine:.6f} graph_cost repo={r['graph_cost']:.6f} -> {flag}{extra}")
print("\n== Resumen (summary) vs recálculo propio ==")
W80 = dict(W=80, H=180, age=30, sex="M", Ls=170, Lg=10, v=1.0)
for pid, s in doc["summary"].items():
    get = lambda m, d: next(x for x in doc["routes"] if x["poi"] == pid and x["mode"] == m and x["direction"] == d)
    def rov(r):
        return sum(M.rover_seg(1000 * (q["s_km"] - p["s_km"]), q["grade_deg"], q["rough"], M.atmos(0.5 * (p["z_m"] + q["z_m"]) / 1000)["rho"])["E_total_J"] for p, q in zip(r["points"], r["points"][1:])) / 3.6e6
    eo, eb = rov(get("rover", "out")), rov(get("rover", "back")); v = M.rover_verdict(eo, eb)
    segs = []
    for d in ("out", "back"):
        for p, q in zip(get("walker", d)["points"], get("walker", d)["points"][1:]):
            _, _, _, pt = M.walker_power(80, 180, 30, "M", 170, 10, 1.0, math.tan(math.radians(q["grade_deg"])), q["rough"])
            dd = 1000 * (q["s_km"] - p["s_km"]); segs.append((dd / 1.0, M.vo2(pt) * dd / 60))
    o = M.o2_plan(segs)
    print(f"  {pid:20s} rover {eo+eb:7.2f} kWh {v:14s} (json {s['rover']['E_round_kWh']} {s['rover']['verdict']}) | a pie {o['n_evas']} EVAs {o['O2_required_L']:.0f} L (json {s['walker'].get('n_evas')} {s['walker'].get('O2_required_L')})")
print({k: v for k, v in doc.items() if k not in ("routes", "summary")})
