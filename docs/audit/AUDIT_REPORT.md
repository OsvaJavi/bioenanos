# Informe de auditoría — Arcadia Planitia Surface Navigator

**Repositorio:** `OsvaJavi/bioenanos`, `main` @ `0f8d5ba` (merge del PR de M6) · **Sitio:** https://osvajavi.github.io/bioenanos/
**Fecha:** 2026-11-15, 12:50–14:45 (America/Mexico_City) · **Auditor:** Claude (Claude Code, Opus 5.5), auditoría independiente según `AUDIT_PROMPT.md`.
**Alcance:** fases 1–9 (solo lectura y pruebas). No se modificó ningún archivo del repo; este informe, `docs/audit/scripts/` y `docs/audit/evidence/` son lo único que se agrega.

---

## 1. Veredicto ejecutivo

### **GO con riesgos**

El sitio público funciona en Chromium, Firefox y WebKit, sin errores de consola, sin peticiones externas y sin 404. La física, la geodesia y las rutas **se verificaron con implementaciones propias escritas desde el spec**:
- los 54 valores dorados se reproducen;
- la paridad Python↔JS es exacta, con un error relativo ≤ 2e-15;
- las 20 rutas son óptimas según un Dijkstra propio y cumplen P-13;
- todas las cifras del README y del guion de demo se reproducen.

**No encontré ningún P0.** Los riesgos están en la entrega, en la credibilidad de la demo y en la robustez ante datos corruptos.

**Los 5 problemas más importantes:**

1. **H-01 (P1, entrega):** el repo no declara en ninguna parte que el código y los datos se generaron con IA. La guía de Space Apps 2026 lo exige para "Code and data … in descriptive text and metadata", además del campo "Use of Super Intelligence (SI)" del formulario. Se arregla en 5 minutos con una sección en el README.
2. **H-02 (P2, demo/ciencia):** la temperatura central estimada no tiene tope.
   - El guion de demo (`docs/DEMO_SCRIPT.md:23`) pide cambiar la velocidad a 1.3 m/s en vivo; con eso la UI muestra **"Core temp up to 43.6 °C"**.
   - Con entradas extremas válidas del formulario llega a **155.4 °C**.
   - El modelo (§6.6) se implementó tal cual, pero un jurado lo leerá como un error.
3. **H-03 (P2, robustez):** si `constants.json` falta o está corrupto, o si `pois.json` o `layers.json` llegan como `{}`, la app queda **en blanco** con una excepción sin manejar, en los 3 navegadores. Esto viola la tarea de M6: "nunca pantalla en blanco".
4. **H-05 (P2, robustez):** `o2_plan` (Python) y `o2Plan` (JS) pueden entrar en **bucle infinito** por una comparación de punto flotante.
   - En Python se reproduce con las rutas reales y EVA = 8.2 h o 4.1 h.
   - En JS solo lo reproduje con entradas sintéticas; en un barrido de 137 625 combinaciones alcanzables desde el formulario no se colgó.
5. **H-06 (P2, despliegue):** `pages.yml` publica en cada push a `main` aunque el CI falle. Hoy el CI está en verde, pero un merge rojo de última hora llegaría al sitio de la entrega.

Los siguientes son menores pero visibles:
- H-07: con menos de 1024 px de ancho o con zoom al 200 % aparece scroll horizontal.
- H-09: `DATA_LICENSE.md` está desactualizado; acredita HiRISE y Mars Trek, que no se usan, y omite CTX, THEMIS y Viking.
- H-16: un doble clic en "Simulate traverse" deja la simulación corriendo.

---

## 2. Línea base

### 2.1 Entorno
| Herramienta | Versión | Nota |
|---|---|---|
| SO | Windows 11 (Git Bash) | Checkout con `core.autocrlf=true` |
| Python | 3.11.9 (venv nuevo) | Spec ≥ 3.11; el CI usa 3.13 |
| Node | 22.23.5 (zip oficial, SHA-256 verificado) | Vitest 5.1.0 exige `^22.12` |
| Playwright | 1.65.1 (Chromium, Firefox, WebKit) | |
| `pip install -r requirements.txt` | OK | numpy 2.4.6, scipy 1.17.1, rasterio 1.4.4 (≠ lock; ver H-10) |
| `npm ci` | OK, 0 vulnerabilidades | `git status` limpio después (el vendor no ensucia) |

### 2.2 Pruebas (3 corridas seguidas, con `set -o pipefail`)
| Suite | Corrida 1 | Corrida 2 | Corrida 3 | Declarado en HANDOFF_M6 |
|---|---|---|---|---|
| `pytest -q tests/py` | 161 passed (80.9 s) | 161 passed (70.7 s) | 161 passed (58.3 s) | 161 ✔ |
| `npm test` (Vitest) | 89 passed | 89 passed | 89 passed | 89 ✔ |
| `npm run e2e -- --repeat-each=3` | 78 passed, 3 skipped (= 26 + 1 omitida, × 3) | — | — | 26 + 1 omitida ✔ |

No hubo pruebas intermitentes. La omitida es `T-M6-03 public site`. La corrí con `PAGES_URL=https://osvajavi.github.io/bioenanos/ npx playwright test -g "public site" --browser=all` y pasó en los 3 navegadores.

### 2.3 CI en GitHub (API pública)
| Workflow | Commit | Resultado |
|---|---|---|
| `ci` (push a main) | `0f8d5ba` | ✔ success |
| `pages` (push a main) | `0f8d5ba` | ✔ success (los 3 anteriores fallaron porque Pages no estaba activado; ya está resuelto) |
| Versiones de las Actions (`checkout@v7`, `setup-python@v7`, `setup-node@v7`, `configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5`) | — | Todas existen (HTTP 200 en `git/ref/tags`) |

---

## 3. Tabla de hallazgos

Orden: por severidad. "Repro" son comandos desde la raíz del repo; los scripts están en `docs/audit/scripts/` (`S=docs/audit/scripts`).

