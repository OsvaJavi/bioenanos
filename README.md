# Arcadia Planitia Surface Navigator

NASA Space Apps 2026 — *Interplanetary Survival Guide: Martian Map*. Static web app (Leaflet) with an operations base (AP-1), five points of interest, optimal rover and on-foot routes, and telemetry dashboards.

Live site: https://osvajavi.github.io/bioenanos/

Spec: `docs/MARS_PROJECT_MASTER_SPEC.md` · Agent rules: `AGENTS.md` · Data licenses: `DATA_LICENSE.md`

## Quick start
```
pip install -r requirements.txt
npm install
pytest -q tests/py && npm test
npm run serve   # http://localhost:4173/bioenanos/
```

## M0 — Scaffold & contracts
Requires **Python ≥ 3.11** and **Node ≥ 22.12** (Vitest 5 does not run on Node 20). Contracts (`web/data/constants.json`, `tests/golden/*`, `schemas/*`) are frozen; `tests/py/test_m0_files.py` fails if they drift from spec Appendix D.

```
python tools/extract_spec_files.py docs/MARS_PROJECT_MASTER_SPEC.md   # re-creates Appendix D files (refuses to overwrite changes)
python tools/make_mocks.py                                            # web/data/mock/{routes,layers}.json + PNGs
npm run vendor                                                        # node_modules/leaflet/dist -> web/vendor/leaflet/
```

- Shared code: `pipeline/{geo,constants,atmos}.py` ⇄ `web/js/{geo,constants,atmos}.js` (same names; JS also exports camelCase aliases such as `llToXY`).
- `from pipeline.constants import C, C_meta` / `import { C, C_meta } from './constants.js'` → `C.rover.crr` (value), `C_meta.rover.crr` (`{value, unit, source, ref}`).
- `layers.json` `file` paths are relative to `web/data/` (mock: `mock/layers/<id>.png`).
- `requirements.lock.txt` was frozen on Python 3.13; CI runs Python 3.13 / Node 22.
## M1 — Data ingestion
## M2 — Routing
## M3 — Map UI
## M4 — Rover telemetry
## M5 — On-foot telemetry
## M6 — Integration & deployment
## Sensitivity analysis (M6)
## Credits
