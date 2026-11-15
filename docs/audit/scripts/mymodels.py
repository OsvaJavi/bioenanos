"""Implementación INDEPENDIENTE de los modelos del spec v1.2 §6.2–6.6 (no importa nada del repo).
Constantes copiadas a mano del spec (§6.2, §6.3, §6.4–6.6, Apéndice D.5)."""
import math
G_MARS = 3.72076; RGAS = 188.92; T_K = 210.0; P0 = 610.0
# rover
M_CURB = 2092.0; CD = 0.23; AREA = 2.34; BATT = 96.0; RESERVE = 0.20
V_R = 5.0; ETA = 0.90; CRR = 0.15; K_ROUGH = 0.5; UA = 10.0; T_SET = 288.0; T_AMB = 210.0; P_AUX = 300.0; PAYLOAD = 350.0
# walker
F_G = 0.70; K_SUIT = 1.0; K_RW = 0.5; MINETTI = (280.5, -58.7, -76.8, 51.9, 19.6, 2.5)
RQ = 0.85; KA, KB = 4.039, 1.157; EVA_H = 8.0; RES_MIN = 30.0; CONT = 0.10; O2_KG_L = 0.001429
KCAL_DAY_W = 4184 / 86400; W_KCAL_MIN = 60 / 4184; J_KCAL = 1 / 4184

def atmos(z_km, T=T_K, p0=P0):
    H = RGAS * T / G_MARS / 1000; P = p0 * math.exp(-z_km / H)
    return dict(H_km=H, P_Pa=P, rho=P / (RGAS * T), Mcol_gcm2=0.1 * P / G_MARS)

def rover_seg(d, theta_deg, r, rho, payload=PAYLOAD, v=V_R, g=G_MARS, crr=CRR, aux=True):
    th = math.radians(theta_deg); m = M_CURB + payload
    F = m * g * crr * (1 + K_ROUGH * r) * math.cos(th) + m * g * math.sin(th) + 0.5 * rho * CD * AREA * v * v
    ew = F * d; ed = ew / ETA if ew > 0 else 0.0; t = d / v
    ea = (UA * (T_SET - T_AMB) + P_AUX) * t if aux else 0.0
    return dict(E_wheel_J=ew, E_drive_J=ed, E_aux_J=ea, E_total_J=ed + ea, t_s=t)

def rover_verdict(e_out, e_back):
    if e_out > BATT: return "NOT REACHABLE"
    if e_out + e_back <= (1 - RESERVE) * BATT: return "ROUND TRIP OK"
    return "ONE-WAY ONLY"

def Cw(G):
    a5, a4, a3, a2, a1, a0 = MINETTI
    return a5*G**5 + a4*G**4 + a3*G**3 + a2*G**2 + a1*G + a0

def walker_power(W, H, age, sex, Ls, Lg, v, G, r=0.0, fg=F_G, ks=K_SUIT):
    bmr = 10*W + 6.25*H - 5*age + (5 if sex == "M" else -161)
    pr = bmr * KCAL_DAY_W
    pl = fg * ks * Cw(G) * (W + Ls + Lg) * v * (1 + K_RW * r)
    return bmr, pr, pl, pr + pl

def vo2(P): return P * W_KCAL_MIN / (KA + KB * RQ)

def hr(age, hrrest, vo2max, vo2_mlkgmin):
    hrmax = 208 - 0.7 * age
    f = min(max((vo2_mlkgmin - 3.5) / (vo2max - 3.5), 0.0), 1.0)
    return hrrest + (hrmax - hrrest) * f

def sweat_Lh(P): return 0.75 * P * 0.30 / 2430 * 3600 / 1000

def core_temp(P, W, t, tc0=37.0):
    q = 0.75 * P; return tc0 + (q - min(q, 500.0)) / (W * 3470) * t

def o2_plan(segs, eva_h=EVA_H, res=RES_MIN, cont=CONT):
    """segs: lista de (t_s, O2_L) en orden. Implementación propia: n_evas por ceil exacto."""
    T = sum(t for t, _ in segs); O = sum(o for _, o in segs)
    n = max(1, math.ceil(T / (eva_h * 3600)))
    vm = O / (T / 60) if T > 0 else 0.0
    req = (O + n * res * vm) * (1 + cont)
    # por EVA
    # reparto por intervalos [t0, t1) de cada segmento contra las ventanas [k*lim, (k+1)*lim) (última abierta)
    per = [0.0] * n; clock = 0.0; lim = eva_h * 3600
    for t, o in segs:
        t0, t1 = clock, clock + t; clock = t1
        if t <= 0:
            per[min(int(t0 // lim), n - 1)] += o; continue
        for k in range(n):
            lo = k * lim; hi = (k + 1) * lim if k < n - 1 else math.inf
            ov = max(0.0, min(t1, hi) - max(t0, lo))
            per[k] += o * ov / t
    pe = [(p + res * vm) * (1 + cont) for p in per]
    return dict(t_round_h=T / 3600, n_evas=n, O2_metabolic_L=O, O2_required_L=req, O2_required_kg=req * O2_KG_L, O2_max_per_EVA_L=max(pe))
