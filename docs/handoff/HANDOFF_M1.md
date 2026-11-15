# HANDOFF_M1 — Módulo 1: Ingesta y derivación de datos
**Fecha/hora:** 2026-11-15 (America/Mexico_City) · **Persona:** Abe (P1) · **Agente:** Claude (claude.ai, Claude Opus 5.5; sesión de nube con terminal)
**Rama:** `m1-data` · **PR:** #2 · **CI:** verde en la última ejecución revisada
**Estado:** ☐ COMPLETO ☒ COMPLETO CON DESVIACIONES ☐ INCOMPLETO

## 1. Resumen
- El M1 quedó dividido en dos pasos: `fetch_data` (necesita internet; lee solo las ventanas por rangos HTTP) y `derive_layers` (offline). El entorno de construcción no alcanza los servidores de USGS ni NASA (el proxy responde 403), así que el humano corrió `fetch_data` en su laptop.
- DEM: **S-DEM1 (mezcla MOLA–HRSC de 200 m) ok**. Ventana de 1513×795 px sin huecos; elevaciones de −4233 a −3692 m.
- Capas regionales disponibles: hillshade, elevation, slope, roughness (proxy), thermal (THEMIS IR día, S-TI2), optical (Viking MDIM 2.1 color, S-OPT2) y shielding (proxy).
- Detalle (P-14): **no hay un HiRISE DTM a ≤ 15 km de AP-1** (regla 1: 0 items). La regla 2 encontró 5 CTX DTM sobre AP-1 y se eligió `J20_052424_2201_XN_40N158W__J20_052490_2201_XN_40N158W` (20 m, CC0, alineado a MOLA). Capa `detail` lista: hillshade, pendiente y ortoimagen a 20 m sobre una franja de ~30×30 km alrededor de AP-1.
- Reproyección propia: esfera de la fuente (R = 3 396 190 m) → esfera del proyecto (R = 3388 km). Las derivadas usan `dx_real = 200·k_x(φ_fila)`.
- Pruebas: **117 pytest + 24 Vitest PASS**. Las de datos reales (T-M1-03…09) se ejecutan sobre los archivos versionados.

## 2. Verificación de módulos previos
| Módulo | Al INICIO | Al FINAL |
|---|---|---|
| M0 | 93 pytest + 24 Vitest PASS (clon limpio de `main`) | PASS (incluidos en los 117 + 24) |

## 3. Archivos creados / modificados
| Ruta | Acción | Propósito |
|---|---|---|
| `pipeline/fetch_data.py` | nuevo | Lecturas por ventana (S-DEM1→S-DEM2, STAC P-14, THEMIS/Viking con respaldo en Trek WMTS) y `source_report.json` |
| `pipeline/derive_layers.py` | nuevo | Reproyección a LEQ, derivadas, PNG, `layers.json` y `pois.json` |
| `data/processed/{dem_200m,slope_deg,roughness,shield_col}.tif`, `source_report.json` | nuevos | Ráster float32 en la rejilla LEQ (CRS `+proj=eqc +lat_ts=40 +lat_0=40 +lon_0=203 +R=3388000`), nodata NaN |
| `web/data/layers/*.png`, `layers.json` | nuevos | Capas para M3 (2.6 MB en total; PNG con paleta de 256 colores) |
| `web/data/pois.json` | modificado | `elev_m` rellenado (bilineal) |
| `tests/py/test_m1_derive.py`, `tests/py/test_m1_real.py` | nuevos | Pruebas |
| `README.md` | solo `## M1` | Instrucciones |

## 4. Interfaces públicas
- `python -m pipeline.fetch_data [--only dem,detail,thermal,optical] [--dem-file F] [--thermal-url U] [--optical-url U] [--tes-url U]`
- `python -m pipeline.derive_layers`; la función es `derive(raw_dir, processed_dir, layers_dir, pois_path, grid=None)`.
- `pipeline.derive_layers`: `Grid` (regional o subrejilla; `latlon()`, `kx_rows()`, `bounds()`), `reproject_to_grid`, `horn_gradients`, `slope_deg`, `hillshade`, `roughness_raw`, `normalize_roughness`, `read_grid_tif(path) -> (array, tags)`.
- `pipeline.fetch_data.SrcGeo(crs, transform)`: lon/lat → píxel de la fuente (eqc o geográfica; respeta `lon_0` y el radio de la fuente).
- **Para M2:** `read_grid_tif("data/processed/dem_200m.tif")`, `slope_deg.tif` y `roughness.tif` (r ∈ [0,1]). Forma 770×1134, fila 0 = norte, nodata = NaN. `ti_tes.tif` **no existe** (P-15: `enable_ti_exclusion = false`).
- **Para M3:** `web/data/layers/layers.json` (B.1, `mock: false`). `file` es relativo a `web/data/`. Campos opcionales nuevos: `palette` (paradas `[t, "#hex"]` para dibujar la leyenda) y `stats`. En `detail`: `subfiles {hillshade, slope, ortho}` y `location_label`.

