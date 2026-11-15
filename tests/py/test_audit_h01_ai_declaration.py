"""Audit H-01: the Space Apps 2026 submission guide requires that SI-generated code and data acknowledge it
"in descriptive text and metadata", and the project-page field is "Use of Super Intelligence (SI)"."""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
README = (ROOT / "README.md").read_text(encoding="utf-8")
DEMO = (ROOT / "docs" / "DEMO_SCRIPT.md").read_text(encoding="utf-8")


def _section(text, heading_regex):
    m = re.search(rf"(?m)^## {heading_regex}.*$", text)
    assert m, f"missing section matching '## {heading_regex}'"
    rest = text[m.end():]
    nxt = re.search(r"(?m)^## ", rest)
    return rest[: nxt.start()] if nxt else rest


def test_readme_declares_use_of_ai_si():
    sec = _section(README, r"Use of AI")
    for must in ("Super Intelligence", "Claude", "code", "data", "tests", "spec"):
        assert must.lower() in sec.lower(), must


def test_package_metadata_acknowledges_ai_generation():
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    assert "AI" in pkg.get("description", "") or "SI" in pkg.get("description", "")


def test_demo_checklist_uses_the_official_field_name():
    assert "Use of Super Intelligence (SI)" in DEMO
