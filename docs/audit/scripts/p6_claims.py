"""Fase 6: cifras del README / DEMO_SCRIPT recalculadas con mymodels (independiente). Uso: python -I -X utf8 p6_claims.py <repo>"""
import json, math, sys, pathlib
HERE = pathlib.Path(__file__).parent; sys.path.insert(0, str(HERE)); import mymodels as M
repo = pathlib.Path(sys.argv[1]); doc = json.loads((repo / "web/data/routes.json").read_text(encoding="utf-8"))
get = lambda pid, m, d: next(x for x in doc["routes"] if x["poi"] == pid and x["mode"] == m and x["direction"] == d)
for pid in doc["summary"]:
    print(f"{pid:20s} rover out {get(pid,'rover','out')['length_km_3d']:.1f} km ; walker out {get(pid,'walker','out')['length_km_3d']:.1f} km ; recta {doc['summary'][pid]['straight_km']}"
          f" ; +{100*(get(pid,'rover','out')['length_km_3d']/doc['summary'][pid]['straight_km']-1):.1f} %")
def rover_round(pid, crr=M.CRR, eta=M.ETA):
    old = M.CRR, M.ETA; M.CRR, M.ETA = crr, eta
    e = [sum(M.rover_seg(1000*(q["s_km"]-p["s_km"]), q["grade_deg"], q["rough"], M.atmos(0.5*(p["z_m"]+q["z_m"])/1000)["rho"], crr=crr)["E_total_J"]
             for p, q in zip(r["points"], r["points"][1:])) / 3.6e6 for r in (get(pid, "rover", "out"), get(pid, "rover", "back"))]
    M.CRR, M.ETA = old; return e
print("\nSensibilidad AP-9 (README):")
for crr in (0.08, 0.15, 0.30):
    eo, eb = rover_round("AP-9", crr=crr); print(f"  crr {crr}: {eo+eb:.1f} kWh {M.rover_verdict(eo, eb)}")
for eta in (0.80, 0.90, 0.95):
    eo, eb = rover_round("AP-9", eta=eta); print(f"  eta {eta}: {eo+eb:.1f} kWh {M.rover_verdict(eo, eb)}")
def walk(pid, v=1.0, fg=M.F_G):
    segs, P = [], []
    for d in ("out", "back"):
        r = get(pid, "walker", d)
        for p, q in zip(r["points"], r["points"][1:]):
            _, _, _, pt = M.walker_power(80, 180, 30, "M", 170, 10, v, math.tan(math.radians(q["grade_deg"])), q["rough"], fg=fg)
            dd = 1000 * (q["s_km"] - p["s_km"]); segs.append((dd / v, M.vo2(pt) * dd / v / 60)); P.append((pt, dd / v))
    return M.o2_plan(segs), P
for fg in (0.56, 0.70, 0.84):
    o, _ = walk("AP-9", fg=fg); print(f"  f_g {fg}: {o['O2_required_L']:.0f} L, {o['n_evas']} EVAs")
print("\nDEMO_SCRIPT AP-9 a pie:")
for v in (1.0, 1.3):
    o, P = walk("AP-9", v=v)
    # temperatura central con reinicio por EVA (spec §6.6), tramo a tramo
    tc, tmax, clock, lim = 37.0, 37.0, 0.0, 8 * 3600
    for pt, t in P:
        while t > 0:
            take = min(t, lim - (clock % lim)); tc = M.core_temp(pt, 80, take, tc); tmax = max(tmax, tc); clock += take; t -= take
            if abs(clock % lim) < 1e-6: tc = 37.0
    print(f"  v={v}: t={o['t_round_h']:.1f} h, {o['n_evas']} EVAs, O2 {o['O2_required_L']:.0f} L, {o['O2_metabolic_L']/o['t_round_h']:.0f} L/h, "
          f"P max {max(p for p, _ in P):.0f} W, P min {min(p for p, _ in P):.0f} W, Tc max {tmax:.1f} °C")
