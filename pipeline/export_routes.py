"""M2 — compute and export the 20 routes (5 POI x {rover, walker} x {out, back}) to web/data/routes.json (B.2).

    python -m pipeline.export_routes

Inputs: data/processed/{dem_200m, slope_deg, roughness}.tif (M1), web/data/pois.json, web/data/constants.json.
Four Dijkstra runs: per mode, one from AP-1 on the graph (out) and one from AP-1 on the transposed graph (back).
`ref` of every route is computed by walking the EXPORTED (rounded) points with models_rover / models_walker,
exactly as web/js/models/{rover,walker}.js will (T-M2-09).
"""
from __future__ import annotations

import json
import math
import pathlib
import sys
import time

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline import geo  # noqa: E402
from pipeline import models_rover as mr  # noqa: E402
from pipeline import models_walker as mw  # noqa: E402
from pipeline import routing as rt  # noqa: E402
from pipeline.constants import C  # noqa: E402
from pipeline.derive_layers import Grid, read_grid_tif  # noqa: E402

PROCESSED = ROOT / "data" / "processed"
POIS_PATH = ROOT / "web" / "data" / "pois.json"
OUT_PATH = ROOT / "web" / "data" / "routes.json"
MODES = ("rover", "walker")

# Rounding of exported values (ref is computed from the rounded values, so it is exactly reproducible)
ND = {"x_km": 4, "y_km": 4, "lat": 6, "lon": 6, "z_m": 2, "s_km": 6, "grade_deg": 4, "rough": 4}


def load_terrain(processed=PROCESSED, grid: Grid = None):
    grid = grid or Grid.regional()
    z = read_grid_tif(processed / "dem_200m.tif")[0]
    slope = read_grid_tif(processed / "slope_deg.tif")[0]
    rough = read_grid_tif(processed / "roughness.tif")[0]
    ti = read_grid_tif(processed / "ti_tes.tif")[0] if (processed / "ti_tes.tif").exists() else None
    _, y = grid.centers_km()
    lat_rows = geo.PHI0_DEG + np.degrees(y * 1000.0 / geo.R_M)
    return rt.Terrain(z=z, slope=slope, rough=rough, kx_rows=grid.kx_rows(), lat_rows=lat_rows,
                      cell_m=grid.cell_m, ti=ti), grid


def points_from_nodes(t: rt.Terrain, grid: Grid, nodes):
    nc = t.shape[1]
    pts = []
    s = 0.0
    prev = None
    for n in nodes:
        i, j = divmod(n, nc)
        x_km, y_km = grid.x_min_km + grid.cell_km * (j + 0.5), grid.y_max_km - grid.cell_km * (i + 0.5)
        lat, lon = geo.xy_to_ll(x_km * 1000.0, y_km * 1000.0)
        z = float(t.z[i, j])
        if prev is None:
            grade, rough = 0.0, float(t.rough[i, j])
        else:
            pi, pj, pz = prev
            dx = (j - pj) * t.cell_m * float(rt.kx_at(0.5 * (t.lat_rows[pi] + t.lat_rows[i])))
            dy = (i - pi) * t.cell_m
            dh = math.hypot(dx, dy)
            dz = z - pz
            s += math.hypot(dh, dz) / 1000.0
            grade = math.degrees(math.atan2(dz, dh))
            rough = 0.5 * (float(t.rough[pi, pj]) + float(t.rough[i, j]))
        pts.append({"x_km": x_km, "y_km": y_km, "lat": lat, "lon": lon, "z_m": z, "s_km": s,
                    "grade_deg": grade, "rough": rough})
        prev = (i, j, z)
    return [{k: round(v, ND[k]) for k, v in p.items()} for p in pts]


def summarize(points, mode):
    """Summary fields of B.2, computed from the exported points."""
    l3 = l2 = asc = desc = wsum = 0.0
    gmax = 0.0
    for a, b in zip(points, points[1:]):
        d = 1000.0 * (b["s_km"] - a["s_km"])
        dz = b["z_m"] - a["z_m"]
        dh = math.sqrt(max(d * d - dz * dz, 0.0))
        l3 += d
        l2 += dh
        asc += max(dz, 0.0)
        desc += max(-dz, 0.0)
        g = abs(b["grade_deg"])
        gmax = max(gmax, g)
        wsum += g * d
    ref = mr.route_energy(points) if mode == "rover" else mw.route_energy(points)
    time_h = ref.pop("time_h")
    return {"length_km_3d": round(points[-1]["s_km"], 6), "length_km_2d": round(l2 / 1000.0, 6),
            "ascent_m": round(asc, 2), "descent_m": round(desc, 2), "max_grade_deg": round(gmax, 4),
            "mean_grade_deg": round(wsum / l3, 4) if l3 > 0 else 0.0, "time_h": time_h, "ref": ref}


