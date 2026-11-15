"""Geodesy and the LEQ working grid (spec §3.1–3.3, §6.1).

Conventions
- Coordinates: planetocentric, lat °N, lon °E in 0–360. Use lon_to_180 / lon_to_360 to convert;
  this module (and web/js/geo.js) is the ONLY place where that conversion lives.
- One sphere for all project distances: R = C.geo.R_km = 3388.0 km (= R_local(40°N) of the context).
  Source rasters (USGS) use a 3396.19 km sphere: never mix radii (see AGENTS.md rule 6).
- LEQ: local equirectangular, phi0 = 40.0°N, lam0 = 203.0°E:
      x_m = R_m * cos(phi0) * (lam - lam0)     y_m = R_m * (phi - phi0)      (radians)
  LEQ is NOT isotropic: one LEQ metre in x equals kx(lat) = cos(lat)/cos(phi0) real metres.
- Grid: 200 m cells, x in [-113.4, 113.4] km (1134 cols), y in [-77, 77] km (770 rows), row 0 = north.
"""
from __future__ import annotations

from math import asin, atan2, cos, degrees, floor, radians, sin, sqrt

from pipeline.constants import C

R_KM = C.geo.R_km
R_M = R_KM * 1000.0
PHI0_DEG = C.grid.phi0_deg
LAM0_DEG = C.grid.lam0_deg
CELL_KM = C.grid.cell_m / 1000.0
X_MIN_KM, X_MAX_KM = C.grid.x_min_km, C.grid.x_max_km
Y_MIN_KM, Y_MAX_KM = C.grid.y_min_km, C.grid.y_max_km
NCOLS, NROWS = C.grid.ncols, C.grid.nrows
_COS_PHI0 = cos(radians(PHI0_DEG))


# --- longitude conventions -------------------------------------------------
def lon_to_360(lon: float) -> float:
    """Any longitude -> [0, 360)."""
    return lon % 360.0


def lon_to_180(lon_e: float) -> float:
    """Longitude °E (0–360) -> (-180, 180]. AP-1: 202.10 -> -157.90."""
    lon = lon_e % 360.0
    return lon - 360.0 if lon > 180.0 else lon


# --- sphere / ellipsoid (copied from context §9) ---------------------------
def r_local(lat_deg: float) -> float:
    """Geocentric radius of the IAU/MOLA ellipsoid at lat (km). r_local(40) -> 3388.002."""
    p = radians(lat_deg)
    req, rpol = C.geo.R_eq_km, C.geo.R_pol_km
    num = (req**2 * cos(p)) ** 2 + (rpol**2 * sin(p)) ** 2
    den = (req * cos(p)) ** 2 + (rpol * sin(p)) ** 2
    return sqrt(num / den)


def dist_az(p1, p2, R: float = R_KM):
    """Haversine distance (km) and initial azimuth (° from N, clockwise). p = (lat °N, lon °E)."""
    f1, l1 = map(radians, p1)
    f2, l2 = map(radians, p2)
    df, dl = f2 - f1, l2 - l1
    a = sin(df / 2) ** 2 + cos(f1) * cos(f2) * sin(dl / 2) ** 2
    d = 2 * R * atan2(sqrt(a), sqrt(1 - a))
    az = (degrees(atan2(sin(dl) * cos(f2), cos(f1) * sin(f2) - sin(f1) * cos(f2) * cos(dl))) + 360) % 360
    return d, az


def gc_interpolate(p1, p2, f: float):
    """Point at fraction f in [0,1] along the great circle p1->p2 (lat °N, lon °E 0–360)."""
    f1, l1 = map(radians, p1)
    f2, l2 = map(radians, p2)
    d = 2 * asin(sqrt(sin((f2 - f1) / 2) ** 2 + cos(f1) * cos(f2) * sin((l2 - l1) / 2) ** 2))
    if d == 0:
        return p1[0], lon_to_360(p1[1])
    a = sin((1 - f) * d) / sin(d)
    b = sin(f * d) / sin(d)
    x = a * cos(f1) * cos(l1) + b * cos(f2) * cos(l2)
    y = a * cos(f1) * sin(l1) + b * cos(f2) * sin(l2)
    z = a * sin(f1) + b * sin(f2)
    return degrees(atan2(z, sqrt(x * x + y * y))), lon_to_360(degrees(atan2(y, x)))


# --- LEQ projection --------------------------------------------------------
def _dlam_rad(lon_e: float) -> float:
    """lon - lam0 in radians, wrapped to (-pi, pi] so 0/360 seams never bite."""
    d = (lon_e - LAM0_DEG + 180.0) % 360.0 - 180.0
    return radians(d)


def ll_to_xy(lat: float, lon: float):
    """(lat °N, lon °E) -> (x_m, y_m) in LEQ. Accepts lon in 0–360 or -180..180."""
    return R_M * _COS_PHI0 * _dlam_rad(lon), R_M * radians(lat - PHI0_DEG)


def xy_to_ll(x_m: float, y_m: float):
    """(x_m, y_m) LEQ -> (lat °N, lon °E 0–360). Exact inverse of ll_to_xy."""
    lat = PHI0_DEG + degrees(y_m / R_M)
    lon = lon_to_360(LAM0_DEG + degrees(x_m / (R_M * _COS_PHI0)))
    return lat, lon


def kx(lat: float) -> float:
    """Real metres per LEQ metre in x at latitude lat: cos(lat)/cos(phi0)."""
    return cos(radians(lat)) / _COS_PHI0


def horizontal_distance_m(x1_m, y1_m, x2_m, y2_m) -> float:
    """Real horizontal length between two LEQ points (spec §3.3): sqrt((dx*kx(phi_mid))^2 + dy^2)."""
    lat_mid = xy_to_ll(0.0, 0.5 * (y1_m + y2_m))[0]
    return sqrt(((x2_m - x1_m) * kx(lat_mid)) ** 2 + (y2_m - y1_m) ** 2)


# --- grid ------------------------------------------------------------------
def cell_center(i: int, j: int):
    """Row i (0 = north), column j -> cell centre (x_km, y_km)."""
    return X_MIN_KM + CELL_KM * (j + 0.5), Y_MAX_KM - CELL_KM * (i + 0.5)


def xy_to_cell(x_km: float, y_km: float):
    """(x_km, y_km) -> (i, j) of the containing cell. May be outside the grid: check with in_grid()."""
    # Round to 1e-9 cells first so values exactly on an edge are stable across Python/JS.
    j = floor(round((x_km - X_MIN_KM) / CELL_KM, 9))
    i = floor(round((Y_MAX_KM - y_km) / CELL_KM, 9))
    return i, j


def in_grid(i: int, j: int) -> bool:
    return 0 <= i < NROWS and 0 <= j < NCOLS


def ll_to_cell(lat: float, lon: float):
    """Convenience: (lat, lon) -> (i, j)."""
    x_m, y_m = ll_to_xy(lat, lon)
    return xy_to_cell(x_m / 1000.0, y_m / 1000.0)
