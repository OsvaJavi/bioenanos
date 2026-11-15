"""Fase 5: bucle infinito en o2_plan / o2Plan. Réplica EXACTA del bucle del repo (pipeline/models_walker.py:118-130)
con un tope de iteraciones para diagnosticar, y búsqueda de valores del formulario (EVA limit) que lo disparan con las
rutas reales. Uso: python -I p5_o2_hang.py <repo> <dir_salida>"""
import json, math, sys, pathlib
repo = pathlib.Path(sys.argv[1]); A = pathlib.Path(sys.argv[2]); sys.path.insert(0, str(repo))
from pipeline import models_walker as pw


def loop_iters(segments, eva_limit_h, cap=100000):
    t_total = sum(t for t, _ in segments)
    n_evas = max(1, math.ceil(round(t_total / 3600.0 / eva_limit_h, 9)))
    lim = eva_limit_h * 3600.0
    clock = 0.0; it = 0
    for t, o in segments:
        rem_t, rem_o = t, o
        while rem_t > 1e-12:
            it += 1
            if it > cap:
                k = min(int(clock // lim), n_evas - 1)
                return it, dict(clock=clock, k=k, boundary=(k + 1) * lim, room=(k + 1) * lim - clock, rem_t=rem_t)
            k = min(int(clock // lim), n_evas - 1)
            room = (k + 1) * lim - clock if k < n_evas - 1 else rem_t
            take = min(rem_t, room)
            frac = take / rem_t
            rem_o -= rem_o * frac; rem_t -= take; clock += take
    return it, None


case = json.loads((A / "o2_case13.json").read_text())
print("caso aleatorio 13:", loop_iters([tuple(s) for s in case[0]], case[1]["eva_limit_h"]))

doc = json.loads((repo / "web/data/routes.json").read_text(encoding="utf-8"))
w = pw.Walker()
found = []
for poi in ["AP-9", "APMR", "HCP_ESP_037655_2210", "AP-8", "US1_FRONT"]:
    segs = []
    for d in ("out", "back"):
        r = next(x for x in doc["routes"] if x["poi"] == poi and x["mode"] == "walker" and x["direction"] == d)
        p = r["points"]
        for a, b in zip(p, p[1:]):
            s = pw.segment(w, 1000 * (b["s_km"] - a["s_km"]), b["grade_deg"], b["rough"]); segs.append((s["t_s"], s["O2_L"]))
    for k in range(100, 1201):          # EVA limit 1.00 … 12.00 h en pasos de 0.01 (el campo acepta cualquier decimal)
        lim = k / 100
        it, info = loop_iters(segs, lim)
        if info:
            found.append((poi, lim, info))
print(f"valores de EVA limit (1.00–12.00, paso 0.01) que cuelgan con el astronauta por defecto: {len(found)}")
for f in found[:15]:
    print("  ", f[0], f[1], {k: (round(v, 6) if isinstance(v, float) else v) for k, v in f[2].items()})
(A / "o2_hang_cases.json").write_text(json.dumps([[f[0], f[1]] for f in found]))
