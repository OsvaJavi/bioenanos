"""Fase 8: compara cada ruta relativa referenciada en web/ (HTML/JS/CSS/JSON) con git ls-files, distinguiendo mayúsculas."""
import json, re, subprocess, sys, posixpath, pathlib
repo = pathlib.Path(sys.argv[1])
files = set(subprocess.check_output(["git", "ls-files", "web"], cwd=repo, text=True).split())
lower = {f.lower(): f for f in files}
pat = re.compile(r"""(?:['"`(]|url\()\s*((?:\.{1,2}/)?[A-Za-z0-9_\-./]+\.(?:js|mjs|css|json|png|tif|svg|ico|html|map))\b""")
bad, checked = [], 0
for f in sorted(files):
    if not f.endswith((".html", ".js", ".mjs", ".css", ".json")) or "/vendor/" in f and f.endswith(".map"):
        continue
    text = (repo / f).read_text(encoding="utf-8", errors="replace")
    base = posixpath.dirname(f)
    for m in pat.finditer(text):
        ref = m.group(1)
        if ref.startswith(("http", "//")):
            continue
        cands = [posixpath.normpath(posixpath.join(base, ref)), posixpath.normpath(posixpath.join("web", ref)),
                 posixpath.normpath(posixpath.join("web/data", ref)), posixpath.normpath(posixpath.join("web/js", ref))]
        checked += 1
        if any(c in files for c in cands):
            continue
        ci = [lower[c.lower()] for c in cands if c.lower() in lower]
        bad.append((f, ref, "CASE MISMATCH -> " + ci[0] if ci else "NOT FOUND (puede ser dinámico)"))
print("referencias revisadas:", checked)
for b in bad: print(*b, sep=" | ")
