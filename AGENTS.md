# AGENTS.md — Arcadia Planitia Surface Navigator

You are a coding agent building ONE module (M0–M6) of this project.

1. Read `docs/MARS_PROJECT_MASTER_SPEC.md` (authoritative), `docs/arcadia_planitia_contexto_LLM.md`, and every `docs/handoff/HANDOFF_M*.md` in numeric order.
2. Work only on your module, on branch `mX-<slug>`, touching only the files that spec §3.5 assigns to it.
3. Before coding, run `pytest -q tests/py` and `npm test`. Report failures; do not "fix" other modules silently.
4. Never edit contracts: `schemas/*`, `web/data/constants.json`, `tests/golden/*`, spec Appendix B. Propose changes in your handoff.
5. Never invent data. Unsourced values are named constants marked `# ASSUMPTION` and listed in your handoff.
6. Coordinates: planetocentric, lat °N, lon °E 0–360. Sources use lon −180..180 and a 3396.19 km sphere; the project grid (LEQ) uses R = 3388 km. Convert only via `geo.py` / `geo.js`.
7. Finish: all tests green, write `docs/handoff/HANDOFF_Mx.md` from `docs/HANDOFF_TEMPLATE.md`, open a PR to `main`, CI must pass.

Commands:
```
pip install -r requirements.txt && npm install
pytest -q tests/py
npm test              # vitest unit tests
npm run e2e           # playwright (needs web/index.html)
node tools/serve.mjs  # http://localhost:4173/bioenanos/
```
