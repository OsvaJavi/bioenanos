# MARS_PROJECT_MASTER_SPEC.md
**Proyecto:** Arcadia Planitia Surface Navigator (NASA Space Apps 2026 — "Interplanetary Survival Guide: Martian Map")
**Versión:** 1.1 · **Fecha:** 2026-11-14 · **Idioma del documento:** español · **Idioma de UI y código:** inglés
**Repositorio:** `https://github.com/OsvaJavi/bioenanos` → sitio publicado en `https://osvajavi.github.io/bioenanos/` (subruta `/bioenanos/`)
**Equipo:** 4 personas, cada una con un agente LLM con terminal e internet (Claude Code, Codex, Gemini CLI).
**Plazo duro:** domingo 2026-11-15, 20:00 (America/Mexico_City). Tiempo disponible desde la v1.1: ~24.5 h.

---

## Cambios respecto a v1.0

| # | Cambio | Motivo |
|---|---|---|
| C-01 | **Se agrega M0** (andamiaje y contratos) y se **paraleliza** M1–M5 entre 4 personas (§9). | Decisión del equipo. Ir en serie no cabe en 24 h. |
| C-02 | Rejilla de rutas y capas a **200 m nativos** (antes 100 m) y BBOX ajustado a **200.5–205.5°E × 38.7–41.3°N**. | El DEM fuente es de 200 m: remuestrear a 100 m no añade información y cuadruplica el grafo (77 M → ~14 M aristas). |
| C-03 | Paralelo estándar de LEQ: **φ₀ = 40.0°N** (antes 40.2°N). Ahora el BBOX queda simétrico. | Centro del nuevo BBOX. |
| C-04 | LEQ **no es isótropa**: la escala en x varía ±1.9 % dentro del BBOX. Las longitudes de arista y las pendientes usan el factor `k_x(φ) = cos φ / cos φ₀` (§3.3). | En v1.0 se daba por isótropa, lo cual es incorrecto lejos de φ₀. |
| C-05 | **Regeneración eliminada** del modelo del rover (D-D2 rev.). Si la energía en la rueda es negativa, la energía de tracción es 0. Se elimina la salida "energía recuperada". | Decisión del equipo. Con crr = 0.15 solo habría regenerado en bajadas > 8.5°. Además, garantiza pesos de arista ≥ 0, que Dijkstra requiere. |
| C-06 | Modelo a pie: **polinomio de Minetti tal cual**, con sesgo declarado (+52 % en llano frente a lo medido). | Decisión del equipo (lado seguro para el O₂). |
| C-07 | Reserva de O₂ **por EVA** (no una sola vez) y salida **O₂ por EVA** además del total. | En trayectos de varias EVAs, cada salida necesita su propia reserva. |
| C-08 | Polilínea de ruta = **camino de nodos** de Dijkstra (sin remuestreo) con `x_km, y_km`. `routes.json` incluye `ref` (energía calculada en Python) para la paridad con JS. | Paridad exacta y trivial entre Python y JS. |
| C-09 | Corte de pendiente sobre la **arista** y sobre la **pendiente de Horn de las celdas** extremas e intermedias (P-13). | El cruce lateral de una ladera también es un riesgo de vuelco. |
| C-10 | Tolerancia de llegada al POI: **< 150 m** (media diagonal de la celda de 200 m). | Consecuencia de C-02. |
| C-11 | Constantes, vectores dorados, esquemas, CI, plantillas y archivos de agente **incluidos en este .md** (Apéndice D). M0 los extrae sin modificarlos. | Decisión del equipo: un solo .md. |
| C-12 | THEMIS TI: el enlace de v1.0 (`…30n300e…`) **probablemente es el cuadrángulo equivocado** (Arcadia está a ~200–206°E). Se agrega TES TI (cuantitativa, ~3 km) como fuente para la exclusión por TI < 100. | Revisión del nombre del producto. |
| C-13 | Velocidades de reproducción: **×60 / ×600 / ×3600** (antes ×1 / ×60 / ×600). | A pie, un trayecto dura 26–66 h; a ×1 la reproducción no tiene sentido. |
| C-14 | Detalle HiRISE: orden de búsqueda con respaldo explícito (P-14). | En v1.0, si no había DTM a ≤15 km de AP-1 la capa simplemente desaparecía. |
| C-15 | Licencia CC BY-SA 3.0 IGO (componente HRSC) **heredada por las capas derivadas**. Se agrega `DATA_LICENSE.md`. | Cláusula *share-alike*. |

---

## 0. Cómo usar este documento (obligatorio para cualquier LLM constructor)

Este documento es **autocontenido**. Cada sesión de agente construye **un módulo** y no tiene memoria de sesiones anteriores. La memoria del proyecto es el repo: este spec, `AGENTS.md` y los handoffs.

**Protocolo de sesión (siempre en este orden):**
1. `git pull` en `main`. Lee este documento completo, `docs/arcadia_planitia_contexto_LLM.md` y **todos** los `docs/handoff/HANDOFF_M*.md` existentes, en orden numérico.
2. Identifica tu módulo (te lo dice el humano: M0…M6) y crea la rama `mX-<slug>` (§3.8). Construye **solo** ese módulo y **solo** los archivos que le pertenecen (§3.5). **No modifiques contratos** (Apéndice B, `constants.json`, `tests/golden/*`). Si algo no encaja, repórtalo en tu handoff (§8.3); no lo "arregles" en silencio.
3. Antes de escribir código, ejecuta **todas** las pruebas existentes: `pytest -q tests/py` y `npm test`. Este es el lado derecho de la V. Si fallan, detente y repórtalo.
4. Implementa y ejecuta tus pruebas. Todas las pruebas con el ID de tu módulo (§7) deben pasar, o documenta exactamente cuál falla y por qué.
5. Escribe `docs/handoff/HANDOFF_Mx.md` con la plantilla (Apéndice D.10). Abre un PR a `main`; el CI debe estar en verde. **Sin handoff y sin CI verde, el módulo no está terminado.**

**Reglas globales:**
- **No inventes datos.** Si un valor no está en este documento ni en las fuentes de §4, decláralo como constante nombrada con el comentario `# ASSUMPTION` y repórtalo en el handoff. **No edites `constants.json`**: propón el cambio en el handoff.
- **No asumas que los endpoints funcionan.** Ningún endpoint de §4 fue probado en vivo al redactar este spec. M1 los valida y registra el resultado.
- **Etiquetas de confianza** (en comentarios y handoffs): `[FUENTE]` = dato de una fuente citada, no re-verificado; `[VERIFICADO]` = recalculado o probado por ti; `[ASSUMPTION]` = supuesto de ingeniería sin fuente; `[PROXY]` = variable sustituta de algo que no se puede medir con los datos disponibles; `[DECISION]` = decisión del equipo.
- **La UI no muestra etiquetas de confianza** (D-C6). **Sí** muestra las atribuciones y licencias (§3.6) y un panel único "About / Assumptions" con la lista de `ASSUMPTION` y `PROXY`, que se genera desde `constants.json`.
- Cada cálculo físico se especifica **una sola vez** (§6) y se implementa en **Python** (M0 y M2) y en **JavaScript** (M0, M4 y M5). Ambas implementaciones deben pasar **los mismos vectores dorados** (`tests/golden/*.json`) y leer **el mismo** `web/data/constants.json`.
- Archivos de contexto por agente: `AGENTS.md` (Codex), `CLAUDE.md` (Claude Code) y `GEMINI.md` (Gemini CLI). Los dos últimos solo remiten a `AGENTS.md`.

---

## 1. Objetivo y alcance

Webapp estática e interactiva (GitHub Pages) para el reto *Martian Map*. Incluye un mapa de Arcadia Planitia con capas NASA/USGS, una base de operaciones fija (AP-1), 5 puntos de interés (POI) y un dashboard de telemetría con dos modos: `ROVER | ON FOOT`.

**Flujo funcional:**
1. **Offline (Python):** recortar por rangos HTTP el DEM y las imágenes, derivar capas en la rejilla LEQ y calcular rutas óptimas de ida y vuelta base↔POI para cada modo.
2. **Online (navegador, sin red externa):** mapa con la base y los POI etiquetados, más una lista lateral con distancias 3D. **No se dibuja ninguna ruta** hasta que el usuario selecciona un POI, y entonces solo la de ese POI en el modo activo (D-C1). El dashboard de telemetría tiene selector de modo.

**Todo es imprescindible** (D-G7). Solo el equipo humano decide qué recortar; §9.4 propone un orden de degradación que requiere aprobación explícita.

---

## 2. Registro de decisiones

### 2.1 Decisiones del equipo (autoritativas)

| ID | Decisión |
|---|---|
| D-A1 | POI: **solo las rutas 1 a 3** del contexto (§5). |
| D-A2 | Las rutas 4–6 (294–640 km) quedan **excluidas**. |
| D-A3 | **Vista regional más detalle HiRISE DTM** alrededor de la base (respaldo en P-14). |
| D-A4 | M1 **recorta los COG/GeoTIFF por rangos HTTP**; no se descargan archivos completos. |
| D-A5 | Se incluyen **todas** las capas; el usuario elige una a la vez con un selector de capa base. |
| D-B1 | El costo de ruta usa **todos** los factores: pendiente, rugosidad, TI y elevación (ver M2 para cómo entra cada uno). |
| D-B2 | Los límites de pendiente los propone Claude (P-01, P-02). |
| D-B3 | **Rutas distintas por modo** (rover y a pie). |
| D-B4 | Cálculo **directo base→POI**, sin pasar por estaciones intermedias. |
| D-B5 | Origen **fijo**: AP-1. |
| D-B6 | La distancia de la lista es la **longitud 3D de la ruta de ida calculada**. |
| D-C1 | Al seleccionar un POI se dibuja **solo su ruta**, la del modo activo. |
| D-C2 | **Leaflet 2D**. · D-C3 UI en **inglés**. · D-C4 **Escritorio**. · D-C5 **HUD sci-fi oscuro**. · D-C6 **Sin** etiquetas de confianza en la UI. |
| D-D1 | Vehículo: **Tesla Model S AWD MY2026 con datos reales** (§6.3). |
| D-D2 (rev. 2026-11-14 19:11) | Energía del rover con **pendiente/energía potencial y calentamiento de batería**. **Sin regeneración**: en bajada, la energía de tracción es 0 y el exceso se disipa con frenado mecánico. |
| D-D3 | **Carga útil editable**. · D-D4 Velocidad de crucero del rover: **18 km/h** (5.0 m/s). |
| D-E1 | Formulario a pie con los campos de §6.4. |
| D-E2 | Modelo metabólico: **polinomio de Minetti 2002 tal cual**, con su sesgo declarado (C-06). |
| D-E3 | Biométricos: **todos** (FC, kcal, VO₂, O₂ consumido, hidratación, temperatura corporal, dosis acumulada). |
| D-E4 | El dashboard **calcula los litros de O₂** necesarios según la distancia y los datos metabólicos. |
| D-F1 | Entorno: se muestran **todas** las variables (T, presión, irradiancia, dosis RAD). · D-F2 Valores **fijos**, sin selector de estación. |
| D-G1 | Stack elegido por Claude (P-10). · D-G2 **GitHub Pages**, repo `OsvaJavi/bioenanos`. |
| D-G3 | Módulos **M0–M6** (§7). · D-G4 Agentes con **terminal e internet**: Claude Code, Codex, Gemini CLI. |
| D-G5 | **Pruebas automáticas exhaustivas**, ejecutadas en CI en cada PR. · D-G6 4 personas, deadline dom 15-nov 20:00. · D-G7 Todo es imprescindible. |
| D-H1 | Entregable de especificación: **un solo .md** (este). |

### 2.2 Decisiones por defecto de Claude (el equipo puede vetarlas; si no, rigen)

| ID | Decisión | Razón |
|---|---|---|
| P-01 | Pendiente máxima del **rover = 10°** (corte duro). | Ángulos de aproximación/salida del Model S de 15°/16° y despeje de 117–158 mm `[FUENTE: S1]`; 10° deja margen por la tracción en regolito suelto. |
| P-02 | Pendiente máxima **a pie = 20°** (corte duro). | Criterio de travesías a pie de Artemis: < 20° `[FUENTE: S8]`. |
| P-03 | **HCP_ESP_037655_2210** (campo de polígonos) se incluye como POI. | Es un objetivo científico nombrado en el contexto. Se puede quitar editando `pois.json`. |
| P-04 | Metabolismo = **Minetti 2002 × masa total × factor de gravedad marciana** (no Pandolf). | Pandolf deja de ser válido con carga/masa corporal > ~0.45; el traje (≈170 kg) más el astronauta (≈80 kg) dan L/W ≈ 2.1. |
| P-05 | Velocidad a pie: **1.0 m/s** (editable). | `[ASSUMPTION]` |
| P-06 | Límite por EVA: **8 h** (editable). | Duración de diseño del PLSS `[FUENTE: S9]`. |
| P-07 | Telemetría = **resumen + reproducción animada** (×60 / ×600 / ×3600). | Cubre ambas lecturas de "telemetría". |
| P-08 | Entorno fijo: **L_s = 270°, mediodía, 40°N**; irradiancia con τ = 0.4 y τ = 2.0. | Caso de diseño más exigente del contexto. |
| P-09 | Reserva de O₂: **30 min por EVA** al consumo medio + **10 %** de contingencia (editables). | `[ASSUMPTION]`; 30 min es el orden del paquete de O₂ secundario `[FUENTE: S10]`. |
| P-10 | Stack: **HTML + JS ES modules + Leaflet 1.9.4 vendorizado** (sin CDN en runtime) y datos estáticos JSON/PNG. Preprocesado en **Python ≥ 3.11** (`rasterio`, `numpy`, `scipy`, `pystac-client`, `requests`, `Pillow`, `jsonschema`, `pytest`). JS con **Vitest** (unitarias) y **Playwright** (E2E). | Despliegue estático garantizado. |
| P-11 | Las rutas se precalculan con **parámetros por defecto** (carga del rover 350 kg; astronauta de referencia de G-WLK-2 + 10 kg de equipo). No se recalculan cuando el usuario cambia la masa; la **energía** sí se recalcula en vivo. | La geometría óptima apenas cambia con la masa. La limitación se declara en "About". |
| P-12 | El **detalle HiRISE** es solo visual (hillshade + pendiente + ortoimagen) y no entra al costo de ruta. | Lo que se ve en el detalle no cambia las rutas regionales; la UI lo avisa. |
| P-13 | Una arista se descarta si `|θ_arista| > θ_max`, **o** si la pendiente de Horn de cualquier celda que toca (origen, destino e intermedias en movimientos de caballo) es `> θ_max`. | Evita cruzar laderas en diagonal o de lado. Más conservador. |
| P-14 | Detalle: (1) HiRISE DTM que intersecte un círculo de 15 km alrededor de AP-1 → (2) CTX DTM en esa misma zona → (3) el HiRISE DTM a ≤ 15 km de cualquier POI que quede más cerca de AP-1, etiquetado con su ubicación → (4) "Not available". | D-A3 sin bloquear el proyecto. El contexto asocia `ESP_052490_2200` a la Ruta 3 (US1_FRONT). |
| P-15 | Exclusión por TI < 100 `[FUENTE: contexto §5.5]` **solo** con TI cuantitativa (TES, S-TI3). El mosaico THEMIS es cualitativo y queda como capa visual. | No se excluyen celdas con datos de 8 bits relativos. |
| P-16 | Durante el trayecto en rover **no** se modela el soporte vital de la tripulación (O₂ en rover). | Fuera de alcance; se declara en "About". |

