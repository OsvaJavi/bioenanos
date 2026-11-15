"""Optimal routes on the LEQ grid (spec M2, P-11, P-13, P-15).

Directed graph over grid cells, 16 neighbours (8 + knight moves). Edge a -> b:
    d_h   = sqrt((dx * k_x(phi_mid))^2 + dy^2)          (spec §3.3, real metres)
    dz    = z_b - z_a ;  d = sqrt(d_h^2 + dz^2) ;  theta = atan2(dz, d_h)
    r     = (r_a + r_b)/2 ;  z = (z_a + z_b)/2
    weight: rover E_total (Wh) or walker E (kcal), with P-11 default parameters; all weights > 0.
Hard cuts (P-13): |theta| > theta_max, or Horn slope > theta_max on the origin, the destination and, for knight
moves, the two intermediate cells; any NaN cell (nodata) on those cells; TI < ti_min if enable_ti_exclusion (P-15).
Shortest paths: scipy.sparse.csgraph.dijkstra — one run from the base on the graph (out routes) and one on the
transposed graph from the base (back routes), per mode.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

from pipeline import models_rover as mr
from pipeline import models_walker as mw
from pipeline.constants import C

KING = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
KNIGHT = [(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)]


def knight_intermediates(di, dj):
    """The two cells a knight move (di, dj) passes through (relative to the origin)."""
    if abs(di) == 1:          # (±1, ±2): one step along the row, then diagonally
        sj = int(math.copysign(1, dj))
        return (0, sj), (di, sj)
    si = int(math.copysign(1, di))  # (±2, ±1)
    return (si, 0), (si, dj)


def offsets(neighbors: int = None):
    n = C.routing.neighbors if neighbors is None else neighbors
    if n == 8:
        return KING
    if n == 16:
        return KING + KNIGHT
    raise ValueError("neighbors must be 8 or 16")


@dataclass
class Terrain:
    """Arrays on one grid (row 0 = north). z in metres, slope in degrees (Horn), r in [0,1]."""
    z: np.ndarray
    slope: np.ndarray
    rough: np.ndarray
    kx_rows: np.ndarray          # k_x(phi) per row
    lat_rows: np.ndarray         # latitude of each row centre (for k_x at edge midpoints)
    cell_m: float
    ti: np.ndarray = None

    @property
    def shape(self):
        return self.z.shape


def kx_at(lat_deg):
    return np.cos(np.radians(lat_deg)) / math.cos(math.radians(C.grid.phi0_deg))


def cell_ok(t: Terrain, slope_max_deg: float):
    ok = np.isfinite(t.z) & np.isfinite(t.slope) & np.isfinite(t.rough) & (t.slope <= slope_max_deg)
    if C.routing.enable_ti_exclusion and t.ti is not None:
        ok &= np.isfinite(t.ti) & (t.ti >= C.routing.ti_min)
    return ok


def edge_arrays(t: Terrain, di, dj, ok):
    """Vectorised geometry of all edges with offset (di, dj) whose endpoint cells are OK.
    Returns (src_flat, dst_flat, d_m, theta_deg, r, zmid, dh)."""
    nr, nc = t.shape
    i0, i1 = max(0, -di), nr - max(0, di)
    j0, j1 = max(0, -dj), nc - max(0, dj)
    ia = np.arange(i0, i1)[:, None]
    ja = np.arange(j0, j1)[None, :]
    ib, jb = ia + di, ja + dj
    valid = ok[ia, ja] & ok[ib, jb]
    if abs(di) + abs(dj) == 3:  # knight: both intermediate cells must be OK (P-13)
        (a1, b1), (a2, b2) = knight_intermediates(di, dj)
        valid &= ok[ia + a1, ja + b1] & ok[ia + a2, ja + b2]
    I, J = np.nonzero(valid)
    ia_v, ja_v = I + i0, J + j0
    ib_v, jb_v = ia_v + di, ja_v + dj
    za, zb = t.z[ia_v, ja_v], t.z[ib_v, jb_v]
    lat_mid = 0.5 * (t.lat_rows[ia_v] + t.lat_rows[ib_v])
    dx = dj * t.cell_m * kx_at(lat_mid)
    dy = di * t.cell_m
    dh = np.sqrt(dx * dx + dy * dy)
    dz = zb - za
    d = np.sqrt(dh * dh + dz * dz)
    theta = np.degrees(np.arctan2(dz, dh))
    r = 0.5 * (t.rough[ia_v, ja_v] + t.rough[ib_v, jb_v])
    zmid = 0.5 * (za + zb)
    return ia_v * nc + ja_v, ib_v * nc + jb_v, d, theta, r, zmid, dh


def edge_weight(mode, d, theta, r, zmid):
    if mode == "rover":
        return mr.segment_energy(d, theta, r, z_m=zmid)["E_total_J"] / mr.J_PER_WH  # Wh
    if mode == "walker":
        return mw.segment(mw.Walker(), d, theta, r)["E_kcal"]                        # kcal
    raise ValueError(mode)


def slope_max(mode):
    return C.rover.slope_max_deg if mode == "rover" else C.walker.slope_max_deg


def build_graph(t: Terrain, mode: str, neighbors: int = None):
    """CSR adjacency (N x N) with weights; also returns edge stats."""
    smax = slope_max(mode)
    ok = cell_ok(t, smax)
    srcs, dsts, ws = [], [], []
    n_cut_theta = 0
    for di, dj in offsets(neighbors):
        s, d_, dist, th, r, zm, _ = edge_arrays(t, di, dj, ok)
        keep = np.abs(th) <= smax
        n_cut_theta += int((~keep).sum())
        w = edge_weight(mode, dist[keep], th[keep], r[keep], zm[keep])
        srcs.append(s[keep])
        dsts.append(d_[keep])
        ws.append(w)
    src = np.concatenate(srcs)
    dst = np.concatenate(dsts)
    w = np.concatenate(ws)
    assert np.all(w > 0) and np.all(np.isfinite(w)), "all edge weights must be finite and > 0"
    n = t.z.size
    g = csr_matrix((w, (src, dst)), shape=(n, n))
    return g, {"n_nodes": n, "n_edges": int(w.size), "n_cells_ok": int(ok.sum()), "n_cut_theta": n_cut_theta}


def shortest_paths(g, source: int, targets, transposed: bool = False):
    """Dijkstra from `source`. transposed=False -> paths source -> target;
    transposed=True -> paths target -> source (run on g.T). Returns ({target: [nodes in travel order]}, {target: cost})."""
    gg = g.T.tocsr() if transposed else g
    dist, pred = dijkstra(gg, directed=True, indices=source, return_predecessors=True)
    paths, costs = {}, {}
    for tg in targets:
        if not np.isfinite(dist[tg]):
            paths[tg], costs[tg] = None, math.inf
            continue
        seq = [tg]
        while seq[-1] != source:
            seq.append(int(pred[seq[-1]]))
        # forward graph: seq is target..source -> reverse; transposed: seq is already target -> source
        paths[tg] = seq if transposed else seq[::-1]
        costs[tg] = float(dist[tg])
    return paths, costs


def path_cost(t: Terrain, mode: str, nodes):
    """Cost of a node sequence with the same edge formula (no cuts applied). Returns (cost, violates_cuts)."""
    nc = t.shape[1]
    smax = slope_max(mode)
    ok = cell_ok(t, smax)
    total = 0.0
    bad = False
    for a, b in zip(nodes, nodes[1:]):
        ia, ja = divmod(a, nc)
        ib, jb = divmod(b, nc)
        za, zb = t.z[ia, ja], t.z[ib, jb]
        lat_mid = 0.5 * (t.lat_rows[ia] + t.lat_rows[ib])
        dx = (jb - ja) * t.cell_m * float(kx_at(lat_mid))
        dy = (ib - ia) * t.cell_m
        dh = math.hypot(dx, dy)
        dz = zb - za
        d = math.hypot(dh, dz)
        th = math.degrees(math.atan2(dz, dh))
        r = 0.5 * (t.rough[ia, ja] + t.rough[ib, jb])
        total += float(edge_weight(mode, d, th, r, 0.5 * (za + zb)))
        if abs(th) > smax or not (ok[ia, ja] and ok[ib, jb]):
            bad = True
    return total, bad


def bresenham(i0, j0, i1, j1):
    """8-connected raster line between two cells (inclusive)."""
    cells = []
    di, dj = abs(i1 - i0), abs(j1 - j0)
    si, sj = (1 if i1 > i0 else -1), (1 if j1 > j0 else -1)
    err = dj - di
    i, j = i0, j0
    while True:
        cells.append((i, j))
        if i == i1 and j == j1:
            break
        e2 = 2 * err
        if e2 > -di:
            err -= di
            j += sj
        if e2 < dj:
            err += dj
            i += si
    return cells
