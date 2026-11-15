# HANDOFF_M4 — Módulo 4: Telemetría del rover
**Fecha/hora:** 2026-11-15 (America/Mexico_City) · **Persona:** Abe (en lugar de P4) · **Agente:** Claude (claude.ai, Claude Opus 5.5; sesión de nube con terminal)
**Rama:** `m4-rover` · **PR:** ver GitHub · **CI:** ver PR
**Estado:** ☐ COMPLETO ☒ COMPLETO CON DESVIACIONES ☐ INCOMPLETO (una prueba de M0 corregida, §7)

## 1. Resumen
- `models/rover.js` es el gemelo exacto del modelo en Python: los 6 vectores dorados pasan en JS y la **paridad con `ref` de `routes.json` es de < 1e-9** en las 10 rutas del rover (el spec pide ≤ 0.5 %).
- Panel del rover:
  - carga útil editable con validación (0–537 kg y un mensaje que explica el límite: GVWR − masa en vacío);
  - veredicto (ROUND TRIP OK / ONE-WAY ONLY / NOT REACHABLE) con la batería que queda a la llegada y el límite de ida y vuelta (76.8 kWh);
  - tabla de ida, vuelta e ida y vuelta: energía, % de batería, kWh/100 km, tiempo, ascenso/descenso y pendiente máxima;
  - perfiles de elevación y de potencia con cursor;
  - reproducción ×60/×600/×3600 con 9 medidores: velocidad, batería, energía, potencia, pendiente, distancia restante, ETA, dosis y temperatura de batería ("held by heater");
  - durante la reproducción emite `traverse:progress` y M3 mueve el marcador en el mapa.
- Franja de entorno: T, P y ρ a la elevación media de la ruta (o en AP-1 si no hay selección), irradiancia con τ 0.4 y 2.0, y tasa de dosis.
- `chart.js`: gráfica de líneas en canvas propio, sin librerías, con soporte de marcadores verticales pensado para separar EVAs en M5.
- Pruebas: **161 pytest + 59 Vitest (26 de M4) + 15 Playwright (5 de M4)**, todas PASS. Las e2e se corrieron 3 veces seguidas sin fallos intermitentes.

## 2. Verificación de módulos previos
| Módulo | Al INICIO (`main` 97e5837) | Al FINAL |
|---|---|---|
| M0–M3 | 161 pytest + 33 Vitest + 10 Playwright PASS | PASS (con la corrección de §7 en `test_m0_serve`) |

## 3. Archivos creados / modificados
| Ruta | Acción | Propósito |
|---|---|---|
| `web/js/models/rover.js` | nuevo | §6.3: `segmentEnergy`, `timeline`, `routeEnergy`, `routeSummary`, `verdict`, `validatePayload`, `stateAt`, `rhoAt`, `auxPowerW` (con alias snake_case) |
| `web/js/telemetry_rover.js` | reemplaza el stub | `mountRoverPanel(el, ctx)` (misma firma) |
| `web/js/env_strip.js` | reemplaza el stub | `mountEnvStrip(el, ctx)` (misma firma), más `meanElevation(route)` y `envValues(z_m)` |
| `web/js/chart.js` | reemplaza el stub | `lineChart(canvas, series, opts)` (misma firma), más `niceTicks` |
| `tests/js/test_m4_rover.test.js`, `tests/e2e/m4_rover.spec.js` | nuevos | Pruebas |
| `tests/js/test_m0_serve.test.js` | **modificado (archivo de M0)** | Ver §7 D-M4-01 |
| `README.md` | solo `## M4` | Instrucciones |

## 4. Interfaces públicas (para M5 y M6)
- `lineChart(canvas, series, opts)` → `{update(series?, opts?), setCursor(x|null), destroy()}`.
  - `series = [{name, x[], y[], color?}]`.
  - `opts = {title, xLabel, yLabel, color, yMin, yMax, digits, fill, empty, markers: [{x, label}]}`.
  - **El canvas no resuelve `var(--x)`:** hay que pasar colores ya resueltos (`getComputedStyle(el).getPropertyValue('--walker')`). Se redibuja solo con un `ResizeObserver`; el canvas necesita una altura CSS.