def compute(processed=PROCESSED, pois_path=POIS_PATH):
    t0 = time.time()
    t, grid = load_terrain(processed)
    pois = json.loads(pathlib.Path(pois_path).read_text(encoding="utf-8"))
    base = pois["base"]
    nc = t.shape[1]

    def node_of(site):
        i, j = geo.ll_to_cell(site["lat"], site["lon"])
        assert geo.in_grid(i, j), site["id"]
        return i * nc + j

    src = node_of(base)
    targets = {p["id"]: node_of(p) for p in pois["pois"]}
    routes, stats, cost = [], {}, {}
    for mode in MODES:
        tb = time.time()
        g, gst = rt.build_graph(t, mode)
        out_paths, out_cost = rt.shortest_paths(g, src, list(targets.values()))
        back_paths, back_cost = rt.shortest_paths(g, src, list(targets.values()), transposed=True)
        stats[mode] = {**gst, "seconds": round(time.time() - tb, 2)}
        for pid, tn in targets.items():
            for direction, paths, costs in (("out", out_paths, out_cost), ("back", back_paths, back_cost)):
                nodes = paths[tn]
                if nodes is None:
                    raise RuntimeError(f"{pid} unreachable for {mode} ({direction})")
                pts = points_from_nodes(t, grid, nodes)
                r = {"poi": pid, "mode": mode, "direction": direction, **summarize(pts, mode),
                     "graph_cost": round(costs[tn], 6), "graph_cost_unit": "Wh" if mode == "rover" else "kcal",
                     "mock": False, "points": pts}
                routes.append(r)
                cost[(pid, mode, direction)] = r
    order = {p["id"]: k for k, p in enumerate(pois["pois"])}
    routes.sort(key=lambda r: (order[r["poi"]], MODES.index(r["mode"]), r["direction"] != "out"))

    # Optional summary (handoff / M6): rover verdicts and walker O2 plans with default parameters
    summary = {}
    for pid in targets:
        ro, rb = cost[(pid, "rover", "out")], cost[(pid, "rover", "back")]
        v, left = mr.verdict(ro["ref"]["E_total_kWh"], rb["ref"]["E_total_kWh"])
        w = mw.Walker()
        segs = []
        for direction in ("out", "back"):
            p = cost[(pid, "walker", direction)]["points"]
            for a, b in zip(p, p[1:]):
                s = mw.segment(w, 1000.0 * (b["s_km"] - a["s_km"]), b["grade_deg"], b["rough"])
                segs.append((s["t_s"], s["O2_L"]))
        plan = mw.o2_plan(segs)
        summary[pid] = {
            "straight_km": next(p["md_straight_km"] for p in pois["pois"] if p["id"] == pid),
            "rover": {"out_km": ro["length_km_3d"], "E_round_kWh": round(ro["ref"]["E_total_kWh"] + rb["ref"]["E_total_kWh"], 3),
                      "verdict": v, "battery_left_on_arrival_kWh": round(left, 3)},
            "walker": {"out_km": cost[(pid, "walker", "out")]["length_km_3d"],
                       "t_round_h": round(plan["t_round_h"], 3), "n_evas": plan["n_evas"],
                       "O2_required_L": round(plan["O2_required_L"], 1),
                       "O2_max_per_EVA_L": round(plan["O2_max_per_EVA_L"], 1)},
            "same_path_rover_walker": [cost[(pid, "rover", d)]["points"] == cost[(pid, "walker", d)]["points"]
                                       for d in ("out", "back")],
        }
    w = mw.Walker()
    doc = {
        "schema_version": "1.1", "mock": False,
        "grid": {"cell_m": grid.cell_m, "neighbors": C.routing.neighbors, "x_min_km": grid.x_min_km,
                 "y_max_km": grid.y_max_km, "ncols": grid.ncols, "nrows": grid.nrows},
        "params_used": {
            "rover": {"payload_kg": C.rover.payload_default_kg, "v_ms": C.rover.v_ms,
                      "slope_max_deg": C.rover.slope_max_deg, "regen_enabled": C.rover.regen_enabled},
            "walker": {"mass_kg": w.W, "height_cm": w.H_cm, "age": w.age, "sex": w.sex, "suit_kg": w.L_suit,
                       "gear_kg": w.L_gear, "v_ms": w.v, "slope_max_deg": C.walker.slope_max_deg},
            "enable_ti_exclusion": C.routing.enable_ti_exclusion,
        },
        "points_note": "grade_deg and rough describe the segment ARRIVING at each point (0 / cell value at the first). "
                       "ref = models walked over these rounded points (same formulas as web/js/models).",
        "summary": summary,
        "routes": routes,
    }
    stats["total_seconds"] = round(time.time() - t0, 2)
    return doc, stats


def write(doc, path=OUT_PATH):
    pathlib.Path(path).write_text(json.dumps(doc, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    doc, stats = compute()
    write(doc)
    print(json.dumps(stats, indent=1))
    for pid, s in doc["summary"].items():
        print(f"{pid:22s} straight {s['straight_km']:7.2f} km | rover {s['rover']['out_km']:7.2f} km "
              f"{s['rover']['E_round_kWh']:6.1f} kWh {s['rover']['verdict']:13s} | walker {s['walker']['out_km']:7.2f} km "
              f"{s['walker']['n_evas']} EVAs {s['walker']['O2_required_L']:7.1f} L | same path {s['same_path_rover_walker']}")
    print(f"wrote {OUT_PATH.relative_to(ROOT)} ({OUT_PATH.stat().st_size / 1e6:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
