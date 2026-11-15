"""Extract files embedded in MARS_PROJECT_MASTER_SPEC.md (Appendix D).
Usage: python tools/extract_spec_files.py docs/MARS_PROJECT_MASTER_SPEC.md [--force] [--dry-run]
"""
import pathlib
import re
import sys

PAT = re.compile(
    r"^<!-- FILE: (?P<path>\S+) -->[ \t]*\n(?P<fence>`{3,}|~{3,})[^\n]*\n(?P<body>.*?)\n(?P=fence)[ \t]*$",
    re.S | re.M,
)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    spec = pathlib.Path(sys.argv[1])
    force = "--force" in sys.argv
    dry = "--dry-run" in sys.argv
    root = pathlib.Path.cwd().resolve()
    text = spec.read_text(encoding="utf-8")
    n = 0
    for m in PAT.finditer(text):
        rel = m.group("path")
        target = (root / rel).resolve()
        if root not in target.parents:
            raise SystemExit(f"Refusing path outside repo: {rel}")
        if target.exists() and not force and target.read_text(encoding="utf-8") != m.group("body") + "\n":
            raise SystemExit(f"Exists and differs (use --force): {rel}")
        n += 1
        print(("DRY " if dry else "") + f"write {rel}")
        if not dry:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(m.group("body") + "\n", encoding="utf-8")
    print(f"{n} files")
    return 0 if n else 1


if __name__ == "__main__":
    sys.exit(main())
