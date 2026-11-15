# HANDOFF_M0 — Módulo 0: Andamiaje y contratos
**Fecha/hora:** 2026-11-14 21:25 (America/Mexico_City) · **Persona:** Abe (P1) · **Agente:** Claude (claude.ai, modelo Claude Opus 5.5; sesión de nube con terminal)
**Rama:** `m0-scaffold` · **Commit:** `811032e` (código) + commit de este handoff · **PR:** no abierto (sin acceso a GitHub, ver §7 D-M0-01) · **CI:** ☐ verde ☐ rojo — **no ejecutado en GitHub**; equivalente local en verde
**Estado:** ☐ COMPLETO ☒ COMPLETO CON DESVIACIONES ☐ INCOMPLETO

## 1. Resumen
- Se extrajeron con `tools/extract_spec_files.py` los 22 archivos del Apéndice D del spec v1.1, byte-idénticos. El extractor escrito a mano coincide con D.1.
- Geodesia/LEQ, cargador de constantes y atmósfera implementados en Python (`pipeline/`) y JS (`web/js/`). Los dos pasan los mismos golden (G-GEO-1/2/3, G-LEQ-1…4, G-ATM-1 y G-ENV-1).
- Mocks generados en `web/data/mock/`: 20 rutas de gran círculo y 8 capas en degradado gris. Validan contra `schemas/*`. Con ellos M2-A, M3 y M4 pueden empezar ya.
- Stubs con firma final: `mountRoverPanel`, `mountWalkerPanel`, `mountEnvStrip`, `lineChart`.
- Leaflet 1.9.4 vendorizado en `web/vendor/leaflet/`. `tools/serve.mjs` sirve `web/` bajo `/bioenanos/`.
- Pruebas: **93 pytest + 24 Vitest, todas PASS**. Incluye un **guardián de contratos** que falla si `constants.json`, `tests/golden/*` o `schemas/*` dejan de ser idénticos al Apéndice D.
- Los golden de rover, caminante y biométricos (G-ROV-1…6, G-WLK-1…7, G-BIO-1) se **recalcularon de forma independiente**: todos coinciden dentro de tolerancia. M2, M4 y M5 pueden confiar en ellos.
- CI y Pages quedan configurados, pero **no se probaron en GitHub** (sin acceso).

## 2. Verificación de módulos previos (lado derecho de la V)
| Módulo | Pruebas al INICIO | Resultado | Pruebas al FINAL | Resultado |
|---|---|---|---|---|
| — | N/A: M0 es el primer módulo; no había pruebas previas | N/A | `pytest -q tests/py` (93) · `npm test` (24) | PASS |

