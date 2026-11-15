"""T-M0-04: every constants.json leaf has `value` and a valid `source`; C / C_meta loader behaves."""
from pipeline.constants import C, C_meta, VALID_SOURCES, leaves


def test_every_leaf_has_value_and_valid_source():
    all_leaves = list(leaves())
    assert len(all_leaves) > 80
    for key, leaf in all_leaves:
        assert "value" in leaf, key
        assert leaf.get("source") in VALID_SOURCES, (key, leaf.get("source"))
        assert "unit" in leaf and "ref" in leaf, key


def test_no_group_is_empty_and_no_stray_values():
    def walk(node, path):
        assert isinstance(node, dict) and node, path
        for k, v in node.items():
            if isinstance(v, dict) and "value" not in v:
                walk(v, f"{path}.{k}")
            else:
                assert isinstance(v, dict), f"{path}.{k} is a bare value (must be a leaf dict)"
    for g, v in C_meta.items():
        walk(v, g)


def test_namespace_access():
    assert C.geo.R_km == 3388.0
    assert C.rover.payload_max_kg == C.rover.gvwr_kg - C.rover.m_curb_kg
    assert C.walker.vo2max_levels["Good"] == 47
    assert C.rover.regen_enabled is False
    assert C_meta["rover"]["crr"]["source"] == "ASSUMPTION"
    assert "_meta" not in C_meta


def test_grid_constants_consistent():
    g = C.grid
    assert round((g.x_max_km - g.x_min_km) * 1000 / g.cell_m) == g.ncols
    assert round((g.y_max_km - g.y_min_km) * 1000 / g.cell_m) == g.nrows
