"""Audit H-06: GitHub Pages must deploy only after the `ci` workflow passed on main (not on every push).

Text checks (no YAML dependency in requirements.txt)."""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
PAGES = (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")


def test_ci_workflow_is_named_ci():
    assert re.search(r"(?m)^name:\s*ci\s*$", CI)


def test_pages_runs_after_ci_completes_on_main_not_on_push():
    on_block = PAGES.split("\non:", 1)[1].split("\npermissions:", 1)[0]
    assert "push:" not in on_block, "pages must not deploy directly on push (it would ignore a red CI)"
    assert "workflow_run:" in on_block
    assert re.search(r"workflows:\s*\[\s*ci\s*\]", on_block)
    assert re.search(r"types:\s*\[\s*completed\s*\]", on_block)
    assert re.search(r"branches:\s*\[\s*main\s*\]", on_block)
    assert "workflow_dispatch:" in on_block  # manual redeploy stays possible


def test_pages_job_requires_ci_success_and_deploys_the_tested_commit():
    assert "github.event.workflow_run.conclusion == 'success'" in PAGES
    assert "github.event.workflow_run.head_sha" in PAGES