| ID | Sev. | Área | archivo:línea | Resumen | Reproducción | Esperado | Obtenido | Corrección propuesta |
|---|---|---|---|---|---|---|---|---|
| H-01 | **P1** | Entrega / Space Apps | `README.md:1-7`; `docs/DEMO_SCRIPT.md:70` | El repo no declara el uso de IA. La guía 2026 exige que el código y los datos generados lo reconozcan "in descriptive text and metadata". El checklist llama al campo "Use of AI", pero en el formulario se llama "Use of Super Intelligence (SI)". | `grep -niE "\bAI\b\|artificial\|LLM\|Claude\|agent" README.md` → solo coincide "Agent rules". Guía leída en https://www.spaceappschallenge.org/resources/project-submission-guide/ (sección "Use of Super Intelligence (SI)") | Una declaración en el README y en los metadatos (por ejemplo, el campo `generator` de los JSON) | No existe | Agregar `## Use of AI (Super Intelligence)` al README: qué escribieron los agentes (código, pipeline, docs) y qué decidió y revisó el equipo. Opcional: `"generated_with"` en `package.json`. Cambiar "Use of AI" por "Use of Super Intelligence (SI)" en el checklist. Podría escalar a P0 si un juez lo aplica estrictamente. |
| H-02 | P2 | Modelo / demo | `pipeline/models_walker.py:147-152`; `web/js/models/walker.js:118-121`; `docs/DEMO_SCRIPT.md:23` | La temperatura central crece linealmente sin tope (§6.6). La UI muestra valores imposibles. | `python -I -X utf8 $S/p6_claims.py .` → AP-9 a 1.3 m/s: "Tc max 43.6 °C". En la UI: ON FOOT, APMR, todos los campos al máximo → "Core temp up to 155.4 °C" (`evidence/run_wf.txt`, EXTREMES) | Un valor plausible, o un aviso de que el modelo dejó de ser válido | 43.6 °C en el paso del guion de demo; 155 °C con entradas válidas | **Decisión humana** (§6.6 es spec): mostrar "> 40 °C — outside model validity" o saturar el valor mostrado, y declararlo en About. Mientras tanto, en la demo, no cambiar la velocidad a 1.3 m/s o explicar la alerta. |
| H-03 | P2 | Robustez / datos | `web/js/main.js:80-92`; `web/js/constants.js:61-62`; `web/js/data.js:40-58`; `web/js/geo.js:9` | `start()` solo atrapa errores de `loadData()`. Si `constants.json` falla, `geo.js` lanza más tarde; si `pois.json` o `layers.json` son `{}`, no se valida su forma. En los tres casos: excepción sin manejar, sin `#fatal` y pantalla sin lista. | `cd $S/e2e && npx playwright test audit_data` → `evidence/data_matrix.txt` | Aviso comprensible | `constants.json` (404, truncado, `{}`), `pois.json {}` y `layers.json {}` dan **FALLA**: `pageerror` ("geo.js: constants not loaded", "Cannot read properties of undefined (reading 'y_min_km')"), `ready=false`, sin `#fatal`. Igual en Chromium, Firefox y WebKit. | Envolver todo `start()` en `try/catch` → `ui.showFatal(...)`. Si `constantsError` existe, mostrar un error fatal. Validar la forma mínima (`pois.base`, `layers.layers`, `routes.routes` como arreglo) y, si falla, usar los mocks. |
| H-04 | P3 | Robustez / textos | `web/js/data.js:51` | `routes.json = {}` no usa los mocks: muestra el error fatal con texto técnico. | Igual que H-03 | Usar los mocks y mostrar el banner MOCK, como con 404 o JSON truncado | "Could not load mission data: Cannot read properties of undefined (reading 'map')" | Lo resuelve la validación de forma de H-03. |
| H-05 | P2 | Robustez / modelos | `pipeline/models_walker.py:131-139`; `web/js/models/walker.js:98-108` | El reparto del O₂ por EVA avanza con `room = (k+1)·lim − clock`. Cuando `clock` llega a la frontera, `floor(clock/lim)` puede devolver k en lugar de k+1 por redondeo; entonces `room = 0` y el bucle no termina. La `//` de Python y el `Math.floor(a/b)` de JS redondean distinto, así que fallan con entradas diferentes. | Python con datos reales: `python -I -X utf8 $S/p5_o2_hang.py . $S` → 203 combinaciones POI × EVA (pasos de 0.01 h) se cuelgan, por ejemplo **AP-9 con 8.2 h y 4.1 h**, y las 5 POI con 8.2 h. Prueba directa: `pw.o2_plan(segs_AP9, eva_limit_h=8.2)` no termina (`timeout 20` → exit 124). JS: `node $S/p5_hang_probe.mjs . <out>/p5_inputs.json o2` se cuelga en el caso 13 (`$S/o2_case13.json`, EVA 1.68 h). | Siempre termina | Bucle infinito. En la UI, `p5_o2_hang_js_sweep.mjs` no encontró combinaciones colgantes (0 de 137 625) y `audit_o2hang.spec.mjs` con 8.2 h y 4.1 h pasa. El riesgo es para `export_routes` y `sensitivity.py` si se cambia `eva_limit_h`, y latente en JS. | Repartir por **solape de intervalos** `[t0,t1) ∩ [k·lim,(k+1)·lim)` sin acumular `clock` (ver `mymodels.o2_plan`), o protegerse con `if take <= 0: k += 1`. Agregar una prueba con el caso 13 y con AP-9 a 8.2 h. |
| H-06 | P2 | Despliegue | `.github/workflows/pages.yml:2-5` | `pages` publica `web/` en cada push a `main` sin depender de `ci`. | Leer el workflow; los runs de `pages` y `ci` del mismo commit corren en paralelo (API) | Publicar solo si `ci` pasa | Independientes | `on: workflow_run: {workflows: [ci], types: [completed], branches: [main]}` + `if: github.event.workflow_run.conclusion == 'success'` (y `ref: ${{ github.event.workflow_run.head_sha }}` en checkout), o un solo workflow con `needs: test`. Es un cambio de `.github/` (M0); no es un contrato. |
| H-07 | P2 | UI / accesibilidad | `web/css/hud.css:34` | `body { min-width: 1024px }`: por debajo de 1024 px CSS hay scroll horizontal y el mapa, el veredicto y la telemetría quedan parcialmente fuera de la vista. Afecta a 1440 px con zoom al 200 % (WCAG 1.4.10) y a una laptop de 1280 px con zoom al 150 %. | `cd $S/e2e && npx playwright test audit_layout_a11y -g pantalla` → `evidence/run_ui.txt` (líneas `LAYOUT`) | Sin desborde con zoom al 200 % | 390, 768 y 720 (1440 al 200 %): `scrollWidth=1024`; `#map` empieza en x=−288. Pasa en 1280, 1440 y 1920. | El spec dice "escritorio" (D-C4), así que el móvil no es obligatorio. Aun así, conviene un `@media (max-width: 1023px)` que apile la barra lateral y la telemetría. Como mínimo, documentar el ancho mínimo. |
| H-08 | P3 | Accesibilidad | `web/js/telemetry_walker.js:33` | axe-core: `scrollable-region-focusable` (serious) en `.wk-summary`. | `npx playwright test audit_layout_a11y -g axe` → `AXE walker AP-9` | 0 violaciones | 1 violación (las otras 3 vistas: 0) | `tabindex="0"` y `role="region"` + `aria-label` en `.wk-summary`. |
| H-09 | P3 | Licencias | `DATA_LICENSE.md:5-6` | Acredita HiRISE y Mars Trek, que no se usan. Omite el **CTX DTM y la ortoimagen** (CC0, usados en el detalle), el **mosaico THEMIS IR día v12** y **Viking MDIM 2.1**. La UI (`web/js/ui.js:137-145`) y el README sí están bien. | `cat DATA_LICENSE.md` frente a `data/processed/source_report.json` (S-DEM4/S-OPT1 = CTX, S-TI2 = THEMIS v12, S-OPT2 = Viking) | Coherencia entre las tres fuentes | Desactualizado (es el texto original del Apéndice D) | Actualizar `DATA_LICENSE.md`. Es un archivo del Apéndice D, pero no es un contrato según la regla 3 del prompt; confirmarlo con el humano. Licencia CTX verificada en STAC: `CC0-1.0`. |
| H-10 | P3 | Reproducibilidad | `requirements.lock.txt:1,10`; `.github/workflows/ci.yml:14`; `README.md:29` | El lock fija `numpy==2.5.3`, que **no se instala en Python 3.11** (mínimo declarado). Su cabecera dice "CI uses 3.11", pero el CI usa 3.13. Ni el CI ni el README usan el lock, así que cada máquina instala versiones distintas. | `pip install --dry-run -r requirements.lock.txt` en 3.11 → `No matching distribution found for numpy==2.5.3` | El lock se instala con el Python mínimo | No se instala | Elegir una opción: subir el mínimo a 3.12+ o regenerar el lock en 3.11. Hacer que el CI instale el lock. Corregir el comentario. |
| H-11 | P3 | Reproducibilidad | `tools/make_mocks.py:173` | `make_mocks.py` no es reproducible byte a byte entre plataformas: en Windows cambian 20 valores `ref` del caminante en el 15.º dígito. | `python tools/make_mocks.py && git diff --stat` → `web/data/mock/routes.json \| 2 +-` | `git diff` vacío | 1 archivo modificado (diferencias relativas de ~5e-15) | Redondear `ref` (por ejemplo a 9 decimales) antes de serializar. `export_routes` sí es determinista (dos corridas idénticas). |
| H-12 | P3 | Higiene | `pipeline/export_routes.py:182`; `tools/make_mocks.py:173-174`; `pipeline/fetch_data.py:225`; `.gitattributes` | `write_text` sin `newline="\n"` escribe CRLF en Windows. `.gitattributes` no cubre `*.json`. `data/processed/source_report.json` está versionado con CRLF. | `git add --renormalize . && git status` → `M data/processed/source_report.json` (824 líneas); `git show HEAD:data/processed/source_report.json \| od -c \| head -1` → `{ \r \n` | Renormalizar no produce cambios | 1 archivo | `newline="\n"` en los `write_text` y `*.json text eol=lf` en `.gitattributes`. |
| H-13 | P3 | Contratos / herramienta | `tools/extract_spec_files.py:27-34` | El extractor no sirve como verificación: aborta con exit 1 en `web/data/pois.json`, que diverge por diseño (M1 rellena `elev_m`). Sin `--dry-run`, **antes** de abortar ya reescribió los 10 archivos previos (no es atómico; en Windows, con CRLF). No llega a revisar `ci.yml`, `pages.yml` ni el README. | `python tools/extract_spec_files.py docs/MARS_PROJECT_MASTER_SPEC.md --dry-run` → `Exists and differs (use --force): web/data/pois.json`, exit 1 | Se niega a sobrescribir **y** no reporta diferencias en contratos | Los contratos son idénticos byte a byte (`python -I $S/p2_appendixD_diff.py .`). Difieren `pois.json` (solo `elev_m`), `ci.yml`, `pages.yml` (versiones de las Actions, cambio documentado) y `README.md` (por diseño). | Agregar `--check`: comparar todo sin escribir y listar las diferencias, con una lista blanca de las que se esperan (`pois.json.elev_m`, workflows, README). |
| H-14 | P3 | Contratos (solo reportar) | `web/data/constants.json` | 7 hojas `FUENTE` sin fuente en §10 ni en el contexto: `geo.R_source_sphere_m`, `o2.O2_kg_per_L`, `bio.latent_J_per_g`, `bio.body_cp_J_per_kgK`, `bio.Tc0_C`, `bio.hrmax_a`, `bio.hrmax_b`. `_meta.version` = "1.1" con spec v1.2. | `python -I $S/p2_schemas_constants.py .` | Cada FUENTE cita una fuente de §10 | 7 sin cita (los valores son estándar; R_source_sphere sí está verificado en `source_report.json`) | **No tocar** (contrato). Agregar las fuentes a §10 en la próxima revisión del spec. |
| H-15 | P3 | Documentación del spec | `docs/MARS_PROJECT_MASTER_SPEC.md` §6.8 (G-ROV-1, G-ROV-6), §3.7 | El texto de §6.8 dice 0.42069/0.48069 y 0.42040, y el golden dice 0.42070/0.48070 y 0.42041. Mi cálculo da 0.420699 / 0.480699 / 0.420409: todos dentro de la tolerancia. §3.7 dice "Node ≥ 20", pero Vitest 5 exige `^22.12` (el README sí lo dice). | `python -I -X utf8 $S/p5_golden.py .` | Coherencia interna | Discrepancias de redondeo | Corregir el spec en la próxima revisión. |
| H-16 | P3 | UX | `web/js/telemetry_rover.js:83` (+ CSS de `.rv-play`) | Al pasar la etiqueta de "Simulate traverse" a "Pause", el botón se encoge de 161 a 63 px. El segundo clic de un doble clic cae en el botón "×60", así que la simulación sigue corriendo con la etiqueta "Pause". | `cd $S/e2e && npx playwright test audit_dblclick` → `DBL dblclick: label=Pause energía 0.0867 -> 0.1664` en los 3 navegadores; dos clics separados sí pausan. Medido: `before:[736,161] after:[736,63]`, y el centro original cae en `.rv-speed`. | Un doble clic deja el estado coherente | La simulación sigue corriendo | `min-width` fijo en `.rv-play` / `.wk-play`. |
| H-17 | P3 | Textos (Apéndice C) | `web/js/telemetry_walker.js:134`; `web/js/telemetry_rover.js:199` | "Max O₂ per EVA" aparece como "Max O₂ in one EVA". "Held by heater" y "Battery reserve" aparecen con otras mayúsculas. | `npx playwright test audit_layout_a11y -g textos` → `missingExact: ["Battery reserve","Held by heater","Max O₂ per EVA"]` | Cadenas exactas | 3 difieren | Usar las cadenas del Apéndice C. Sin TODO, STUB ni "Pending module" (OK). |
| H-18 | P3 | UX / formulario | `web/js/telemetry_rover.js:133-139`; `web/js/models/rover.js` (`validatePayload`) | Con una carga inválida el campo se marca y aparece el mensaje, pero el resumen sigue mostrando el cálculo **anterior** sin indicar que está desactualizado. `validatePayload('0x10'/'0b11'/'0o7')` acepta 16, 3 y 7 kg, aunque el `<input type=number>` lo evita en la UI. | `$S/e2e/audit_forms.spec.mjs` (PAYLOAD), `$S/p5_parity.py` | El resumen vacío o atenuado si el valor es inválido | Queda el resumen anterior | Atenuar el resumen o mostrar "—" cuando `!r.ok`. Usar `/^\s*-?\d+(\.\d+)?\s*$/` en lugar de `Number()`. |
| H-19 | P3 | Rendimiento | — | Con Fast 3G emulado (CDP), la app tarda **11.0 s** en estar lista en local y 7.0 s contra Pages. M6 midió "< 5 s" solo en un servidor local. En red real (sin caché, desde aquí): 0.96 s (Chromium), 2.3 s (Firefox), 1.7 s (WebKit), con 1.9–2.2 MB descargados. | `npx playwright test audit_load -g "red lenta"`; `node $S/e2e/measure_public_load.mjs` | < 5 s | OK en red real; 7–11 s en 3G | Opcional: carga diferida de `routes.json` (630 kB) o compresión de PNGs. |
| H-20 | P3 | Pruebas | `tests/py/test_m2_real.py:103-104` | T-M2-07 (óptimo ≤ Bresenham) solo revisa las rutas `out`. | Leer la prueba | Las 20 rutas | 10 rutas | Quitar el `continue`. Mi verificación cubre las 20 contra un Dijkstra propio (todas OK). |
| H-21 | P3 | Licencia del código | raíz del repo | No hay `LICENSE` para el código (§3.6: "DECISION pendiente"). El repo es público. | `git ls-files \| grep -i licen` → solo `DATA_LICENSE.md` y la de Leaflet | Licencia explícita | Ninguna | Agregar MIT, como sugiere el spec, si el equipo lo decide. |