---

## 3. Contrato global

### 3.1 Unidades y convenciones
- Distancias en **metros** dentro del código y en **km** en la UI. Elevación en **metros** sobre el areoide MOLA (el contexto da km: convertir).
- Coordenadas `[lat, lon]` **planetocéntricas**, °N, °E 0–360. Para convertir a −180..180: `lon_180 = lon_E − 360` si `lon_E > 180` (AP-1: 202.10°E = −157.90°). La conversión vive **solo** en `geo.py` / `geo.js`.
- Pendiente en grados; "grade" `G = tan(θ)` decimal, con signo (positivo = subida en el sentido de marcha).
- `g = 3.72076 m/s²` `[FUENTE: contexto §5.1]`.

### 3.2 Geodesia
- Una sola constante `R = 3388.0 km` para **todas** las distancias del proyecto, igual a `R_local(40°N)` del contexto. Con ella se reproducen las distancias del contexto.
- `dist_az` (haversine + acimut inicial) y `r_local` se copian del contexto §9 a `geo.py` y se portan idénticas a `geo.js`.

### 3.3 Proyección y rejilla de trabajo ("LEQ")
Equirectangular local sobre la esfera R = 3388 km, con φ₀ = 40.0°N y λ₀ = 203.0°E:
```
x_m = R_m * cos(φ0) * (λ − λ0)      # radianes
y_m = R_m * (φ − φ0)                # radianes
```
**Rejilla única** (capas regionales y rutas), con bordes de celda en múltiplos de 0.2 km:

| Parámetro | Valor |
|---|---|
| Tamaño de celda | 200 m |
| x | −113.4 … +113.4 km → **1134 columnas** |
| y | −77.0 … +77.0 km → **770 filas** (fila 0 = norte, y_max) |
| Centro de la celda (fila i, columna j) | `x = −113.4 + 0.2·(j+0.5)`, `y = 77.0 − 0.2·(i+0.5)` (km) |
| Cobertura | ≈ 200.49–205.51°E × 38.70–41.30°N |

**No isotropía (C-04).** Una unidad de x en LEQ equivale a `k_x(φ) = cos φ / cos φ₀` metros reales: de 0.981 a 41.3°N a 1.019 a 38.7°N. Toda longitud horizontal real entre puntos de la rejilla se calcula así:
```
d_h = sqrt( (Δx · k_x(φ_mid))² + Δy² )
```
Las derivadas del DEM (Horn, rugosidad, hillshade) usan `dx_real = 200·k_x(φ_fila)` y `dy = 200 m`.

**Leaflet:** `L.CRS.Simple`, **1 unidad de mapa = 1 km**, `L.latLng(y_km, x_km)`; `minZoom 1`, `maxZoom 8`, `zoomSnap 0.25`. Los overlays son `L.imageOverlay(png, [[y_min,x_min],[y_max,x_max]])`. Conversión `llToXY` / `xyToLL` con prueba de ida y vuelta (error < 1 m).

### 3.4 Estructura del repositorio
```
/ (repo root: OsvaJavi/bioenanos)
├─ AGENTS.md  CLAUDE.md  GEMINI.md          # M0 (D.2–D.4)
├─ README.md  DATA_LICENSE.md                # M0 crea; cada módulo edita SOLO su sección
├─ requirements.txt  package.json  .gitignore
├─ .github/workflows/{ci.yml, pages.yml}
├─ docs/
│  ├─ MARS_PROJECT_MASTER_SPEC.md           # este archivo, sin editar
│  ├─ arcadia_planitia_contexto_LLM.md      # contexto del usuario, sin editar (lo coloca el humano)
│  ├─ HANDOFF_TEMPLATE.md
│  └─ handoff/HANDOFF_M0.md … HANDOFF_M6.md
├─ schemas/{layers.schema.json, routes.schema.json, pois.schema.json}
├─ tools/{extract_spec_files.py, make_mocks.py, serve.mjs, vendor_leaflet.mjs}
├─ pipeline/
│  ├─ geo.py  constants.py  atmos.py        # M0
│  ├─ fetch_data.py  derive_layers.py       # M1
│  └─ models_rover.py  models_walker.py  routing.py  export_routes.py   # M2
├─ tests/
│  ├─ golden/{geo,atmos,env,rover,walker}.json   # M0 (D.6), inmutables
│  ├─ py/  js/  e2e/
├─ data/
│  ├─ raw/                  # NO se versiona
│  └─ processed/            # dem_200m.tif, slope_deg.tif, roughness.tif, shield_col.tif, source_report.json (sí se versiona; es pequeño)
└─ web/                     # sitio estático publicado tal cual
   ├─ index.html  css/hud.css
   ├─ js/{geo.js, constants.js, atmos.js, data.js, map.js, ui.js, main.js,
   │      models/rover.js, models/walker.js, env_strip.js,
   │      telemetry_rover.js, telemetry_walker.js, chart.js}
   ├─ vendor/leaflet/
   └─ data/{constants.json, pois.json, routes.json, layers/layers.json, layers/*.png, mock/…}
```

### 3.5 Propiedad de archivos (evita conflictos de merge)
| Módulo | Es dueño de |
|---|---|
| M0 | Todo lo de la raíz, `.github/`, `schemas/`, `tools/`, `tests/golden/`, `pipeline/{geo,constants,atmos}.py`, `web/js/{geo,constants,atmos}.js`, `web/data/constants.json`, `web/data/mock/*`, `web/vendor/`; stubs de `web/js/telemetry_*.js`, `web/js/env_strip.js`, `web/js/chart.js`; `tests/{py,js}/test_m0_*` |
| M1 | `pipeline/{fetch_data,derive_layers}.py`, `data/processed/*`, `web/data/layers/*`, `web/data/pois.json`, `tests/py/test_m1_*` |
| M2 | `pipeline/{models_rover,models_walker,routing,export_routes}.py`, `web/data/routes.json`, `tests/py/test_m2_*` |
| M3 | `web/index.html`, `web/css/*`, `web/js/{data,map,ui,main}.js`, `tests/js/test_m3_*`, `tests/e2e/m3_*` |
| M4 | `web/js/{models/rover.js, telemetry_rover.js, env_strip.js, chart.js}`, `tests/js/test_m4_*`, `tests/e2e/m4_*` |
| M5 | `web/js/{models/walker.js, telemetry_walker.js}`, `tests/js/test_m5_*`, `tests/e2e/m5_*` |
| M6 | `tests/e2e/m6_*`, ajustes de integración (cada cambio en un archivo de otro módulo se justifica en HANDOFF_M6 §7), `README.md` final |

`README.md`: cada módulo edita **solo** su sección `## Mx`.

### 3.6 Licencias y atribuciones (panel "Data credits" en la UI)
- MOLA: dominio público/CC0. **Mezcla MOLA–HRSC: CC BY-SA 3.0 IGO** (atribuir a DLR/ESA/FU Berlin/NASA/USGS). Las capas derivadas de ella (`web/data/layers/*` regionales, `data/processed/*`) **heredan CC BY-SA 3.0 IGO**; se declara en `DATA_LICENSE.md`.
- HiRISE DTMs (USGS STAC): CC0; se cita y se acredita a NASA/JPL-Caltech/University of Arizona/USGS.
- Teselas de Mars Trek: NASA/JPL-Caltech/USGS/ASU (según la capa).
- Datos del Tesla Model S: se cita la fuente (S1).
- El código del repo: licencia a elección del equipo (sugerida MIT) `[DECISION pendiente; no bloquea]`.

### 3.7 Entorno de ejecución
- Python ≥ 3.11 y Node ≥ 20. `requirements.txt` y `package-lock.json` se congelan en M0 (D.5).
- Variables GDAL para lectura por rangos: `GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR`, `CPL_VSIL_CURL_ALLOWED_EXTENSIONS=.tif,.TIF,.cub,.IMG`, `GDAL_HTTP_MAX_RETRY=5`, `GDAL_HTTP_RETRY_DELAY=2`, `VSI_CACHE=TRUE`.
- Ningún secreto en el repo. `DEMO_KEY` de api.nasa.gov solo si un endpoint lo exige (30 solicitudes/h, 50/día).

### 3.8 Flujo de Git
- Ramas `m0-scaffold`, `m1-data`, `m2-routing`, `m3-map-ui`, `m4-rover`, `m5-walker` y `m6-integration`. PR a `main` con el handoff incluido.
- **El CI debe estar en verde** para hacer merge (pytest + Vitest + validación de esquemas; Playwright cuando haya `web/index.html`).
- M0 se mergea **primero**. Después, M1–M5 se mergean en cualquier orden, porque los contratos ya están congelados y existen mocks.
- `data/raw/` nunca entra al repo (está en `.gitignore`).

---

## 4. Fuentes de datos

> Estado: **ninguna probada en vivo** al redactar este spec. M1 registra en `source_report.json` y en su handoff qué funcionó.

| ID | Fuente | Uso | Endpoint / referencia | Notas y trampas |
|---|---|---|---|---|
| S-DEM1 | USGS MOLA–HRSC blended DEM 200 m v2 | DEM regional principal | `https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif` (≈ 11 GB) | **No descargar completo.** `rasterio.open('/vsicurl/<url>')` + `read(window=…)`. CRS: equirectangular sobre una **esfera de 3 396 190 m** con longitudes **−180..180** (verificar en los metadatos). Int16 en metros. Verificar si está teselado (COG); si no, la ventana se lee igual pero más lento. |
| S-DEM2 | USGS MOLA DEM 463 m | **Plan B** del DEM | `https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif` (≈ 2 GB) | Mismo método de ventana. Si se usa, se remuestrea a la rejilla de 200 m y se declara en "About" (resolución efectiva de 463 m). |
| S-DEM3 | HiRISE DTM (USGS STAC) | Detalle (P-14) | API: `https://stac.astrogeology.usgs.gov/api/` · colección `mro_hirise_controlled_socet_dtms` · `POST /search` con `bbox` (lon −180..180) y `collections` | COG con post de ≈ 1–2 m, CC0. Aplicar escala/offset si los metadatos los declaran (`raster:bands`). CRS: esfera Mars 2015 (R = 3 396 190 m), equirectangular. Verificar el datum vertical en los metadatos (solo afecta a la visualización). |
| S-DEM4 | CTX DTM (USGS STAC) | Respaldo del detalle | `https://stac.astrogeology.usgs.gov/docs/data/mars/ctxdtms/` | Paso (2) de P-14. |
| S-TI1 | THEMIS TI cualitativo, 100 m | Capa térmica visual | Página citada en v1.0: `…/themis_thermal_inertia_mosaic_qualitative_30n300e_100_mpp` | **El cuadrángulo `30n300e` probablemente no cubre 200–206°E.** M1 debe buscar en `astrogeology.usgs.gov/search` el cuadrángulo que contiene 38.7–41.3°N, 200.5–205.5°E (probablemente `30n180e` u otro nombre equivalente; **verificar**). Es 8 bits y relativo; puede venir como `.cub` (driver ISIS3 de GDAL). |
| S-TI2 | THEMIS IR día/noche vía Mars Trek WMTS | Respaldo de la capa térmica | `https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars` · catálogo `https://api.nasa.gov/mars-wmts/catalog` | Solo imagen. Descargar las teselas **offline**, mosaicar y reproyectar a LEQ. Una tesela ausente significa que no hay cobertura. |
| S-TI3 | TES TI cuantitativa (~3 km) | Exclusión por TI < 100 (P-15) | Mapas de TI de TES (ASU / PDS). M1 localiza el producto | Best-effort. Si no se encuentra o no se puede leer: `ENABLE_TI_EXCLUSION=false` y se reporta. |
| S-OPT1 | Ortoimagen HiRISE (asset del item S-DEM3) | Óptica del detalle | Asset `ortho` | Solo donde exista DTM. |
| S-OPT2 | Mosaico Viking color o THEMIS día vía Trek | Óptica regional | Trek WMTS | Best-effort. Si falla, la capa "Optical" se marca `available:false` (no se sustituye por otra cosa en silencio). |
| S-ENV | Contexto del usuario | T, P, ρ, irradiancia, dosis RAD, TI por unidad | `docs/arcadia_planitia_contexto_LLM.md` §5 | **Fuente primaria** del entorno. |
| S-META | PDS ODE REST | Metadatos (localizar productos) | `https://oderest.rsl.wustl.edu/` | Opcional. |

**Huecos conocidos:** no hay mapa de rocas de alta resolución, así que la rugosidad del DEM es un `[PROXY]` del peligro por rocas. Tampoco hay una API verificada de radiación o clima marciano, por lo que el entorno usa los valores fijos del contexto.

**Procedimiento de validación de acceso (M1, obligatorio):** para cada fuente, una lectura mínima (ventana de ~1 km²). Se registra: URL final, CRS (WKT), resolución, dtype, nodata, escala/offset, tiempo de respuesta y error si lo hubo. Todo va a `data/processed/source_report.json`.

---

## 5. Datos de la misión

Las coordenadas provienen del contexto §6.2/§9.1 (`[FUENTE]`; el contexto no las contrastó con las publicaciones originales). Las distancias en línea recta se **recalcularon** con `dist_az` y R = 3388 km `[VERIFICADO]`. **La elevación que usa la app sale del DEM**, no de esta tabla (el contexto da ≈ −3.9 km para todos).

