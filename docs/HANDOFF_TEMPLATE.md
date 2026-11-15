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