---

## 4. Sospechas no confirmadas

| ID | Sospecha | Qué haría falta para confirmarla |
|---|---|---|
| S-1 | HANDOFF_M6 §9.3 afirma que la guía prohíbe "material que promueva productos comerciales". En la página de la guía de entrega no encontré esa regla (busqué `commercial`, `promot`, `endorse`, `product`). Puede estar en los Términos y Condiciones. | Leer los T&C de Space Apps 2026. Mientras tanto, seguir presentando el Tesla como "vehículo de referencia", como ya indica el checklist. |
| S-2 | La guía dice que la SI "should not be used to come up with your idea". El spec atribuye a Claude las decisiones por defecto P-01…P-16, que son parámetros de ingeniería, no la idea. Un juez podría leerlo mal. | Que el equipo explique en el campo SI que la idea y las decisiones D-* fueron humanas. |
| S-3 | Sin conexión después de cargar, las capas que no se vieron antes no se cargan (no hay service worker). En Chromium aparecen 7 `ERR_INTERNET_DISCONNECTED` y la app muestra el aviso de capa no disponible. | No es un requisito del spec. Solo documentarlo; el plan B del guion (`npm run serve`) lo cubre. |
| S-4 | La leyenda de elevación usa un estiramiento −3984…−3827 m; el DEM va de −4233 a −3692 m, así que se saturan los extremos. | Confirmar si la leyenda lo explica en la UI. Si no, agregar "(2–98 % stretch)". |
| S-5 | En WebKit, la prueba de reproducción del rover a ×60 con reloj simulado expiró (5 min). En Chromium y Firefox pasa y a ×600 / ×3600 pasa en los 3. Lo atribuyo a la lentitud del reloj simulado en WebKit, no a la app. | Repetir en WebKit con reloj real (unos 12 min a ×60). |
| S-6 | `n_evas` redondea a 1e-9: con t = 8 h + 1 µs da 1 EVA (el ceil exacto da 2). Con 8 h + 1 s da 2, correcto. | Despreciable; solo documentar la tolerancia. |

