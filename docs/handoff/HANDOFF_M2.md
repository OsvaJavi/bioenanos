# HANDOFF_M2 — Módulo 2: Cálculo de rutas óptimas
**Fecha/hora:** 2026-11-15 (America/Mexico_City) · **Persona:** Abe (en lugar de P2) · **Agente:** Claude (claude.ai, Claude Opus 5.5; sesión de nube con terminal)
**Rama:** `m2-routing` · **PR:** ver GitHub · **CI:** ver PR
**Estado:** ☒ COMPLETO ☐ COMPLETO CON DESVIACIONES ☐ INCOMPLETO

## 1. Resumen
- Se implementaron los modelos físicos del rover y del caminante (`models_rover.py`, `models_walker.py`). Los **20 vectores dorados** (G-ROV-1…6, G-WLK-1…7, G-BIO-1) pasan a la primera.
- Ruteo (`routing.py`): grafo dirigido de 16 vecinos sobre la rejilla de 200 m (873 180 nodos y ≈ 13.9 M aristas por modo), con los cortes P-13 y Dijkstra de scipy. Se hacen 4 corridas: por modo, una sobre el grafo para las rutas `out` y otra sobre el grafo transpuesto para las `back`.
- `web/data/routes.json` tiene las 20 rutas reales (0.63 MB, `mock: false`) y se genera en **≈ 6 s**.
- Las rutas son 1.2–2.7 % más largas que la línea recta, como era de esperar en una llanura de 0.84° de pendiente media. Los resultados coinciden con el Apéndice E: **APMR en rover = ONE-WAY ONLY**, los otros 4 POI = ROUND TRIP OK, y **a pie todos requieren varias EVAs (4–9)**.
- Pruebas: **161 pytest (44 de M2) + 24 Vitest PASS**.

## 2. Verificación de módulos previos
| Módulo | Al INICIO (`main` 2d53be0) | Al FINAL |
|---|---|---|
| M0 + M1 | 117 pytest + 24 Vitest PASS | PASS (incluidos en 161 + 24) |

## 3. Archivos creados / modificados
| Ruta | Acción | Propósito |
|---|---|---|
| `pipeline/models_rover.py` | nuevo | §6.3: `segment_energy`, `route_energy(points)`, `verdict`, `rho_at` |
| `pipeline/models_walker.py` | nuevo | §6.4–6.6: `Walker`, `C_w`, `metabolic`, `segment`, `route_energy(points)`, `o2_plan`, `core_temp_C` |
| `pipeline/routing.py` | nuevo | Grafo de 16 vecinos, P-13, Dijkstra, `path_cost`, `bresenham` |
| `pipeline/export_routes.py` | nuevo | Rutas reales → `web/data/routes.json` |
| `web/data/routes.json` | nuevo | 20 rutas (B.2) |
| `tests/py/test_m2_models.py`, `test_m2_routing.py`, `test_m2_real.py` | nuevos | Pruebas |
| `README.md` | solo `## M2` | Instrucciones |

## 4. Interfaces públicas
- **`routes.json` (B.2).** Cada punto trae `x_km, y_km, lat, lon, z_m, s_km, grade_deg, rough`. `grade_deg` y `rough` describen el **segmento que llega** a ese punto (en el primero: 0 y el valor de la celda).
- **Cómo deben recorrer las rutas M4 y M5 (obligatorio para la paridad T-M4-02 / T-M5-02).** Para cada segmento k ≥ 1:
  - `d = 1000·(s_k − s_{k−1})` (m, longitud 3D);
  - `θ = grade_deg_k`;
  - `r = rough_k`;
  - `z = (z_{k−1} + z_k)/2`;
  - rover: `ρ = atmos(z/1000).rho`; caminante: `G = tan θ`.

  `ref` se calculó exactamente así sobre los valores **redondeados** del JSON (T-M2-09: diferencia < 1e-9).