## 5. Resultados de las pruebas
| ID | PASS/FAIL | Medido |
|---|---|---|
| T-M1-01 G-GEO (reuso) | PASS | — |
| T-M1-02 ida y vuelta `ll↔xy` (1000 pts) + rejilla vectorizada = `geo.xy_to_ll` | PASS | error < 1e-9° |
| T-M1-03 POI en la rejilla y sobre celdas válidas | PASS | 6/6 |
| T-M1-04 DEM ≥ 99 % válido; AP-1 en −4500…−3300 m | PASS | 100 % válido; AP-1 −3928.0 m; ningún POI a > 400 m del contexto (máx. Δ = −37.5 m, AP-8) |
| T-M1-05 pendientes 0–45°, media < 10° | PASS | media 0.84°, P99 5.19°, máx. 23.2°; > 10°: 0.05 % de las celdas; > 20°: 4 celdas |
| T-M1-06 `layers.json` cumple B.1 y los archivos existen | PASS | 8/8 capas disponibles |
| T-M1-07 georreferenciación (pico sintético) | PASS | en 4 ubicaciones del BBOX, error ≤ 1 celda |
| T-M1-08 una entrada por fuente de §4 | PASS | 11/11 |
| T-M1-09 `web/data/layers/` < 15 MB | PASS | 2.6 MB (antes de cuantizar eran 14 MB) |
| (extra) gradientes de superficies inclinadas | PASS | componente este `p` = g_e ± 0.4 % (la diferencia restante es 3396.19 vs 3388 km); pendiente norte ± 0.02° |
| (extra) sin `k_x` el error sería ≥ 1.8 % en el borde sur | PASS | — |

## 6. Validación de fuentes de datos (`data/processed/source_report.json`)
| Fuente | Estado | Datos clave |
|---|---|---|
| S-DEM1 MOLA–HRSC 200 m | **ok** (32 s) | CRS **geográfico** `+proj=longlat +R=3396190` (no eqc), 0.003374°/px, Int16, nodata −32768, **no teselado** |
| S-DEM2 MOLA 463 m | no necesario | — |
| S-DEM3 HiRISE DTM | no localizado cerca de AP-1 | La colección real se llama `mro_hirise_socet_dtms` (el spec dice `mro_hirise_controlled_socet_dtms`, que no existe); se encontró por búsqueda heurística |
| S-DEM4 CTX DTM | **ok** (2.6 s; segunda ejecución) | colección `mro_ctx_controlled_usgs_dtms`; assets: `image` (= **hillshade**), `dtm`, `orthoimage`, `qa_metrics`, `intersection_error`, `thumbnail`, `mola_csv` |
| S-OPT1 ortoimagen CTX | ok | float32 (reflectancia ≈ 0–0.65), nodata −32767, 22.4 m |
| S-TI1 THEMIS TI cualitativo | no localizado | sin URL; se puede pasar con `--thermal-url` |
| S-TI2 THEMIS IR día 100 m v12 | **ok** (77 s) | `Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12.tif`; eqc con **`lon_0 = 180`**; uint8; se agregó a 200 m |
| S-TI3 TES TI | no localizado | `enable_ti_exclusion` sigue en false |
| S-OPT2 Viking MDIM 2.1 color 232 m | **ok** (28 s) | 3 bandas uint8 |
| S-ENV | ok | contexto §5 |
| S-META | no necesario | (la primera ejecución lo dejó como `not_attempted` por un bug; ya está corregido) |

## 7. Desviaciones respecto al spec
- **D-M1-01:** el fetch corrió en la laptop del humano porque el entorno del agente tiene la red restringida (riesgo §9).
- **D-M1-02:** el nombre de la colección HiRISE en el spec es incorrecto; existe `mro_hirise_socet_dtms`. El código la descubre listando las colecciones.
- **D-M1-03:** S-TI2 y S-OPT2 se leyeron como **ventanas GeoTIFF de USGS** (los mismos productos que el spec nombra para Trek). El respaldo con teselas WMTS de Trek está implementado pero no se usó ni se probó.
- **D-M1-04:** el hillshade PNG lleva un estiramiento de contraste solo para la visualización (P0.5–P99.5), porque la llanura es muy plana. El cálculo sigue siendo el de §M1 (az 315°, alt 45°, z ×1).
- **D-M1-05:** campos opcionales en `layers.json` (`palette`, `stats`, `file_base`; en `detail`, `z_range_m` y `slope_max_deg`).
- **D-M1-06:** el detalle es **CTX (20 m)**, no HiRISE, por la regla 2 de P-14. La etiqueta de la capa lo dice ("CTX detail"). Producto: `J20_052424_2201_XN_40N158W__J20_052490_2201_XN_40N158W`, z −4060…−3906 m; pendiente máxima a 20 m: 49° (bordes de cráteres pequeños y ruido del DTM; es solo visual, P-12).
- **D-M1-07:** la **primera** descarga del detalle tomó el asset equivocado: en CTX, `image` es el hillshade. Se corrigió `_pick_assets` (prefiere `dtm` y rechaza DTM de 8 bits) y se repitió `--only detail`. Hay una prueba de regresión: `test_pick_assets_ctx_layout`.
- **D-M1-08:** los PNG se guardan con paleta (256 colores, sin tramado) para respetar T-M1-09.

