"""Fase 5: paridad de 3 vías (mymodels propio / pipeline Python / web JS) + bordes del veredicto + O2.
Uso: python -I p5_parity.py <repo> <dir_salida>"""
import json, math, random, subprocess, sys, pathlib
HERE = pathlib.Path(__file__).parent; sys.path.insert(0, str(HERE)); import mymodels as M
repo = pathlib.Path(sys.argv[1]); A = pathlib.Path(sys.argv[2]); sys.path.insert(0, str(repo))
from pipeline import models_rover as pr, models_walker as pw

random.seed(7)
rover_in = []
for k in range(10000):
    th = random.choice([random.uniform(-10, 10), -10, 10, 0, random.uniform(-30, 30)])
    r = random.choice([0.0, 1.0, random.random()]); d = random.choice([0.0, 200.0, random.uniform(0, 600)])
    rover_in.append([d, th, r, random.uniform(-4300, -3600), random.choice([0, 537, 350, random.uniform(0, 537)])])
FI = dict(W=(45, 130), H_cm=(140, 210), age=(21, 65), L_suit=(0, 250), L_gear=(0, 100), v=(0.4, 1.6), hr_rest=(40, 100), k_suit=(1.0, 1.5))
walker_in = []
for k in range(10000):
    w = {f: random.choice([lo, hi, random.uniform(lo, hi)]) for f, (lo, hi) in FI.items()}
    w.update(sex=random.choice("MF"), vo2max=random.choice([30, 40, 47, 55]), f_g=0.7, RQ=0.85)
    walker_in.append([w, random.choice([0.0, 200.0, random.uniform(0, 600)]), random.choice([random.uniform(-20, 20), -20, 20, 0]), random.choice([0.0, 1.0, random.random()])])
o2_in = []
for k in range(500):
    n = random.randint(1, 400); segs = [[random.uniform(0, 600), random.uniform(0, 20)] for _ in range(n)]  # tramos realistas (H-01 aparte)
    o2_in.append([segs, dict(eva_limit_h=random.choice([1, 8, 12, random.randint(2, 24) / 2]), reserve_min=random.uniform(0, 120), contingency=random.uniform(0, 0.5))])
verdict_in = [[38.4, 38.4], [76.8, 0], [76.8 + 1e-9, 0], [76.79, 0.01 + 1e-12], [96, 0], [96 + 1e-9, 0], [80, 0], [80, 20],
              [60, 16.8], [60, 16.8 + 1e-9], [0, 0], [100, 0]]
payload_in = ["0", "537", "537.0001", "-1", "-0", "", "  ", "abc", "1e3", "0x10", "NaN", "Infinity", "350,5", "9" * 400, " 350 ", "1e2", "0b11", "0o7"]
inp = dict(rover=rover_in, walker=walker_in, o2=o2_in, verdict=verdict_in, payload=payload_in)
(A / "p5_inputs.json").write_text(json.dumps(inp))
js = json.loads(subprocess.check_output(["node", str(HERE / "p5_js_eval.mjs"), str(repo), str(A / "p5_inputs.json")]))


def rel(a, b):
    return abs(a - b) / max(abs(a), abs(b), 1e-300) if (a or b) else 0.0


res = {}


def upd(k, a, b):
    o = res.setdefault(k, [0.0, 0.0]); o[0] = max(o[0], abs(a - b)); o[1] = max(o[1], rel(a, b) if abs(a - b) > 1e-12 else 0)


neg = 0
for (d, th, r, z, p), j in zip(rover_in, js["rover"]):
    rho = M.atmos(z / 1000)["rho"]; m = M.rover_seg(d, th, r, rho, payload=p)
    q = pr.segment_energy(d, th, r, z_m=z, payload_kg=p)
    for i, k in enumerate(("E_drive_J", "E_aux_J", "E_total_J", "t_s")):
        upd(f"rover {k} propia-vs-Py", m[k], q[k]); upd(f"rover {k} Py-vs-JS", q[k], j[i])
    neg += m["E_total_J"] < 0 or q["E_total_J"] < 0 or j[2] < 0
