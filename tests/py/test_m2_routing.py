"""M2 routing on SYNTHETIC DEMs (spec M2 phase A): plane, 3° tilted plane, 15° wall with a gap, basin.
T-M2-04 (cuts), T-M2-05 (wall: rover around, walker over), T-M2-07 (optimum <= Bresenham line), determinism,
knight-move intermediate cells (P-13)."""
import math

import numpy as np
import pytest

from pipeline import derive_layers as dl
from pipeline import routing as rt
from pipeline.constants import C

CELL = 200.0


def terrain(z, rough=None, lat0=40.0):
    nr, nc = z.shape
    lat_rows = lat0 - np.degrees((np.arange(nr) + 0.5) * CELL / (C.geo.R_km * 1000))
    kx = rt.kx_at(lat_rows)
    return rt.Terrain(z=z.astype("float64"), slope=dl.slope_deg(z.astype("float64"), CELL, kx),
                      rough=np.zeros_like(z, dtype="float64") if rough is None else rough,
                      kx_rows=kx, lat_rows=lat_rows, cell_m=CELL)


def node(t, i, j):
    return i * t.shape[1] + j


def route(t, mode, a, b, back=False):
    g, _ = rt.build_graph(t, mode)
    src, dst = node(t, *a), node(t, *b)
    paths, costs = rt.shortest_paths(g, src, [dst], transposed=back)
    return paths[dst], costs[dst]


def check_cuts(t, mode, nodes):
    """T-M2-04: every edge respects |theta| <= max and P-13 cell rules (incl. knight intermediates)."""
    nc = t.shape[1]
    smax = rt.slope_max(mode)
    ok = rt.cell_ok(t, smax)
    for a, b in zip(nodes, nodes[1:]):
        ia, ja = divmod(a, nc)
        ib, jb = divmod(b, nc)
        di, dj = ib - ia, jb - ja
        assert (di, dj) in rt.offsets(), (di, dj)
        cells = [(ia, ja), (ib, jb)]
        if abs(di) + abs(dj) == 3:
            cells += [(ia + x, ja + y) for x, y in rt.knight_intermediates(di, dj)]
        assert all(ok[c] for c in cells), cells
        dh = math.hypot(dj * CELL * float(rt.kx_at(0.5 * (t.lat_rows[ia] + t.lat_rows[ib]))), di * CELL)
        assert abs(math.degrees(math.atan2(t.z[ib, jb] - t.z[ia, ja], dh))) <= smax + 1e-9


def bresenham_cost(t, mode, a, b):
    cells = rt.bresenham(*a, *b)
    return rt.path_cost(t, mode, [node(t, i, j) for i, j in cells])


# --- geometry helpers -------------------------------------------------------------------------
def test_knight_intermediates():
    assert rt.knight_intermediates(1, 2) == ((0, 1), (1, 1))
    assert rt.knight_intermediates(-1, -2) == ((0, -1), (-1, -1))
    assert rt.knight_intermediates(2, 1) == ((1, 0), (1, 1))
    assert rt.knight_intermediates(-2, 1) == ((-1, 0), (-1, 1))
    assert len(rt.offsets()) == 16 and len(set(rt.offsets())) == 16


def test_bresenham_endpoints_and_connectivity():
    cells = rt.bresenham(3, 2, 10, 30)
    assert cells[0] == (3, 2) and cells[-1] == (10, 30)
    for (a, b), (c, d) in zip(cells, cells[1:]):
        assert max(abs(c - a), abs(d - b)) == 1