| id | Nombre en UI | lat °N | lon °E | x_km LEQ | y_km LEQ | rol | línea recta desde AP-1 |
|---|---|---|---|---|---|---|---|
| `AP-1` | AP-1 · Base of Operations | 39.80 | 202.10 | −40.768 | −11.826 | **base fija** | — |
| `AP-9` | AP-9 · ISRU Site | 40.02 | 203.35 | 15.854 | 1.183 | POI (Ruta 1) | 58.17 km, az 76.68° |
| `APMR` | APMR · Paleo-megaripples | 39.90 | 204.70 | 77.006 | −5.913 | POI (Ruta 1 ext.) | 118.18 km, az 86.30° |
| `HCP_ESP_037655_2210` | HCP · Polygon Field | 40.560 | 202.404 | −26.997 | 33.114 | POI (Ruta 2, P-03) | 46.99 km, az 16.90° |
| `AP-8` | AP-8 · Periglacial Plain | 40.75 | 201.30 | −77.006 | 44.349 | POI (Ruta 2) | 66.77 km, az 327.54° |
| `US1_FRONT` | US1 · Ogive Front | 39.10 | 201.50 | −67.946 | −53.219 | POI (Ruta 3) | 49.64 km, az 213.69° |

Todos los POI quedan dentro del BBOX con al menos ~22 km de margen. `pois.json` completo, con descripciones en inglés: Apéndice D.7.

---

## 6. Modelos físicos (especificación compartida Python/JS)

### 6.1 Geodesia
§3.2–3.3. Funciones: `r_local(lat)`, `dist_az(p1, p2)`, `ll_to_xy(lat, lon) → (x_m, y_m)`, `xy_to_ll(x_m, y_m)`, `kx(lat)`, `cell_center(i, j) → (x_km, y_km)`, `xy_to_cell(x_km, y_km) → (i, j)`.

### 6.2 Atmósfera y entorno fijo (contexto §5.1)
```
H_km = RGAS*T/G/1000            # RGAS = 188.92, G = 3.72076, T = 210 K, P0 = 610 Pa
P(z_km) = P0*exp(-z_km/H_km) ; rho = P/(RGAS*T) ; Mcol_gcm2 = 0.1*P/G
```
Entorno fijo del dashboard (P-08, D-F2): T = 210 K; P y ρ a la elevación media de la ruta seleccionada; irradiancia al mediodía con L_s = 270° y 40°N de **185.3 W/m² (τ = 0.4)** y **27.5 W/m² (τ = 2.0)** `[FUENTE: contexto §5.2]`; tasa de dosis superficial de **0.213 mGy/día** `[FUENTE: MSL/RAD, contexto §5.4]`.
**Limitación declarada:** el modelo es isotérmico y las irradiancias de superficie no se pueden reproducir porque la fuente no da su modelo radiativo.

### 6.3 Rover (Tesla Model S AWD MY2026)
Datos de partida `[FUENTE: S1, agregador evkx.net, no la ficha oficial de Tesla]`: `m_curb = 2092 kg`, `GVWR = 2629 kg`, `Cd = 0.208`, `A = 2.34 m²`, batería de **96 kWh utilizables**, despeje de 117–158 mm y ángulos de aproximación/salida de 15°/16°. **Si M4 verifica la ficha oficial, propone la actualización en su handoff** (no edita `constants.json`).

Parámetros (en `constants.json`; los editables se exponen en la UI):
```
payload_kg   = 350     # editable (D-D3); validar 0 ≤ payload ≤ GVWR − m_curb = 537 kg
v_ms         = 5.0     # 18 km/h (D-D4)
eta_dt       = 0.90    # [ASSUMPTION] eficiencia batería→rueda
crr          = 0.15    # [ASSUMPTION] rodadura en regolito suelto (sensibilidad 0.08–0.30)
k_rough      = 0.5     # [ASSUMPTION] multiplicador de crr por rugosidad r∈[0,1]
UA_W_per_K   = 10.0    # [ASSUMPTION] pérdida térmica de la batería
T_batt_set_K = 288.0   # [ASSUMPTION] 15 °C
T_amb_K      = 210.0   # [FUENTE: contexto §5.1]
p_aux_W      = 300.0   # [ASSUMPTION] electrónica
reserve_frac = 0.20    # [ASSUMPTION] reserva de batería
```
**Energía por segmento** (longitud 3D `d` en m, ángulo con signo `θ`, rugosidad `r`, elevación media `z`):
```
rho    = atmos(z).rho
m      = m_curb + payload
F      = m*g*crr*(1 + k_rough*r)*cos(θ) + m*g*sin(θ) + 0.5*rho*Cd*A*v²
E_wheel = F*d
E_drive = E_wheel/eta_dt   si E_wheel > 0,   si no 0          # SIN regeneración (D-D2 rev.)
t       = d/v
E_aux   = (UA*(T_batt_set − T_amb) + p_aux) * t               # 1080 W con los valores por defecto
E_total = E_drive + E_aux                                     # siempre ≥ 0 → válido para Dijkstra
```
**Salidas de telemetría:** energía total (kWh), % de batería usada (sobre 96 kWh), consumo (kWh/100 km), tiempo (h), ascenso/descenso (m), pendiente máxima y media. **Viabilidad:** si `E_out + E_back ≤ (1 − reserve_frac)·96 kWh` → "ROUND TRIP OK"; si no, "ONE-WAY ONLY" con la batería restante a la llegada. Si `E_out > 96 kWh` → "NOT REACHABLE".
**Expectativa (no es prueba):** en llano, ≈ 0.481 kWh/km. El límite de ida y vuelta (76.8 kWh) equivale a ≈ 79.9 km de ida, así que **APMR (≥ 118 km) será ONE-WAY ONLY** y los otros cuatro POI probablemente serán viables (Apéndice E).

### 6.4 Astronauta a pie
**Formulario (D-E1):** estatura `H_cm`, masa corporal `W` (kg), sexo (M/F), edad, condición física (selector `Low 30 / Average 40 / Good 47 / Elite 55` de VO₂max en ml·kg⁻¹·min⁻¹ `[ASSUMPTION]`; por defecto `Good`), masa del traje + PLSS `L_suit` (por defecto **170 kg** `[FUENTE: S11]`), masa de equipo `L_gear` (por defecto 10 kg), velocidad (por defecto 1.0 m/s), FC en reposo (por defecto 60 lpm), límite por EVA (8 h), reserva (30 min), contingencia (10 %) y `k_suit` (slider 1.0–1.5).
**Validación:** estatura 140–210 cm; `W` 45–130 kg; edad 21–65; velocidad 0.4–1.6 m/s; `L_suit` 0–250; `L_gear` 0–100; FC en reposo 40–100; EVA 1–12 h; reserva 0–120 min; contingencia 0–50 %. Si un campo está vacío o fuera de rango: mensaje en línea y **no** se calcula.

**Metabolismo (D-E2, P-04):**
```
BMR_kcal_day = 10*W + 6.25*H_cm − 5*age + (5 si M, −161 si F)       # Mifflin–St Jeor [FUENTE: literatura estándar]
P_rest_W     = BMR_kcal_day * 0.048426
C_w(G)       = 280.5G⁵ − 58.7G⁴ − 76.8G³ + 51.9G² + 19.6G + 2.5      # J·kg⁻¹·m⁻¹, G = tan θ [FUENTE: Minetti 2002, S16]
f_g          = 0.70     # [FUENTE/ASSUMPTION] factor de gravedad marciana (S5; n=12, sin traje)
k_suit       = 1.00     # [ASSUMPTION] penalización por movilidad del traje
k_rough_walk = 0.5      # [ASSUMPTION]
P_loco_W     = f_g * k_suit * C_w(G) * (W + L_suit + L_gear) * v * (1 + k_rough_walk*r)
P_total_W    = P_rest_W + P_loco_W
E_seg_J      = P_total_W * d/v          # d = longitud 3D del segmento
```
**Notas de validez (declarar en "About"):**
1. `C_w` es costo **neto** (Minetti restó el VO₂ de reposo), así que sumar `P_rest` no lo duplica `[FUENTE: S16]`.
2. El polinomio da 2.5 J·kg⁻¹·m⁻¹ en llano frente a 1.64 ± 0.50 medido: **sobreestima ~52 % en llano** (C-06). Queda del lado seguro para el O₂.
3. Su rango es |G| ≤ 0.45; el corte de 20° (G = 0.364) lo respeta. En ese rango `C_w` > 0 (mínimo ≈ 0.935).
4. Escalar por la masa total con traje es una extrapolación (el estudio se hizo sin carga).
Si `P_total` queda fuera de **[250, 900] W**: advertencia "outside typical EVA metabolic range" (referencia: 300 W nominales del PLSS `[FUENTE: S9]`).

### 6.5 Oxígeno (D-E4)
```
kcal_per_min = P_total_W * 0.0143403                      # 60/4184
RQ           = 0.85                                       # [ASSUMPTION]
VO2_Lmin     = kcal_per_min / (4.039 + 1.157*RQ)          # L/min STPD [FUENTE: S11]
VO2_mlkgmin  = VO2_Lmin*1000 / W
```
**Línea de tiempo:** ida y vuelta seguidas (ruta `out` y luego `back`, calculadas por separado en M2). Se corta en EVAs consecutivas de `eva_limit_h`; la última puede ser parcial.
```
n_evas          = ceil(t_round_h / eva_limit_h)
O2_met_L        = Σ_seg VO2_Lmin(seg) * t_seg/60
VO2_mean        = O2_met_L / (t_round_min)
O2_required_L   = (O2_met_L + n_evas*reserve_min*VO2_mean) * (1 + contingency)
O2_per_EVA_L[k] = (O2_met_L de la EVA k + reserve_min*VO2_mean) * (1 + contingency)   # se muestra el máximo
O2_required_kg  = O2_required_L * 0.001429                # 1 L STPD de O2 ≈ 1.429 g
```
El dashboard muestra **litros STPD totales** (cifra principal), su masa, **O₂ máximo por EVA**, `n_evas` y `single_eva_feasible = (n_evas == 1)`.
**Resultado esperado:** a 1.0 m/s, una EVA de 8 h cubre ≈ 14.4 km de ida y vuelta, así que **ningún POI es alcanzable en una sola EVA** (4–9 EVAs). La UI lo muestra con la alerta "Multi-EVA traverse — overnight shelter and resupply are not modeled". **No se oculta.**

### 6.6 Biométricos (D-E3) — todos `[ASSUMPTION]` salvo indicación
- **FC:** `HRmax = 208 − 0.7*age`; `%VO2R = clamp((VO2_mlkgmin − 3.5)/(VO2max − 3.5), 0, 1)`; `HR = HRrest + (HRmax − HRrest)*%VO2R`.
- **kcal acumuladas:** `Σ P_total_W * t * 0.000239006`.
- **Hidratación (solo sudor; no incluye pérdida respiratoria):** `Q_heat = 0.75*P_total_W`; `sweat_g_s = Q_heat*0.30/2430`; 1 g ≈ 1 mL. Se muestran L/h y el total.
- **Temperatura corporal:** `Q_removed = min(Q_heat, 500 W)` (capacidad del LCVG); `dTc/dt = (Q_heat − Q_removed)/(W*3470)`; `Tc0 = 37.0 °C`; alerta si `Tc > 38.5 °C`. Entre EVAs, Tc vuelve a 37.0 `[ASSUMPTION]`.
- **Dosis acumulada:** `dose_mGy = 0.213 * t_h/24` `[FUENTE: contexto §5.4]`, sin blindaje de traje ni de rover (se declara).

### 6.7 Capa "Radiation shielding"
Mapa de `Mcol_gcm2(z)` calculado del DEM con §6.2. Es un `[PROXY]` de exposición relativa a GCR (más columna = más blindaje); **no es un mapa de dosis**. Leyenda: "Atmospheric shielding column (g/cm²) — relative proxy".

### 6.8 Vectores dorados
Valores exactos y tolerancias en el Apéndice D.6 (`tests/golden/*.json`). Se recalcularon con una implementación de referencia independiente `[VERIFICADO]`. Resumen:

| ID | Entrada | Salida esperada |
|---|---|---|
| G-GEO-1 | `dist_az(AP-1, AP-9)` | 58.17 km (±0.1), 76.68° (±0.1) |
| G-GEO-2 | `r_local(40)` | 3388.002 km (±0.01) |
| G-GEO-3 | `dist_az(AP-1, cada POI)` | tabla §5 (±0.1 km, ±0.1°) |
| G-LEQ-1 | `ll_to_xy(AP-1)` | (−40.768, −11.826) km (±0.001); ida y vuelta < 1 m |
| G-ATM-1 | `atmos(−3.9)` | P 879.38 Pa (±0.2), ρ 0.022166 (±0.0002), Mcol 23.635 (±0.01), H 10.663 km |
| G-ROV-1 | 1 km llano, r=0, carga 350, ρ=0.0222 | E_drive 0.42069, E_aux 0.06000, E_total 0.48069 kWh |
| G-ROV-2 | Calibración terrestre (g 9.80665, ρ 1.225, crr 0.009, v 25, sin aux, carga 350) | 12.40 kWh/100 km ∈ [10.5, 13.0] (ref. 12.9 `[FUENTE: S1]`) |
| G-ROV-3 | 1 km a +5° / 0° / −5° | 0.72351 / 0.48069 / 0.23468 kWh, en orden estricto |
| G-ROV-4 | 1 km a −9.5° | E_wheel < 0 → E_drive = 0; E_total = 0.06000 (rama sin regeneración) |
| G-ROV-5 | 1 km llano, r = 1 | E_total 0.69102 kWh |
| G-ROV-6 | carga 0 / 537 kg | 0.42040 / 0.51291 kWh |
| G-WLK-1 | `C_w(0)`, `C_w(0.1)`, `C_w(−0.1)` | 2.5000, 4.8991, 1.1271 |
| G-WLK-2 | H, 30 años, 180 cm, W 80, traje 170, equipo 0, G 0, v 1.0 | BMR 1780; P_rest 86.198; P_loco 437.5; P_total 523.698 W; VO₂ 1.49529 L/min; FC 104.35 (VO₂max 47, FCrep 60); sudor 0.17457 L/h |
| G-WLK-3 | 1 km llano (G-WLK-2) | t 1000 s; O₂_met 24.921 L; 125.167 kcal |
| G-WLK-4 | `C_w(±tan 20°)`; mínimo de `C_w` en [−0.364, 0.364] | 13.5677 / 3.1228; mínimo 0.9355 > 0 |
| G-WLK-5 | 20 km ida y vuelta, llano (G-WLK-2) | 5.5556 h; 1 EVA; O₂_met 498.43 L; O₂_req 597.62 L; 0.85399 kg |
| G-WLK-6 | 100 km ida y vuelta, llano (G-WLK-2) | 27.778 h; 4 EVAs; O₂_req 2938.74 L; 4.19946 kg |
| G-WLK-7 | Mujer, 35 años, 165 cm, W 60, traje 170, equipo 10, G 0.05, v 0.8 | BMR 1295.25; P_total 546.546 W; VO₂ 1.56053 L/min |
| G-BIO-1 | P_total 1000 W, W 80, 3600 s | Tc 40.242 °C (alerta) |
| G-ENV-1 | dosis en 8 h | 0.071 mGy (±0.001) |

---