for (w, d, th, r), j in zip(walker_in, js["walker"]):
    G = math.tan(math.radians(th))
    bmr, prr, pl, pt = M.walker_power(w["W"], w["H_cm"], w["age"], w["sex"], w["L_suit"], w["L_gear"], w["v"], G, r, w["f_g"], w["k_suit"])
    E = pt * d / w["v"]; O2 = M.vo2(pt) * (d / w["v"]) / 60
    pw_w = pw.Walker(W=w["W"], H_cm=w["H_cm"], age=w["age"], sex=w["sex"], L_suit=w["L_suit"], L_gear=w["L_gear"], v=w["v"],
                     k_suit=w["k_suit"], vo2max=w["vo2max"], hr_rest=w["hr_rest"])
    s = pw.segment(pw_w, d, th, r); mm = pw.metabolic(pw_w, G, r)
    hr = M.hr(w["age"], w["hr_rest"], w["vo2max"], M.vo2(pt) * 1000 / w["W"])
    upd("walker E_J propia-vs-Py", E, s["E_J"]); upd("walker E_J Py-vs-JS", s["E_J"], j[0])
    upd("walker O2_L propia-vs-Py", O2, s["O2_L"]); upd("walker O2_L Py-vs-JS", s["O2_L"], j[1])
    upd("walker HR propia-vs-Py", hr, float(mm["HR_bpm"])); upd("walker HR Py-vs-JS", float(mm["HR_bpm"]), j[4])
    upd("walker sweat Py-vs-JS", mm["sweat_L_h"], j[5]); upd("walker Tc(1h) propia-vs-JS", M.core_temp(pt, w["W"], 3600), j[6])
    assert all(math.isfinite(v) for v in j), (w, d, th, r, j)
nev_mis = 0
for (segs, plan), j in zip(o2_in, js["o2"]):
    m = M.o2_plan([tuple(s) for s in segs], plan["eva_limit_h"], plan["reserve_min"], plan["contingency"])
    q = pw.o2_plan([tuple(s) for s in segs], **plan)
    nev_mis += (m["n_evas"] != q["n_evas"]) + (q["n_evas"] != j[0])
    upd("o2 required propia-vs-Py", m["O2_required_L"], q["O2_required_L"]); upd("o2 required Py-vs-JS", q["O2_required_L"], j[1])
    upd("o2 max/EVA propia-vs-Py", m["O2_max_per_EVA_L"], q["O2_max_per_EVA_L"]); upd("o2 max/EVA Py-vs-JS", q["O2_max_per_EVA_L"], j[2])
for k, (ab, rl) in res.items():
    print(f"{k:32s} max abs {ab:.3e}  max rel {rl:.3e}")
print("energías negativas:", neg, "; n_evas distintos:", nev_mis)
print("\nVEREDICTO (E_out, E_back) -> propio | Py | JS")
for (a, b), j in zip(verdict_in, js["verdict"]):
    print(f"  {a!r:>22} {b!r:>22} -> {M.rover_verdict(a, b):14s} | {pr.verdict(a, b)[0]:14s} | {j}")
print("  nota: (1-0.20)*96 =", repr((1 - 0.20) * 96))
print("\nn_evas en el borde:")
for t in (8 * 3600, 8 * 3600 + 1, 8 * 3600 - 1, 16 * 3600, 8 * 3600 + 1e-6, 8 * 3600 + 1e-4):
    print(f"  t={t:.6f}s -> Py {pw.o2_plan([(t, 1.0)])['n_evas']}  propio(ceil exacto) {M.o2_plan([(t, 1.0)])['n_evas']}")
print("\nvalidatePayload (JS):", {k if len(k) < 20 else k[:6] + '...': v for k, v in zip(payload_in, js["payloadValidation"])})
doc = json.loads((repo / "web/data/routes.json").read_text(encoding="utf-8"))
print("\nRUTAS: error relativo vs ref (propia / Py / JS) y por segmento propia-vs-JS")
for r, jr, jseg in zip(doc["routes"], js["routes"], js["routeSegs"]):
    pts = r["points"]; tot = drive = o2 = 0.0; segerr = 0.0
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        d = 1000 * (b["s_km"] - a["s_km"])
        if r["mode"] == "rover":
            e = M.rover_seg(d, b["grade_deg"], b["rough"], M.atmos(0.5 * (a["z_m"] + b["z_m"]) / 1000)["rho"])
            tot += e["E_total_J"]; drive += e["E_drive_J"]; mine = e["E_total_J"]
        else:
            _, _, _, pt = M.walker_power(80, 180, 30, "M", 170, 10, 1.0, math.tan(math.radians(b["grade_deg"])), b["rough"])
            tot += pt * d; o2 += M.vo2(pt) * d / 60; mine = pt * d
        segerr = max(segerr, rel(mine, jseg[k]))
    if r["mode"] == "rover":
        py = pr.route_energy(pts); mine = {"E_total_kWh": tot / 3.6e6, "E_drive_kWh": drive / 3.6e6}
    else:
        py = pw.route_energy(pts); mine = {"E_kcal": tot / 4184, "O2_metabolic_L": o2}
    worst = {k: f"{rel(mine[k], r['ref'][k]):.1e}/{rel(py[k], r['ref'][k]):.1e}/{rel(jr[k], r['ref'][k]):.1e}" for k in mine}
    print(f"  {r['poi']:20s} {r['mode']:6s} {r['direction']:4s} seg {segerr:.1e} | {worst}")