---

## 5. Matriz de trazabilidad (§8.1)

Leyenda: ✔ cubre lo pedido · ◐ cubre parcialmente o de forma más débil · ✖ sin prueba. Archivos: `py/` = `tests/py/`, `js/` = `tests/js/`, `e2e/` = `tests/e2e/`.

| ID | archivo::prueba | ¿Cubre? | Comentario |
|---|---|---|---|
| T-M0-01 | `py/test_m0_files.py::test_file_exists`, `::test_json_parses`, `::test_contract_unchanged` | ✔ | También verifica que los contratos no cambien respecto al Apéndice D. |
| T-M0-02 | `py/test_m0_geo.py::test_golden`; `js/test_m0_geo.test.js` "golden geo.json" | ✔ | Python y JS con el mismo JSON. Lo verifiqué de forma independiente (r_local 3388.0020, G-LEQ-2 113.244/76.871, k_x 0.98071). |
| T-M0-03 | `py/test_m0_atmos.py::test_g_atm_1`; `js/test_m0_atmos.test.js` "G-ATM-1" | ✔ | |
| T-M0-04 | `py/test_m0_constants.py::test_every_leaf_has_value_and_valid_source`; `js/test_m0_constants.test.js` | ✔ | No comprueba que FUENTE cite §10 (ver H-14), pero el spec no lo pide. |
| T-M0-05 | `py/test_m0_mocks.py::test_mock_routes_schema`, `::test_mock_layers_schema_and_files`, `::test_pois_schema_and_inside_grid` | ✔ | |
| T-M0-06 | — (proceso) | ◐ | No hay una prueba automática; verifiqué el CI en verde en `main` con la API. |
| T-M0-07 | `js/test_m0_serve.test.js` "serves Leaflet under /bioenanos/" | ✔ | |
| T-M1-01 | `py/test_m1_real.py::test_t_m1_01_geo_golden_reuse` | ✔ | |
| T-M1-02 | `py/test_m0_geo.py::test_leq_roundtrip_1000_points`; `py/test_m1_derive.py::test_srcgeo_roundtrip_against_rasterio_transform` | ✔ | Yo lo hice con 10 000 puntos: error 0 (repo) y 5.7e-14° (mío). |
| T-M1-03 | `py/test_m1_real.py::test_t_m1_03_pois_on_valid_cells` | ✔ | |
| T-M1-04 | `py/test_m1_real.py::test_t_m1_04_dem_coverage_and_ap1` | ✔ | AP-1 a −3928 m; mi bilineal da lo mismo para los 6 sitios. |
| T-M1-05 | `py/test_m1_real.py::test_t_m1_05_slopes` | ✔ | Mi Horn con k_x coincide hasta 5.3e-5°. |
| T-M1-06 | `py/test_m1_real.py::test_t_m1_06_layers_schema_and_files` | ✔ | |
| T-M1-07 | `py/test_m1_derive.py::test_peak_lands_in_expected_cell` (4 parámetros), `::test_wrong_radius_would_be_caught` | ✔ | Además prueba que un radio equivocado se detectaría. |
| T-M1-08 | `py/test_m1_real.py::test_t_m1_08_source_report_complete` | ◐ | El `set(SOURCE_IDS) <= ids` sí cubre lo pedido, pero la segunda aserción es tautológica para todo lo que no sea S-DEM1 (precedencia de `and`/`or`). |
| T-M1-09 | `py/test_m1_real.py::test_t_m1_09_layers_size` | ✔ | |
| T-M2-01 | `py/test_m2_models.py` (`test_rover_*`, `test_c_w`, `test_metabolic`, `test_g_wlk_3_segment`, `test_o2_plan*`, `test_g_bio_1`) | ✔ | |
| T-M2-02 | `py/test_m2_real.py::test_t_m2_02_endpoints` | ✔ | |
| T-M2-03 | `py/test_m2_real.py::test_t_m2_03_length_vs_straight` | ✔ | |
| T-M2-04 | `py/test_m2_real.py::test_t_m2_04_cuts` | ✔ | Lo recalculé de forma independiente: 0 violaciones en las 20 rutas. |
| T-M2-05 | `py/test_m2_routing.py::test_wall_rover_goes_through_gap`, `::test_wall_walker_climbs_over`; `py/test_m2_real.py::test_t_m2_05_report_rover_vs_walker` | ✔ | |
| T-M2-06 | `py/test_m2_real.py::test_t_m2_06_determinism`; `py/test_m2_routing.py::test_determinism` | ✔ | Compara después de la decodificación universal de saltos de línea (ver H-12). |
| T-M2-07 | `py/test_m2_real.py::test_t_m2_07_optimum_vs_bresenham` | ◐ | Solo las rutas `out` (H-20). |
| T-M2-08 | `py/test_m2_real.py::test_t_m2_08_schema` | ✔ | |
| T-M2-09 | `py/test_m2_real.py::test_t_m2_09_ref_reproducible` | ✔ | |
| T-M2-10 | `py/test_m2_real.py::test_t_m2_10_runtime` | ✔ | Unos 10 s. |
| T-M3-01 | `e2e/m3_ui.spec.js` "T-M3-01 loads without console errors" | ✔ | |
| T-M3-02 | `e2e/m3_ui.spec.js` "T-M3-02 markers = 5 POI + 1 base" | ✔ | |
| T-M3-03 | `e2e/m3_ui.spec.js` "T-M3-03 list sorted…"; `js/test_m3_data.test.js` "sortByDistance…" | ✔ | |
| T-M3-04 | `e2e/m3_ui.spec.js` "T-M3-04 no route lines by default" | ✔ | |
| T-M3-05 | `e2e/m3_ui.spec.js` "T-M3-05 clicking a POI draws exactly one route…" | ✔ | |
| T-M3-06 | `e2e/m3_ui.spec.js` "T-M3-06 mode change emits mode:changed…" | ✔ | |
| T-M3-07 | `e2e/m3_ui.spec.js` "T-M3-07 layer selector swaps the overlay…" | ✔ | |
| T-M3-08 | `js/test_m3_data.test.js` "T-M3-08 llToXY in JS equals Python" | ✔ | |
| T-M3-09 | `e2e/m3_ui.spec.js` "T-M3-09 MOCK DATA banner only with mock data" | ✔ | |
| T-M4-01 | `js/test_m4_rover.test.js` "golden rover.json", "G-ROV-2 Earth calibration" | ✔ | |
| T-M4-02 | `js/test_m4_rover.test.js` "covers the 10 rover routes"; `e2e/m4_rover.spec.js` "T-M4-02…" | ✔ | Real: error relativo 0 frente a `ref`. |
| T-M4-03 | `js/test_m4_rover.test.js` "accepts 0 … 537 kg…"; `e2e/m4_rover.spec.js` "T-M4-03 / T-M4-04" | ✔ | Ver H-18 (resumen desactualizado). |
| T-M4-04 | `js/test_m4_rover.test.js` "on every rover route"; e2e ídem | ✔ | |
| T-M4-05 | `js/test_m4_rover.test.js` "cumulative energy…"; `e2e/m4_rover.spec.js` "T-M4-05 / T-M4-06" | ✔ | Lo verifiqué a ×60, ×600 y ×3600: error relativo 1e-15. |
| T-M4-06 | `e2e/m4_rover.spec.js` "T-M4-05 / T-M4-06…" | ✔ | |
| T-M4-07 | `js/test_m4_rover.test.js` "200 km…", "120 km…" | ✔ | |
| T-M5-01 | `js/test_m5_walker.test.js` (golden, "G-WLK-3 segment", "G-BIO-1", "G-ENV-1") | ✔ | |
| T-M5-02 | `js/test_m5_walker.test.js` "covers the 10 walker routes", "summary … equals routes.json summary" | ✔ | |
| T-M5-03 | `js/test_m5_walker.test.js` (validateForm); `e2e/m5_walker.spec.js` "T-M5-03…" | ✔ | Los 13 campos los verifiqué en la UI (`evidence/run_wf.txt`). |
| T-M5-04 | `js/test_m5_walker.test.js` "more mass => more O2", "more speed => more P_total and less time" | ✔ | |
| T-M5-05 | `js/test_m5_walker.test.js` "n_evas = ceil(…) with the 8.0 h edge = 1"; `py/test_m2_models.py::test_o2_plan_edge_exactly_8h_is_one_eva` | ✔ | Incluye 8 h + 1 s → 2. No cubre el bucle infinito (H-05). |
| T-M5-06 | `js/test_m5_walker.test.js` "cumulative kcal and O2 at the end…"; `e2e/m5_walker.spec.js` "T-M5-06 / T-M5-07" | ✔ | Lo verifiqué a ×600, ×3600 y ×36000. |
| T-M5-07 | `e2e/m5_walker.spec.js` "T-M5-06 / T-M5-07…" | ✔ | |
| T-M6-01 | Las 3 suites completas (CI) | ✔ | 161 + 89 + 26 en verde, 3 veces. |
| T-M6-02 | `e2e/m6_integration.spec.js` "T-M6-02 / T-M6-04 every POI in both modes…" | ✔ | Lo amplié con show return × 8 capas × 3 subcapas: OK. |
| T-M6-03 | `e2e/m6_integration.spec.js` "T-M6-03 works under /bioenanos/…", "T-M6-03 public site" | ◐ | La parte pública se omite sin `PAGES_URL`. **La corrí: pasa en los 3 navegadores.** |
| T-M6-04 | `e2e/m6_integration.spec.js` (T-M6-02/04) | ✔ | |
| T-M6-05 | `e2e/m6_integration.spec.js` "T-M6-05 attribution links are present" | ✔ | Ver H-09 (DATA_LICENSE). |
| T-M6-06 | `e2e/m6_integration.spec.js` "T-M6-06 APMR…" | ✔ | |
| T-M6-07 | `e2e/m6_integration.spec.js` "T-M6-07 real data…" | ✔ | |

