"""T-M0-01: every Appendix-D file exists and JSON files parse.
Contract guard: constants.json, tests/golden/* and schemas/* are byte-identical to spec Appendix D
(spec §0 rule: contracts never change without a spec revision)."""
import json
import pathlib
import re

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = ROOT / "docs" / "MARS_PROJECT_MASTER_SPEC.md"
PAT = re.compile(
    r"^<!-- FILE: (?P<path>\S+) -->[ \t]*\n(?P<fence>`{3,}|~{3,})[^\n]*\n(?P<body>.*?)\n(?P=fence)[ \t]*$",
    re.S | re.M,
)
EMBEDDED = {m.group("path"): m.group("body") + "\n" for m in PAT.finditer(SPEC.read_text(encoding="utf-8"))}
CONTRACTS = [p for p in EMBEDDED if p == "web/data/constants.json" or p.startswith(("tests/golden/", "schemas/"))]


def test_spec_and_context_present():
    assert SPEC.is_file()
    assert (ROOT / "docs" / "arcadia_planitia_contexto_LLM.md").is_file()


def test_appendix_d_has_expected_files():
    assert len(EMBEDDED) == 22
    assert len(CONTRACTS) == 9


@pytest.mark.parametrize("rel", sorted(EMBEDDED))
def test_file_exists(rel):
    assert (ROOT / rel).is_file(), rel


@pytest.mark.parametrize("rel", sorted(p for p in EMBEDDED if p.endswith(".json")))
def test_json_parses(rel):
    json.loads((ROOT / rel).read_text(encoding="utf-8"))


@pytest.mark.parametrize("rel", sorted(CONTRACTS))
def test_contract_unchanged(rel):
    assert (ROOT / rel).read_text(encoding="utf-8") == EMBEDDED[rel], (
        f"{rel} differs from spec Appendix D. Contracts are frozen: propose changes in your handoff."
    )


@pytest.mark.parametrize("rel", ["pipeline/geo.py", "pipeline/constants.py", "pipeline/atmos.py",
                                 "web/js/geo.js", "web/js/constants.js", "web/js/atmos.js",
                                 "web/js/telemetry_rover.js", "web/js/telemetry_walker.js",
                                 "web/js/env_strip.js", "web/js/chart.js",
                                 "tools/make_mocks.py", "tools/serve.mjs", "tools/vendor_leaflet.mjs",
                                 "web/vendor/leaflet/leaflet.js", "web/vendor/leaflet/leaflet.css",
                                 "requirements.lock.txt", "package-lock.json"])
def test_m0_deliverables_exist(rel):
    assert (ROOT / rel).is_file(), rel