## 8. Suposiciones nuevas
| Constante | Valor | Dónde | Por qué |
|---|---|---|---|
| `SLOPE_DISPLAY_MAX_DEG` | 25° | derive_layers | Tope de la rampa de color, por encima del corte de 20° |
| `ELEV_DISPLAY_PCT` | P1–P99 | derive_layers | Rampa de elevación |
| `HILLSHADE_STRETCH_PCT` | P0.5–P99.5 | derive_layers | Solo visualización |
| URLs de THEMIS y Viking | ver `THERMAL_CANDIDATES` / `OPTICAL_CANDIDATES` | fetch_data | Funcionaron en vivo |
| Paletas | viridis / magma / cividis / azul | derive_layers | Perceptualmente uniformes |

## 9. Problemas conocidos y riesgos
1. **Rayas N–S de ≈ 0.3° en la pendiente del tercio oeste.** Vienen del **DEM fuente**, no de la reproyección (misma amplitud en la pendiente nativa de la fuente). En esa zona la mezcla es casi solo MOLA interpolado y está cuantizada en enteros de 1 m (35 % de diferencias nulas entre píxeles vecinos). Quedan muy por debajo de los cortes de 10° y 20°; para M2 son ruido pequeño en el costo. No se suavizó (`SLOPE_SMOOTH_SIGMA_CELLS = 0` por spec).
2. **El terreno es muy plano** (pendiente media 0.84°). Según el spec (§9, riesgo "Alta"), es de esperar que las rutas salgan casi rectas.
3. **M0 / `.gitattributes`:** en `main` los archivos de `web/vendor/leaflet/` tienen CRLF, y `npm install` los reescribe con LF, así que quedan como modificados en todos los clones. Solución propuesta (M0 o M6): un `.gitattributes` con `web/vendor/** -text` o `* text=auto eol=lf`.
4. El respaldo con Trek WMTS no está probado en vivo.
5. **El mosaico THEMIS IR día v12 está desplazado ≈ 2 celdas (≈ 400 m al S y 200 m al E) respecto a Viking y a la ortoimagen CTX**, que coinciden entre sí. Se midió por correlación cruzada de los campos filtrados (pasa-altos): CTX↔THEMIS |r| = 0.63 y Viking↔THEMIS |r| = 0.24, ambos con el máximo en (2, 1). Mi conversión lon/lat → píxel coincide con PROJ en todos los productos (error < 2e-9 m), así que el desfase está en la georreferenciación del propio mosaico. Es una capa solo visual y **no se corrigió**: no se aplican desplazamientos sin fuente.
6. **La alineación horizontal del DEM regional no se pudo verificar contra imágenes:** en esta llanura el relieve a 200 m casi no correlaciona con THEMIS, Viking ni CTX (|r| < 0.1). Se confía en la prueba sintética T-M1-07 y en la verificación contra PROJ. Desfase vertical medio CTX − regional cerca de AP-1: −31 m (datums distintos; el detalle es solo visual).

## 10. Lo que necesitan los módulos siguientes
- **M2:** usar `data/processed/*.tif` con `derive_layers.read_grid_tif`; las celdas NaN no existen en esta región (DEM 100 % válido). La rugosidad ya está normalizada (r ∈ [0,1], `rough_ref_m = 2.09 m` en los tags). TI: sin exclusión.
- **M3:** las 8 capas están en `layers.json`; usar `palette` + `min`/`max`/`unit`/`legend` para la leyenda. `thermal` y `optical` no tienen min/max (son imagen relativa). Atribuciones: S-DEM1 → CC BY-SA 3.0 IGO (DLR/ESA/FU Berlin/NASA/USGS); CTX DTM → CC0 (NASA/JPL-Caltech/MSSS/USGS); THEMIS → NASA/JPL-Caltech/ASU; Viking → NASA/USGS.
- **Regenerar:** `python -m pipeline.fetch_data` (con red) y luego `python -m pipeline.derive_layers`.

## 11. Preguntas abiertas
1. ¿Agregar `.gitattributes` (riesgo 3)? *Recomendado:* sí, en M6 o como parche de M0.
2. ¿Quieres un HiRISE DTM aunque esté lejos de AP-1 (P-14, regla 3)? *Recomendado:* no; el CTX sobre la base es más útil para la demo.

## 12. Checklist de cierre
- ☒ Pruebas de M1 y M0 PASS · ☒ Solo archivos de M1 (más la sección del README) · ☒ Sin cambios de contratos · ☒ Sin datos crudos en el repo · ☒ README `## M1` · ☒ PR listo para revisión
