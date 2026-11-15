// Geodesy and the LEQ working grid — identical port of pipeline/geo.py (spec §3.1–3.3, §6.1).
// Coordinates: planetocentric lat °N, lon °E 0–360. One sphere R = C.geo.R_km (3388 km).
// LEQ: x_m = R·cos(phi0)·(lam − lam0), y_m = R·(phi − phi0). NOT isotropic: kx(lat) = cos(lat)/cos(phi0).
// Grid: 200 m cells, x ∈ [−113.4, 113.4] km (1134 cols), y ∈ [−77, 77] km (770 rows), row 0 = north.
// Leaflet (L.CRS.Simple, 1 unit = 1 km): L.latLng(y_km, x_km).
// Both snake_case (parity with Python) and camelCase names are exported; they are the same functions.
import { C } from './constants.js';

const DEG = Math.PI / 180;
const rad = (d) => d * DEG;
const deg = (r) => r / DEG;

const g = () => {
  if (!C) throw new Error('geo.js: constants not loaded');
  const cosPhi0 = Math.cos(rad(C.grid.phi0_deg));
  return { ...C.grid, R_km: C.geo.R_km, R_m: C.geo.R_km * 1000, cell_km: C.grid.cell_m / 1000, cosPhi0 };
};

// --- longitude conventions ---
export function lon_to_360(lon) {
  return ((lon % 360) + 360) % 360;
}
export function lon_to_180(lonE) {
  const lon = lon_to_360(lonE);
  return lon > 180 ? lon - 360 : lon;
}

// --- sphere / ellipsoid (context §9) ---
export function r_local(latDeg) {
  const p = rad(latDeg);
  const req = C.geo.R_eq_km, rpol = C.geo.R_pol_km;
  const num = (req ** 2 * Math.cos(p)) ** 2 + (rpol ** 2 * Math.sin(p)) ** 2;
  const den = (req * Math.cos(p)) ** 2 + (rpol * Math.sin(p)) ** 2;
  return Math.sqrt(num / den);
}

/** Haversine distance (km) and initial azimuth (deg). p = [lat °N, lon °E]. Returns [d_km, az_deg]. */
export function dist_az(p1, p2, R = C.geo.R_km) {
  const f1 = rad(p1[0]), l1 = rad(p1[1]), f2 = rad(p2[0]), l2 = rad(p2[1]);
  const df = f2 - f1, dl = l2 - l1;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  const d = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const az = (deg(Math.atan2(Math.sin(dl) * Math.cos(f2),
    Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl))) + 360) % 360;
  return [d, az];
}

// --- LEQ projection ---
function dlamRad(lonE) {
  const d = ((((lonE - C.grid.lam0_deg + 180) % 360) + 360) % 360) - 180;
  return rad(d);
}

/** [lat °N, lon °E] -> [x_m, y_m] (LEQ). Accepts lon in 0–360 or −180..180. */
export function ll_to_xy(lat, lon) {
  const G = g();
  return [G.R_m * G.cosPhi0 * dlamRad(lon), G.R_m * rad(lat - G.phi0_deg)];
}

/** [x_m, y_m] (LEQ) -> [lat °N, lon °E 0–360]. Exact inverse of ll_to_xy. */
export function xy_to_ll(x_m, y_m) {
  const G = g();
  const lat = G.phi0_deg + deg(y_m / G.R_m);
  const lon = lon_to_360(G.lam0_deg + deg(x_m / (G.R_m * G.cosPhi0)));
  return [lat, lon];
}

export function kx(lat) {
  return Math.cos(rad(lat)) / g().cosPhi0;
}

export function horizontal_distance_m(x1, y1, x2, y2) {
  const latMid = xy_to_ll(0, 0.5 * (y1 + y2))[0];
  return Math.hypot((x2 - x1) * kx(latMid), y2 - y1);
}

// --- grid ---
/** Row i (0 = north), col j -> [x_km, y_km] of the cell centre. */
export function cell_center(i, j) {
  const G = g();
  return [G.x_min_km + G.cell_km * (j + 0.5), G.y_max_km - G.cell_km * (i + 0.5)];
}

const round9 = (v) => Math.round(v * 1e9) / 1e9;

/** [x_km, y_km] -> [i, j] of the containing cell (may be outside the grid: check in_grid). */
export function xy_to_cell(x_km, y_km) {
  const G = g();
  return [Math.floor(round9((G.y_max_km - y_km) / G.cell_km)), Math.floor(round9((x_km - G.x_min_km) / G.cell_km))];
}

export function in_grid(i, j) {
  const G = g();
  return i >= 0 && i < G.nrows && j >= 0 && j < G.ncols;
}

export function ll_to_cell(lat, lon) {
  const [x, y] = ll_to_xy(lat, lon);
  return xy_to_cell(x / 1000, y / 1000);
}

// --- Leaflet helpers (km units) ---
/** [lat, lon] -> [x_km, y_km]. */
export function llToXYkm(lat, lon) {
  const [x, y] = ll_to_xy(lat, lon);
  return [x / 1000, y / 1000];
}
/** [x_km, y_km] -> [lat, lon]. */
export function xyKmToLL(x_km, y_km) {
  return xy_to_ll(x_km * 1000, y_km * 1000);
}

// camelCase aliases (spec §3.3 / M3 use llToXY / xyToLL; units are metres, like Python).
export {
  lon_to_360 as lonTo360, lon_to_180 as lonTo180, r_local as rLocal, dist_az as distAz,
  ll_to_xy as llToXY, xy_to_ll as xyToLL, horizontal_distance_m as horizontalDistanceM,
  cell_center as cellCenter, xy_to_cell as xyToCell, in_grid as inGrid, ll_to_cell as llToCell,
};
