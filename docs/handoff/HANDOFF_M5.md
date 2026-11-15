# HANDOFF_M5 — Módulo 5: Telemetría a pie
**Fecha/hora:** 2026-11-15 (America/Mexico_City) · **Persona:** Abe (en lugar de P4) · **Agente:** Claude (claude.ai, Claude Opus 5.5; sesión de nube con terminal)
**Rama:** `m5-walker` · **PR:** ver GitHub · **CI:** ver PR
**Estado:** ☒ COMPLETO ☐ COMPLETO CON DESVIACIONES ☐ INCOMPLETO

## 1. Resumen
- `models/walker.js` es el gemelo exacto del modelo en Python. Los vectores dorados G-WLK-1…7, G-BIO-1 y G-ENV-1 pasan en JS, y la **paridad con `ref` es < 1e-9** en las 10 rutas a pie. El resumen del navegador (EVAs, O₂ requerido, O₂ máximo por EVA) coincide con el `summary` de `routes.json` para el astronauta por defecto.
- Panel a pie, en 4 columnas:
  - **formulario** de 13 campos con los rangos del spec: estatura, masa, sexo, edad, condición física, traje + PLSS, equipo, velocidad, FC en reposo, límite por EVA, reserva de O₂, contingencia y penalización del traje (deslizador). Un campo vacío o fuera de rango muestra un mensaje en línea y **no se calcula**;
  - **resumen:** O₂ requerido en L STP (cifra principal) y su masa, O₂ máximo por EVA, EVAs, distancia y tiempo de ida y vuelta, kcal, VO₂ medio, y las **alertas** (multi-EVA con el texto exacto del spec, temperatura corporal > 38.5 °C y gasto metabólico fuera de 250–900 W);
  - **reproducción** de la ida y vuelta (×600/×3600/×36000) con el perfil de elevación y **separadores de EVA**;
  - **medidores:** EVA, FC, VO₂, kcal, O₂ consumido, hidratación, temperatura corporal, dosis y distancia recorrida.
- Reutiliza `chart.js` y `env_strip.js` de M4 **sin modificarlos**.
- Pruebas: **161 pytest + 89 Vitest (30 de M5) + 19 Playwright (4 de M5)**, todas PASS. Las e2e se corrieron 3 veces seguidas sin fallos intermitentes.

## 2. Verificación de módulos previos
| Módulo | Al INICIO (`main` 7c72a2e) | Al FINAL |
|---|---|---|
| M0–M4 | 161 pytest + 59 Vitest + 15 Playwright PASS | PASS |

## 3. Archivos creados / modificados
| Ruta | Acción | Propósito |
|---|---|---|
| `web/js/models/walker.js` | nuevo | §6.4–6.6 |
| `web/js/telemetry_walker.js` | reemplaza el stub | `mountWalkerPanel(el, ctx)` (misma firma), más `walkerSummary` y `MULTI_EVA_ALERT` |
| `tests/js/test_m5_walker.test.js`, `tests/e2e/m5_walker.spec.js` | nuevos | Pruebas |
| `README.md` | solo `## M5` | Instrucciones |

## 4. Interfaces públicas
- `models/walker.js`:
  - modelo: `defaultWalker()`, `C_w(G)`, `bmrKcalDay`, `pRestW`, `powerW(w, G, r)`, `vo2Lmin`, `heartRate`, `sweatLh`, `metabolic(w, G, r)`, `segment(w, d_m, θ, r)`, `routeEnergy(points, w)`, `o2Plan(segs, {eva_limit_h, reserve_min, contingency})` (incluye `O2_per_EVA_L[]`), `coreTempC`;
  - reproducción: `roundTripTimeline(out, back, w, plan)` y `walkerStateAt(tl, t_s, eva_limit_h)`;
  - formulario: `FIELDS`, `validateForm(raw)` → `{ok, values, errors}`, `fromForm(values)` → `{w, plan}` y `defaultForm()`.
- `telemetry_walker.js`: `walkerSummary(out, back, w, plan)` devuelve `{o2, kcal, tl, tcMax, pMin, pMax, alerts[], km_out, km_back}` (útil para M6).
- Eventos: emite `traverse:progress {mode: 'walker', id, s_km}`. **En el regreso** el marcador se refleja sobre la ruta `out` (`s_out = L_out·(1 − fracción de la vuelta)`), porque M3 dibuja el marcador sobre la ruta `out`; la ruta `back` es casi la misma con estos datos. Al cambiar a ROVER, la reproducción se pausa y el marcador se borra.
- Atributos para pruebas: `[data-s="O2_required_L|O2_required_kg|O2_max_per_EVA_L|n_evas|t_round_h|kcal|VO2_mean"][data-v]`, `[data-s="n_evas"][data-single]`, `[data-alert="multi-eva|core-temp|metabolic"]`, `[data-g="eva|hr|vo2|kcal|o2|hyd|tc|dose|dist"][data-v]`, `.wk[data-done]` y `#wk-err`.