**Ninguna prueba del spec queda sin implementar.** Tres son más débiles de lo que piden (T-M1-08, T-M2-07 y T-M6-03, esta última por omitirse por defecto), y una es de proceso (T-M0-06).

---

## 6. Paridad numérica (Fase 5)

Implementación propia: `docs/audit/scripts/mymodels.py`, escrita desde el spec v1.2 sin importar el repo. Usa los factores exactos 4184/86400 y 60/4184; el contrato los trae redondeados a 0.048426 y 0.0143403.

### 6.1 Vectores dorados
54 de 54 comprobaciones dentro de la tolerancia: G-ROV-1…6, G-WLK-1…7, G-BIO-1, G-ATM-1, G-ENV-1, y G-GEO/G-LEQ en la Fase 3. **G-ROV-2 = 13.0111 kWh/100 km ∈ [10.5, 13.5]** ✔. El valor está bien calculado. Se acepta porque el rango se amplió en v1.2 (decisión humana documentada), no porque sea un tope físico.

### 6.2 Entradas aleatorias (10 000 del rover, 10 000 del caminante y 500 planes de O₂, con extremos)
| Modelo / magnitud | Error máx. propio vs Python | Error máx. Python vs JS |
|---|---|---|
| Rover E_drive | 0 | abs 9.3e-10 J, rel 6.0e-14 |
| Rover E_aux, t | 0 | 0 |
| Rover E_total | 0 | rel 2.3e-15 |
| Caminante E (J) | rel 1.3e-6 (redondeo del contrato) | rel 1.1e-15 |
| Caminante O₂ (L) | rel 3.1e-6 (ídem) | 0 |
| Caminante FC | rel 2.6e-6 (ídem) | 0 |
| Sudor, Tc | — | 0 / rel 5.7e-8 (propio vs JS) |
| O₂ requerido / máx. por EVA | 0 / rel 4.3e-13 | 0 / 0 |