- **Extras opcionales:**
  - por ruta: `graph_cost` (Wh o kcal, unidad en `graph_cost_unit`) y `mock: false`;
  - en el nivel superior: `summary[poi]`, con `straight_km`, el veredicto del rover, la batería a la llegada, y para el caminante `t_round_h`, `n_evas`, `O2_required_L` y `O2_max_per_EVA_L` con los parámetros por defecto; `same_path_rover_walker [out, back]` y `points_note`.
- **Python:**
  - `models_rover.segment_energy(d_m, theta_deg, r, rho=|z_m=, payload_kg, v_ms, g, crr, aux)` devuelve J;
  - `models_walker.segment(Walker(...), d_m, theta_deg, r)` devuelve `t_s, P_total_W, E_J, E_kcal, O2_L`;
  - `models_walker.o2_plan([(t_s, O2_L), ...])` incluye el reparto por EVA (prorratea dentro del segmento que cruza un límite).

## 5. Resultados de las pruebas
| ID | PASS/FAIL | Medido |
|---|---|---|
| T-M2-01 vectores dorados en Python | PASS | 20/20 (incluye G-ROV-2 = 12.40 kWh/100 km y el mínimo de C_w = 0.9355) |
| T-M2-02 extremos (< 150 m, misma celda) | PASS | 20/20 |
| T-M2-03 0.995× ≤ 2D ≤ 3× la línea recta | PASS | razón 1.012–1.027 |
| T-M2-04 ninguna arista viola P-13 | PASS | pendiente máx. de arista: rover 5.06°, a pie 5.82° |
| T-M2-05 muro sintético de 15° con hueco | PASS | el rover rodea por el hueco y el caminante cruza |
| T-M2-05 DEM real (se reporta) | — | rutas idénticas solo en AP-8 `out` y US1 `back`. Celdas compartidas: AP-8 100 %, US1 99 %, AP-9 93 %, HCP 87 %, APMR 6 % (separación máx. 2.8 km). La diferencia viene del costo (subidas y rugosidad se pesan distinto en cada modo), no de los cortes |
| T-M2-06 determinismo, byte a byte | PASS | dos `compute()` idénticos e iguales al archivo versionado |
| T-M2-07 óptimo ≤ línea Bresenham | PASS | 10/10 rutas `out` |
| T-M2-08 esquema B.2, `mock: false` | PASS | — |
| T-M2-09 `ref` = recálculo desde `points` | PASS | diferencia < 1e-9 |
| T-M2-10 tiempo total | PASS | 5.5 s (sandbox de nube) |
| (extra) `graph_cost` = recorrido de la ruta | PASS | diferencia relativa máx. 6e-11 |
| (extra) plano, plano de 3° (asimetría ida/vuelta), cuenca, nodata, movimientos de caballo, determinismo sintético | PASS | — |

**Resultados por POI** (parámetros por defecto, P-11):
| POI | Recta (km) | Rover ida (km) | Rover ida+vuelta (kWh) | Veredicto | A pie ida (km) | t ida+vuelta (h) | EVAs | O₂ req. (L STPD) | O₂ máx./EVA (L) |
|---|---|---|---|---|---|---|---|---|---|
| HCP | 46.99 | 48.24 | 47.6 | ROUND TRIP OK | 48.24 | 26.8 | 4 | 3012 | 893 |
| US1_FRONT | 49.64 | 50.25 | 50.2 | ROUND TRIP OK | 50.25 | 27.9 | 4 | 3169 | 901 |
| AP-9 | 58.17 | 59.76 | 61.4 | ROUND TRIP OK | 59.76 | 33.2 | 5 | 3896 | 968 |
| AP-8 | 66.77 | 67.68 | 67.8 | ROUND TRIP OK | 67.68 | 37.6 | 5 | 4258 | 925 |
| APMR | 118.18 | 119.80 | 123.3 | **ONE-WAY ONLY** (quedan 34.4 kWh a la llegada) | 120.21 | 66.8 | 9 | 7758 | 969 |

El consumo real es de 0.49–0.52 kWh/km, frente a 0.481 en llano; la diferencia viene de la rugosidad (`k_rough`) y del ascenso acumulado. AP-8 queda en 67.8 kWh, dentro del límite de 76.8 kWh.