## 7. Módulos (modelo V: cada módulo = especificación + pruebas)

### M0 — Andamiaje y contratos (P1, ~1–1.25 h; bloquea a todos)
**Objetivo:** congelar los contratos y dejar a los demás módulos trabajar en paralelo contra mocks.
**Tareas:**
1. Crear el repo/rama. Verificar que el humano colocó `docs/arcadia_planitia_contexto_LLM.md` y este spec en `docs/`; si faltan, detenerse y pedirlos.
2. Escribir a mano `tools/extract_spec_files.py` (D.1) y ejecutarlo: `python tools/extract_spec_files.py docs/MARS_PROJECT_MASTER_SPEC.md`. Así se crean, **sin modificarlos**, todos los archivos marcados `<!-- FILE: … -->` del Apéndice D.
3. Crear primero `tools/vendor_leaflet.mjs` (paso 7), porque el `postinstall` de `package.json` lo ejecuta. Después, `pip install -r requirements.txt`; `npm install`; congelar con `pip freeze > requirements.lock.txt` y `package-lock.json`. Verificar que las versiones de las GitHub Actions de D.8 existen y actualizarlas si alguna está obsoleta (reportarlo).
4. Implementar `pipeline/{geo,constants,atmos}.py` y `web/js/{geo,constants,atmos}.js` (§6.1, §6.2). `constants.py` / `constants.js` cargan `web/data/constants.json` y exponen `C.<grupo>.<clave>` (el valor, sin metadatos) y `C_meta` (con `source`/`unit`/`ref`).
5. `tools/make_mocks.py`: genera `web/data/mock/{routes.json, layers.json, layers/*.png}`. Las rutas mock son grandes círculos de AP-1 a cada POI muestreados cada 200 m, con `z_m = −3900`, `grade_deg = 0`, `rough = 0`, 20 rutas, `"mock": true` y `ref` calculado con funciones mínimas de energía en llano. Las capas mock son un degradado gris y deben declarar `"mock": true`.
6. Stubs con la firma final: `web/js/telemetry_rover.js` → `export function mountRoverPanel(el, ctx)`; `web/js/telemetry_walker.js` → `export function mountWalkerPanel(el, ctx)`; `web/js/env_strip.js` → `export function mountEnvStrip(el, ctx)`; `web/js/chart.js` → `export function lineChart(canvas, series, opts)`. Cada stub pinta "Pending module Mx".
7. `tools/vendor_leaflet.mjs` copia `node_modules/leaflet/dist` → `web/vendor/leaflet/`. `tools/serve.mjs` sirve `web/` bajo `http://localhost:4173/bioenanos/` (para Playwright, igual que en Pages).
8. Configurar GitHub Pages: Settings → Pages → Source = GitHub Actions. El repo debe ser público o tener un plan que permita Pages; **lo hace el humano** si el agente no tiene permisos.
**Pruebas:** T-M0-01 todos los archivos de D existen y los JSON parsean; T-M0-02 G-GEO-1/2/3 y G-LEQ-1 en Python **y** JS; T-M0-03 G-ATM-1 en Python y JS; T-M0-04 `constants.json` tiene `value` y `source` ∈ {FUENTE, VERIFICADO, ASSUMPTION, PROXY, DECISION, DERIVED} en cada hoja; T-M0-05 los mocks validan contra `schemas/*.json`; T-M0-06 `python -m pytest` y `npm test` en verde localmente y en CI; T-M0-07 `serve.mjs` responde 200 en `/bioenanos/vendor/leaflet/leaflet.js`.
**Entregables:** todo lo de M0 en §3.5 + `HANDOFF_M0.md`.

### M1 — Ingesta y derivación de datos (P1, ~4 h)
**Objetivo:** ráster regionales y de detalle en LEQ, `pois.json` y `source_report.json`.
**Tareas:**
1. Validar S-DEM1 (S-DEM2 como plan B) leyendo una ventana que cubra el BBOX + 2 km de margen. Convertir longitudes: la ventana en la fuente es ≈ −159.6..−154.4°.
2. **Reproyección propia (no `rasterio.warp`):** para cada centro de celda de la rejilla §3.3, `xy_to_ll` (R = 3388 km) da lat/lon; después, lat/lon → coordenada de píxel de la fuente mediante su geotransform (**con su radio de 3 396 190 m**: `x_src = R_src·λ_rad`, `y_src = R_src·φ_rad`, con λ en −180..180). Interpolar bilinealmente (`scipy.ndimage.map_coordinates`, `order=1`). Los ángulos no dependen del radio; el radio solo convierte metros↔grados en cada sistema. **Mezclar radios desplaza todo varios km.**
3. Derivar en la rejilla, con `dx_real = 200·k_x(φ_fila)`:
   - `slope_deg`: Horn sin suavizado (`SLOPE_SMOOTH_SIGMA_CELLS = 0`).
   - `hillshade`: acimut 315°, altitud 45°, factor z 1.
   - `roughness` `[PROXY]`: desviación típica de los residuos de un plano ajustado por mínimos cuadrados en una ventana 3×3, normalizada `r = clip(raw / P95(raw), 0, 1)`.
   - `shield_col_gcm2` (§6.7).
   Guardar en `data/processed/*.tif` (float32, nodata = NaN, con la definición de la rejilla en tags/metadatos).
4. **Detalle (P-14):** buscar en STAC (bbox en lon −180..180). Si existe un item: leer **solo la ventana**, aplicar escala/offset, **agregar a 20 m** (media por bloques) antes de calcular la pendiente (el ruido del DTM puede dar errores de pendiente de hasta ≈ 9° con base de 20 m `[FUENTE: S3]`), y generar hillshade, pendiente y ortoimagen en una sub-rejilla LEQ de 20 m. Registrar el id del producto, su ubicación y la regla de P-14 que se aplicó.
5. Capas térmica (S-TI1 → S-TI2) y óptica (S-OPT2): **cada una puede fallar**; registrarlo. Las teselas de Trek se descargan y se reproyectan offline. TES (S-TI3): si se obtiene, `data/processed/ti_tes.tif` y M2 la usa con P-15.
6. PNG por capa (paleta con transparencia en nodata, tamaño nativo 1134×770; detalle ≤ 2048 px de lado) + `web/data/layers/layers.json` (esquema B.1) con `bounds_km`, `min`, `max`, `unit`, `legend`, `available`, `proxy` y `source`.
7. `web/data/pois.json`: partir de D.7 y rellenar `elev_m` con el valor del DEM (bilineal).
**Pruebas:** T-M1-01 G-GEO (reuso); T-M1-02 ida y vuelta `ll↔xy` < 1 m en 1000 puntos aleatorios del BBOX; T-M1-03 todos los POI dentro de la rejilla y sobre celdas válidas; T-M1-04 DEM sin NaN en ≥ 99 % de las celdas y AP-1 en **−4500…−3300 m** (para el resto de POI, `|z_DEM − z_contexto| > 400 m` se **reporta**, no falla); T-M1-05 pendientes en 0–45° y media regional < 10°; T-M1-06 `layers.json` valida contra el esquema B.1 y cada `file` disponible existe; T-M1-07 **prueba de georreferenciación**: un DEM sintético en la fuente con un pico en una lat/lon conocida debe aparecer, después de la reproyección, en la celda que da `xy_to_cell(ll_to_xy(lat, lon))` (error ≤ 1 celda); T-M1-08 `source_report.json` tiene una entrada por fuente de §4; T-M1-09 tamaño total de `web/data/layers/` < 15 MB.

### M2 — Cálculo de rutas óptimas (P2, ~4–6 h; empieza en paralelo con datos sintéticos)
**Objetivo:** `web/data/routes.json` con 20 rutas (5 POI × 2 modos × `out`/`back`).
**Fase A (sin esperar a M1):** implementar `models_rover.py` y `models_walker.py` (§6.3–6.6) contra los vectores dorados, y el ruteo sobre **DEM sintéticos** generados en las pruebas (plano, plano inclinado 3°, muro de 15° con un hueco, cuenca).
**Fase B:** cuando M1 publique `data/processed/dem_200m.tif`, ejecutar sobre el DEM real.
**Algoritmo:**
- Grafo dirigido sobre la rejilla con **16 vecinos** (8 + movimientos de caballo). Arista de la celda a a la b: `d_h` según §3.3 (con φ medio), `dz = z_b − z_a`, `d = sqrt(d_h² + dz²)`, `θ = atan2(dz, d_h)`, `r = (r_a + r_b)/2`, `z = (z_a + z_b)/2`.
- Peso = `E_total` del rover en **Wh**, o `E_seg` del caminante en **kcal**, con los parámetros por defecto (P-11). **Todos los pesos deben ser > 0** (se verifica con una aserción).
- Cortes duros: P-13 (arista y pendiente de Horn de las celdas que toca; un movimiento de caballo exige que las **dos celdas intermedias** sean válidas), nodata, y TI < 100 si `ENABLE_TI_EXCLUSION` (P-15).
- Elevación (D-B1): entra por la pendiente y por `ρ(z)`. No hay penalización por elevación absoluta salvo decisión humana.
- `scipy.sparse.csgraph.dijkstra`: **una** corrida desde AP-1 sobre el grafo (rutas `out` a los 5 POI) y **una** sobre el grafo transpuesto desde AP-1 (rutas `back`), por modo. 4 corridas en total.
- Origen y destino = la celda que contiene la coordenada (`xy_to_cell`).
**Exportación (B.2):** `points` = camino de nodos (centros de celda), con `x_km, y_km, lat, lon, z_m` (valor de la celda), `s_km` (3D acumulado), `grade_deg` (θ del segmento que **llega** a ese punto; 0 en el primero) y `rough` (r del segmento que llega). Resumen: `length_km_3d`, `length_km_2d`, `ascent_m`, `descent_m` (positivo), `max_grade_deg` (máximo de |θ|), `mean_grade_deg` (media de |θ| ponderada por longitud), `time_h` y `ref` (rover: `E_total_kWh`, `E_drive_kWh`, `E_aux_kWh`; caminante: `E_kcal`, `O2_metabolic_L`, calculados **recorriendo `points`** con las mismas fórmulas que usará JS).
**Pruebas:** T-M2-01 G-ROV-1…6, G-WLK-1…7 y G-BIO-1 en Python; T-M2-02 toda ruta `out` empieza en la celda de AP-1 y termina en la del POI (error de coordenadas < 150 m), y viceversa en `back`; T-M2-03 `length_km_2d ≥ 0.995 ×` la línea recta de §5 y `≤ 3×` (si no, se reporta); T-M2-04 ninguna arista viola P-13; T-M2-05 en el muro sintético de 15° con hueco, el rover rodea por el hueco y el caminante cruza; en el DEM real se reporta si rover y caminante coinciden en todos los POI; T-M2-06 determinismo (dos ejecuciones dan `routes.json` idéntico byte a byte); T-M2-07 el costo óptimo ≤ el de la línea recta rasterizada (Bresenham) sobre el mismo DEM, salvo que esta viole cortes; T-M2-08 `routes.json` valida contra B.2 y tiene `"mock": false`; T-M2-09 `ref` = recálculo desde `points` (diferencia relativa < 1e-9); T-M2-10 tiempo total de ejecución < 10 min en una laptop (reportar).

### M3 — Mapa, lista de POI y UI base (P3, ~4 h; empieza con mocks)
**Objetivo:** interfaz HUD con mapa Leaflet, base, POI, lista, selector de capas y contenedores de telemetría.
**Datos:** `data.js` intenta `data/routes.json` y `data/layers/layers.json`. Si no existen, usa `data/mock/*` y muestra un banner fijo "MOCK DATA".
**Layout (≥ 1280 px):** barra superior (título y selector `ROVER | ON FOOT`); centro con el mapa (~65 %) y la columna derecha con la lista de POI; franja inferior `<section id="telemetry">` con `#env-strip`, `#telemetry-rover` y `#telemetry-walker` (solo se ve la del modo activo).
**Comportamiento:**
- Selector de capa base (radio): *Hillshade, Elevation, Slope, Roughness (proxy), Thermal (THEMIS), Optical, Radiation shielding (proxy), HiRISE detail*. Las que tienen `available:false` se deshabilitan con el tooltip "Not available". *HiRISE detail* muestra el hillshade regional + el overlay de detalle, con un subselector Hillshade/Slope/Ortho y el aviso "Visual only — not used for routing".
- AP-1 con un icono propio; POI con marcador y etiqueta permanente (`short`).
- **Lista:** nombre + longitud 3D de la ruta `out` del modo activo (km, 1 decimal), ordenada de menor a mayor. Clic en una fila o en un marcador → selecciona el POI: centra el mapa, **dibuja solo esa ruta** (`out`; la `back` se dibuja punteada solo si el usuario activa "Show return") y emite `poi:selected`.
- Cambiar de modo actualiza las distancias y redibuja la ruta del POI seleccionado.
- Escala, leyenda de la capa activa, coordenadas del cursor (lat/lon °N °E), panel "About / Assumptions" (generado desde `C_meta`: todas las hojas `ASSUMPTION`/`PROXY` + las notas de §6.4 + P-11, P-12 y P-16) y "Data credits" (§3.6).
- Tema oscuro con variables CSS, fuente monoespaciada y contraste AA.
- Si recibe `traverse:progress`, dibuja un marcador móvil en `s_km`.
**Contratos expuestos (fijos):**
- `data.js`: `await loadData()`; `getBase()`; `getPOIs()`; `getPOI(id)`; `getRoute(poiId, mode, direction='out')`; `getLayers()`; `isMock()`; `getConstants()` → `{C, C_meta}`.
- Eventos en `document` (`CustomEvent`, payload en `detail`): `mode:changed {mode}`; `poi:selected {id, mode}`; `poi:cleared {}`; `traverse:progress {mode, id, s_km}` (lo emiten M4/M5).
- `main.js` llama a `mountEnvStrip`, `mountRoverPanel` y `mountWalkerPanel` con `ctx = {data, bus: document, getState}`, donde `getState()` → `{mode, poiId}`.
**Pruebas:** T-M3-01 carga sin errores de consola (Playwright, `/bioenanos/`); T-M3-02 número de marcadores = 5 POI + 1 base; T-M3-03 lista ordenada y con distancias iguales a `routes.json` (±0.05 km); T-M3-04 sin polilíneas por defecto; T-M3-05 clic en un POI → exactamente 1 polilínea; T-M3-06 cambiar de modo dispara `mode:changed` y la distancia mostrada coincide con la del nuevo modo; T-M3-07 el selector de capas cambia la `src` del overlay y las capas no disponibles están deshabilitadas; T-M3-08 `llToXY` en JS = Python (G-LEQ-1); T-M3-09 con mocks aparece el banner "MOCK DATA" y con datos reales no.