- `mountEnvStrip(el, ctx)` se monta una sola vez desde `main.js` y se actualiza con `poi:selected`, `poi:cleared` y `mode:changed`. Usa la ruta `out` del modo activo, así que **M5 no tiene que tocarla**.
- Cada panel inyecta su propia hoja de estilos (`<style id="telemetry-rover-style">`), porque `hud.css` pertenece a M3. Usa las variables de M3 (`--rover`, `--walker`, `--mode`, `--line`, `--muted`, `--panel-2`, `--ok`, `--alert`). M5 puede hacer lo mismo con su propio id.
- Patrón de la reproducción, que M5 puede copiar: `requestAnimationFrame` avanza el tiempo simulado `t += dt·speed`; `stateAt(segs, t)` interpola con potencia constante por segmento; al final se fija `t = total`, para que los acumulados sean **exactamente** los del resumen. El panel emite `traverse:progress {mode, id, s_km}` en cada frame y `{s_km: null}` para borrar el marcador. Al cambiar de modo, el panel se pausa y borra el marcador.
- Atributos para pruebas: `[data-k="out|back|total.E_total_kWh"][data-v]`, `[data-verdict]`, `[data-g="speed|battery|energy|power|grade|remaining|eta|dose|tbatt"][data-v]`, `.rv[data-done]`, `#rv-payload`, `#rv-msg`.

## 5. Resultados de las pruebas
| ID | PASS/FAIL | Medido |
|---|---|---|
| T-M4-01 G-ROV-1…6 en JS | PASS | mismos JSON que Python; G-ROV-2 = 12.40 kWh/100 km |
| T-M4-02 paridad con `ref` (10 rutas) | PASS | diferencia relativa < 1e-9 (el umbral del spec es 0.5 %); en el navegador, la energía mostrada = `ref` |
| T-M4-03 carga < 0 o > 537 → rechazo con mensaje | PASS | unitaria + e2e: `aria-invalid`, mensaje y nada se recalcula |
| T-M4-04 más carga ⇒ más energía | PASS | 0 < 100 < 350 < 537 kg en las 10 rutas |
| T-M4-05 fin de la reproducción = resumen (±0.1 %) | PASS | energía igual al resumen; distancia restante 0; batería = 100·(1 − E/96); ETA "Arrived" |
| T-M4-06 sin errores de consola | PASS | durante la selección y la reproducción completa |
| T-M4-07 ruta sintética de 200 km | PASS | 96.14 kWh de ida > 96 → **NOT REACHABLE**; a 120 km, ONE-WAY ONLY; a 60 km, ROUND TRIP OK |
| (extra) APMR real → ONE-WAY ONLY | PASS | adelanta T-M6-06 |
| (extra) cambio a ON FOOT pausa la reproducción, oculta el panel y borra el marcador; al volver, "Resume" | PASS | — |

## 6. Validación de fuentes de datos
Se buscó la ficha oficial de Tesla (el spec lo pide en §6.3):
| Dato | `constants.json` (EVKX) | Tesla oficial | Comentario |
|---|---|---|---|
| Masa en vacío | 2092 kg | **2092 kg** (tesla.com/en_gb, Model S Dual Motor) | coincide; en EE. UU. Tesla publica 4561 lb (2069 kg) |
| Coef. de arrastre | 0.208 | **0.23** (tesla.com, todas las regiones) | **propuesta de cambio** (§8) |
| GVWR | 2629 kg | no aparece en la página de especificaciones | un tercero (iSeeCars, EE. UU.) da 5452 lb (2473 kg), lo que dejaría la carga máxima en ≈ 404 kg; **sin confirmar** |

