# HANDOFF_M6 — Módulo 6: Integración, E2E y despliegue
**Fecha/hora:** 2026-11-15 (America/Mexico_City) · **Persona:** Abe (en lugar de P1 + P3) · **Agente:** Claude (claude.ai, Claude Opus 5.5; sesión de nube con terminal)
**Rama:** `m6-integration` · **PR:** ver GitHub · **CI:** ver PR
**Estado:** ☐ COMPLETO ☒ COMPLETO CON DESVIACIONES ☐ INCOMPLETO. Las desviaciones son la v1.2 del spec (Cd), decidida por el humano, y T-M6-03 contra la URL pública, pendiente de que Pages publique.

## 1. Resumen
- **Datos reales en todo el sitio:** `routes.json` y `layers.json` con `"mock": false` y sin banner MOCK (T-M6-07).
- **Cd = 0.23** (ficha oficial de Tesla), por decisión humana. El spec pasa a la **v1.2**: G-ROV-1/2/3/6 recalculados y el rango de G-ROV-2 ampliado a [10.5, 13.5]. Se regeneraron `routes.json` y los mocks, y los veredictos y EVAs no cambiaron.
- **Manejo de datos faltantes, sin pantalla en blanco:**
  - sin `pois.json`: mensaje fatal con la causa;
  - sin `routes.json` o `layers.json`: se usan los mocks y aparece el banner;
  - **nuevo en M6:** si una imagen de capa no carga, se muestra un aviso bajo la leyenda en lugar de un hueco silencioso.
- **E2E de integración** (`tests/e2e/m6_integration.spec.js`): cada POI en ambos modos, sin errores de consola, cero peticiones externas, atribuciones, APMR, subruta `/bioenanos/`, peso y primera carga, datos faltantes, y una prueba opcional contra la URL pública.
- **README final:** regenerar, probar y desplegar; tabla de resultados; **sensibilidad** de `crr`, `eta_dt` y `f_g` sobre AP-9 (`tools/sensitivity.py`); créditos.
- **`docs/DEMO_SCRIPT.md`** (inglés): demo en vivo de 3 min, **video de 30 s** (el formato oficial de Space Apps), alternativa de 7 diapositivas y checklist de entrega.
- **`.gitattributes` y normalización LF** en `tools/vendor_leaflet.mjs`: acaba con los diffs fantasma en `web/vendor` tras `npm install`.
- Pruebas: **161 pytest + 89 Vitest + 26 Playwright PASS**, 1 omitida (la URL pública, que se corre con `PAGES_URL`).

## 2. Verificación de módulos previos
| Módulo | Al INICIO (`main` 28838f3) | Al FINAL |
|---|---|---|
| M0–M5 | 161 pytest + 89 Vitest + 19 Playwright PASS | PASS, con datos reales y Cd 0.23 (T-M6-01, que incluye T-M4-02 y T-M5-02) |

## 3. Archivos creados / modificados
| Ruta | Acción | Propósito |
|---|---|---|
| `tests/e2e/m6_integration.spec.js` | nuevo | T-M6-02…07, peso y carga, datos faltantes |
| `tools/sensitivity.py` | nuevo | Tabla de sensibilidad del README |
| `docs/DEMO_SCRIPT.md` | nuevo | Guion de demo y checklist de entrega |
| `.gitattributes` | nuevo | `web/vendor/** text eol=lf`; binarios PNG/TIF |
| `README.md` | `## M6`, sensibilidad, créditos | README final |
| `web/data/constants.json`, `tests/golden/rover.json`, `docs/MARS_PROJECT_MASTER_SPEC.md` | **contratos, v1.2** | Cd 0.23 (§7, D-M6-01) |
| `web/data/routes.json`, `web/data/mock/routes.json` | regenerados | Con Cd 0.23 |
| `tools/vendor_leaflet.mjs` (M0) | modificado | CRLF → LF al copiar Leaflet (§7, D-M6-02) |
| `web/js/map.js`, `web/js/main.js`, `web/js/ui.js`, `web/css/hud.css` (M3) | modificados | Aviso de imagen faltante; notas y créditos (§7, D-M6-03/04) |

## 4. Interfaces públicas
- `createMap(el, {…, onLayerStatus})`: callback opcional `(kind: 'regional' | 'detail', label | null)`. Recibe `label` cuando una imagen falla y `null` cuando carga o cambia la capa.
- `ui.setLayerNotice(labels[])`: muestra o quita `#legend .legend-error`.
- `python tools/sensitivity.py`: imprime la tabla en Markdown.
- Eventos y contratos de M3–M5: sin cambios.

## 5. Resultados de las pruebas
| ID | PASS/FAIL | Medido |
|---|---|---|
| T-M6-01 todas las pruebas M0–M5 con datos reales | PASS | 161 + 89 + 19 (más 7 nuevas de M6) |
| T-M6-02 cada POI × ambos modos | PASS | 5 × 2: ruta dibujada, distancia ±0.05 km frente a `length_km_3d`, veredicto o EVAs = `summary`, franja ambiental; además, todas las capas, los diálogos y la reproducción en ambos modos; 0 errores de consola |
| T-M6-03 bajo `/bioenanos/` (local) | PASS | todas las peticiones bajo `/bioenanos/` |
| T-M6-03 en la URL de Pages | **pendiente** | prueba lista, se omite sin `PAGES_URL` (§9.1) |
| T-M6-04 cero peticiones externas | PASS | durante el recorrido completo de T-M6-02 |
| T-M6-05 atribuciones | PASS | USGS, STAC, planetarymaps, Tesla, Leaflet; CC BY-SA 3.0 IGO y CC0 |
| T-M6-06 APMR | PASS | rover ONE-WAY ONLY; a pie 9 EVAs y alerta multi-EVA |
| T-M6-07 sin mocks | PASS | `mock: false` en rutas y capas; banner oculto |
| Peso < 25 MB / primera carga < 5 s | PASS | **7.27 MB** / **178 ms** (servidor local) |
| (extra) datos faltantes | PASS | `pois.json` → mensaje fatal; `routes.json` → mocks y banner, la app funciona; `thermal.png` → aviso que desaparece al cambiar de capa |

