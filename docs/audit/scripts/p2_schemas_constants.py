"""Fase 2: valida JSON de datos contra schemas/* (jsonschema 2020-12) y revisa metadatos de constants.json."""
import json, sys, pathlib, re
from jsonschema import Draft202012Validator
repo = pathlib.Path(sys.argv[1])
L = lambda p: json.loads((repo / p).read_text(encoding="utf-8"))
pairs = [("web/data/routes.json", "schemas/routes.schema.json"), ("web/data/mock/routes.json", "schemas/routes.schema.json"),
         ("web/data/pois.json", "schemas/pois.schema.json"), ("web/data/layers/layers.json", "schemas/layers.schema.json"),
         ("web/data/mock/layers.json", "schemas/layers.schema.json")]
for d, s in pairs:
    v = Draft202012Validator(L(s)); errs = list(v.iter_errors(L(d)))
    print(f"{d} vs {s}: {'OK' if not errs else str(len(errs)) + ' errores'}")
    for e in errs[:5]: print("   ", list(e.path), e.message[:150])
# constants
C = L("web/data/constants.json")
spec = (repo / "docs/MARS_PROJECT_MASTER_SPEC.md").read_text(encoding="utf-8")
sec10 = spec.split("## 10. Fuentes")[1].split("## Apéndice A")[0]
ids10 = set(re.findall(r"\*\*(S\d+b?)\*\*", sec10))
print("Fuentes §10:", sorted(ids10))
allowed = {"FUENTE", "VERIFICADO", "ASSUMPTION", "PROXY", "DECISION", "DERIVED"}
for g, grp in C.items():
    if g.startswith("_"): continue
    for k, leaf in grp.items():
        miss = [f for f in ("value", "unit", "source", "ref") if f not in leaf]
        if miss or leaf.get("source") not in allowed: print("HOJA MAL", g, k, miss, leaf.get("source"))
        if leaf.get("source") == "FUENTE":
            refs = set(re.findall(r"\bS\d+b?\b", leaf["ref"]))
            ctx = "contexto" in leaf["ref"]
            if not refs and not ctx: print(f"FUENTE sin cita a §10 ni contexto: {g}.{k} = {leaf['value']} ref='{leaf['ref']}'")
            for r in refs - ids10: print(f"FUENTE cita {r} inexistente en §10: {g}.{k}")
print("_meta:", C["_meta"])