### M4 — Telemetría del rover (P4, ~2.5 h; empieza con mocks)
**Objetivo:** `models/rover.js` (§6.3, idéntico a Python), `telemetry_rover.js`, `env_strip.js` y `chart.js` (canvas propio, sin librerías externas).
**Contenido:** campo "Payload (kg)" (validación 0–537 con mensaje); resumen de la ruta seleccionada (ida, vuelta y total): energía, % de batería, kWh/100 km, tiempo, ascenso/descenso, pendiente máxima y **veredicto** (ROUND TRIP OK / ONE-WAY ONLY / NOT REACHABLE) con la reserva del 20 %; gráficas de perfil de elevación y potencia contra `s_km`; **reproducción** ×60/×600/×3600 con medidores: velocidad, % de batería, potencia (kW), pendiente actual, distancia restante, ETA, dosis acumulada y temperatura de batería (constante = `T_batt_set`, etiqueta "held by heater"). Emite `traverse:progress`. Franja de entorno: T, P, ρ (a la z media de la ruta), irradiancia (τ 0.4 / 2.0) y tasa de dosis.
**Pruebas:** T-M4-01 G-ROV-1…6 en JS (los mismos JSON); T-M4-02 paridad con `ref` de `routes.json` en las 10 rutas de rover (≤ 0.5 %; con mocks pasa trivialmente y se re-ejecuta en M6); T-M4-03 carga > 537 o < 0 → rechazo con mensaje; T-M4-04 más carga ⇒ más energía; T-M4-05 al terminar la reproducción, los acumulados = resumen (±0.1 %); T-M4-06 sin errores de consola; T-M4-07 ruta sintética de 200 km → "ONE-WAY ONLY" o "NOT REACHABLE" según corresponda.

### M5 — Telemetría a pie (P4 después de M4, ~3 h)
**Objetivo:** `models/walker.js` (§6.4–6.6) y `telemetry_walker.js`.
**Contenido:** formulario §6.4 con validación; resumen: distancia, tiempo de ida y vuelta, **EVAs requeridas**, kcal, VO₂ medio, **O₂ requerido (L STPD)** + kg + O₂ máximo por EVA; reproducción con medidores (FC, kcal, VO₂, O₂ consumido, hidratación, temperatura corporal, dosis) y separadores visuales entre EVAs; alertas (multi-EVA, Tc > 38.5 °C, P_total fuera de [250, 900] W); reutiliza `env_strip.js` y `chart.js` de M4 **sin modificarlos**.
**Pruebas:** T-M5-01 G-WLK-1…7, G-BIO-1 y G-ENV-1 en JS; T-M5-02 paridad con `ref` en las 10 rutas a pie (≤ 0.5 %); T-M5-03 validaciones del formulario (vacíos, extremos y valores fuera de rango); T-M5-04 más masa ⇒ más O₂; más velocidad ⇒ más P_total y menos tiempo; T-M5-05 `n_evas = ceil(t_round/eva_limit)` y `single_eva_feasible` correctos (incluido el caso de borde t = 8.0 h → 1); T-M5-06 la reproducción termina igual al resumen (±0.1 %); T-M5-07 sin errores de consola.

### M6 — Integración, E2E y despliegue (P1 + P3, ~3 h)
**Tareas:** cambiar los mocks por datos reales; estado unificado (modo, POI, parámetros) que actualice mapa, lista y telemetría; manejo de errores (dato faltante ⇒ aviso, nunca pantalla en blanco); README final (instalación, regenerar datos, pruebas, despliegue y un análisis de sensibilidad ± de `crr`, `eta_dt` y `f_g` sobre AP-9); despliegue con `pages.yml`; peso del sitio **< 25 MB** y primera carga < 5 s; guion de demo de 3 minutos y checklist de entrega.
**Pruebas:** T-M6-01 re-ejecutar **todas** las pruebas M0–M5 con datos reales (incluidas T-M4-02 y T-M5-02); T-M6-02 E2E: cargar → cada POI × ambos modos → ruta dibujada, distancia, telemetría no vacía y sin errores de consola; T-M6-03 funciona bajo `/bioenanos/`, localmente con `serve.mjs` y en la URL de Pages; T-M6-04 cero peticiones de red a dominios externos en runtime (Playwright intercepta); T-M6-05 enlaces de atribución presentes; T-M6-06 APMR en rover → "ONE-WAY ONLY" (implicado por §6.3, Apéndice E); APMR a pie → EVAs > 1; T-M6-07 `web/data/routes.json` con `"mock": false` y sin banner MOCK.

---

## 8. Metodología en V

### 8.1 Matriz de trazabilidad
| Requisito | Módulo | Pruebas |
|---|---|---|
| Contratos, constantes, geodesia y atmósfera compartidas | M0 | T-M0-01…07, G-GEO, G-LEQ, G-ATM |
| Datos y capas (D-A3…A5) | M1 | T-M1-01…09 |
| Rutas óptimas por modo (D-B1…B5) | M2 | T-M2-01…10 |
| Base y POI etiquetados; lista con distancia 3D; ruta solo al seleccionar (D-B6, C1) | M3 | T-M3-02…06 |
| Selector de capas (D-A5) | M3 | T-M3-07 |
| Energía del rover con pendiente y calefacción, sin regeneración (D-D2 rev.) | M2/M4 | G-ROV-1…6, T-M4-01…05 |
| Carga editable (D-D3) | M4 | T-M4-03/04 |
| Formulario, biométricos y O₂ (D-E1…E4) | M2/M5 | G-WLK, G-BIO, T-M5-01…06 |
| Entorno fijo (D-F1/F2) | M0/M4 | G-ATM-1, G-ENV-1 |
| Despliegue y E2E (D-G2, G5) | M6 | T-M6-01…07 |

### 8.2 Reglas de integración
- Los contratos (Apéndice B, `constants.json`, golden) **no cambian** sin actualizar este documento y avisar a los 4 humanos. Un cambio obliga a re-ejecutar las pruebas de todos los módulos.
- Un módulo puede **agregar** campos opcionales a un JSON, nunca renombrar ni quitar (los esquemas permiten `additionalProperties`).
- Cada PR ejecuta todas las pruebas en CI. Al empezar y al terminar cada sesión también se ejecutan localmente.

### 8.3 Handoff
Al terminar, el agente crea `docs/handoff/HANDOFF_Mx.md` con la plantilla (D.10). Debe incluir la rama, el hash de commit, el PR, el resultado de **todas** las pruebas, las desviaciones, las suposiciones, los riesgos y lo que necesitan los módulos que dependen de él.

### 8.4 Prompt de arranque (el humano lo pega al iniciar cada sesión)
> Lee `AGENTS.md`, `docs/MARS_PROJECT_MASTER_SPEC.md`, `docs/arcadia_planitia_contexto_LLM.md` y todos los `docs/handoff/HANDOFF_M*.md`. Tu tarea es construir **solo el módulo Mx** en la rama `mx-<slug>`, tocando solo los archivos que §3.5 le asigna. Antes de escribir código, ejecuta `pytest -q tests/py` y `npm test` y reporta el resultado. No cambies contratos (Apéndice B, `constants.json`, `tests/golden/`). No inventes datos: marca `ASSUMPTION` lo que no esté en el spec. Al terminar, ejecuta todas las pruebas, escribe `docs/handoff/HANDOFF_Mx.md` con la plantilla y abre un PR a `main`.

---

## 9. Plan de trabajo, riesgos y contingencia

### 9.1 Asignación (4 personas)
| Persona | Secuencia |
|---|---|
| **P1** (líder de integración) | M0 → M1 → M6 |
| **P2** | (prepara el entorno mientras se hace M0) → M2 fase A (sintético) → M2 fase B (DEM real) → apoyo con el análisis de sensibilidad para el README |
| **P3** | (entorno) → M3 con mocks → conectar datos reales → E2E de M6 |
| **P4** | (entorno) → M4 con mocks → M5 |

### 9.2 Cronograma sugerido (hora local)
| Hora | Hito |
|---|---|
| Sáb 19:30–20:45 | **M0** (P1). P2–P4 instalan Python, Node y su CLI de agente, y leen el spec. |
| Sáb 20:45 | **Merge de M0** → inicio en paralelo de M1, M2-A, M3 y M4. |
| Dom 01:00 | **Checkpoint 1:** M1 con DEM y capas mergeado (o reportado bloqueado); M2-A, M3 y M4 con pruebas en verde. (El horario de descanso lo decide el equipo.) |
| Dom 11:00 | **Checkpoint 2:** `routes.json` real mergeado (M2-B); M5 mergeado. |
| Dom 14:00 | **Congelación de funcionalidades.** Inicio de M6. |
| Dom 18:00 | Sitio publicado en Pages; E2E en verde contra la URL pública. |
| Dom 18:00–19:30 | Ensayo de la demo y entrega del reto. |
| Dom 19:30–20:00 | Colchón. |

### 9.3 Riesgos
| Riesgo | Prob. | Mitigación |
|---|---|---|
| El DEM 200 m no se puede leer por rangos (servidor, tamaño, no-COG) | Media | Plan B S-DEM2 (463 m). Si ambas fallan, el humano descarga manualmente una ventana con QGIS/GDAL y la deja en `data/raw/` (M1 la acepta). |
| No hay HiRISE/CTX DTM cerca de AP-1 | Media | P-14 (respaldo en otro POI) → "Not available". |
| THEMIS `.cub` ilegible o cuadrángulo equivocado | Media | S-TI2 (Trek) → `available:false`. |
| Rutas casi rectas en la llanura con 200 m | **Alta** | Es esperado; se reporta. **No** se introduce ruido artificial. |
| Paridad Python↔JS | Baja | `constants.json` único + golden compartidos + `ref` exportado desde `points`. |
| Conflictos de merge entre 4 personas | Media | Propiedad de archivos §3.5; README por secciones; CI obligatorio. |
| Las versiones de las GitHub Actions de D.8 están obsoletas | Media | M0 las verifica y actualiza. |
| A pie, ningún POI se alcanza en una EVA | **Cierta** | Es un resultado (§6.5). La UI muestra las EVAs y el O₂. |
| Rover a APMR: ida y vuelta imposible con la reserva | **Cierta** | ONE-WAY ONLY con la batería restante. |
| El jurado cuestiona los `ASSUMPTION` | Media | Panel "About" + sensibilidad en el README + sesgo de Minetti declarado. |
| El agente "arregla" un contrato en silencio | Media | Golden y esquemas en CI; revisión del PR por P1. |

### 9.4 Orden de degradación propuesto (solo con aprobación humana)
(1) capa óptica/térmica regional → solo hillshade; (2) detalle HiRISE; (3) reproducción animada → solo resumen; (4) gráficas de perfil. **Nunca se degradan:** rutas por modo, lista con distancias, energía del rover, O₂ a pie.

---

## 10. Fuentes
- **S1** Tesla Model S AWD MY2026 (agregador EVKX): https://evkx.net/models/tesla/model_s/model_s_awd/specifications · Plaid: https://evkx.net/models/tesla/model_s/model_s_plaid/specifications
- **S2** Looney et al. (2018), *Metabolic Costs of Military Load Carriage over Complex Terrain*, Mil Med 183: https://academic.oup.com/milmed/article/183/9-10/e357/5025891
- **S3** USGS HiRISE DTMs en STAC: https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/
- **S4** USGS STAC API: https://stac.astrogeology.usgs.gov/api
- **S5** Brown et al., *The metabolic cost of walking in simulated Martian gravity*: https://kclpure.kcl.ac.uk/portal/en/publications/the-metabolic-cost-of-walking-in-simulated-martian-gravity-and-it/
- **S6** Revisión de gravedad parcial (Frontiers in Physiology 2017): https://www.frontiersin.org/articles/10.3389/fphys.2017.00583/pdf
- **S7** Mars Trek WMTS: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars · https://api.nasa.gov/mars-wmts/catalog
- **S8** Pendiente < 20° para travesías de astronautas (Artemis): https://www.universetoday.com/163783/lunar-astronauts-will-need-easy-walking-trails-around-the-moons-south-pole/ ; LRV: https://ntrs.nasa.gov/api/citations/20250011301/downloads/AsTrav_LPSC26_v1.docx
- **S9** Reglas de diseño del PLSS (EVA de 8 h, 300 W nominales): https://ntrs.nasa.gov/api/citations/20070006297/downloads/20070006297.pdf
- **S10** Paquete secundario de O₂ (~30 min): https://www.nap.edu/read/5826/chapter/6 · https://orbitalradar.com/spacesuits/how-spacesuits-work
- **S11** Masa del xEMU y ecuación VO₂→kcal/min (NASA, ICES-2026): https://ntrs.nasa.gov/api/citations/20260005410/downloads/Mars_Mass_ICES2026_Presentation_Final.pdf ; ≈ 170 kg: https://www.universetoday.com/articles/martian-space-suits-will-need-to-be-40-lighter
- **S12** MOLA DEM 463 m: https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m · MOLA–HRSC 200 m: https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m
- **S13** THEMIS TI cualitativo 100 m (verificar el cuadrángulo, C-12): https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_qualitative_30n300e_100_mpp
- **S14** PDS ODE REST: https://ode.rsl.wustl.edu/mars/pagehelp/Content/Additional_Resources/ODE_REST_API.htm
- **S15** HiRISE ESP_052490_2200 / ESP_052424_2200: https://hirise.lpl.arizona.edu/anaglyph/ESP_052490_2200_ESP_052424_2200_RED
- **S16** Minetti, A. E. et al. (2002). Energy cost of walking and running at extreme uphill and downhill slopes. *J Appl Physiol* 93:1039–1046 (Cw calculado con VO₂ neto; mínimo en llano 1.64 ± 0.50 J·kg⁻¹·m⁻¹): https://iris.unibs.it/retrieve/ddc633e4-3c03-4e2e-e053-3705fe0a4c80/Minetti%20JAP%202002.pdf

---

## Apéndice A — Pandolf + Santee (comparación opcional, no se implementa salvo que sobre tiempo)
```
M_pandolf = 1.5*W + 2.0*(W+L)*(L/W)^2 + eta*(W+L)*(1.5*S^2 + 0.35*S*G)      # W; G en %
```
La corrección de Santee para G < 0 aparece **de dos formas** según la transcripción, y dan resultados distintos con W = 80, L = 20, η = 1, S = 1.34 m/s, G = −10 % (`M_pandolf = −67.16 W`):
- Forma impresa en v1.0: `M = M_pandolf − η[(G(W+L)S)/3.5 − ((W+L)(G+6)²)/W + 25·S²]` → **290.81 W**.
- Forma `(25 − S²)`: `M = M_pandolf − η[(G(W+L)S)/3.5 − ((W+L)(G+6)²)/W + (25 − S²)]` → **312.49 W**.
Quien lo implemente debe verificar contra S2 cuál es la correcta. **No usar** con el traje completo (L/W > ~0.45).

