# Scripts de la auditoría

Todos se escribieron **fuera del repo** (equivalente a `/tmp/audit/`) y se copian aquí solo para reproducir. Ninguno importa
código del repo para *calcular*: `mymodels.py` es una implementación independiente del spec v1.2 §6.2–6.6, y los scripts
solo importan `pipeline/*` o `web/js/*` para **comparar** contra ella.

Convención: `<repo>` = raíz del checkout; `<out>` = carpeta temporal de salida (fuera del repo).
En Windows, usar `python -I -X utf8` (con `-I` se ignora `PYTHONUTF8`).

| Fase | Comando | Qué hace |
|---|---|---|
| 2 | `python -I p2_appendixD_diff.py <repo>` | Compara byte a byte cada bloque `<!-- FILE -->` del Apéndice D con el blob de `HEAD`. |
| 2 | `python -I p2_schemas_constants.py <repo>` | Valida `routes/pois/layers` (reales y mock) contra `schemas/*`; revisa `value/unit/source/ref` y fuentes §10. |
| 3 | `python -I -X utf8 p3_geo.py <repo> <out>` (usa `p3_geo_js.mjs`) | Geodesia propia vs `pipeline/geo.py` y `web/js/geo.js` en 10 000 puntos; POIs vs DEM (bilineal propia); distancias. |
| 4 | `python -I -X utf8 p4_rasters.py <repo>` | Rasters, Horn propio con `k_x`, rugosidad propia, blindaje propio, PNGs. |
| 4 | `python -I -X utf8 p4_png_orient.py <repo>` | Orientación de PNGs (correlación normal/volteada) y paleta de leyenda. |
| 5 | `python -I -X utf8 p5_golden.py <repo>` | Todos los vectores dorados con `mymodels.py`. |
| 5 | `python -I -X utf8 p5_parity.py <repo> <out>` (usa `p5_js_eval.mjs`) | Paridad de 3 vías en 10 000 entradas, bordes del veredicto, `n_evas`, validación de carga, 20 rutas. |
| 5 | `python -I -X utf8 p5_o2_hang.py <repo> <dir con o2_case13.json>` | H-05: réplica del bucle de `o2_plan` con tope; caso aleatorio + barrido de EVA 1.00–12.00 h. |
| 5 | `node p5_o2_hang_js.mjs <repo> AP-9 8.2` · `node p5_o2_hang_js_sweep.mjs <repo>` · `node p5_hang_probe.mjs <repo> <out>/p5_inputs.json o2` | H-05 en JS. |
| 6 | `python -I -X utf8 p6_routes.py <repo>` | Integridad, P-13 recalculado, grafo de 16 vecinos + Dijkstra propios (pesos de `mymodels`), `back` transpuesto, resúmenes. |
| 6 | `python -I -X utf8 p6_claims.py <repo>` | Cifras del README y `docs/DEMO_SCRIPT.md` (sensibilidad, 1.3 m/s, Tc). |
| 8 | `python -I p8_case_check.py <repo>` | Mayúsculas de rutas referenciadas vs `git ls-files`. |
| 7/8 | `cd e2e && npm i @playwright/test@1.65.1 axe-core@4.10.3 && REPO=<repo> npx playwright test` | Pruebas de UI en Chromium/Firefox/WebKit. `BASE=https://osvajavi.github.io/bioenanos/` las corre contra Pages. Requiere `node tools/serve.mjs` para la URL local. |
| 8 | `cd e2e && node measure_public_load.mjs` | Tiempo real de primera carga del sitio publicado. |

Notas:
- `e2e/audit_forms.spec.mjs` contiene una primera versión de la prueba del astronauta que **expira** por latencia de Playwright (no de la app); la versión válida es `e2e/audit_walkerform.spec.mjs`.
- `e2e/audit_playback.spec.mjs` usa el reloj simulado de Playwright; la prueba "cambiar de velocidad a mitad" no es concluyente (el reloj sigue corriendo en tiempo real mientras se hace clic).
- Las pruebas no se reintentan (`retries: 0`).
