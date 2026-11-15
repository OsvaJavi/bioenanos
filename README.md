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
Two steps, so that only the first one needs internet:

```
python -m pipeline.fetch_data        # networked machine: windowed reads (HTTP ranges) -> data/raw/ + data/processed/source_report.json
python -m pipeline.derive_layers     # offline: own reprojection to the LEQ grid -> data/processed/*.tif, web/data/layers/*, web/data/pois.json
```
- `fetch_data` options: `--only dem,detail,thermal,optical`, `--dem-file <local.tif>` (a DEM downloaded by hand), `--thermal-url`, `--optical-url`, `--tes-url`. Every failure is recorded in `source_report.json`, never fatal (except no DEM at all).
- `data/raw/` is not versioned; `data/processed/*` and `web/data/layers/*` are (small).
- Layer `file` paths in `web/data/layers/layers.json` are relative to `web/data/`. Extra optional fields: `palette` (legend stops), `stats` (DEM/slope/roughness summary and POI elevation check).
- Tests: `tests/py/test_m1_derive.py` (synthetic sources, always run) and `tests/py/test_m1_real.py` (real outputs; skipped until they exist).
## M2 — Routing
```
python -m pipeline.export_routes     # data/processed/*.tif (M1) -> web/data/routes.json (~6 s, 4 Dijkstra runs)
```
- `pipeline/models_rover.py`, `pipeline/models_walker.py`: physics of spec §6.3–6.6 (scalar or numpy). `route_energy(points)` walks exported points exactly as the JS models must (T-M2-09).
- `pipeline/routing.py`: 16-neighbour directed graph, P-13 cuts (edge angle + Horn slope of origin, destination and knight intermediates), Dijkstra on the graph (`out`) and on its transpose (`back`).
- `routes.json` extras (optional, B.2-compatible): per route `graph_cost`/`graph_cost_unit`; top level `summary` (rover verdict, walker EVAs/O₂ with default parameters, rover/walker same-path flags) and `points_note`.
- Tests: `test_m2_models.py` (golden), `test_m2_routing.py` (synthetic plane / 3° plane / 15° wall with gap / basin), `test_m2_real.py` (real routes).
## M3 — Map UI
```
npm run serve                                  # http://localhost:4173/bioenanos/
npm run e2e                                    # Playwright (CI installs its Chromium)
PW_CHROME=/usr/bin/google-chrome npm run e2e   # local run with a system Chrome
```
- `web/index.html`, `web/css/hud.css`, `web/js/{data,map,ui,main}.js`. Leaflet is imported as an ES module from `web/vendor/leaflet/` (no CDN).
- `data.js` contract: `loadData()`, `getBase()`, `getPOIs()`, `getPOI(id)`, `getRoute(poiId, mode, direction='out')`, `getLayers()`, `isMock()`, `getConstants()`; falls back to `data/mock/*` with a "MOCK DATA" banner.
- Events on `document`: `mode:changed {mode}`, `poi:selected {id, mode}`, `poi:cleared {}`; listens to `traverse:progress {mode, id, s_km}` (moving marker on the `out` route).
- Telemetry modules are mounted by `main.js` with `ctx = {data, bus: document, getState}`.
## M4 — Rover telemetry
- `web/js/models/rover.js`: spec §6.3 in JS (twin of `pipeline/models_rover.py`): `segmentEnergy`, `routeEnergy(points, {payload_kg})`, `routeSummary`, `verdict`, `timeline`/`stateAt` (playback), `validatePayload` (0–537 kg).
- `web/js/telemetry_rover.js` (`mountRoverPanel`): payload, out/back/round-trip summary, verdict with the 20 % reserve, elevation and power profiles, playback ×60/×600/×3600 emitting `traverse:progress`.
- `web/js/env_strip.js` (`mountEnvStrip`) and `web/js/chart.js` (`lineChart(canvas, series, opts)` → `{update, setCursor, destroy}`; `opts.markers` for vertical separators) are shared with M5.
- Tests: `tests/js/test_m4_rover.test.js` (golden, parity with `routes.json`, payload, 200 km synthetic route) and `tests/e2e/m4_rover.spec.js`.
## M5 — On-foot telemetry
- `web/js/models/walker.js`: spec §6.4–6.6 in JS (twin of `pipeline/models_walker.py`): `metabolic`, `segment`, `routeEnergy`, `o2Plan` (EVA split, reserve, contingency), `coreTempC`, `roundTripTimeline`/`walkerStateAt` (playback, core temperature reset at each EVA), `validateForm`/`FIELDS`.
- `web/js/telemetry_walker.js` (`mountWalkerPanel`): astronaut form (13 fields, spec ranges), O₂ required (L STP + kg + max per EVA), EVAs, kcal, mean VO₂, alerts (multi-EVA, core temperature, metabolic range), round-trip playback ×600/×3600/×36000 with biometric gauges and EVA separators; reuses M4's `chart.js` and `env_strip.js` unchanged.
- Tests: `tests/js/test_m5_walker.test.js`, `tests/e2e/m5_walker.spec.js`.
## M6 — Integration & deployment
## Sensitivity analysis (M6)
## Credits