---

## Apéndice B — Esquemas de datos
Los esquemas formales (JSON Schema 2020-12) están en D.9; M0 los extrae a `schemas/`. Ejemplos mínimos:

**B.1 `layers.json`**
```json
{"schema_version":"1.1","mock":false,
 "crs":{"name":"LEQ","phi0_deg":40.0,"lam0_deg":203.0,"R_km":3388.0,"units":"km"},
 "grid":{"cell_m":200,"x_min_km":-113.4,"x_max_km":113.4,"y_min_km":-77.0,"y_max_km":77.0,"ncols":1134,"nrows":770},
 "layers":[{"id":"hillshade","label":"Hillshade","file":"layers/hillshade.png",
   "bounds_km":{"x_min":-113.4,"x_max":113.4,"y_min":-77.0,"y_max":77.0},
   "unit":"","min":null,"max":null,"legend":"Shaded relief (az 315°, alt 45°)",
   "source":"S-DEM1","available":true,"proxy":false,"note":""}]}
```
`id` ∈ {`hillshade`, `elevation`, `slope`, `roughness`, `thermal`, `optical`, `shielding`, `detail`}. `detail` agrega `subfiles: {hillshade, slope, ortho}` (cada uno string o null) y `location_label`.

**B.2 `routes.json`**
```json
{"schema_version":"1.1","mock":false,
 "grid":{"cell_m":200,"neighbors":16},
 "params_used":{"rover":{"payload_kg":350,"v_ms":5.0},
                "walker":{"mass_kg":80,"height_cm":180,"age":30,"sex":"M","suit_kg":170,"gear_kg":10,"v_ms":1.0}},
 "routes":[{"poi":"AP-9","mode":"rover","direction":"out",
   "length_km_3d":0.0,"length_km_2d":0.0,"ascent_m":0,"descent_m":0,
   "max_grade_deg":0,"mean_grade_deg":0,"time_h":0,
   "ref":{"E_total_kWh":0,"E_drive_kWh":0,"E_aux_kWh":0},
   "points":[{"x_km":0,"y_km":0,"lat":0,"lon":0,"z_m":0,"s_km":0,"grade_deg":0,"rough":0}]}]}
```
`mode` ∈ {`rover`, `walker`}; `direction` ∈ {`out`, `back`}; exactamente 20 rutas. En el caminante, `ref` = `{"E_kcal", "O2_metabolic_L"}`.

**B.3 `pois.json`**: contenido completo en D.7.

**B.4 `constants.json`**: contenido completo en D.5. Cada hoja es `{"value", "unit", "source", "ref"}`.

---

## Apéndice C — Cadenas de UI (inglés)
`Arcadia Planitia Surface Navigator` · `Base of Operations` · `Points of Interest` · `Mode: ROVER / ON FOOT` · `Route distance` · `Select a point of interest` · `Show return` · `Layer` · `Not available` · `Visual only — not used for routing` · `MOCK DATA` · `Payload (kg)` · `Energy used` · `Battery` · `Battery reserve` · `Round trip` · `ROUND TRIP OK` · `ONE-WAY ONLY` · `NOT REACHABLE` · `Held by heater` · `EVAs required` · `Oxygen required (L, STP)` · `Max O₂ per EVA` · `Multi-EVA traverse — overnight shelter and resupply are not modeled` · `Heart rate` · `Core temp (est.)` · `Hydration loss` · `Dose` · `outside typical EVA metabolic range` · `Simulate traverse` · `About / Assumptions` · `Data credits`.

---

## Apéndice D — Archivos incluidos (M0 los extrae sin modificarlos)

Convención: una línea `<!-- FILE: ruta -->` seguida de un bloque de código. El contenido del bloque es el archivo exacto. Los bloques que contienen ``` usan `~~~~` como delimitador.

### D.1 Extractor
<!-- FILE: tools/extract_spec_files.py -->
```python
"""Extract files embedded in MARS_PROJECT_MASTER_SPEC.md (Appendix D).
Usage: python tools/extract_spec_files.py docs/MARS_PROJECT_MASTER_SPEC.md [--force] [--dry-run]
"""
import pathlib
import re
import sys

PAT = re.compile(
    r"^<!-- FILE: (?P<path>\S+) -->[ \t]*\n(?P<fence>`{3,}|~{3,})[^\n]*\n(?P<body>.*?)\n(?P=fence)[ \t]*$",
    re.S | re.M,
)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    spec = pathlib.Path(sys.argv[1])
    force = "--force" in sys.argv
    dry = "--dry-run" in sys.argv
    root = pathlib.Path.cwd().resolve()
    text = spec.read_text(encoding="utf-8")
    n = 0
    for m in PAT.finditer(text):
        rel = m.group("path")
        target = (root / rel).resolve()
        if root not in target.parents:
            raise SystemExit(f"Refusing path outside repo: {rel}")
        if target.exists() and not force and target.read_text(encoding="utf-8") != m.group("body") + "\n":
            raise SystemExit(f"Exists and differs (use --force): {rel}")
        n += 1
        print(("DRY " if dry else "") + f"write {rel}")
        if not dry:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(m.group("body") + "\n", encoding="utf-8")
    print(f"{n} files")
    return 0 if n else 1


if __name__ == "__main__":
    sys.exit(main())
