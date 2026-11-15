"""Fase 5: vectores dorados reproducidos con mymodels.py (independiente)."""
import json, math, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import mymodels as M
repo = pathlib.Path(sys.argv[1]); gold = lambda f: json.loads((repo / "tests/golden" / f).read_text(encoding="utf-8"))
rows = []
def chk(id_, k, got, exp, tol): rows.append((id_, k, got, exp, tol, abs(got - exp) <= tol))
for c in gold("rover.json")["cases"]:
    ins = c["input"] if isinstance(c["input"], list) else [c["input"]]
    outs = [M.rover_seg(i["d_m"], i["theta_deg"], i["r"], i["rho"], payload=i["payload_kg"], v=i["v_ms"], g=i.get("g", M.G_MARS), crr=i.get("crr", M.CRR), aux=i.get("aux", True)) for i in ins]
    if c["id"] == "G-ROV-2":
        k = outs[0]["E_total_J"] / 3.6e6; chk(c["id"], "kWh_per_100km", k, c["expect"]["kWh_per_100km"], c["tol"]["kWh_per_100km"])
        rows.append((c["id"], "en rango", k, c["expect"]["range"], "", c["expect"]["range"][0] <= k <= c["expect"]["range"][1])); continue
    for key, exp in c["expect"].items():
        exps = exp if isinstance(exp, list) else [exp]
        for o, e in zip(outs, exps): chk(c["id"], key, o[key.replace("kWh", "J")] / 3.6e6, e, c["tol"][key])
W = gold("walker.json")["cases"]
for c in W:
    i = c["input"]
    if c["fn"] == "C_w":
        for g, e in zip(i, c["expect"]): chk(c["id"], f"Cw({g})", M.Cw(g), e, c["tol"])
        if "also" in c:
            mn = min(M.Cw(-0.364 + 0.728 * k / 200000) for k in range(200001)); chk(c["id"], "min Cw", mn, c["also"]["min_over_range"]["expect_min"], 0.001)
    if c["fn"] == "metabolic":
        bmr, pr, pl, pt = M.walker_power(i["W"], i["H_cm"], i["age"], i["sex"], i["L_suit"], i["L_gear"], i["v"], i["G"], i["r"], i["f_g"], i["k_suit"])
        v = M.vo2(pt); got = dict(BMR_kcal_day=bmr, P_rest_W=pr, P_loco_W=pl, P_total_W=pt, kcal_per_min=pt * M.W_KCAL_MIN, VO2_Lmin=v, VO2_mlkgmin=v * 1000 / i["W"], sweat_L_h=M.sweat_Lh(pt))
        if "vo2max" in i: got["HR_bpm"] = M.hr(i["age"], i["hr_rest"], i["vo2max"], v * 1000 / i["W"])
        for k, e in c["expect"].items(): chk(c["id"], k, got[k], e, c["tol"][k])
ref = dict(W=80, H=180, age=30, sex="M", Ls=170, Lg=0, v=1.0)
_, _, _, P0 = M.walker_power(80, 180, 30, "M", 170, 0, 1.0, 0.0)
for c in W:
    if c["id"] == "G-WLK-3":
        t = 1000 / 1.0; chk(c["id"], "t_s", t, 1000, 1e-9); chk(c["id"], "O2_metabolic_L", M.vo2(P0) * t / 60, c["expect"]["O2_metabolic_L"], 0.1); chk(c["id"], "kcal", P0 * t * M.J_KCAL, c["expect"]["kcal"], 0.1)
    if c["fn"] == "o2_plan":
        d = c["input"]["round_trip_m"]; n = 1000; segs = [(d / n, M.vo2(P0) * d / n / 60)] * n
        p = M.o2_plan(segs)
        for k, e in c["expect"].items():
            if k == "single_eva_feasible": rows.append((c["id"], k, p["n_evas"] == 1, e, "", (p["n_evas"] == 1) == e))
            elif k == "n_evas": rows.append((c["id"], k, p[k], e, "", p[k] == e))
            else: chk(c["id"], k, p[k], e, c["tol"][k])
    if c["id"] == "G-BIO-1":
        tc = M.core_temp(1000, 80, 3600); chk(c["id"], "Tc_C", tc, c["expect"]["Tc_C"], c["tol"]["Tc_C"]); rows.append((c["id"], "alert", tc > 38.5, True, "", tc > 38.5))
a = M.atmos(-3.9); c = gold("atmos.json")["cases"][0]
for k, e in c["expect"].items(): chk("G-ATM-1", k, a[k], e, c["tol"][k])
chk("G-ENV-1", "dose_mGy", 0.213 * 8 / 24, 0.071, 0.001)
fails = [r for r in rows if not r[5]]
for r in rows: print(("OK  " if r[5] else "FAIL"), r[0], r[1], "got", r[2] if not isinstance(r[2], float) else round(r[2], 6), "exp", r[3], "tol", r[4])
print(f"\n{len(rows)} comprobaciones, {len(fails)} fallos")