## 3. Archivos creados / modificados
| Ruta | Acción | ¿De M0 según §3.5? | Propósito |
|---|---|---|---|
| `docs/MARS_PROJECT_MASTER_SPEC.md` | nuevo (copia sin editar de la v1.1) | sí (raíz/docs) | Spec autoritativo |
| `docs/arcadia_planitia_contexto_LLM.md` | nuevo (copia sin editar) | lo coloca el humano | Contexto |
| 22 archivos del Apéndice D (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`, `DATA_LICENSE.md`, `requirements.txt`, `package.json`, `.gitignore`, `.github/workflows/{ci,pages}.yml`, `schemas/*`, `tests/golden/*`, `web/data/{constants,pois}.json`, `docs/HANDOFF_TEMPLATE.md`, `tools/extract_spec_files.py`) | nuevos (extraídos) | sí | Contratos y configuración |
| `.github/workflows/ci.yml`, `pages.yml` | **modificados** después de la extracción | sí | Versiones de Actions/Python/Node (§7 D-M0-02, D-M0-03) |
| `README.md` | modificado (solo `## M0`) | sí | Instrucciones de M0 |
| `requirements.lock.txt`, `package-lock.json` | nuevos | sí | Versiones congeladas |
| `pipeline/{__init__,geo,constants,atmos}.py` | nuevos | sí | Código compartido Python |
| `web/js/{geo,constants,atmos}.js` | nuevos | sí | Código compartido JS |
| `web/js/{telemetry_rover,telemetry_walker,env_strip,chart}.js` | nuevos (stubs) | sí (stubs) | Firmas finales para M4/M5 |
| `tools/{vendor_leaflet.mjs,serve.mjs,make_mocks.py}` | nuevos | sí | Vendorizado, servidor local, mocks |
| `web/vendor/leaflet/*` | nuevos (generados) | sí | Leaflet 1.9.4 + LICENSE + VERSION |
| `web/data/mock/{routes.json,layers.json,layers/*.png}` | nuevos (generados) | sí | Datos mock |
| `tests/py/{conftest.py,test_m0_files.py,test_m0_geo.py,test_m0_atmos.py,test_m0_constants.py,test_m0_mocks.py}` | nuevos | sí | Pruebas Python |
| `tests/js/test_m0_{geo,atmos,constants,serve}.test.js` | nuevos | sí | Pruebas Vitest (necesitan `.test.js` para el patrón por defecto de Vitest) |
| `docs/handoff/HANDOFF_M0.md` | nuevo | sí | Este documento |

## 4. Interfaces públicas
**Python** (`from pipeline import geo, atmos`; `from pipeline.constants import C, C_meta`)
- `geo.r_local(lat_deg) -> km` · `geo.dist_az((lat,lon),(lat,lon), R=3388.0) -> (d_km, az_deg)`
- `geo.ll_to_xy(lat, lon) -> (x_m, y_m)` · `geo.xy_to_ll(x_m, y_m) -> (lat, lon°E 0–360)`. Acepta longitudes 0–360 o −180..180. Ida y vuelta exacta.
- `geo.kx(lat)` · `geo.horizontal_distance_m(x1_m, y1_m, x2_m, y2_m)`, la longitud real con `k_x(φ_mid)` de §3.3. **M2 debe usar esta función para `d_h`.**
- `geo.cell_center(i, j) -> (x_km, y_km)` · `geo.xy_to_cell(x_km, y_km) -> (i, j)` (intervalo semiabierto; puede devolver índices fuera de la rejilla) · `geo.in_grid(i, j)` · `geo.ll_to_cell(lat, lon)`. Ejemplo: AP-1 → celda `(444, 363)`.
- `geo.lon_to_180`, `geo.lon_to_360`: **únicas** conversiones de longitud permitidas. `geo.gc_interpolate(p1, p2, f)`.
- Constantes de rejilla: `geo.R_KM, R_M, PHI0_DEG, LAM0_DEG, CELL_KM, X_MIN_KM, X_MAX_KM, Y_MIN_KM, Y_MAX_KM, NROWS, NCOLS`.
- `atmos.atmos(z_km, T=210, P0=610) -> {H_km, P_Pa, rho, Mcol_gcm2}` · `atmos.shield_column_gcm2(z_m)` (escalar o ndarray; NaN se propaga; **M1: úsala para la capa de §6.7**) · `atmos.dose_mGy(t_h, rate=0.213)` · `atmos.env_fixed(z_km)`.
- `C.<grupo>.<clave>` → valor; `C_meta[grupo][clave]` → `{value, unit, source, ref}`; `constants.leaves()` → `(clave.punteada, hoja)` (para el panel "About").

**JS** (ES modules; mismos nombres en snake_case y alias camelCase: `llToXY`, `xyToLL`, `distAz`, `xyToCell`, `cellCenter`, `llToCell`, `rLocal`, `inGrid`, `lonTo180`, `lonTo360`, `doseMGy`, `envFixed`)
- `web/js/constants.js`: `C`, `C_meta`, `constantsError`, `leaves()`, `buildConstants(raw)`, `loadConstants(raw?)`, `VALID_SOURCES`. Carga `../data/constants.json` con **top-level await**: `fetch` en el navegador, `fs` en Node/Vitest. Si falla, `C === null` y `constantsError` guarda el error (la UI puede mostrar un aviso en vez de quedarse en blanco).
- `web/js/geo.js`: las funciones de arriba. Devuelven **arrays** donde Python devuelve tuplas (`[x_m, y_m]`, `[d_km, az]`, `[i, j]`). Para Leaflet: `llToXYkm(lat, lon) -> [x_km, y_km]` y `xyKmToLL(x_km, y_km)`. **Ojo: `L.latLng(y_km, x_km)`.**
- `web/js/atmos.js`: `atmos(z_km, T?, P0?)`, `dose_mGy(t_h, rate?)`, `env_fixed(z_km)`.
- Stubs (firmas finales): `mountRoverPanel(el, ctx)`, `mountWalkerPanel(el, ctx)`, `mountEnvStrip(el, ctx)` → `{destroy()}`; `lineChart(canvas, series, opts={})` → `{update(series), destroy()}`.

**Archivos de datos**
- `web/data/mock/routes.json` (B.2, `"mock": true`, 20 rutas). Ejemplo de resumen: `AP-9 / rover / out`: `length_km_3d 58.17`, `ref.E_total_kWh 27.96`. Puntos cada 200 m (el último tramo es más corto), con `z_m −3900`, `grade 0` y `rough 0`.
- `web/data/mock/layers.json` (B.1, `"mock": true`): 8 capas, todas con `available: true`, PNG de 227×154 px y `bounds_km` = rejilla completa. `file` = `mock/layers/<id>.png` (**relativo a `web/data/`**, ver D-M0-04).
- `tools/serve.mjs`: `node tools/serve.mjs [port]` → `http://localhost:4173/bioenanos/`; `import { startServer } from './tools/serve.mjs'` → `{server, port, url}` (con puerto 0 elige uno aleatorio).

## 5. Resultados de las pruebas de ESTE módulo
| ID | Descripción | PASS/FAIL | Medido vs esperado | Notas |
|---|---|---|---|---|
| T-M0-01 | Archivos de D existen; los JSON parsean | PASS | 22/22 archivos; 11 JSON | + guardián: 9 contratos byte-idénticos al Apéndice D |
| T-M0-02 | G-GEO-1/2/3, G-LEQ-1…4 en Py **y** JS | PASS | G-GEO-1 58.169 km / 76.677° · G-GEO-2 3388.002 · G-LEQ-1 (−40.7678, −11.8264) · G-LEQ-2 (113.2439, 76.8713) · G-LEQ-3 0.980706 · ida y vuelta máx ≈ 0 m (< 1 m) | Paridad Py↔JS en celdas: AP-1 → (444, 363) en ambos |
| T-M0-03 | G-ATM-1 en Py y JS | PASS | H 10.6627 km · P 879.384 Pa · ρ 0.022166 · Mcol 23.6345 | + G-ENV-1 (0.071 mGy) en ambos |
| T-M0-04 | Cada hoja de `constants.json` con `value` y `source` válido | PASS | 89 hojas | Py y JS |
| T-M0-05 | Mocks validan contra los esquemas | PASS | routes, layers y pois.json válidos (Draft 2020-12) | + consistencia: 20 combinaciones, extremos a < 1 m de la base/POI, pasos ≤ 200 m, `ref` = 0.48069 kWh/km (rover) |
| T-M0-06 | pytest y npm test en verde, local **y CI** | PASS local / **CI no ejecutado** | 93 + 24 PASS | Sin acceso a GitHub (D-M0-01) |
| T-M0-07 | `serve.mjs` → 200 en `/bioenanos/vendor/leaflet/leaflet.js` | PASS | 200, `text/javascript` | + bloquea path traversal y rutas fuera de `/bioenanos/` |
| (extra) | Módulos JS en navegador real | PASS | Chrome headless bajo `/bioenanos/`: `C.geo.R_km = 3388`, `atmos(−3.9).P = 879.38`, `constantsError = null` | Prueba manual, no está en CI |
| (extra) | Recálculo independiente de G-ROV-1…6, G-WLK-1…7 y G-BIO-1 | PASS | Todos dentro de tolerancia; mayor diferencia: G-WLK-6 O₂ 2938.73 vs 2938.74 L (tol. 0.5) | Script de verificación fuera del repo (no duplica los modelos de M2) |

Comandos: `pip install -r requirements.txt && npm install && python -m pytest -q tests/py && npm test`

## 6. Validación de fuentes de datos
N/A: M0 no usa fuentes externas. La validación de §4 es tarea de M1.

## 7. Desviaciones respecto al spec
- **D-M0-01 (protocolo §0 paso 5, §3.8). Sin rama remota, PR ni CI.** La sesión no tiene una cuenta de GitHub vinculada. El trabajo está en un repo git local, rama `m0-scaffold`, entregado como `git bundle` + `.zip`. **Decisión humana:** subirlo (`git clone bioenanos-m0.bundle`, o `git fetch <bundle> m0-scaffold`) a `OsvaJavi/bioenanos`, abrir el PR y confirmar que el CI queda en verde.
- **D-M0-02 (D.8 / §3.7). Versiones de las GitHub Actions actualizadas** a sus majors actuales (verificado con `git ls-remote --tags`): checkout v4→**v7**, setup-python v5→**v7**, setup-node v4→**v7**, configure-pages v5→**v6**, upload-pages-artifact v3→**v5**, deploy-pages v4→**v5**. Los tags viejos siguen existiendo; si v7/v6/v5 trajeran algún cambio incompatible, basta con volver a los del spec. No se pudo probar en GitHub.
- **D-M0-03 (§3.7 "Node ≥ 20"; D.8 `node-version: "20"`). El CI usa Node 22 y Python 3.13.** `devDependencies: vitest: "latest"` resuelve a Vitest 5.1.0, que exige `node ^22.12 || ^24 || >=26`. **Con Node 20, `npm test` fallaría en CI.** Python pasa a 3.13 para que coincida con `requirements.lock.txt`, porque numpy 2.5.3 no publica wheels para 3.11. `requirements.txt` (mínimos) sigue sirviendo para 3.11 en local. **Requisito efectivo para el equipo: Node ≥ 22.12.**
- **D-M0-04 (B.1, ambigüedad). Base de las rutas `file` de `layers.json`.** El spec no lo define: B.1 pone `"file": "layers/hillshade.png"` y §3.4 coloca `layers.json` dentro de `web/data/layers/`, así que la ruta solo tiene sentido **relativa a `web/data/`**. Se fija esa regla: real = `"layers/<id>.png"`; mock = `"mock/layers/<id>.png"`. M3 resuelve `new URL(file, <base de web/data/>)` y M1 debe escribir `layers/<id>.png`. La prueba de M0 ya resuelve así.
- **D-M0-05 (§8.2). Campos opcionales extra** (permitidos porque los esquemas aceptan `additionalProperties`): `mock: true` y `note` en cada ruta y capa mock; `file_base: "web/data/"` en `layers.json` mock. No se renombra ni se quita nada.
- **D-M0-06 (ninguno; ampliación). Funciones auxiliares** además de las de §6.1: `lon_to_180/360`, `gc_interpolate`, `horizontal_distance_m`, `in_grid`, `ll_to_cell`; en atmósfera, `dose_mGy`, `env_fixed` y `shield_column_gcm2`. Se agregaron para que M1, M2, M4 y M5 no reimplementen geodesia ni atmósfera.
- **D-M0-07 (M0 tarea 8). GitHub Pages sin configurar:** Settings → Pages → Source = GitHub Actions. Lo hace el humano.

## 8. Suposiciones nuevas y cambios de constantes propuestos
| Constante / decisión | Valor | Dónde vive | Justificación | ¿Aprobación humana? |
|---|---|---|---|---|
| Tamaño de los PNG mock | 227×154 px | `tools/make_mocks.py` | 1/5 de la rejilla; los mocks pesan poco (`web/data/mock` ≈ 0.9 MB) | No |
| Redondeo en `xy_to_cell` | `floor(round(v, 9))` | `geo.py` / `geo.js` | Evita que un punto exactamente en un borde caiga en celdas distintas en Py y JS | No |
| Node mínimo | ≥ 22.12 | CI, README | D-M0-03 | **Sí** (afecta a §3.7) |
| Sin cambios a `constants.json` | — | — | — | — |

## 9. Problemas conocidos y riesgos
1. **Importante:** CI y Pages **no probados** en GitHub (D-M0-01/02/03). Lo primero tras subir: abrir el PR y revisar la pestaña Actions.
2. **Importante:** las rutas mock de rover y caminante comparten geometría (el spec pide grandes círculos), así que **con mocks las distancias son iguales en los dos modos**. T-M3-06 solo distingue modos con datos reales de M2. Opción si se quiere probar antes: desviar ligeramente la mock del caminante (requiere decisión, §11 P2).
3. **Menor (contexto, no contrato):** la tabla barométrica del contexto §5.1, marcada `[VERIFICADO ≤ 0.2 Pa]`, **no se reproduce en la fila PM-7 (z = −2.3 km): 757.3 frente a 756.85 Pa (−0.45 Pa, 0.06 %)**. El resto de filas coincide a ≤ 0.03 Pa. PM-7 queda fuera del BBOX y no afecta al proyecto. La prueba documenta la excepción.
4. **Menor:** el navegador pide `/favicon.ico` fuera de `/bioenanos/` → 404 en la consola. **M3:** agregar `<link rel="icon" href="data:,">` en `index.html` para que T-M3-01 ("sin errores de consola") no falle por esto.
5. **Menor:** `requirements.lock.txt` se congeló con Python 3.13 en la nube. En una laptop con 3.11/3.12, usar `requirements.txt` (mínimos).
6. **Menor:** `constants.js` depende de top-level await (navegadores modernos; probado en Chrome). Si `constants.json` no carga, `C` es `null`; `geo.js`/`atmos.js` lanzan "constants not loaded".

## 10. Lo que necesitan los módulos que dependen de este
- **Pueden dar por hecho:** contratos congelados y verificados; golden recalculados de forma independiente (correctos); mocks válidos contra los esquemas.
- **NO deben tocar:** `web/data/constants.json`, `tests/golden/*`, `schemas/*` (el guardián `test_m0_files.py::test_contract_unchanged` hace fallar el CI) ni `pipeline/{geo,constants,atmos}.py` / `web/js/{geo,constants,atmos}.js` (propongan cambios en su handoff).
- **Trampas:**
  - Radios: rejilla y distancias con **R = 3388 km** (`C.geo.R_km`); ráster USGS en una esfera de **3 396 190 m** (`C.geo.R_source_sphere_m`) con longitudes **−180..180**. M1: píxel fuente = `R_src·λ_rad` (λ en −180..180, usar `geo.lon_to_180`); **nunca** uses R = 3388 para la fuente.
  - LEQ no es isótropa: usar `geo.horizontal_distance_m` (M2) y `dx_real = 200·kx(φ_fila)` (M1).
  - Fila 0 = **norte**; `y` decrece con `i`. Leaflet: `L.latLng(y_km, x_km)`.
  - `layers.json` → `file` relativo a `web/data/` (D-M0-04).
  - Python devuelve tuplas y JS arrays (`[x_m, y_m]`), siempre en **metros** (`llToXY`), salvo `llToXYkm`.
  - Mocks: `routes.json`/`layers.json` mock tienen `"mock": true`; los reales deben tener `"mock": false` (T-M2-08, T-M6-07).
  - Vitest solo recoge `tests/js/**/*.test.js`: nombrar `test_mX_algo.test.js`.
- **Desde cero:** `git clone …; pip install -r requirements.txt; npm install` (el `postinstall` vendoriza Leaflet); `python -m pytest -q tests/py; npm test; npm run serve`.
- **Por módulo:** M1 → `atmos.shield_column_gcm2`, `geo.xy_to_ll` sobre los centros de `geo.cell_center`. M2 → `geo.horizontal_distance_m`, `geo.ll_to_cell`, `atmos.atmos(z).rho`. M3 → `data.js` cae a `data/mock/*`, que ya existe. M4/M5 → `atmos.env_fixed`, `atmos.dose_mGy`; stubs a reemplazar conservando la firma.

## 11. Preguntas abiertas para el equipo humano
1. **Subir M0 al repo** y configurar Pages (D-M0-01, D-M0-07). *Recomendado:* que P1 lo suba hoy, porque M0 bloquea a todos.
2. **¿Desviar la mock del caminante** para que T-M3-06 se pueda probar con mocks? *Recomendado:* no; mantener el spec y re-ejecutar T-M3-06 en M6 con datos reales.
3. **¿Aceptar Node ≥ 22.12** como requisito (D-M0-03)? *Recomendado:* sí (Node 20 está fuera de soporte). La alternativa es fijar `vitest@3`.
4. **¿Aceptar las versiones nuevas de Actions** (D-M0-02)? *Recomendado:* sí, y volver a las del spec solo si el CI falla.

## 12. Checklist de cierre
- ☒ Todas las pruebas de mi módulo pasan (local)
- ☒ Todas las pruebas de los módulos previos pasan (N/A: primer módulo)
- ☒ Solo toqué archivos de mi módulo (§3.5), o justifiqué la excepción en §7
- ☒ No cambié contratos (schemas, constants.json, golden): lo verifica el guardián
- ☒ No dejé secretos ni datos crudos pesados en el repo (`web/` ≈ 3.9 MB, casi todo Leaflet + mocks)
- ☒ Sección `## M0` del README actualizada
- ☐ Handoff en `docs/handoff/HANDOFF_M0.md` ☒ / **PR abierto con CI verde ☐** (pendiente: sin acceso a GitHub)