```

### D.2 AGENTS.md
<!-- FILE: AGENTS.md -->
~~~~markdown
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
~~~~

### D.3 CLAUDE.md
<!-- FILE: CLAUDE.md -->
```markdown
Read and follow `AGENTS.md` and `docs/MARS_PROJECT_MASTER_SPEC.md` before doing anything.
```

### D.4 GEMINI.md
<!-- FILE: GEMINI.md -->
```markdown
Read and follow `AGENTS.md` and `docs/MARS_PROJECT_MASTER_SPEC.md` before doing anything.
```

### D.5 constants.json
<!-- FILE: web/data/constants.json -->
```json
{
  "_meta": {"version": "1.1", "note": "Single source of constants for Python and JS. Use .value. Do not edit outside a spec revision."},
  "geo": {
    "R_km": {"value": 3388.0, "unit": "km", "source": "FUENTE", "ref": "contexto §2.2 R_local(40N)"},
    "R_eq_km": {"value": 3396.19, "unit": "km", "source": "FUENTE", "ref": "contexto §2.1"},
    "R_pol_km": {"value": 3376.20, "unit": "km", "source": "FUENTE", "ref": "contexto §2.1"},
    "R_source_sphere_m": {"value": 3396190.0, "unit": "m", "source": "FUENTE", "ref": "USGS DEM/DTM CRS; verify in metadata (M1)"}
  },
  "grid": {
    "phi0_deg": {"value": 40.0, "unit": "deg", "source": "DECISION", "ref": "spec §3.3"},
    "lam0_deg": {"value": 203.0, "unit": "deg E", "source": "DECISION", "ref": "spec §3.3"},
    "cell_m": {"value": 200, "unit": "m", "source": "DECISION", "ref": "spec C-02"},
    "x_min_km": {"value": -113.4, "unit": "km", "source": "DECISION", "ref": "spec §3.3"},
    "x_max_km": {"value": 113.4, "unit": "km", "source": "DECISION", "ref": "spec §3.3"},
    "y_min_km": {"value": -77.0, "unit": "km", "source": "DECISION", "ref": "spec §3.3"},
    "y_max_km": {"value": 77.0, "unit": "km", "source": "DECISION", "ref": "spec §3.3"},
    "ncols": {"value": 1134, "unit": "", "source": "DERIVED", "ref": "226.8 km / 0.2 km"},
    "nrows": {"value": 770, "unit": "", "source": "DERIVED", "ref": "154.0 km / 0.2 km"},
    "bbox_lon_min": {"value": 200.5, "unit": "deg E", "source": "DECISION", "ref": "spec C-02"},
    "bbox_lon_max": {"value": 205.5, "unit": "deg E", "source": "DECISION", "ref": "spec C-02"},
    "bbox_lat_min": {"value": 38.7, "unit": "deg N", "source": "DECISION", "ref": "spec C-02"},
    "bbox_lat_max": {"value": 41.3, "unit": "deg N", "source": "DECISION", "ref": "spec C-02"}
  },
  "atmos": {
    "RGAS": {"value": 188.92, "unit": "J/kg/K", "source": "FUENTE", "ref": "contexto §5.1"},
    "G": {"value": 3.72076, "unit": "m/s2", "source": "FUENTE", "ref": "contexto §5.1"},
    "T_K": {"value": 210.0, "unit": "K", "source": "FUENTE", "ref": "contexto §5.1 (210–220 K)"},
    "P0_Pa": {"value": 610.0, "unit": "Pa", "source": "FUENTE", "ref": "contexto §5.1"}
  },
  "env": {
    "Ls_deg": {"value": 270, "unit": "deg", "source": "DECISION", "ref": "P-08"},
    "irr_tau04_Wm2": {"value": 185.3, "unit": "W/m2", "source": "FUENTE", "ref": "contexto §5.2 (model not specified by source)"},
    "irr_tau20_Wm2": {"value": 27.5, "unit": "W/m2", "source": "FUENTE", "ref": "contexto §5.2 (model not specified by source)"},
    "dose_rate_mGy_day": {"value": 0.213, "unit": "mGy/day", "source": "FUENTE", "ref": "MSL/RAD, contexto §5.4"}
  },
  "rover": {
    "m_curb_kg": {"value": 2092, "unit": "kg", "source": "FUENTE", "ref": "S1 evkx (aggregator)"},
    "gvwr_kg": {"value": 2629, "unit": "kg", "source": "FUENTE", "ref": "S1 evkx (aggregator)"},
    "payload_max_kg": {"value": 537, "unit": "kg", "source": "DERIVED", "ref": "gvwr - m_curb"},
    "Cd": {"value": 0.208, "unit": "", "source": "FUENTE", "ref": "S1"},
    "A_m2": {"value": 2.34, "unit": "m2", "source": "FUENTE", "ref": "S1"},
    "battery_usable_kWh": {"value": 96.0, "unit": "kWh", "source": "FUENTE", "ref": "S1"},
    "clearance_mm": {"value": [117, 158], "unit": "mm", "source": "FUENTE", "ref": "S1"},
    "approach_departure_deg": {"value": [15, 16], "unit": "deg", "source": "FUENTE", "ref": "S1"},
    "payload_default_kg": {"value": 350, "unit": "kg", "source": "ASSUMPTION", "ref": "P-11"},
    "v_ms": {"value": 5.0, "unit": "m/s", "source": "DECISION", "ref": "D-D4 (18 km/h)"},
    "eta_dt": {"value": 0.90, "unit": "", "source": "ASSUMPTION", "ref": "battery-to-wheel efficiency"},
    "crr": {"value": 0.15, "unit": "", "source": "ASSUMPTION", "ref": "loose regolith; sensitivity 0.08–0.30"},
    "k_rough": {"value": 0.5, "unit": "", "source": "ASSUMPTION", "ref": "crr multiplier per normalized roughness"},
    "UA_W_per_K": {"value": 10.0, "unit": "W/K", "source": "ASSUMPTION", "ref": "battery thermal loss"},
    "T_batt_set_K": {"value": 288.0, "unit": "K", "source": "ASSUMPTION", "ref": "15 C"},
    "T_amb_K": {"value": 210.0, "unit": "K", "source": "FUENTE", "ref": "contexto §5.1"},
    "p_aux_W": {"value": 300.0, "unit": "W", "source": "ASSUMPTION", "ref": "electronics"},
    "reserve_frac": {"value": 0.20, "unit": "", "source": "ASSUMPTION", "ref": "battery reserve"},
    "regen_enabled": {"value": false, "unit": "", "source": "DECISION", "ref": "D-D2 rev. 2026-11-14"},
    "slope_max_deg": {"value": 10.0, "unit": "deg", "source": "DECISION", "ref": "P-01"}
  },
  "walker": {
    "slope_max_deg": {"value": 20.0, "unit": "deg", "source": "DECISION", "ref": "P-02, S8"},
    "v_ms_default": {"value": 1.0, "unit": "m/s", "source": "ASSUMPTION", "ref": "P-05"},
    "suit_kg_default": {"value": 170, "unit": "kg", "source": "FUENTE", "ref": "S11 xEMU"},
    "gear_kg_default": {"value": 10, "unit": "kg", "source": "ASSUMPTION", "ref": "spec §6.4"},
    "ref_mass_kg": {"value": 80, "unit": "kg", "source": "ASSUMPTION", "ref": "reference astronaut P-11"},
    "ref_height_cm": {"value": 180, "unit": "cm", "source": "ASSUMPTION", "ref": "reference astronaut P-11"},
    "ref_age": {"value": 30, "unit": "yr", "source": "ASSUMPTION", "ref": "reference astronaut P-11"},
    "ref_sex": {"value": "M", "unit": "", "source": "ASSUMPTION", "ref": "reference astronaut P-11"},
    "f_g": {"value": 0.70, "unit": "", "source": "FUENTE", "ref": "S5 LBPP 0.38 g, unsuited, n=12 (extrapolated)"},
    "k_suit": {"value": 1.00, "unit": "", "source": "ASSUMPTION", "ref": "slider 1.0–1.5"},
    "k_rough_walk": {"value": 0.5, "unit": "", "source": "ASSUMPTION", "ref": "spec §6.4"},
    "minetti_coeffs_hi_to_lo": {"value": [280.5, -58.7, -76.8, 51.9, 19.6, 2.5], "unit": "J/kg/m", "source": "FUENTE", "ref": "S16 Minetti 2002; +52% bias on level vs measured 1.64"},
    "P_warn_min_W": {"value": 250, "unit": "W", "source": "ASSUMPTION", "ref": "S9 context"},
    "P_warn_max_W": {"value": 900, "unit": "W", "source": "ASSUMPTION", "ref": "S9 context"},
    "vo2max_levels": {"value": {"Low": 30, "Average": 40, "Good": 47, "Elite": 55}, "unit": "ml/kg/min", "source": "ASSUMPTION", "ref": "spec §6.4"},
    "vo2max_default_level": {"value": "Good", "unit": "", "source": "ASSUMPTION", "ref": "spec §6.4"},
    "hr_rest_default": {"value": 60, "unit": "bpm", "source": "ASSUMPTION", "ref": "spec §6.4"}
  },
  "o2": {
    "RQ": {"value": 0.85, "unit": "", "source": "ASSUMPTION", "ref": "spec §6.5"},
    "kcal_per_L_a": {"value": 4.039, "unit": "kcal/L", "source": "FUENTE", "ref": "S11 VO2 equation"},
    "kcal_per_L_b": {"value": 1.157, "unit": "kcal/L", "source": "FUENTE", "ref": "S11 VO2 equation"},
    "eva_limit_h": {"value": 8.0, "unit": "h", "source": "FUENTE", "ref": "P-06, S9"},
    "reserve_min": {"value": 30, "unit": "min", "source": "ASSUMPTION", "ref": "P-09, S10 order of magnitude"},
    "contingency": {"value": 0.10, "unit": "", "source": "ASSUMPTION", "ref": "P-09"},
    "O2_kg_per_L": {"value": 0.001429, "unit": "kg/L", "source": "FUENTE", "ref": "O2 density at STP"}
  },
  "bio": {
    "q_heat_frac": {"value": 0.75, "unit": "", "source": "ASSUMPTION", "ref": "spec §6.6"},
    "phi_evap": {"value": 0.30, "unit": "", "source": "ASSUMPTION", "ref": "spec §6.6"},
    "latent_J_per_g": {"value": 2430, "unit": "J/g", "source": "FUENTE", "ref": "latent heat of sweat evaporation"},
    "LCVG_cap_W": {"value": 500, "unit": "W", "source": "ASSUMPTION", "ref": "spec §6.6"},
    "body_cp_J_per_kgK": {"value": 3470, "unit": "J/kg/K", "source": "FUENTE", "ref": "human tissue specific heat"},
    "Tc0_C": {"value": 37.0, "unit": "C", "source": "FUENTE", "ref": "normal core temperature"},
    "Tc_alert_C": {"value": 38.5, "unit": "C", "source": "ASSUMPTION", "ref": "spec §6.6"},
    "hrmax_a": {"value": 208, "unit": "bpm", "source": "FUENTE", "ref": "Tanaka HRmax formula"},
    "hrmax_b": {"value": 0.7, "unit": "bpm/yr", "source": "FUENTE", "ref": "Tanaka HRmax formula"}
  },
  "routing": {
    "neighbors": {"value": 16, "unit": "", "source": "DECISION", "ref": "spec M2"},
    "enable_ti_exclusion": {"value": false, "unit": "", "source": "DECISION", "ref": "P-15; M1 proposes true only with TES TI"},
    "ti_min": {"value": 100, "unit": "J m-2 K-1 s-1/2", "source": "FUENTE", "ref": "contexto §5.5 Golombek 2021"},
    "slope_smooth_sigma_cells": {"value": 0, "unit": "cells", "source": "ASSUMPTION", "ref": "spec M1"},
    "rough_window": {"value": 3, "unit": "cells", "source": "PROXY", "ref": "spec M1"},
    "rough_ref_percentile": {"value": 95, "unit": "", "source": "PROXY", "ref": "spec M1"},
    "detail_radius_km": {"value": 15, "unit": "km", "source": "DECISION", "ref": "P-14"},
    "detail_cell_m": {"value": 20, "unit": "m", "source": "FUENTE", "ref": "S3 DTM noise"}
  },
  "units": {
    "kcal_day_to_W": {"value": 0.048426, "unit": "W per kcal/day", "source": "DERIVED", "ref": "4184/86400"},
    "W_to_kcal_min": {"value": 0.0143403, "unit": "kcal/min per W", "source": "DERIVED", "ref": "60/4184"},
    "J_to_kcal": {"value": 0.000239006, "unit": "kcal/J", "source": "DERIVED", "ref": "1/4184"}
  }
}
```

### D.6 Vectores dorados
<!-- FILE: tests/golden/geo.json -->
```json
{
  "R_km": 3388.0,
  "cases": [
    {"id": "G-GEO-1", "fn": "dist_az", "p1": [39.80, 202.10], "p2": [40.02, 203.35], "expect": {"d_km": 58.169, "az_deg": 76.677}, "tol": {"d_km": 0.1, "az_deg": 0.1}},
    {"id": "G-GEO-2", "fn": "r_local", "lat": 40.0, "expect": {"r_km": 3388.002}, "tol": {"r_km": 0.01}},
    {"id": "G-GEO-3a", "fn": "dist_az", "p1": [39.80, 202.10], "p2": [39.90, 204.70], "expect": {"d_km": 118.18, "az_deg": 86.30}, "tol": {"d_km": 0.1, "az_deg": 0.1}},
    {"id": "G-GEO-3b", "fn": "dist_az", "p1": [39.80, 202.10], "p2": [40.560, 202.404], "expect": {"d_km": 46.99, "az_deg": 16.90}, "tol": {"d_km": 0.1, "az_deg": 0.1}},
    {"id": "G-GEO-3c", "fn": "dist_az", "p1": [39.80, 202.10], "p2": [40.75, 201.30], "expect": {"d_km": 66.77, "az_deg": 327.54}, "tol": {"d_km": 0.1, "az_deg": 0.1}},
    {"id": "G-GEO-3d", "fn": "dist_az", "p1": [39.80, 202.10], "p2": [39.10, 201.50], "expect": {"d_km": 49.64, "az_deg": 213.69}, "tol": {"d_km": 0.1, "az_deg": 0.1}},
    {"id": "G-LEQ-1", "fn": "ll_to_xy", "lat": 39.80, "lon": 202.10, "expect": {"x_km": -40.7678, "y_km": -11.8264}, "tol": {"x_km": 0.001, "y_km": 0.001}},
    {"id": "G-LEQ-2", "fn": "ll_to_xy", "lat": 41.3, "lon": 205.5, "expect": {"x_km": 113.244, "y_km": 76.871}, "tol": {"x_km": 0.001, "y_km": 0.001}},
    {"id": "G-LEQ-3", "fn": "kx", "lat": 41.3, "expect": {"kx": 0.98071}, "tol": {"kx": 0.00001}},
    {"id": "G-LEQ-4", "fn": "roundtrip_m", "note": "ll->xy->ll error over 1000 random points in bbox", "expect": {"max_err_m": 0.0}, "tol": {"max_err_m": 1.0}}
  ]
}
```

<!-- FILE: tests/golden/atmos.json -->
```json
{
  "cases": [
    {"id": "G-ATM-1", "fn": "atmos", "z_km": -3.9, "T": 210.0, "P0": 610.0,
     "expect": {"H_km": 10.6627, "P_Pa": 879.384, "rho": 0.022166, "Mcol_gcm2": 23.6345},
     "tol": {"H_km": 0.001, "P_Pa": 0.2, "rho": 0.0002, "Mcol_gcm2": 0.01}}
  ]
}
```

<!-- FILE: tests/golden/env.json -->
```json
{
  "cases": [
    {"id": "G-ENV-1", "fn": "dose_mGy", "t_h": 8.0, "rate_mGy_day": 0.213, "expect": {"dose_mGy": 0.071}, "tol": {"dose_mGy": 0.001}}
  ]
}
```

<!-- FILE: tests/golden/rover.json -->
```json
{
  "defaults": "constants.json rover.* ; rho fixed per case (input)",
  "cases": [
    {"id": "G-ROV-1", "input": {"d_m": 1000, "theta_deg": 0, "r": 0, "payload_kg": 350, "v_ms": 5.0, "rho": 0.0222},
     "expect": {"E_drive_kWh": 0.42069, "E_aux_kWh": 0.06000, "E_total_kWh": 0.48069}, "tol": {"E_drive_kWh": 0.001, "E_aux_kWh": 0.001, "E_total_kWh": 0.002}},
    {"id": "G-ROV-2", "note": "Earth calibration: g=9.80665, rho=1.225, crr=0.009, v=25, no aux, payload 350, 100 km flat",
     "input": {"d_m": 100000, "theta_deg": 0, "r": 0, "payload_kg": 350, "v_ms": 25.0, "rho": 1.225, "g": 9.80665, "crr": 0.009, "aux": false},
     "expect": {"kWh_per_100km": 12.403, "range": [10.5, 13.0]}, "tol": {"kWh_per_100km": 0.01}},
    {"id": "G-ROV-3", "note": "strict order up > flat > down",
     "input": [{"d_m": 1000, "theta_deg": 5, "r": 0, "payload_kg": 350, "v_ms": 5.0, "rho": 0.0222},
               {"d_m": 1000, "theta_deg": 0, "r": 0, "payload_kg": 350, "v_ms": 5.0, "rho": 0.0222},
               {"d_m": 1000, "theta_deg": -5, "r": 0, "payload_kg": 350, "v_ms": 5.0, "rho": 0.0222}],
     "expect": {"E_total_kWh": [0.72351, 0.48069, 0.23468]}, "tol": {"E_total_kWh": 0.001}},
    {"id": "G-ROV-4", "note": "no-regen branch: E_wheel < 0 -> E_drive = 0",
     "input": {"d_m": 1000, "theta_deg": -9.5, "r": 0, "payload_kg": 350, "v_ms": 5.0, "rho": 0.0222},
     "expect": {"E_wheel_kWh": -0.04313, "E_drive_kWh": 0.0, "E_aux_kWh": 0.06000, "E_total_kWh": 0.06000}, "tol": {"E_wheel_kWh": 0.001, "E_drive_kWh": 1e-12, "E_aux_kWh": 0.001, "E_total_kWh": 0.001}},
    {"id": "G-ROV-5", "input": {"d_m": 1000, "theta_deg": 0, "r": 1.0, "payload_kg": 350, "v_ms": 5.0, "rho": 0.0222},
     "expect": {"E_total_kWh": 0.69102}, "tol": {"E_total_kWh": 0.001}},
    {"id": "G-ROV-6", "note": "monotonic in payload",
     "input": [{"d_m": 1000, "theta_deg": 0, "r": 0, "payload_kg": 0, "v_ms": 5.0, "rho": 0.0222},
               {"d_m": 1000, "theta_deg": 0, "r": 0, "payload_kg": 537, "v_ms": 5.0, "rho": 0.0222}],
     "expect": {"E_total_kWh": [0.42040, 0.51291]}, "tol": {"E_total_kWh": 0.001}}
  ]
}
```

<!-- FILE: tests/golden/walker.json -->
```json
{
  "cases": [
    {"id": "G-WLK-1", "fn": "C_w", "input": [0.0, 0.1, -0.1], "expect": [2.5000, 4.8991, 1.1271], "tol": 0.001},
    {"id": "G-WLK-2", "fn": "metabolic",
     "input": {"W": 80, "H_cm": 180, "age": 30, "sex": "M", "L_suit": 170, "L_gear": 0, "G": 0.0, "v": 1.0, "f_g": 0.70, "k_suit": 1.0, "r": 0, "RQ": 0.85, "vo2max": 47, "hr_rest": 60},
     "expect": {"BMR_kcal_day": 1780.0, "P_rest_W": 86.198, "P_loco_W": 437.5, "P_total_W": 523.698, "kcal_per_min": 7.5100, "VO2_Lmin": 1.49529, "VO2_mlkgmin": 18.691, "HR_bpm": 104.35, "sweat_L_h": 0.17457},
     "tol": {"BMR_kcal_day": 0.01, "P_rest_W": 0.1, "P_loco_W": 0.01, "P_total_W": 0.1, "kcal_per_min": 0.001, "VO2_Lmin": 0.002, "VO2_mlkgmin": 0.01, "HR_bpm": 0.1, "sweat_L_h": 0.0005}},
    {"id": "G-WLK-3", "fn": "segment", "note": "1 km flat with G-WLK-2 inputs",
     "input": {"d_m": 1000}, "expect": {"t_s": 1000, "O2_metabolic_L": 24.921, "kcal": 125.167}, "tol": {"t_s": 1e-9, "O2_metabolic_L": 0.1, "kcal": 0.1}},
    {"id": "G-WLK-4", "fn": "C_w", "input": [0.36397, -0.36397], "expect": [13.5677, 3.1228], "tol": 0.001,
     "also": {"min_over_range": {"range": [-0.364, 0.364], "expect_min": 0.9355, "tol": 0.001, "must_be_positive": true}}},
    {"id": "G-WLK-5", "fn": "o2_plan", "note": "G-WLK-2 inputs, flat, round trip 20 km, eva 8 h, reserve 30 min, contingency 0.10",
     "input": {"round_trip_m": 20000}, "expect": {"t_round_h": 5.5556, "n_evas": 1, "single_eva_feasible": true, "O2_metabolic_L": 498.43, "O2_required_L": 597.62, "O2_required_kg": 0.85399},
     "tol": {"t_round_h": 0.001, "O2_metabolic_L": 0.1, "O2_required_L": 0.1, "O2_required_kg": 0.0005}},
    {"id": "G-WLK-6", "fn": "o2_plan", "input": {"round_trip_m": 100000},
     "expect": {"t_round_h": 27.778, "n_evas": 4, "single_eva_feasible": false, "O2_required_L": 2938.74, "O2_required_kg": 4.19946},
     "tol": {"t_round_h": 0.001, "O2_required_L": 0.5, "O2_required_kg": 0.001}},
    {"id": "G-WLK-7", "fn": "metabolic",
     "input": {"W": 60, "H_cm": 165, "age": 35, "sex": "F", "L_suit": 170, "L_gear": 10, "G": 0.05, "v": 0.8, "f_g": 0.70, "k_suit": 1.0, "r": 0, "RQ": 0.85},
     "expect": {"BMR_kcal_day": 1295.25, "P_total_W": 546.546, "VO2_Lmin": 1.56053}, "tol": {"BMR_kcal_day": 0.01, "P_total_W": 0.1, "VO2_Lmin": 0.002}},
    {"id": "G-BIO-1", "fn": "core_temp", "input": {"P_total_W": 1000, "W": 80, "t_s": 3600}, "expect": {"Tc_C": 40.242, "alert": true}, "tol": {"Tc_C": 0.005}}
  ]
}
```

### D.7 pois.json (M1 rellena `elev_m`)
<!-- FILE: web/data/pois.json -->
```json
{
  "schema_version": "1.1",
  "base": {"id": "AP-1", "name": "AP-1 · Base of Operations", "short": "AP-1", "lat": 39.80, "lon": 202.10, "elev_m": null,
    "description": "Primary base on the Sinuous Unit. Considered the safest site in the study: slopes below 5° at 10 m scale and almost no rocks larger than 1 m. About 10 cm of sand over up to 80 m of ice."},
  "pois": [
    {"id": "AP-9", "name": "AP-9 · ISRU Site", "short": "AP-9", "lat": 40.02, "lon": 203.35, "elev_m": null, "route_group": 1,
     "md_straight_km": 58.17, "md_az_deg": 76.68,
     "description": "Primary heavy-ISRU site on the Sinuous Unit. Thickest subsurface ice of the unit (radar: up to ~80 m of excess ice) and the unit's highest combined ice-consistency index. Rougher and rockier than AP-1."},
    {"id": "APMR", "name": "APMR · Paleo-megaripples", "short": "APMR", "lat": 39.90, "lon": 204.70, "elev_m": null, "route_group": 1,
     "md_straight_km": 118.18, "md_az_deg": 86.30,
     "description": "Paleo-megaripples and lithified dunes east of AP-9, at the far end of Route 1 across the Sinuous Unit."},
    {"id": "HCP_ESP_037655_2210", "name": "HCP · Polygon Field", "short": "HCP", "lat": 40.560, "lon": 202.404, "elev_m": null, "route_group": 2,
     "md_straight_km": 46.99, "md_az_deg": 16.90,
     "description": "Field of high-centered thermal-contraction polygons (HiRISE ESP_037655_2210). A modal polygon diameter of ~11 m suggests ground ice only ~6–20 cm deep; this depth is a model-based estimate calibrated at the Phoenix site, not a direct measurement."},
    {"id": "AP-8", "name": "AP-8 · Periglacial Plain", "short": "AP-8", "lat": 40.75, "lon": 201.30, "elev_m": null, "route_group": 2,
     "md_straight_km": 66.77, "md_az_deg": 327.54,
     "description": "Periglacial plain next to the Sinuous Unit. Highest neutron and combined ice indices among adjacent sites, and a basal radar reflector deeper than ~20 m. Shallow ice mining and astrobiology target."},
    {"id": "US1_FRONT", "name": "US1 · Ogive Front", "short": "US1", "lat": 39.10, "lon": 201.50, "elev_m": null, "route_group": 3,
     "md_straight_km": 49.64, "md_az_deg": 213.69,
     "description": "Terminal lobe of Sinuous Unit 1, with ogives and crescent-shaped ridges. Low-insolation NNW–NE scarps preserved for over 20 Myr are candidates for trenching or horizontal drilling. Glaciology target."}
  ]
}
```

### D.8 Configuración del repo
<!-- FILE: requirements.txt -->
```text
# Minimum versions [ASSUMPTION]; M0 freezes exact versions in requirements.lock.txt
numpy>=1.26
scipy>=1.11
rasterio>=1.3.9
pystac-client>=0.7
requests>=2.31
Pillow>=10.0
jsonschema>=4.20
pytest>=8.0
```

<!-- FILE: package.json -->
```json
{
  "name": "bioenanos-arcadia-navigator",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run tests/js",
    "e2e": "playwright test tests/e2e",
    "vendor": "node tools/vendor_leaflet.mjs",
    "serve": "node tools/serve.mjs",
    "postinstall": "node tools/vendor_leaflet.mjs"
  },
  "dependencies": {
    "leaflet": "1.9.4"
  },
  "devDependencies": {
    "vitest": "latest",
    "@playwright/test": "latest"
  }
}
```

<!-- FILE: .gitignore -->
```text
data/raw/
node_modules/
__pycache__/
.pytest_cache/
*.pyc
.venv/
test-results/
playwright-report/
.DS_Store
*.aux.xml
```

<!-- FILE: .github/workflows/ci.yml -->
```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install -r requirements.txt
      - run: pytest -q tests/py
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci || npm install
      - run: npm test
      - name: e2e (only if UI exists)
        run: |
          if [ -f web/index.html ] && ls tests/e2e/*.spec.* >/dev/null 2>&1; then
            npx playwright install --with-deps chromium
            npm run e2e
          else
            echo "No UI/e2e yet; skipping"
          fi
```

<!-- FILE: .github/workflows/pages.yml -->
```yaml
name: pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web
      - id: deployment
        uses: actions/deploy-pages@v4
```

<!-- FILE: DATA_LICENSE.md -->
```markdown
# Data licenses

- Regional layers in `web/data/layers/` and rasters in `data/processed/` derived from the USGS MOLA–HRSC blended DEM (200 m, v2) are licensed **CC BY-SA 3.0 IGO** (share-alike), credit: DLR/ESA/FU Berlin, NASA/JPL/GSFC, USGS Astrogeology.
- MOLA-only products: public domain.
- HiRISE DTM-derived detail layers: CC0 (USGS); credit NASA/JPL-Caltech/University of Arizona/USGS.
- Mars Trek tiles: credit as listed in the Mars Trek layer metadata (NASA/JPL-Caltech/USGS/ASU).
- Exact sources used are listed in `data/processed/source_report.json`.
```

### D.9 Esquemas JSON
<!-- FILE: schemas/pois.schema.json -->
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["schema_version", "base", "pois"],
  "$defs": {
    "site": {
      "type": "object",
      "required": ["id", "name", "short", "lat", "lon", "elev_m", "description"],
      "properties": {
        "id": {"type": "string"}, "name": {"type": "string"}, "short": {"type": "string"},
        "lat": {"type": "number", "minimum": 38.7, "maximum": 41.3},
        "lon": {"type": "number", "minimum": 200.5, "maximum": 205.5},
        "elev_m": {"type": ["number", "null"]},
        "description": {"type": "string", "minLength": 1}
      }
    }
  },
  "properties": {
    "schema_version": {"const": "1.1"},
    "base": {"$ref": "#/$defs/site"},
    "pois": {"type": "array", "minItems": 5, "maxItems": 5,
      "items": {"allOf": [{"$ref": "#/$defs/site"},
        {"type": "object", "required": ["md_straight_km", "md_az_deg", "route_group"],
         "properties": {"md_straight_km": {"type": "number"}, "md_az_deg": {"type": "number"}, "route_group": {"enum": [1, 2, 3]}}}]}}
  }
}
```

<!-- FILE: schemas/layers.schema.json -->
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["schema_version", "mock", "crs", "grid", "layers"],
  "properties": {
    "schema_version": {"const": "1.1"},
    "mock": {"type": "boolean"},
    "crs": {"type": "object", "required": ["name", "phi0_deg", "lam0_deg", "R_km", "units"],
      "properties": {"name": {"const": "LEQ"}, "phi0_deg": {"const": 40.0}, "lam0_deg": {"const": 203.0}, "R_km": {"const": 3388.0}, "units": {"const": "km"}}},
    "grid": {"type": "object", "required": ["cell_m", "x_min_km", "x_max_km", "y_min_km", "y_max_km", "ncols", "nrows"]},
    "layers": {"type": "array", "minItems": 8,
      "items": {"type": "object",
        "required": ["id", "label", "file", "bounds_km", "unit", "min", "max", "legend", "source", "available", "proxy"],
        "properties": {
          "id": {"enum": ["hillshade", "elevation", "slope", "roughness", "thermal", "optical", "shielding", "detail"]},
          "label": {"type": "string"},
          "file": {"type": ["string", "null"]},
          "bounds_km": {"type": ["object", "null"], "required": ["x_min", "x_max", "y_min", "y_max"]},
          "unit": {"type": "string"}, "min": {"type": ["number", "null"]}, "max": {"type": ["number", "null"]},
          "legend": {"type": "string"}, "source": {"type": "string"},
          "available": {"type": "boolean"}, "proxy": {"type": "boolean"},
          "subfiles": {"type": "object"}, "location_label": {"type": "string"}, "note": {"type": "string"}
        }}}
  }
}
```

<!-- FILE: schemas/routes.schema.json -->
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["schema_version", "mock", "grid", "params_used", "routes"],
  "properties": {
    "schema_version": {"const": "1.1"},
    "mock": {"type": "boolean"},
    "grid": {"type": "object", "required": ["cell_m", "neighbors"]},
    "params_used": {"type": "object", "required": ["rover", "walker"]},
    "routes": {"type": "array", "minItems": 20, "maxItems": 20,
      "items": {"type": "object",
        "required": ["poi", "mode", "direction", "length_km_3d", "length_km_2d", "ascent_m", "descent_m", "max_grade_deg", "mean_grade_deg", "time_h", "ref", "points"],
        "properties": {
          "poi": {"enum": ["AP-9", "APMR", "HCP_ESP_037655_2210", "AP-8", "US1_FRONT"]},
          "mode": {"enum": ["rover", "walker"]},
          "direction": {"enum": ["out", "back"]},
          "length_km_3d": {"type": "number", "exclusiveMinimum": 0},
          "length_km_2d": {"type": "number", "exclusiveMinimum": 0},
          "ascent_m": {"type": "number", "minimum": 0}, "descent_m": {"type": "number", "minimum": 0},
          "max_grade_deg": {"type": "number", "minimum": 0, "maximum": 20},
          "mean_grade_deg": {"type": "number", "minimum": 0, "maximum": 20},
          "time_h": {"type": "number", "exclusiveMinimum": 0},
          "ref": {"type": "object"},
          "points": {"type": "array", "minItems": 2,
            "items": {"type": "object", "required": ["x_km", "y_km", "lat", "lon", "z_m", "s_km", "grade_deg", "rough"],
              "properties": {"x_km": {"type": "number"}, "y_km": {"type": "number"}, "lat": {"type": "number"}, "lon": {"type": "number"},
                "z_m": {"type": "number"}, "s_km": {"type": "number", "minimum": 0}, "grade_deg": {"type": "number"}, "rough": {"type": "number", "minimum": 0, "maximum": 1}}}}
        },
        "allOf": [
          {"if": {"properties": {"mode": {"const": "rover"}}}, "then": {"properties": {"ref": {"required": ["E_total_kWh", "E_drive_kWh", "E_aux_kWh"]}, "max_grade_deg": {"maximum": 10}}}},
          {"if": {"properties": {"mode": {"const": "walker"}}}, "then": {"properties": {"ref": {"required": ["E_kcal", "O2_metabolic_L"]}}}}
        ]}}
  }
}
```

### D.10 Plantilla de handoff
<!-- FILE: docs/HANDOFF_TEMPLATE.md -->
~~~~markdown
# HANDOFF_Mx — Módulo <X>: <nombre>
**Fecha/hora:** <YYYY-MM-DD HH:MM> · **Persona:** <P1–P4> · **Agente:** <Claude Code | Codex | Gemini CLI + modelo/versión>
**Rama:** <mX-slug> · **Commit:** <hash> · **PR:** <url> · **CI:** ☐ verde ☐ rojo
**Estado:** ☐ COMPLETO ☐ COMPLETO CON DESVIACIONES ☐ INCOMPLETO

> Copia este archivo a `docs/handoff/HANDOFF_Mx.md`, reemplaza todo `<...>` y no borres secciones. Si una no aplica, escribe "N/A" y explica por qué.

## 1. Resumen (máx. 10 líneas)
Qué se construyó y qué queda listo para los módulos que dependen de este.

## 2. Verificación de módulos previos (lado derecho de la V)
| Módulo | Pruebas al INICIO | Resultado | Pruebas al FINAL | Resultado |
|---|---|---|---|---|
| M0 | | PASS/FAIL | | PASS/FAIL |

Si algo falló al inicio: qué falló, si lo corregiste (y por qué no rompe el contrato) o por qué lo dejaste.

## 3. Archivos creados / modificados
| Ruta | Acción (nuevo/modificado) | ¿Es de mi módulo según §3.5? | Propósito |
|---|---|---|---|

## 4. Interfaces públicas
- Funciones (firma, unidades y un ejemplo de llamada).
- Archivos de datos (ruta, esquema y 1 registro de ejemplo).
- Eventos DOM / estado compartido (nombre y payload).
- Constantes usadas (clave de `constants.json`).

## 5. Resultados de las pruebas de ESTE módulo
| ID | Descripción | PASS/FAIL | Medido vs esperado | Notas |
|---|---|---|---|---|

Comandos exactos para reproducir: `<comandos>`.

## 6. Validación de fuentes de datos (obligatoria en M1; en otros módulos, solo si usaste datos nuevos)
| Fuente (ID §4) | ¿Accesible? | URL final | CRS | Resolución | Nodata / escala / offset | Tiempo | Notas |
|---|---|---|---|---|---|---|---|

## 7. Desviaciones respecto al spec
Para cada una: requisito (ID), qué hiciste distinto, por qué, impacto y si requiere decisión humana.

## 8. Suposiciones nuevas (`ASSUMPTION` / `PROXY`) y cambios de constantes propuestos
| Constante / decisión | Valor | Dónde vive | Justificación | ¿Requiere aprobación humana? |
|---|---|---|---|---|

## 9. Problemas conocidos y riesgos
Lista priorizada (bloqueante / importante / menor), con cómo reproducir cada uno.

## 10. Lo que necesitan los módulos que dependen de este
- Qué pueden dar por hecho.
- Qué NO deben tocar.
- Trampas de datos o código (CRS, radios, nodata, orden lat/lon, longitudes 0–360 vs −180..180, mocks vs reales).
- Cómo ejecutar el proyecto desde cero hasta este punto.

## 11. Preguntas abiertas para el equipo humano
Numeradas, cada una con tu opción recomendada.

## 12. Checklist de cierre
- ☐ Todas las pruebas de mi módulo pasan (o están documentadas como FAIL con causa)
- ☐ Todas las pruebas de los módulos previos pasan
- ☐ Solo toqué archivos de mi módulo (§3.5) o justifiqué la excepción en §7
- ☐ No cambié contratos (schemas, constants.json, golden)
- ☐ No dejé secretos ni datos crudos pesados en el repo
- ☐ Sección `## Mx` del README actualizada
- ☐ Handoff en `docs/handoff/HANDOFF_Mx.md` y PR abierto con CI verde
~~~~

### D.11 README (esqueleto)
<!-- FILE: README.md -->
~~~~markdown
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
## M1 — Data ingestion
## M2 — Routing
## M3 — Map UI
## M4 — Rover telemetry
## M5 — On-foot telemetry
## M6 — Integration & deployment
## Sensitivity analysis (M6)
## Credits
~~~~

---

## Apéndice E — Resultados esperados (sanidad, no son pruebas)
Calculados en línea recta y en llano con los parámetros por defecto. Las rutas reales serán ≥ estos valores.

| POI | Línea recta (km) | Rover ida y vuelta en llano (kWh) | Veredicto esperado (límite 76.8 kWh) | A pie, ida y vuelta (h, 1 m/s) | EVAs (8 h) |
|---|---|---|---|---|---|
| HCP | 46.99 | 45.2 | ROUND TRIP OK | 26.1 | 4 |
| US1_FRONT | 49.64 | 47.7 | ROUND TRIP OK | 27.6 | 4 |
| AP-9 | 58.17 | 55.9 | ROUND TRIP OK | 32.3 | 5 |
| AP-8 | 66.77 | 64.2 | ROUND TRIP OK si la ruta ≤ 79.9 km de ida | 37.1 | 5 |
| APMR | 118.18 | 113.6 | **ONE-WAY ONLY** (ida ≈ 56.8 kWh; quedan ≈ 39 kWh) | 65.7 | 9 |

Si M2 produce valores muy alejados de esta tabla (por ejemplo, rutas > 1.3× la línea recta en una llanura), es señal de un error de georreferenciación o de unidades: revisa T-M1-07 y §3.3.
