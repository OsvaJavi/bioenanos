"""Fase 2: compara byte a byte cada bloque <!-- FILE --> del Apéndice D con el archivo del repo (blob de git HEAD, LF)."""
import re, subprocess, sys, hashlib
repo = sys.argv[1]
spec = subprocess.check_output(["git", "show", "HEAD:docs/MARS_PROJECT_MASTER_SPEC.md"], cwd=repo).decode()
PAT = re.compile(r"^<!-- FILE: (?P<path>\S+) -->[ \t]*\n(?P<fence>`{3,}|~{3,})[^\n]*\n(?P<body>.*?)\n(?P=fence)[ \t]*$", re.S | re.M)
for m in PAT.finditer(spec):
    p = m.group("path"); body = (m.group("body") + "\n").encode()
    try:
        blob = subprocess.check_output(["git", "show", f"HEAD:{p}"], cwd=repo, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        print(f"MISSING  {p}"); continue
    print(("IDENTICAL" if blob == body else f"DIFFERS  ({len(body)} spec vs {len(blob)} repo)"), p)