# --- plane ------------------------------------------------------------------------------------
@pytest.mark.parametrize("mode", ["rover", "walker"])
def test_plane_straight(mode):
    t = terrain(np.full((40, 70), -3900.0))
    nodes, cost = route(t, mode, (20, 5), (20, 65))
    rows = {n // 70 for n in nodes}
    assert rows == {20}
    check_cuts(t, mode, nodes)
    bc, bad = bresenham_cost(t, mode, (20, 5), (20, 65))
    assert not bad and cost <= bc * (1 + 1e-12)


@pytest.mark.parametrize("mode", ["rover", "walker"])
def test_plane_diagonal_uses_knight_moves_and_is_near_straight(mode):
    """Knight moves reduce the directional bias: a 1:2 diagonal over a plane costs ~ the true distance."""
    t = terrain(np.full((50, 90), -3900.0))
    nodes, cost = route(t, mode, (5, 5), (45, 85))
    check_cuts(t, mode, nodes)
    flat = rt.edge_weight(mode, 1.0, 0.0, 0.0, -3900.0)  # cost per metre
    true_len = math.hypot(40 * CELL, 80 * CELL)  # kx ~ 1 here
    assert cost / flat <= true_len * 1.01


# --- tilted plane 3° --------------------------------------------------------------------------
def test_tilted_plane_out_back_asymmetry():
    nr, nc = 40, 80
    j = np.arange(nc)[None, :] * CELL
    z = -3900.0 + np.tan(np.radians(3.0)) * j + np.zeros((nr, 1))
    t = terrain(z)
    for mode in ("rover", "walker"):
        out, c_out = route(t, mode, (20, 5), (20, 75))           # uphill to the east
        back, c_back = route(t, mode, (20, 5), (20, 75), back=True)
        assert out[0] == node(t, 20, 5) and out[-1] == node(t, 20, 75)
        assert back[0] == node(t, 20, 75) and back[-1] == node(t, 20, 5)
        assert c_out > c_back  # climbing costs more than descending
        check_cuts(t, mode, out)
        check_cuts(t, mode, back)
        bc, bad = bresenham_cost(t, mode, (20, 5), (20, 75))
        assert not bad and c_out <= bc * (1 + 1e-12)


# --- 15° wall with a gap (T-M2-05) --------------------------------------------------------------
@pytest.fixture(scope="module")
def wall():
    nr, nc = 60, 80
    jj = np.arange(nc)[None, :]
    ridge = np.maximum(0.0, 200.0 - np.abs(jj - 40) * CELL * math.tan(math.radians(15.0)))
    z = np.full((nr, nc), -3900.0) + ridge
    z[48:, :] = -3900.0  # the gap: rows 48..59 are flat
    return terrain(z)


def crosses_ridge_at_rows(t, nodes, col=40):
    """Rows where the path crosses column `col` (a node on it, or a step jumping over it)."""
    nc = t.shape[1]
    rows = set()
    for a, b in zip(nodes, nodes[1:]):
        (ia, ja), (ib, jb) = divmod(a, nc), divmod(b, nc)
        if ja == col:
            rows.add(ia)
        if min(ja, jb) < col < max(ja, jb):
            rows.update((ia, ib))
    if nodes and nodes[-1] % nc == col:
        rows.add(nodes[-1] // nc)
    return sorted(rows)


def test_wall_rover_goes_through_gap(wall):
    nodes, _ = route(wall, "rover", (10, 10), (10, 70))
    check_cuts(wall, "rover", nodes)
    rows = crosses_ridge_at_rows(wall, nodes)
    assert rows and min(rows) >= 48, rows
    assert float(np.nanmax(wall.slope[:40, 36:45])) > 10  # the flanks are really steeper than the rover cut


def test_wall_walker_climbs_over(wall):
    nodes, cost = route(wall, "walker", (10, 10), (10, 70))
    check_cuts(wall, "walker", nodes)
    rows = crosses_ridge_at_rows(wall, nodes)
    assert rows and max(rows) < 48, rows
    bc, bad = bresenham_cost(wall, "walker", (10, 10), (10, 70))
    assert bad or cost <= bc * (1 + 1e-12)


def test_wall_rover_straight_line_violates_cuts(wall):
    _, bad = bresenham_cost(wall, "rover", (10, 10), (10, 70))
    assert bad  # T-M2-07 exception case: the straight line is not allowed


# --- basin --------------------------------------------------------------------------------------
@pytest.mark.parametrize("mode", ["rover", "walker"])
def test_basin_optimum_not_worse_than_straight(mode):
    nr, nc = 60, 90
    ii, jj = np.mgrid[0:nr, 0:nc]
    z = -3900.0 - 150.0 * np.exp(-(((ii - 30) / 8.0) ** 2 + ((jj - 45) / 8.0) ** 2))
    t = terrain(z)
    nodes, cost = route(t, mode, (30, 5), (30, 85))
    check_cuts(t, mode, nodes)
    bc, bad = bresenham_cost(t, mode, (30, 5), (30, 85))
    assert bad or cost <= bc * (1 + 1e-12)
    # Note: without regeneration a basin is NOT pure loss — on slopes below atan(crr) ≈ 8.5° the descent only
    # offsets rolling resistance, so the optimum may cross it. Only optimality vs the straight line is asserted.


# --- unreachable, nodata, determinism -------------------------------------------------------------
def test_nodata_blocks_and_unreachable_is_reported():
    z = np.full((20, 30), -3900.0)
    z[:, 15] = np.nan
    t = terrain(z)
    g, _ = rt.build_graph(t, "rover")
    paths, costs = rt.shortest_paths(g, node(t, 10, 2), [node(t, 10, 27)])
    # knight moves can jump one column, but P-13 requires the intermediate cells to be valid
    assert paths[node(t, 10, 27)] is None and math.isinf(costs[node(t, 10, 27)])


def test_determinism():
    rng = np.random.default_rng(0)
    z = -3900 + np.cumsum(rng.normal(0, 3, (50, 60)), axis=1)
    t = terrain(z)
    a = route(t, "walker", (5, 5), (45, 55))
    b = route(t, "walker", (5, 5), (45, 55))
    assert a == b