## 7. Desviaciones respecto al spec
- **D-M4-01 (regla "no tocar archivos de otros módulos"). Se corrigió `tests/js/test_m0_serve.test.js`.** Esa prueba (escrita en M0) montaba los stubs sin DOM y exigía el texto "Pending module M4/M5", así que tenía que romperse en cuanto M4 hiciera su trabajo. Las **verificaciones de firma siguen intactas** (`mountRoverPanel.length === 2`, etc.); la de contenido solo se aplica si el archivo sigue siendo el stub de M0. Es el cambio mínimo y no toca ningún contrato.
- **D-M4-02:** la reproducción recorre la ruta de **ida** (`out`), que es la que dibuja el marcador de M3. La tabla y el veredicto cubren ida, vuelta y total.
- **D-M4-03:** `chart.js` añade `setCursor` y `opts.markers` a la firma mínima (son extensiones; la firma del stub se conserva).

## 8. Suposiciones nuevas y cambios propuestos
| Constante | Valor actual | Propuesta | Efecto |
|---|---|---|---|
| `rover.Cd` | 0.208 [FUENTE: EVKX] | **0.23** [FUENTE: tesla.com] | Despreciable en Marte: a 5 m/s y ρ = 0.0222, la fuerza aerodinámica pasa de 0.135 a 0.149 N frente a ≈ 1360 N de rodadura (< 0.002 % de la energía). Requiere revisar el spec y G-ROV (el golden usa 0.208). |
| `rover.gvwr_kg` | 2629 [EVKX] | sin cambio (no confirmado) | Si fuera 2473 kg, la carga máxima bajaría a ≈ 404 kg. **Decisión humana.** |
No hay constantes físicas nuevas. Las de interfaz (velocidades de reproducción 60/600/3600) vienen del spec.

## 9. Problemas conocidos y riesgos
1. Con la tabla, las gráficas y los medidores, la franja de telemetría (300 px, definida por M3) queda justa a 1280 px. Cabe sin scroll, pero el botón ×3600 baja a una segunda línea.
2. La elevación media de la ruta para la franja de entorno pondera los segmentos por longitud 3D. Con estas rutas casi planas la diferencia con la media simple es de < 1 m.
3. Sigue pendiente el `.gitattributes` (CRLF en `web/vendor`), reportado desde M1.

## 10. Lo que necesitan los módulos siguientes
- **M5:** reutilizar `chart.js` y `env_strip.js` **sin modificarlos** (la franja ya se actualiza sola). Montar el panel en `#telemetry-walker` con la misma estructura de 3 columnas, o la que convenga, e inyectar su propio `<style>`. Para la reproducción conviene copiar el patrón de `telemetry_rover.js` (`timeline` + `stateAt`, fijar al final, emitir `traverse:progress` con `mode: 'walker'`, pausar con `mode:changed`). Los separadores de EVA se dibujan con `opts.markers: [{x: s_km, label: 'EVA 2'}]`.
- **M6:** T-M4-02 ya corre con datos reales. Falta el análisis de sensibilidad de `crr`/`eta_dt`/`f_g`; los valores de `crr` ya calculados están en HANDOFF_M2 §9.

## 11. Preguntas abiertas
1. ¿Actualizar `Cd` a 0.23 (oficial)? *Recomendado:* sí en una revisión del spec, solo por exactitud de fuente; no cambia ningún resultado visible.
2. ¿Investigar más el GVWR oficial? *Recomendado:* no antes de la entrega; mantener 2629 kg y mencionarlo en About.

## 12. Checklist de cierre
- ☒ Pruebas de M4 PASS · ☒ Pruebas de M0–M3 PASS · ☒ Solo archivos de M4, salvo la excepción justificada en §7 · ☒ Sin cambios de contratos · ☒ README `## M4` · ☐ PR con CI verde (se completa al abrir el PR)
