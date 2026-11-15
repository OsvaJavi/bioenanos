"""Single source of constants (spec §0, B.4): loads web/data/constants.json.

    from pipeline.constants import C, C_meta
    C.geo.R_km                 -> 3388.0          (value only)
    C_meta["geo"]["R_km"]      -> {"value", "unit", "source", "ref"}

Do NOT hard-code physical constants elsewhere; read them from here.
Do NOT edit constants.json outside a spec revision (propose changes in your handoff).
"""
from __future__ import annotations

import json
import pathlib
from types import SimpleNamespace

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONSTANTS_PATH = ROOT / "web" / "data" / "constants.json"

VALID_SOURCES = {"FUENTE", "VERIFICADO", "ASSUMPTION", "PROXY", "DECISION", "DERIVED"}


def is_leaf(node) -> bool:
    """A leaf is a dict carrying a 'value' key (the value itself may be a list or dict)."""
    return isinstance(node, dict) and "value" in node


def _values(node):
    if is_leaf(node):
        return node["value"]
    return SimpleNamespace(**{k: _values(v) for k, v in node.items()})


def load_constants(path: str | pathlib.Path = CONSTANTS_PATH):
    """Return (C, C_meta). '_meta' (file info) is excluded from both."""
    raw = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    groups = {k: v for k, v in raw.items() if not k.startswith("_")}
    return _values(groups), groups


C, C_meta = load_constants()


def leaves(meta: dict = None, prefix: str = ""):
    """Yield (dotted_key, leaf_dict) for every constant. Used by tests and the 'About' panel."""
    meta = C_meta if meta is None else meta
    for k, v in meta.items():
        key = f"{prefix}.{k}" if prefix else k
        if is_leaf(v):
            yield key, v
        elif isinstance(v, dict):
            yield from leaves(v, key)
