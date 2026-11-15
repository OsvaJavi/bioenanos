"""T-M0-03: G-ATM-1 (and G-ENV-1 for dose_mGy) in Python."""
import json
import math
import pathlib

import numpy as np
import pytest

from pipeline.atmos import atmos, dose_mGy, env_fixed, shield_column_gcm2

G = pathlib.Path(__file__).resolve().parents[2] / "tests/golden"


def test_g_atm_1():
    for c in json.loads((G / "atmos.json").read_text())["cases"]:
        got = atmos(c["z_km"], T=c["T"], P0=c["P0"])
        for k, exp in c["expect"].items():
            assert abs(got[k] - exp) <= c["tol"][k], (c["id"], k, got[k], exp)


def test_g_env_1():
    for c in json.loads((G / "env.json").read_text())["cases"]:
        got = dose_mGy(c["t_h"], c["rate_mGy_day"])
        assert abs(got - c["expect"]["dose_mGy"]) <= c["tol"]["dose_mGy"]
    assert dose_mGy(8.0) == pytest.approx(0.071)


def test_context_barometric_table():
    """Context §5.1 table (claimed verified to <= 0.2 Pa / 0.01 g/cm2).
    [DISCREPANCIA found by M0] the PM-7 row (z = -2.3 km) lists 757.3 Pa; the model gives 756.85 Pa
    (-0.45 Pa, 0.06 %). Every other row matches to <= 0.03 Pa. PM-7 is outside the project bbox, so this
    is reported, not fixed; that row is checked at 0.5 Pa."""
    table = [(0.0, 610.0, 0.0154, 16.39, 0.2), (-2.3, 757.3, 0.0191, 20.35, 0.5), (-3.2, 823.5, 0.0208, 22.13, 0.2),
             (-4.0, 887.7, 0.0224, 23.86, 0.2), (-4.3, 913.0, 0.0230, 24.54, 0.2)]
    for z, P, rho, M, tolP in table:
        a = atmos(z)
        assert abs(a["P_Pa"] - P) <= tolP and abs(a["rho"] - rho) <= 0.00006 and abs(a["Mcol_gcm2"] - M) <= 0.01


def test_shield_column_matches_atmos_and_handles_nan():
    z = np.array([-3900.0, np.nan, 0.0])
    out = shield_column_gcm2(z)
    assert out[0] == pytest.approx(atmos(-3.9)["Mcol_gcm2"])
    assert math.isnan(out[1])
    assert out[2] == pytest.approx(atmos(0.0)["Mcol_gcm2"])
    assert shield_column_gcm2(-3900.0) == pytest.approx(atmos(-3.9)["Mcol_gcm2"])


def test_env_fixed():
    e = env_fixed(-3.9)
    assert e["T_K"] == 210.0 and e["irr_tau04_Wm2"] == 185.3 and e["irr_tau20_Wm2"] == 27.5
    assert e["P_Pa"] == pytest.approx(879.384, abs=0.2)
