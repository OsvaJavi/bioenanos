# HANDOFF_M3 — Módulo 3: Mapa, lista de POI y UI base
**Fecha/hora:** 2026-11-15 (America/Mexico_City) · **Persona:** Abe (en lugar de P3) · **Agente:** Claude (claude.ai, Claude Opus 5.5; sesión de nube con terminal)
**Rama:** `m3-map-ui` · **PR:** ver GitHub · **CI:** ver PR
**Estado:** ☒ COMPLETO ☐ COMPLETO CON DESVIACIONES ☐ INCOMPLETO

## 1. Resumen
- La interfaz HUD oscura ya funciona con **datos reales** (M1 + M2 en `main`):
  - mapa Leaflet en `L.CRS.Simple` (1 unidad = 1 km);
  - AP-1 con icono propio y 5 POI con etiqueta permanente;
  - lista ordenada por la distancia 3D de la ruta `out` del modo activo, con una barra proporcional a la distancia;
  - selector `ROVER | ON FOOT`;
  - selector de 8 capas con leyenda y subselector de detalle Hillshade/Slope/Ortho;
  - "Show return" (ruta de regreso punteada);
  - escala en km, coordenadas del cursor en °N/°E;
  - paneles About / Assumptions y Data credits;
  - banner MOCK DATA y aviso de error en lugar de pantalla en blanco.
- Paleta "crepúsculo marciano": el rover usa el azul del atardecer marciano (`#7FB8EA`) y la marcha a pie el ámbar del polvo (`#E0A867`), así que el color del modo se aplica a la ruta, la lista y los controles. La tipografía es la monoespaciada del sistema: el spec pide fuente monoespaciada y T-M6-04 prohíbe fuentes externas.
- Pruebas: **161 pytest + 33 Vitest (9 de M3) + 10 Playwright (M3)**, todas PASS. Las e2e se corrieron 3 veces seguidas sin fallos intermitentes.

## 2. Verificación de módulos previos
| Módulo | Al INICIO (`main` 90ae67d) | Al FINAL |
|---|---|---|
| M0–M2 | 161 pytest + 24 Vitest PASS | PASS |

## 3. Archivos creados / modificados
| Ruta | Acción | Propósito |
|---|---|---|
| `web/index.html` | nuevo | Layout: barra superior, mapa (~65 %), columna de POI y capas, franja `#telemetry` con `#env-strip`, `#telemetry-rover` y `#telemetry-walker`; diálogos About y Credits. `<link rel="icon" href="data:,">` evita el 404 del favicon que se anotó en M0 |
| `web/css/hud.css` | nuevo | Tema con variables CSS, foco visible y `prefers-reduced-motion` |
| `web/js/data.js` | nuevo | Contrato de datos más funciones puras (`sortByDistance`, `pointAtS`, `formatLatLon`, `assumptionRows`, `layerUrl`) |
| `web/js/map.js` | nuevo | Leaflet: overlays, marcadores, rutas, escala en km, marcador de progreso |
| `web/js/ui.js` | nuevo | Lista, capas, leyenda, banner, About y Credits |
| `web/js/main.js` | nuevo | Estado, eventos y montaje de la telemetría |
| `tests/js/test_m3_data.test.js` | nuevo | Unitarias (sin navegador) |
| `tests/e2e/m3_ui.spec.js` | nuevo | E2E bajo `/bioenanos/` |
| `README.md` | solo `## M3` | Instrucciones |

## 4. Interfaces públicas (contratos fijos del spec)
- `data.js`: `await loadData({fetchJson?})`, `getBase()`, `getPOIs()`, `getPOI(id)`, `getRoute(poiId, mode, direction='out')`, `getLayers()`, `isMock()` y `getConstants()` (devuelve `{C, C_meta}`). Además: `getWarnings()`, `getSummary()` (el `summary` de M2), `layerUrl(file)`, `sortByDistance`, `pointAtS(route, s_km)`, `formatLatLon` y `assumptionRows`.
- Eventos en `document` (`CustomEvent`, payload en `detail`):
  - emitidos por M3: `mode:changed {mode}`, `poi:selected {id, mode}` y `poi:cleared {}` (Esc o "Clear selection");
  - escuchado por M3: `traverse:progress {mode, id, s_km}`, que dibuja un marcador `path.progress-dot` sobre la ruta `out` de `id` en `mode`.
