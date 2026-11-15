# Via Virtus

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
- `web/js/telemetry_walker.js` (`mountWalkerPanel`): astronaut form (13 fields, spec ranges), O₂ required (L STP + kg + max per EVA), EVAs (ended at the EVA limit or, spec v1.3, when the estimated core temperature reaches 38.5 °C; "Not feasible on foot" if a heat-limited EVA would last < 1 h), kcal, mean VO₂, alerts (multi-EVA, core temperature, metabolic range), round-trip playback ×600/×3600/×36000 with biometric gauges and EVA separators; reuses M4's `chart.js` and `env_strip.js` unchanged.
- Tests: `tests/js/test_m5_walker.test.js`, `tests/e2e/m5_walker.spec.js`.
## M6 — Integration & deployment
**Regenerate everything** (only the first step needs internet; outputs are committed):
```
python -m pipeline.fetch_data        # networked machine: windowed source reads -> data/raw/
python -m pipeline.derive_layers     # data/processed/*.tif, web/data/layers/*, web/data/pois.json
python -m pipeline.export_routes     # web/data/routes.json (~6 s)
python tools/make_mocks.py           # web/data/mock/* (placeholders, only used if real data is missing)
```
**Test everything**
```
pytest -q tests/py                             # Python: geodesy, layers, models, routing, real routes
npm test                                       # Vitest: JS models (same golden vectors), data layer
npx playwright install chromium && npm run e2e # end-to-end in a real browser, served under /bioenanos/
PW_CHROME=/usr/bin/google-chrome npm run e2e   # same, with a system Chrome
```
**Deploy:** `.github/workflows/pages.yml` publishes `web/` on every push to `main`. One-time setup by a repo admin: *Settings → Pages → Source: GitHub Actions*. The site only uses relative paths and works under `/bioenanos/`; it makes no requests to other domains at runtime.

**Results with default parameters** (rover payload 350 kg; astronaut 80 kg + 170 kg suit + 10 kg gear at 1.0 m/s):

| Site | Straight line | Route (rover) | Rover, round trip | Rover verdict | On foot: EVAs | O₂ required |
|---|---|---|---|---|---|---|
| HCP · Polygon Field | 47.0 km | 48.2 km | 47.6 kWh | ROUND TRIP OK | 4 | 3012 L |
| US1 · Ogive Front | 49.6 km | 50.3 km | 50.2 kWh | ROUND TRIP OK | 4 | 3169 L |
| AP-9 · ISRU Site | 58.2 km | 59.8 km | 61.4 kWh | ROUND TRIP OK | 5 | 3896 L |
| AP-8 · Periglacial Plain | 66.8 km | 67.7 km | 67.8 kWh | ROUND TRIP OK | 5 | 4258 L |
| APMR · Paleo-megaripples | 118.2 km | 119.8 km | 123.3 kWh | ONE-WAY ONLY | 9 | 7758 L |

Battery: 96 kWh usable; round trips must fit in 76.8 kWh (20 % reserve). The plain is very flat (mean slope 0.84°), so routes are only 1–3 % longer than the straight line.

Site weight and first load are checked by `tests/e2e/m6_integration.spec.js` (< 25 MB, < 5 s locally).
## Sensitivity analysis (M6)
Recomputed on the fixed AP-9 routes with `python tools/sensitivity.py` (all other parameters at their defaults):

| Parameter | Value | Result (AP-9) | Change | Verdict / EVAs |
|---|---|---|---|---|
| Rover · crr (rolling resistance) | 0.08 | 36.1 kWh round trip | -41 % | ROUND TRIP OK |
| Rover · crr (rolling resistance) | 0.15 (default) | 61.4 kWh round trip | +0 % | ROUND TRIP OK |
| Rover · crr (rolling resistance) | 0.3 | 115.6 kWh round trip | +88 % | ONE-WAY ONLY |
| Rover · eta_dt (drivetrain efficiency) | 0.8 | 68.2 kWh round trip | +11 % | ROUND TRIP OK |
| Rover · eta_dt (drivetrain efficiency) | 0.9 (default) | 61.4 kWh round trip | +0 % | ROUND TRIP OK |
| Rover · eta_dt (drivetrain efficiency) | 0.95 | 58.5 kWh round trip | -5 % | ROUND TRIP OK |
| On foot · f_g (Mars gravity factor) | 0.56 | 3233 L O₂ | -17 % | 5 EVAs |
| On foot · f_g (Mars gravity factor) | 0.7 (default) | 3896 L O₂ | +0 % | 5 EVAs, 1 heat-limited |
| On foot · f_g (Mars gravity factor) | 0.84 | — | — | Not feasible on foot (heat) |

Rolling resistance on Martian regolith (`crr`, an assumption with no direct measurement) dominates the rover result: across its plausible range the AP-9 round trip goes from comfortable to impossible with the reserve. Drivetrain efficiency matters much less. On foot, a lower Mars gravity factor `f_g` saves about 17 % of the oxygen; a 20 % higher one makes AP-9 not feasible on foot, because on the climbs the suit can no longer remove the extra heat and an EVA would end in under 1 h (spec v1.3: an EVA ends when the estimated core temperature reaches 38.5 °C).
## Use of AI (Super Intelligence, SI)
This project was built with AI coding agents, as declared under the Space Apps "Use of Super Intelligence (SI)" rules.
- **What the AI generated:** all the code in this repository (`pipeline/`, `web/js/`, `web/css/`, `tools/`), the tests (`tests/`), the generated data files (`data/processed/*`, `web/data/layers/*`, `web/data/routes.json`, `web/data/pois.json` elevations, `web/data/mock/*`) and the documentation (`README.md`, `docs/DEMO_SCRIPT.md`, `docs/handoff/*`, `docs/audit/*`). It was written by Claude (Anthropic; Claude Code and claude.ai coding agents), one module per session, as recorded in each `docs/handoff/HANDOFF_M*.md` and in the commit history.
- **What the team set:** the scope and the binding decisions in the spec (`docs/MARS_PROJECT_MASTER_SPEC.md` §2.1, decisions D-*), the review and merge of every module, and the approval of every contract change (for example spec v1.2). Default engineering choices proposed by the AI are labelled P-01…P-16 in spec §2.2 and were open to team veto.
- **How it was checked:** the physics, geodesy and routes are specified once in the spec and implemented twice (Python and JavaScript) against the same golden vectors; CI runs the unit and end-to-end tests on every change, and an independent audit (`docs/audit/AUDIT_REPORT.md`) re-derived the results.
- **Data:** every map layer comes from NASA, USGS and ESA/DLR mission data (see Credits); the AI only wrote the code that reprojects and derives it. No image or video in the app is AI-generated, and no NASA logo or insignia is used.

## Credits
Elevation: Mars HRSC–MOLA blended DEM 200 m v2 (CC BY-SA 3.0 IGO — DLR, ESA, FU Berlin, NASA, USGS). Detail: CTX DTM and orthoimage from the USGS STAC (CC0 — NASA/JPL-Caltech/MSSS, USGS). Thermal: THEMIS day-IR mosaic 100 m v12 (NASA/JPL-Caltech/ASU, USGS). Optical: Viking MDIM 2.1 colour mosaic (NASA, USGS). Rover data: Tesla Model S (tesla.com; EVKX). Map library: Leaflet (BSD-2-Clause). Full list in the app's *Data credits* panel and `DATA_LICENSE.md`.