## 5. Resultados de las pruebas
| ID | PASS/FAIL | Medido |
|---|---|---|
| T-M5-01 G-WLK-1…7, G-BIO-1, G-ENV-1 en JS | PASS | mismos JSON que Python |
| T-M5-02 paridad con `ref` (10 rutas) | PASS | < 1e-9; además, EVAs, O₂ y O₂ máx./EVA = `summary` de M2 |
| T-M5-03 validación del formulario | PASS | extremos aceptados en los 11 campos numéricos; vacío, texto y ±1 fuera de rango rechazados con mensaje; sexo y condición física inválidos rechazados; en e2e, mensaje en línea + `aria-invalid` + resumen reemplazado por "Fix the highlighted field" |
| T-M5-04 más masa ⇒ más O₂; más velocidad ⇒ más P_total y menos tiempo | PASS | masa corporal, traje y equipo |
| T-M5-05 `n_evas = ceil(t/limit)`; t = 8.0 h → 1 | PASS | también 8 h + 1 s → 2; con límite de 12 h bajan las EVAs |
| T-M5-06 fin de la reproducción = resumen (±0.1 %) | PASS | kcal, O₂ metabólico, EVA final = n_evas y distancia = ida + vuelta; marcas de EVA = n_evas − 1 |
| T-M5-07 sin errores de consola | PASS | durante una reproducción completa |
| (extra) temperatura corporal reiniciada en cada EVA | PASS | — |

**Resultados con el astronauta por defecto** (80 kg, traje 170 kg, equipo 10 kg, 1.0 m/s):
| POI | EVAs | O₂ requerido | O₂ máx./EVA | Alertas |
|---|---|---|---|---|
| HCP | 4 | 3012 L | 893 L | multi-EVA |
| US1_FRONT | 4 | 3169 L | 901 L | multi-EVA |
| AP-9 | 5 | 3896 L | 968 L | multi-EVA, **Tc hasta 38.9 °C**, **P hasta 1096 W** |
| AP-8 | 5 | 4258 L | 925 L | multi-EVA, **P hasta 1032 W** |
| APMR | 9 | 7758 L | 969 L | multi-EVA, **Tc hasta 38.7 °C**, **P hasta 1096 W** |

## 6. Validación de fuentes de datos
N/A (sin datos nuevos).

## 7. Desviaciones respecto al spec
- **D-M5-01:** la reproducción cubre la **ida y vuelta completa**, porque las EVAs y el O₂ son de ida y vuelta (§6.5). El marcador del mapa se refleja sobre la ruta `out` durante el regreso (§4).
- **D-M5-02:** las velocidades de reproducción son ×600/×3600/×36000, no las de M4: el spec no las fija para M5, y una ida y vuelta a pie dura de 27 a 67 h (a ×36000, APMR tarda unos 7 s).
- **D-M5-03:** los segmentos que cruzan el límite de una EVA se **parten en el límite**, para que el reinicio de la temperatura corporal (§6.6: "entre EVAs Tc vuelve a 37.0") ocurra exactamente ahí. El primer intento asignaba cada segmento por su punto medio, y una prueba lo detectó.

## 8. Suposiciones nuevas
No hay constantes nuevas. Decisiones de interfaz: las velocidades de reproducción (D-M5-02) y el reflejo del marcador durante el regreso.

## 9. Problemas conocidos y riesgos
1. **Hallazgo del modelo:** en AP-9, AP-8 y APMR hay tramos cortos de subida (≈ 5° más rugosidad) donde el gasto metabólico llega a **1030–1096 W**, por encima de los 900 W. En AP-9 y APMR, la temperatura corporal estimada sube a **38.7–38.9 °C** dentro de una EVA. Es lo que el spec pide alertar, y la UI lo muestra. Con el modelo actual, Tc solo sube cuando el calor supera los 500 W del LCVG y no baja hasta la siguiente EVA, así que es conservador. Conviene mencionarlo en la demo como resultado, no como error.
2. A 1280 px, con 3 alertas (AP-9, APMR), la columna del resumen necesita ≈ 17 px de scroll. El resto cabe en la franja de 300 px de M3.
3. `walkerSummary` recalcula la línea de tiempo completa con cada cambio del formulario: unos 1200 segmentos en APMR, instantáneo.

## 10. Lo que necesitan los módulos siguientes (M6)
- T-M5-02 ya corre con datos reales. Para T-M6-06 (APMR a pie con EVAs > 1): `[data-s="n_evas"]` muestra 9.
- El análisis de sensibilidad de `f_g` (y de `k_suit`) puede usar `walkerSummary` con `{...w, f_g}`; `f_g` no está en el formulario (spec), pero `powerW` lo lee del objeto `w`.
- About (M3) ya incluye las 4 notas de validez de §6.4. Falta, si M6 lo decide, una línea sobre el hallazgo 9.1.

## 11. Preguntas abiertas
Ninguna bloqueante.

## 12. Checklist de cierre
- ☒ Pruebas de M5 PASS · ☒ Pruebas de M0–M4 PASS · ☒ Solo archivos de M5 (más la sección del README) · ☒ `chart.js` y `env_strip.js` sin modificar · ☒ Sin cambios de contratos · ☒ README `## M5` · ☐ PR con CI verde (se completa al abrir el PR)