## 6. Validación de fuentes de datos
N/A: se usan solo los productos de M1 (`data/processed/*`), sin datos nuevos.

## 7. Desviaciones respecto al spec
Ninguna de contrato. Solo se agregaron campos opcionales en `routes.json` (permitido por §8.2): `graph_cost`, `graph_cost_unit`, `mock` por ruta, `summary` y `points_note`; en `grid`, también `x_min_km, y_max_km, ncols, nrows`.

## 8. Suposiciones nuevas
Ninguna constante nueva. Hay dos decisiones de implementación que el spec no fijaba:
| Decisión | Valor | Dónde |
|---|---|---|
| Redondeo de `points` | x/y 4 dec., lat/lon 6, z 2, s 6, grade 4, rough 4 | `export_routes.ND` (`ref` se calcula después de redondear) |
| Celdas intermedias de un movimiento de caballo (±1, ±2) | (0, ±1) y (±1, ±1); para (±2, ±1): (±1, 0) y (±1, ±1) | `routing.knight_intermediates` |

## 9. Problemas conocidos y riesgos
1. **El terreno es muy plano:** las rutas son casi rectas y los cortes casi nunca se activan (aristas cortadas: 232 en rover y 8 a pie, de unos 14 M). Es lo que el spec espera (§9, "Alta"). La diferencia entre modos se demuestra con el muro sintético.
2. **El veredicto del rover depende fuertemente de `crr` [ASSUMPTION].** Energía de ida y vuelta (kWh) sobre las mismas rutas, para `crr` = 0.08 / 0.15 / 0.30:
   - HCP: 28.1 / 47.6 / 89.4
   - US1: 29.6 / 50.2 / 94.4
   - AP-9: 36.1 / 61.4 / 115.6
   - AP-8: 39.9 / 67.8 / 127.4
   - APMR: 72.5 / 123.3 / 232.1

   El límite es 76.8 kWh. Con 0.08, **todos** los POI son ROUND TRIP OK, APMR incluido. Con 0.30, **ninguno** lo es, y APMR es NOT REACHABLE (116 kWh solo de ida > 96). M6 debe mostrarlo en el análisis de sensibilidad. Es el supuesto más influyente del proyecto.
3. **Las rutas no se recalculan si el usuario cambia la masa (P-11):** la geometría queda fija y solo la energía se recalcula en el navegador. Se declara en "About".
4. **Pendiente: `.gitattributes`** (CRLF en `web/vendor/leaflet`), ya reportado en HANDOFF_M1.

## 10. Lo que necesitan los módulos siguientes
- **M3:** `web/data/routes.json` ya existe y es real, así que `data.js` debe tomarlo en lugar del mock y **no** mostrar el banner MOCK. La distancia de la lista es `length_km_3d` de la ruta `out` del modo activo. Ahora T-M3-06 ya se puede probar con datos reales: las distancias por modo difieren en APMR (119.80 frente a 120.21 km).
- **M4:** `models/rover.js` debe reproducir `models_rover.segment_energy` y `route_energy` (§4 de este handoff). La paridad se mide contra `ref` (≤ 0.5 %; aquí la diferencia es < 1e-9 si se respeta el orden de las operaciones).
- **M5:** `models/walker.js` debe reproducir `models_walker` (`segment`, `o2_plan` con reparto por EVA, `core_temp_C`). Para comprobarse, puede usar `summary` como referencia de `n_evas` y O₂.
- **Regenerar:** `python -m pipeline.export_routes` (requiere los `data/processed/*.tif` de M1, ya versionados).

## 11. Preguntas abiertas
Ninguna bloqueante.

## 12. Checklist de cierre
- ☒ Pruebas de M2 PASS · ☒ Pruebas de M0 y M1 PASS · ☒ Solo archivos de M2 (más la sección del README) · ☒ Sin cambios de contratos · ☒ README `## M2` · ☐ PR con CI verde (se completa al abrir el PR)