Energías negativas: 0. `n_evas` distintos: 0 (con límites de EVA múltiplos de 0.5 h; con otros valores ver H-05).

### 6.3 Las 20 rutas (error relativo frente a `ref` exportado)
| Ruta | propia | Python | JS |
|---|---|---|---|
| 10 rutas del rover (E_total, E_drive) | ≤ 1.3e-15 | 0 | 0 |
| 10 rutas a pie (E_kcal / O₂) | ≤ 1.3e-6 / 2.9e-6 | 0 | 0 |

Detalle por ruta: `docs/audit/evidence/p5_parity.txt`.

### 6.4 Veredicto del rover (bordes)
| E_out, E_back (kWh) | propio | Python | JS |
|---|---|---|---|
| 76.8, 0 | ROUND TRIP OK | igual | igual |
| 76.8 + 1e-9, 0 | ONE-WAY ONLY | igual | igual |
| 60, 16.8 / 60, 16.8 + 1e-9 | OK / ONE-WAY | igual | igual |
| 96, 0 | ONE-WAY ONLY (0 kWh a la llegada) | igual | igual |
| 96 + 1e-9, 0 · 100, 0 | NOT REACHABLE | igual | igual |
| 80, 20 (ida > 76.8, vuelta imposible) | ONE-WAY ONLY | igual | igual |