- `main.js` llama a `mountEnvStrip(#env-strip)`, `mountRoverPanel(#telemetry-rover)` y `mountWalkerPanel(#telemetry-walker)` con `ctx = {data, bus: document, getState}`, donde `getState()` devuelve `{mode, poiId}`. Si un montaje lanza una excepción, se registra y el resto sigue. Solo es visible el panel del modo activo (atributo `hidden`).
- `body[data-mode]` vale `rover` o `walker`; la variable CSS `--mode` toma el color del modo. M4 y M5 pueden usar `var(--rover)`, `var(--walker)`, `var(--mode)`, `--panel`, `--line`, `--text`, `--muted`, `--alert` y `--ok`.
- `body[data-ready="true"]` indica que la aplicación terminó de montar (útil para E2E).

## 5. Resultados de las pruebas
| ID | PASS/FAIL | Nota |
|---|---|---|
| T-M3-01 sin errores de consola | PASS | además, cero peticiones a dominios externos (adelanta T-M6-04) |
| T-M3-02 6 marcadores | PASS | 5 POI + 1 base; 5 etiquetas permanentes |
| T-M3-03 lista ordenada = `routes.json` (±0.05 km) | PASS | dato y texto mostrado |
| T-M3-04 sin rutas por defecto | PASS | — |
| T-M3-05 clic → 1 ruta + `poi:selected` | PASS | también con clic en el marcador; "Show return" → 2 líneas; Esc → 0 líneas + `poi:cleared` |
| T-M3-06 `mode:changed` + distancias del nuevo modo | PASS | con datos reales las distancias difieren en APMR (119.8 frente a 120.2 km) |
| T-M3-07 selector de capas | PASS | cambia el `src` del overlay; detalle con subselector y aviso "Visual only…"; una capa no disponible queda deshabilitada con el tooltip "Not available" (se probó modificando `layers.json` al vuelo) |
| T-M3-08 `llToXY` JS = Python (G-LEQ-1) | PASS | Vitest |
| T-M3-09 banner MOCK DATA | PASS | oculto con datos reales; visible si `routes.json` responde 404 |
| (extra) `traverse:progress`, About (tabla de ASSUMPTION/PROXY + P-11/P-12/P-16), Credits (≥ 5 enlaces, CC BY-SA 3.0 IGO) | PASS | — |
| (extra) `pois.json` ausente → aviso, no pantalla en blanco | PASS | — |

## 6. Validación de fuentes de datos
N/A: solo se usan archivos ya publicados por M1 y M2.

## 7. Desviaciones respecto al spec
- **D-M3-01:** la capa de detalle se rotula con su `label` de `layers.json` ("CTX detail") y no con "HiRISE detail", porque el producto es CTX (P-14, regla 2; ver HANDOFF_M1).
- **D-M3-02:** el escalímetro es propio, en km. El de Leaflet supone metros y un CRS geográfico, así que en `CRS.Simple` sería incorrecto. Mide km LEQ, que equivalen a km reales con un error de ±2 % (k_x).
- **D-M3-03:** al seleccionar un POI, el mapa encuadra la ruta completa en lugar de centrarse en el POI; muestra lo mismo y además el recorrido. Al limpiar la selección vuelve a la vista regional.

## 8. Suposiciones nuevas
Ninguna constante física. Las decisiones visuales (paleta, tamaños) viven en `hud.css`.

## 9. Problemas conocidos y riesgos
1. La franja de telemetría (300 px) muestra los placeholders "Pending module M4/M5" hasta que M4 y M5 reemplacen los stubs.
2. A 1280×800 la columna derecha necesita scroll para ver todas las capas. Es aceptable en escritorio (D-C4); en M6 se puede compactar si molesta en la demo.
3. Para las e2e locales sin el Chromium de Playwright hay que definir `PW_CHROME=<ruta a Chrome>`. En CI, `ci.yml` ya instala Chromium y ejecuta `npm run e2e` porque ahora existen `web/index.html` y `tests/e2e/*.spec.js`.

## 10. Lo que necesitan los módulos siguientes
- **M4 / M5:** reemplazar los stubs **conservando la firma**. Escuchar `poi:selected`, `poi:cleared` y `mode:changed` en `ctx.bus`; leer la ruta con `ctx.data.getRoute(id, mode, 'out' | 'back')`; emitir `traverse:progress {mode, id, s_km}` durante la reproducción (M3 mueve el marcador). La forma de recorrer `points` está en HANDOFF_M2 §4. `ctx.data.getSummary()` da referencias de veredicto, EVAs y O₂.
- **M6:** ya hay un E2E con verificación de peticiones externas que se puede extender. El sitio funciona bajo `/bioenanos/` con rutas relativas.

## 11. Preguntas abiertas
Ninguna bloqueante.

## 12. Checklist de cierre
- ☒ Pruebas de M3 PASS · ☒ Pruebas de M0–M2 PASS · ☒ Solo archivos de M3 (más la sección del README) · ☒ Sin cambios de contratos · ☒ README `## M3` · ☐ PR con CI verde (se completa al abrir el PR)