**Sensibilidad sobre AP-9** (`tools/sensitivity.py`):
| Parámetro | Valores | Resultado |
|---|---|---|
| `crr` | 0.08 / **0.15** / 0.30 | 36.1 / **61.4** / 115.6 kWh, ida y vuelta. Con **0.30 → ONE-WAY ONLY** |
| `eta_dt` | 0.80 / **0.90** / 0.95 | 68.2 / **61.4** / 58.5 kWh; siempre OK |
| `f_g` | 0.56 / **0.70** / 0.84 | 3233 / **3896** / 4559 L O₂; siempre 5 EVAs |

## 6. Validación de fuentes de datos
- **S1b** (tesla.com, Model S Dual Motor): Cd 0.23, masa en vacío 2092 kg y WLTP 16.8 kWh/100 km, consultado el 2026-11-15. Sustituye a EVKX (0.208) solo para Cd. El área frontal, la batería útil y el GVWR siguen viniendo de EVKX (S1).
- Guía de entrega de Space Apps (spaceappschallenge.org/resources/project-submission-guide): el demo es un video de ≤ 30 s o ≤ 7 diapositivas, en inglés o con subtítulos en inglés, y hay que declarar el uso de IA. El checklist de `DEMO_SCRIPT.md` se basa en ella.

## 7. Desviaciones respecto al spec
- **D-M6-01 (decisión humana, spec v1.2):** Cd 0.208 → **0.23**. Con 0.23, G-ROV-2 da 13.011 kWh/100 km, fuera de [10.5, 13.0]. El humano eligió ampliar el rango a **[10.5, 13.5]**: el WLTP de 16.8 incluye pérdidas que el modelo de §6.3 no tiene. G-ROV-1/3/6 se recalcularon. `constants.json`, `rover.json` y el Apéndice D se cambiaron juntos, así que `test_m0_files` sigue en verde, y el cambio está documentado en "Cambios respecto a v1.1".
- **D-M6-02:** `tools/vendor_leaflet.mjs` (M0) normaliza a LF los archivos de texto de Leaflet, porque el paquete npm trae `LICENSE`, `leaflet-src*.js` y `leaflet.css` en CRLF. Junto con `.gitattributes`, `npm install` ya no ensucia `web/vendor`.
- **D-M6-03:** `map.js` / `main.js` / `ui.js` / `hud.css` (M3): aviso cuando falla una imagen de capa. Es la tarea de M6 "dato faltante ⇒ aviso", y antes el fallo era silencioso.
- **D-M6-04:** `ui.js` (M3): About suma el hallazgo metabólico y térmico de HANDOFF_M5 §9.1 y la procedencia de Cd. Los créditos separan Tesla (oficial) de EVKX (agregador).
- **D-M6-05:** el spec pide un "guion de demo de 3 minutos", pero el demo oficial de Space Apps es de ≤ 30 s o ≤ 7 diapositivas (los demos más largos no son elegibles para Global Judging). `DEMO_SCRIPT.md` incluye los tres formatos.
- **Estado unificado:** no hizo falta cambiar nada. `main.js` ya es el dueño de modo, POI y capa, y los parámetros (carga y astronauta) viven en cada panel y recalculan con el mismo evento. T-M6-02 lo cubre.

## 8. Suposiciones nuevas
Ninguna constante nueva, aparte de Cd (D-M6-01).

## 9. Problemas conocidos y riesgos
1. **Pages:** el `pages` del último push a `main` falló en `configure-pages` con "Get Pages site failed… Not Found", es decir, Pages no estaba activado. Ahora la API del repo reporta `has_pages: true`, así que el merge de este PR debería publicar el sitio. Si vuelve a fallar: *Settings → Pages → Source: GitHub Actions*. Después hay que correr la prueba de la URL pública (checklist).
2. Los 178 ms de primera carga son en un servidor local. En Pages, desde México, depende de la red: son 7.3 MB, con PNGs de 2–3 MB en total.
3. Riesgo de presentación: Tesla aparece como vehículo de referencia. La guía prohíbe "material que promueva productos comerciales", así que conviene presentarlo como dato de referencia, no como marca (el checklist lo indica).

## 10. Lo que necesitan los módulos siguientes
No hay más módulos. Pendiente del equipo:
- activar o verificar Pages y correr `PAGES_URL=… npm run e2e -- -g "public site"`;
- grabar el video de 30 s (Parte B) con subtítulos en inglés;
- llenar la página del proyecto con el checklist, incluida la **declaración de uso de IA**.

## 11. Preguntas abiertas
Ninguna bloqueante. Falta saber el nombre del equipo y de los integrantes para la diapositiva y el video (en el guion hay marcadores `<team name>` y `<names>`).

## 12. Checklist de cierre
- ☒ Pruebas de M6 PASS · ☒ Pruebas de M0–M5 PASS · ☒ Cambios en archivos de otros módulos justificados (§7) · ☒ Cambio de contratos solo con decisión humana y spec v1.2 · ☒ README final · ☒ Guion de demo y checklist · ☐ PR con CI verde (se completa al abrir el PR) · ☐ E2E contra la URL pública (después del merge)