Coincide con §6.3: el límite `(1−0.20)·96` vale `76.80000000000001` en punto flotante, así que 76.8 exacto da OK. **No hay regeneración** (C-05): en una bajada de −9.5°, E_drive = 0 y E_total = E_aux = 0.06 kWh.

### 6.5 Plan de O₂
- `n_evas = ceil(t/lím)`: 8 h → 1, 8 h + 1 s → 2, 16 h → 2 ✔.
- Reserva: `reserve_min × VO2_mean` **por EVA**, con VO₂ medio de todo el viaje, y contingencia aplicada **sobre (metabólico + reservas)**, como dice §6.5 ✔.
- Densidad: 0.001429 kg/L, correcta para el O₂ en STP (0 °C, 1 atm) ✔.
- La temperatura central se reinicia en cada frontera de EVA ✔ (`js/test_m5_walker.test.js` "core temperature restarts…", y verificado en `p6_claims.py`).

### 6.6 Unidades
Revisé J↔kWh (3.6e6), J↔Wh (3600), km↔m (×1000 en `route_energy`), grados↔radianes (`np.radians`/`Math.PI/180`), L/min↔L (÷60), W↔kcal/min (60/4184) y W↔kcal/día (4184/86400). No encontré mezclas.

### 6.7 Plausibilidad científica (observaciones; no modifiqué nada)
| Magnitud | Modelo (parámetros por defecto) | Referencia | Lectura |
|---|---|---|---|
| Metabolismo a pie | 524 W en llano (G-WLK-2); AP-9: 414–1096 W, unos 578 W de media | Apollo ≈ 230–300 W de media (rango del prompt; **no verifiqué la fuente primaria**) | De 1.7 a 2× mayor. Es coherente con el sesgo +52 % declarado de Minetti (C-06) y con escalar por los 260 kg de masa total. Es una suposición documentada, del lado seguro para el O₂. |
| O₂ | 99 L/h ≈ 0.14 kg/h (AP-9) | PLSS: **NO VERIFICADO** (no consulté datos de consumo del PLSS) | Alto por la misma razón. |
| Rover en Marte | 48 kWh/100 km en llano (0.481 kWh/km) frente a 13.0 en la calibración terrestre | Tesla WLTP 16.8 (S1b) | Lo domina `crr` = 0.15, que es un ASSUMPTION (en la Tierra, 0.009). La sensibilidad (0.08–0.30 → 36–116 kWh en AP-9) está en el README y la verifiqué. |
| f_g | 0.70 | S5, sin traje y n = 12 (extrapolado) | Declarado como extrapolación; ±20 % mueve el O₂ ±17 % (verificado). |
| Tc | 43.6 °C a 1.3 m/s; 155 °C en extremos | — | **Fuera de rango físico** (H-02). |

---

## 7. Resultados de las demás fases (sin hallazgos)

- **Geodesia (Fase 3):** con 10 000 puntos (9000 interiores, 1000 en el borde), la ida y vuelta da error 0° en el repo y 5.7e-14° en mi versión. Python vs JS: 2.6e-9 m; las celdas JS y Python son idénticas.
  - Las longitudes 203, −157, 563, 0 y 360 se envuelven bien.
  - Los bordes son semiabiertos: el borde E/S (x = 113.4, y = −77) cae fuera de la rejilla y el N/O dentro. Es coherente con `cell_center`.
  - Las coordenadas de los POI coinciden con §5 y el contexto. Mi `elev_m` bilineal da los mismos valores que `pois.json` en los 6 sitios.
  - Las distancias de gran círculo (R = 3388 km): 58.169, 118.176, 46.992, 66.769 y 49.637 km, iguales a §5 y al README (con 1 decimal). README "Route (rover)" = `length_km_3d` de `out`.
- **Datos (Fase 4):**
  - Los 4 TIF son de 1134 × 770, float32, nodata = NaN (0 NaN) y transform `(200, 0, −113400, 0, −200, 77000)`, con CRS equirectangular en R = 3 388 000.
  - DEM de −4233 a −3692 m. La pendiente va de 0 a 23.2° (media 0.838°) y coincide con mi Horn con k_x hasta 5.3e-5°; sin k_x habría diferido 0.32°.
  - La rugosidad propia coincide hasta 1.7e-3 y el blindaje hasta 1.5e-6.
  - Los PNG tienen el tamaño de la rejilla, la orientación correcta (correlación con la fuente de 0.95–0.995, frente a ≤ 0.28 volteados) y paletas coherentes.
  - **El detalle es el CTX DTM** (asset `dtm`, `…_dtm.tif`) más su `orthoimage`; no es el hillshade. Mide 1499 × 1501 px (20 m).
- **Rutas (Fase 6):** en las 20 rutas no hay NaN, `s_km` es estrictamente creciente, los saltos están dentro de los 16 vecinos, x/y coinciden con lat/lon y `length_km_3d` es igual a mi suma 3D (≤ 1e-4 km).
  - P-13 se cumple (arista + Horn de origen, destino e intermedias de caballo).
  - **Óptimas:** el costo exportado es igual al óptimo de mi Dijkstra (grafo propio, pesos propios) en las 20 rutas.
  - `back` usa el grafo transpuesto: los costos de ida y vuelta difieren; por ejemplo, AP-9 rover: 30659.42 Wh de vuelta frente a 30716.32 Wh de ida.
  - Los resúmenes coinciden con mi recálculo y con el README y el guion: 61.4, 123.3, 47.6, 67.8 y 50.2 kWh; 5, 9, 4, 5 y 4 EVAs; 3896, 7758, 3012, 4258 y 3169 L; AP-9 a 1.3 m/s: 25.5 h, 4 EVAs, 3773 L y 125 L/h.
  - La robustez de `routing.py` (inalcanzable, nodata) está cubierta por `test_m2_routing.py::test_nodata_blocks_and_unreachable_is_reported`. No escribí pruebas sintéticas propias de origen = destino ni de POI en el borde (ver §8).
  - `export_routes` dos veces → idéntico byte a byte; el único cambio frente al blob es el salto de línea final CRLF en Windows (H-12).
- **Web (Fase 7), en Chromium, Firefox y WebKit, local y contra Pages:**
  - Carga con 0 errores, 0 warnings, 0 peticiones externas y 0 respuestas 4xx. `/bioenanos` sin barra redirige con 301.
  - Recorrido de 5 POI × 2 modos × show return × 8 capas + 3 subcapas: OK.
  - Cambiar de POI, limpiar la selección (botón y Esc), recargar y el botón atrás durante la reproducción: OK.
  - 200 ciclos de POI × modo: heap de 3.5 → 5.0 MB (estable después del primer ciclo), listeners 119 → 119, nodos 1334 → 1342, siempre 3 canvas.
  - Reproducción: los acumulados finales son iguales al resumen a todas las velocidades (error relativo ~1e-15); pausa y reanudar OK.
  - Formularios: el rover rechaza o acepta correctamente las 15 entradas probadas. Los 13 campos del astronauta, en mínimo, máximo, ±ε, vacío, texto y coma, dan el mensaje correcto y nunca NaN.
  - axe-core: 0 violaciones salvo H-08. Los marcadores tienen `tabindex=0`, `role=button` y se activan con Enter. El foco es visible (no así en BODY). `prefers-reduced-motion` se respeta: 0 animaciones.
  - Sin TODO, STUB ni `console.log`, y sin `catch {}` vacíos indebidos (los dos que hay son intencionales: `serve.mjs` 404 y `chart.js`).
- **Despliegue (Fase 8):**
  - Los 53 archivos de `web/` responden 200 en Pages, con bytes idénticos al blob de git.
  - `Content-Type`: `.js` application/javascript, `.json` application/json, `.png` image/png, `.css` text/css.
  - Las mayúsculas coinciden en las 96 referencias. Peso publicado: 7.27 MB (< 25 MB).
  - Enlaces del README, la UI y el guion: 10 de 11 responden 200; tesla.com da 403 (bloqueo a bots, **NO VERIFICADO**).
- **Higiene (Fase 9):**
  - Sin secretos en todo el historial (`git log -p --all`) ni correos en archivos.
  - `data/raw`, `node_modules` y `test-results` no están versionados. El archivo más grande es `slope_deg.tif` (2.9 MB).
  - `npm audit` y `pip-audit -r requirements.txt` sin vulnerabilidades.
  - `npm install` no ensucia `package-lock.json`.
  - El Leaflet vendorizado es 1.9.4, idéntico al paquete npm salvo los saltos de línea (CRLF → LF), con la licencia incluida.
  - Quick start del README seguido al pie de la letra en un clon y un venv nuevos: OK.

---

## 8. Lo que no se pudo verificar y por qué

| Qué | Por qué |
|---|---|
| `python -m pipeline.fetch_data` y `derive_layers` de punta a punta | Requieren descargar ventanas de los mosaicos de USGS (GB) y `data/raw/`, que no se versiona. Los rasters se verificaron por recálculo (Fase 4). |
| Rendimiento con 3G en Firefox y WebKit; memoria en Firefox y WebKit | CDP solo existe en Chromium. |
| Enlace https://www.tesla.com/en_gb/models/design | 403 a clientes automatizados. |
| Plausibilidad frente a datos de Apollo y del PLSS | No consulté fuentes primarias; solo comparé con los rangos del prompt. |
| Términos y Condiciones de Space Apps (S-1) | No los revisé. |
| "Cambiar de velocidad sin saltos" | Mi prueba con reloj simulado no es concluyente: el reloj avanza en tiempo real durante el clic. No vi saltos anómalos. |
| Pruebas sintéticas propias de `routing.py` (origen = destino, POI en el borde) | Por tiempo. Los casos de inalcanzable y nodata los cubre el repo. |
| `make_mocks` y `export_routes` en Linux | Solo tengo Windows; la diferencia de H-11 podría ser específica de la plataforma. |

**Nota operativa:** al correr `pip-audit` lo instalé por error en el Python global de la máquina del auditor, no en el venv. Lo desinstalé junto con sus dependencias exclusivas; no afecta al repo.

---

## 9. Scripts y evidencia

- `docs/audit/scripts/`: todos los scripts (Python y Node) y las pruebas Playwright de la auditoría, con instrucciones en `docs/audit/scripts/README.md`. `mymodels.py` es la implementación independiente.
- `docs/audit/evidence/`: salidas de `p5_parity`, `p6_routes`, `p6_claims`, la matriz de datos corruptos y los registros de Playwright local, público y del formulario.

**Fase de corrección:** no se hizo; requiere la aprobación del humano. H-02, H-09 y H-14 tocan el spec o archivos del Apéndice D: **lo decide el humano.**
