---
documento: Base de conocimiento técnico — Arcadia Planitia (Marte)
version: 1.0
idioma: es
fecha_compilacion: 2026-11-14
fuente_primaria: "Estudio Técnico Exhaustivo de Arcadia Planitia (Marte): Geofísica Criosférica (SWIM/SHARAD), Modelado Meteorológico y Físico-Químico, y Arquitectura Geodésica de Rutas de Exploración" (documento del usuario)
alcance: [geodesia, nomenclatura IAU/USGS, estratigrafía, criosfera (SWIM/SHARAD), atmósfera, irradiancia, polvo, radiación, blindaje, geotecnia, geoquímica, selección de sitios, rutas de exploración]
sistema_coordenadas_por_defecto: planetocéntrico, longitud Este positiva 0–360°E (MOLA)
estado_verificacion: "Fórmulas y tablas derivadas recalculadas de forma independiente (ver §11). Valores observacionales (coordenadas de sitios, mediciones instrumentales, citas) provienen de la fuente y NO fueron contrastados contra las publicaciones originales."
---

# Arcadia Planitia (Marte) — Base de conocimiento técnico para LLM

## 0. Instrucciones de uso para el modelo

Este archivo es contexto de referencia. Al usarlo:

1. **Jerarquía de confianza.** Usa estas etiquetas para decidir qué tan firme afirmar algo:
   - `[VERIFICADO]`: valor derivado que se recalculó a partir de las fórmulas e insumos de este documento y coincide.
   - `[FUENTE]`: dato observacional o bibliográfico tomado del documento fuente; no fue verificado contra el artículo original. Cítalo con su referencia (§10) y no lo presentes como hecho independiente.
   - `[DISCREPANCIA]`: hay una inconsistencia interna o un error probable. Explícalo si el usuario usa ese dato.
   - `[INFERENCIA]`: interpretación del documento fuente, no medición directa (por ejemplo, profundidad del hielo inferida a partir del tamaño de los polígonos).
   - Los datos sin etiqueta dentro de tablas heredan la etiqueta del encabezado de la tabla.
2. **Coordenadas.** Salvo que se indique otra cosa, todo está en sistema **planetocéntrico, °N, °E (0–360)**. Para convertir: `lon_W = 360 − lon_E`.
3. **Elevaciones** referidas al geoide/datum MOLA (km).
4. **No inventes** valores ausentes (por ejemplo, conteos de rocas de sitios que no se reportan aquí). Si falta un dato, dilo.
5. Las fórmulas tienen implementación de referencia en Python (§9); úsala para cálculos nuevos en lugar de aproximar mentalmente.
6. Unidades SI salvo indicación. Inercia térmica (TI) en J m⁻² K⁻¹ s⁻¹ᐟ² (“unidades SI” o “tiu”).

---

## 1. Identificación, nomenclatura y marco cartográfico

### 1.1 Registro oficial (Gazetteer of Planetary Nomenclature, USGS/IAU) `[FUENTE]`

- **Arcadia Planitia**: Feature ID **348**, aprobado en 1973, actualizado el 2018-06-06, cuadrángulo **MC-02 (Diacria)**.
- El nombre proviene del rasgo de albedo clásico **Arcadia** (Feature ID 346), cartografiado por E. M. Antoniadi en *La Planète Mars* (1930, láminas 2–5); alude a la región del Peloponeso.
- Coexisten dos sistemas aprobados por la IAU:
  - Planetocéntrico, longitud +Este 0–360° (MOLA, mapas geológicos modernos).
  - Planetográfico, longitud +Oeste 0–360° (referencia histórica del nomenclátor).
- Polígono WKT oficial (Sets 1 y 2):
  ```
  MULTIPOLYGON (((217 34.6828059174, 165 34.6828059174, 165 54.6815224861, 217 54.6815224861, 217 34.6828059174)))
  ```

### 1.2 Tabla de rasgos `[FUENTE]`

| Rasgo | ID | Tipo | Lat. central | Lon. central | Extensión lat. | Extensión lon. | Diámetro (km) | Notas |
|---|---|---|---|---|---|---|---|---|
| Arcadia Planitia (Set 1) | 348 | Planitia | 46.66°N | 192.00°E | 34.68–54.68°N | 165.00–217.00°E | 2200.00 | Planetocéntrico +E |
| Arcadia Planitia (Set 2) | 348 | Planitia | 46.66°N | 168.00°W | 34.68–54.68°N | 195.00–143.00°W | 2200.00 | Red +W |
| Arcadia Planitia (Set 3) | 348 | Planitia | 49.02°N | 188.15°E | 33.87–64.17°N | 165.86–210.43°E | 2245.00 | Red extendida +E |
| Arcadia Planitia (Set 4) | 348 | Planitia | 49.02°N | 171.85°W | 33.87–64.17°N | 194.14–149.57°W | 2245.00 | Red extendida +W |
| Arcadia (albedo) | 346 | Albedo | 44.66°N | 260.00°E `[DISCREPANCIA]` | — | — | 0 | MDIM 2.0, 1973 |
| Arcadia Dorsa | 347 | Dorsa | 55.90°N | 222.44°E | 39.45–66.81°N | sector NE | 1952.65 | Crestas compresivas |
| Erebus Montes | s/n | Montes | 35.66°N | 185.02°E | 30.02–41.49°N | hasta 191.32°E | 811.67 | Relieve meridional |
| Phlegra Montes | s/n | Montes | 40.40°N | 163.71°E | 29.05–51.57°N | margen W | 1350.65 | Límite W de Arcadia |
| Phlegra Dorsa | s/n | Dorsa | 25.08°N | 170.37°E | hasta 54.19°N | SW de la cuenca | 2818.61 | Transición Arcadia–Elysium |
| Cráter Milankovič | 3893 | Cráter | 54.38°N | 213.30°E | 53.48–55.38°N | 211.70–214.90°E | 118.40 | Variante: 54.46°N, 213.42°E, 113.51 km |

> `[DISCREPANCIA]` En el texto, el rasgo de albedo Arcadia aparece en “45°N, 120°W”; 120°W equivale a **240°E**, no a los 260°E de la tabla. Contrasta con el Gazetteer (Feature 346) antes de usarlo.
> Consistencia verificada: Set 2 = 360 − 192.00 = 168.00°W; Set 4 = 360 − 188.15 = 171.85°W `[VERIFICADO]`.

### 1.3 Contexto fisiográfico `[FUENTE]` (Luzzi et al. 2025; Ramsdale et al. 2018)

- Cuenca de tierras bajas centrada en ~47.2°N, 184.3°E, elevación media ≈ −4 km MOLA.
- Límites: S → Amazonis Planitia (24.8°N, 196.0°E); SW → provincia volcánica de Elysium Mons; SE → Tharsis / Olympus Mons / Alba Patera; N → Scandia y Olympia Undae; W → Utopia Planitia y E → Acidalia Planitia, separadas por sillas topográficas bajas.

---

## 2. Parámetros geodésicos

### 2.1 Elipsoide (IAU/MOLA)

- Radio ecuatorial: R_eq = 3396.19 km
- Radio polar: R_pol = 3376.20 km
- Latitud de referencia del estudio: φ_ref = 40.0°N

### 2.2 Radio geocéntrico local

$$
R_{\text{local}}(\phi)=\sqrt{\frac{(R_{eq}^2\cos\phi)^2+(R_{pol}^2\sin\phi)^2}{(R_{eq}\cos\phi)^2+(R_{pol}\sin\phi)^2}}
$$

R_local(40°N) = **3388.00 km** `[VERIFICADO: 3388.002]`

### 2.3 Distancia ortodrómica (haversine) y acimut inicial

$$
a=\sin^2\!\tfrac{\Delta\phi}{2}+\cos\phi_1\cos\phi_2\sin^2\!\tfrac{\Delta\lambda}{2},\qquad d=2R_{\text{local}}\,\operatorname{atan2}(\sqrt a,\sqrt{1-a})
$$

$$
\theta_{az}=\big(\deg[\operatorname{atan2}(\sin\Delta\lambda\cos\phi_2,\;\cos\phi_1\sin\phi_2-\sin\phi_1\cos\phi_2\cos\Delta\lambda)]+360^\circ\big)\bmod 360^\circ
$$

**Limitación:** es un modelo esférico con un radio local fijo. Para cientos de km, el error frente a una geodésica sobre el elipsoide es del orden de 0.1–0.3 %, aceptable para planeación pero no para navegación de precisión.

---

## 3. Estratigrafía y estructura cortical

### 3.1 Unidades (USGS SIM 2888, Tanaka et al. 2005; SIM 3292, Tanaka et al. 2014; grid-mapping 30–80°N a lo largo de 170°W, Ramsdale et al. 2018) `[FUENTE]`

| Código | Unidad | Edad | Litología / interpretación |
|---|---|---|---|
| Nl, Nn | Basamento noeico | Noeico (>3.77 Ga) | Corteza muy craterizada bajo lavas y sedimentos; filosilicatos en bordes de cráteres (alteración acuosa antigua). |
| HNn / HNt / eHt | Nepenthes Mensae y transición (Erebus y Phlegra Montes) | Noeico tardío – Hespérico temprano (3.77–3.91 Ga) | Knobs y mesetas de <1 km a decenas de km; base −2000 a −4000 m; relieve local 3–4 km; brechas de impacto y faldones por remoción en masa o erosión costera. |
| HVe | Edificio volcánico hespérico | 3.65–3.71 Ga | Flancos de Elysium y tierras altas adyacentes. |
| HAa / AHv | Arcadia Planitia y volcánica Hespérico-Amazónica | <3.65 Ga | Basaltos de inundación y flujos volcaniclásticos (Elysium o NW de Olympus Mons); fallamiento amazónico centrado en Alba Patera. |
| ABvi / ABvm | Formación Vastitas Borealis (interior/marginal) | Hespérico tardío – Amazónico temprano | Sedimentos de outflow channels alterados; polígonos kilométricos; Thumbprint Terrain. |
| AAa1n / AAa2n / Aa3 | Amazonis Planitia N1/N2, Formación Arcadia | Amazónico medio–tardío | Lavas inmodificadas y modificadas (Amazonis / Cerberus Fossae); montículos, canales, flujos pre-aureola de Olympus Mons (>1800 km). |
| ABs / ABa | Scandia y Astapus Colles | Amazónico | Mesetas y colinas de 0.1–1 km de espesor con colapso por pérdida de volátiles; manto rico en hielo degradado por viento y sublimación. |
| ABo / LDM | Olympia Undae y manto dependiente de la latitud | Amazónico tardío | Dunas activas (barjanes, transversales) al N; manto de hielo y polvo entre 35–78°N (más intacto entre 70–78°N). |

### 3.2 Domos y criptodomos de Arcadia occidental `[FUENTE]`

- Región: 34–46°N, 167–180°E. Domo tipo en **39.07°N, 172.41°E**.
- Datos: CTX (5–6 m/px), THEMIS TI diurna y nocturna (100 m/px), DEM MOLA-HRSC (200 m/px), CRISM (Farrand et al. 2011, 2020/21; Suárez-Valencia et al. 2025).
- Morfología: pendientes >8°, núcleo con textura en bloques, faldones y **aureolas** (los domos de Utopia no tienen aureola).
- Génesis: monogenética, de criptodomo intrusivo a domo de lava viscosa; alineados con fracturas NW–SE.
- Espectros: piroxeno alto en Ca, composición alcalina/félsica, absorción anómala cerca de **1.3 µm**.

### 3.3 Volcanismo sedimentario — Thumbprint Terrain (51°N, 177°E) `[FUENTE]` (De Toffoli et al. 2019, 2021)

- Mosaico de 46 imágenes CTX (122 000 km²): **9028 montículos con cráter apical** (>100 m) en alineaciones curvilíneas; edad ~370 Ma.
- TI de material suelto de grano fino → interpretados como centros de extrusión de fluidos y sedimentos.
- El análisis fractal y de espaciamiento identifica tres discontinuidades mecánicas, que la fuente dice coincidir con el perfil sísmico de InSight `[INFERENCIA]`:

| Discontinuidad | Profundidad | Interpretación |
|---|---|---|
| D1 | ~4–5 km | Reservorio intermedio de mezcla fluido–sedimento |
| D2 | ~14–23 km | Interfaz criosfera–hidrosfera (fusión basal o disociación de clatratos) |
| D3 | ~50–55 km | Capa fuente en litosfera frágil (~1 Ga); fracturamiento por tectónica, magmatismo o impactos enterrados (para cubrir 122 000 km² haría falta un cráter de >500 km de radio, que no se observa) |

> Nota: InSight está en Elysium Planitia, a miles de km; la correlación es una analogía regional, no una medición local.

---

## 4. Criosfera subsuperficial

### 4.1 Ecuación SWIM (Morgan et al. 2021; Putzig et al. 2019, 2023)

$$
C_I=\frac{C_N+C_T+C_G+C_{RS}+C_{RD}}{5},\qquad C_I\in[-1,+1]
$$

- C_I = +1: todas las técnicas apoyan hielo casi puro de >5 m con morfología criosférica.
- C_I = 0: inconcluso. C_I = −1: inconsistente con hielo.
- Productos por zona de profundidad: 0–1 m, 1–5 m y >5 m.
- **Zonas de Reconocimiento (RZ):** buffer de 5° (~300 km) alrededor de los gradientes más altos de C_I medio; se excluyen elevaciones > +1 km.

| Término | Instrumento | Ventana vertical | −1 (seco) | 0 | +1 (hielo) | Valor en Arcadia `[FUENTE]` |
|---|---|---|---|---|---|---|
| C_N neutrones | MONS (Odyssey), FREND (TGO) | <1 m | W_dn ≤ 5 % WEH | 10 % WEH | ≥ 25 % WEH (lineal) | 15–20 % WEH regional (33.9–64.2°N, 165.9–210.4°E); techo MONS ~16 cm; máximo local en AP-8 |
| C_T térmico | TES, THEMIS | <1 m | Sin ajuste o capa superior muy delgada | ATI alta sobre baja | ATI baja sobre alta (suelo suelto sobre hielo cementado) | Hielo a <1 m en toda la banda 40–45°N (Piqueux et al. 2019) |
| C_RS potencia superficial radar | SHARAD | <5 m | P > +1σ | \|P\| < 0.5σ | P < −1σ | Baja potencia en Unidades Sinuosas y glaciares enterrados |
| C_RD dieléctrico | SHARAD (reflectores) | >15–20 m (hasta ~1 km) | ε′ ≥ 7 | ε′ = 5 | ε′ ≤ 3 (lineal) | ε′ = 2.5 ± 0.3 (local 2.1–3.17); reflector continuo hasta 36°N (15 a >100 m) |
| C_G geomorfología | CTX, HiRISE, MOLA | todas | Sin rasgos periglaciares | Rasgos aislados o degradados | max(C_survey, C_glacial, C_pedestal, C_scallop) | ~9000 polígonos, unidades sinuosas, cráteres expandidos, brain terrain |
| **C_I** | Integración | 0–1, 1–5, >5 m | → −1 | 0 | → +1 | **+0.6 a +0.7 desde ~40°N** (creciente hacia el polo); excursión sur con C_I > +0.5 hasta 36°N |

### 4.2 SHARAD: relación tiempo–espesor–permitividad

- SHARAD (MRO) detecta interfaces hasta ~1000 m en hielo (~100 m en roca).
- Reflector continuo en 38–52°N, 180–225°E, sobre ~10⁶ km² (≈2000 × 500 km) (Plaut et al. 2009; Bramson et al. 2013, 2015): radar-transparente, poca dispersión interna, pérdidas bajas.
- Pico del histograma: Δt₁ ≈ 0.22 µs (one-way), Δt₂ ≈ 0.45 µs (two-way).

$$
\varepsilon'=\left(\frac{c\,\Delta t_1}{\Delta x}\right)^2=\left(\frac{c\,\Delta t_{2w}}{2\,\Delta x}\right)^2,\qquad c=2.99792\times10^8\ \text{m/s}
$$

Supuestos: medio no magnético y de bajas pérdidas; Δx = espesor físico desde la superficie hasta la interfaz.

### 4.3 Calibración con cráteres aterrazados (Bramson et al. 2015) `[FUENTE]`

- 281 imágenes CTX, **187 cráteres aterrazados**:
  - 1 terraza: 62 cráteres, D = 328 ± 129 m.
  - 2 terrazas: 35 cráteres, D = 430 ± 135 m.
  - Cuestionables: 90 cráteres, D = 339 ± 271 m.
- 32 imágenes HiRISE de seguimiento y 11 DTM (ISIS + SOCET SET; elevación de referencia muestreada a 3 radios, fuera de la eyección).
- Las profundidades de terraza se agrupan en: **<10 m, 17–23 m, 26–31 m, >42 m**.

**Caso de calibración: cráter Bullseye/Badger** — HiRISE ESP_018522_2270, 46.58°N, 194.84°E, D ≈ 700 m, con 10 cráteres aterrazados en un radio de 23 km, a ~1 km de una traza SHARAD con Δt₂ = 0.45 µs.

| Interfaz | Δx (2013 → DTM 2015) | ε′ según la fuente | ε′ recalculado (Δt₂ = 0.45 µs) |
|---|---|---|---|
| Terraza de pared | 13 m → 17 m | 28.55 (imposible) | 26.9 (13 m); 15.7 (17 m) |
| Piso / base del hielo | 38 m → 43 m | **3.17** | 3.15 (38 m); 2.46 (43 m) |

`[DISCREPANCIA menor]` Los valores de la fuente (28.55 y 3.17) implican tiempos one-way ligeramente distintos entre sí (~0.232 y ~0.2255 µs). La conclusión no cambia: el reflector corresponde al piso (~38–43 m), no a la terraza superior.

- Cuatro cráteres de doble terraza con DTM y SHARAD a ≤10 km (media ponderada por inverso de distancia): ε′ = 2.1, 2.6 y 2.9 → **media regional 2.5 ± 0.3** (comparable a Utopia, Stuurman et al. 2016). Un cuarto cráter, demasiado somero, da ε′ = 6.5 (basalto poroso o hielo intersticial).
- Referencias: hielo puro ε′ ≈ 3.15; basalto denso ε′ ≈ 8.0.
- Modelo ternario hielo–roca–aire ⇒ capa decamétrica de **exceso de hielo**, volumen ~**10⁴ km³** (Utopia: 14.3 × 10³ km³), con <5–10 % de fracción lítica `[INFERENCIA]`.
- Debate: Campbell & Morgan (2018) proponen hielo intersticial (pore-filling) en lugar de exceso de hielo. La evidencia geomorfológica de §4.4 favorece el exceso de hielo.

### 4.4 Evidencia geomorfológica directa `[FUENTE]`

1. **Impacto de 150 m, 35.1°N, 189.8°E** (24-dic-2021; HiRISE ESP_073077_2155; Posiolova et al. 2022; Dundas et al. 2022/23):
   - D = 150 ± 10 m; bloques de hielo limpio de hasta 3 m, visibles hasta 700 m del borde.
   - CRISM: absorción a 1.02 µm (3 px promediados, 26 px de referencia a 3.1 km).
   - Los parches se reducen por sublimación en una imagen tomada 39 días después.
   - Que persistan bloques de 3 m implica hielo masivo de ≥3 m con techo a <5 m (quizá ~2 m), porque el hielo intersticial forma costra de polvo en días (observado en Phoenix) `[INFERENCIA]`.
   - Secundarios (>5 m, hasta >8 km del primario) con pisos planos o aterrazados → tabla de hielo a **0.97 ± 0.25 m** (0.72–1.22 m).
   - Montículos de cráteres invertidos de ~200 m → pérdida histórica de ≥30 m de hielo; manto regional de 7–40 m.
2. **Cráter fresco de 13 m, 43.884°N, 204.346°E** — HiRISE ESP_025840_2240 (2012-01-30, 14:47 LMST, L_s = 64.1°, altitud 301.0 km, 25 cm/px proyectado y 30.4 cm/px original); zona oscura de explosión de ~850 m; bloques métricos de hielo limpio. Otros ejemplos: ESP_011494_2265 (~46°N; Byrne et al. 2009) y ESP_046707_2220 (~41°N; Dundas et al. 2021).
3. **Polígonos de contracción térmica en AP-1, AP-8 y AP-9** (Luzzi et al. 2023, 2025): **8967 polígonos de centro elevado** (HCP), con diámetro modal ~**11 m** constante entre sitios. Con modelos de fractura térmica calibrados en Phoenix, el techo del hielo queda a **6–20 cm** `[INFERENCIA]`. Rangos regionales: 5–20 m (Sako et al. 2025); polígonos de centro bajo (LCP) de ~10 m en ESP_015898_2225 (41.980°N, 194.221°E).
4. **Unidades Sinuosas, cráteres expandidos, brain terrain:**
   - Hibbard et al. (2018, 2021): seis unidades de hielo entre 37–43°N y 192–204°E. Unidades Sinuosas 1–3 entre 38–40°N y 156–166°W (=194–204°E), orientadas NW–SE, interpretadas como corrientes de hielo puro con hasta **80 m** de exceso de hielo bajo la US1.
   - Cráteres secundarios expandidos de >20 Myr (Viola et al. 2015).
   - Depresiones festoneadas (scalloped) concentradas entre 37–42°N y 194–205°E.
   - Brain coral terrain en franja SW–NE de (33°N, 182°E) a (40°N, 193°E); por ejemplo, ESP_063726_2155 (35.4524°N, 181.7855°E).

### 4.5 Perfil vertical consolidado

| Horizonte | Clase | z_min (m) | z_max (m) | Método / propiedad |
|---|---|---|---|---|
| Techo de hielo bajo polígonos (AP-1/8/9) | Somero | 0.06 | 0.20 | Diámetro modal 11 m (8967 polígonos) + MONS ~0.16 m `[INFERENCIA]` |
| Tabla de hielo, cráter de 150 m | Somero | 0.72 | 1.22 | 0.97 ± 0.25 m en secundarios; CRISM 1.02 µm |
| Techo de hielo masivo, cráter de 150 m | Intermedio | 2 | 5 | Bloques de 3 m eyectados hasta 700 m |
| Badger: terraza superior | Intermedio | 13 | 17 | DTM ESP_018522_2270 (zona ciega de SHARAD) |
| Badger: piso / base del hielo | Profundo | 38 | 43 | ε′ = 3.17 (38 m, 0.45 µs); doble terraza: 2.1 / 2.6 / 2.9 |
| Unidad Sinuosa 1 | Profundo | 15 | 80 | ε′ = 2.5 ± 0.3; ~10 cm de cubierta arenosa (TI 200–250) |
| Lámina regional (36–52°N) | Profundo | 15 | 100 | ε′ = 2.5 ± 0.3, ~10⁶ km², ~10⁴ km³ |

**Hueco de observación:** entre ~1 m (MONS/THEMIS) y ~15–20 m (SHARAD) no hay sondeo orbital directo; solo restringen ese intervalo los cráteres aterrazados y los impactos frescos (ver §8.1).

---

## 5. Atmósfera, energía y entorno

### 5.1 Modelo barométrico

Composición: 95.32 % CO₂. R_gas = 188–188.92 J kg⁻¹ K⁻¹. g = 3.72076 m s⁻². T_media = 210–220 K.

$$
H=\frac{R_{gas}T}{g}\approx 10.66\ \text{km (210 K)};\ \approx 11.17\ \text{km (220 K)}\quad[\text{VERIFICADO}]
$$

$$
P(z)=P_0e^{-z/H},\qquad \rho(z)=\frac{P(z)}{R_{gas}T},\qquad M_{col}[\text{g/cm}^2]=0.1\,\frac{P(z)}{g}
$$

P₀ (datum) = 610 Pa (media anual); mínimo 480 Pa (L_s ≈ 148°, condensación del casquete sur); máximo 690 Pa (L_s ≈ 250°).

Tabla de diseño EDL (H = 10.66 km, R = 188.92, T = 210 K) `[VERIFICADO; diferencias ≤0.2 Pa]`:

| Nivel | z (km) | P media (Pa) | Rango (Pa) | ρ (kg/m³) | M_col media (g/cm²) | M_col máx. | Δ vs. datum |
|---|---|---|---|---|---|---|---|
| Datum | 0.0 | 610.0 | 480–690 | 0.0154 | 16.39 | 18.54 | 0 % |
| PM-7 | −2.3 | 757.3 | 596–857 | 0.0191 | 20.35 | 23.02 | +24.2 % |
| PM-1 | −3.2 | 823.5 | 648–932 | 0.0208 | 22.13 | 25.04 | +35.0 % |
| AP-1, AP-8, AP-9, EM-15, EM-16 | −3.9 | 879.4 | 692–995 | 0.0222 | 23.63 | 26.73 | +44.2 % |
| Llanura central de Arcadia | −4.0 | 887.7 | 698–1004 | 0.0224 | 23.86 | 26.99 | +45.5 % (≈ Gale) |
| Cuenca norte de Arcadia | −4.3 | 913.0 | 718–1033 | 0.0230 | 24.54 | 27.76 | +49.7 % (≈ 7 ± 0.5 Torr) |

Limitación: es isotérmico. El ciclo diurno de T y los efectos dinámicos locales cambian ρ cerca de la superficie en ±10–20 %; para EDL hay que usar Mars-GRAM, MCD o EMARS.

### 5.2 Irradiancia solar

Parámetros: S₀ = 590–591 W/m² (1.524 UA), e = 0.0934, oblicuidad 25.19°, L_s del perihelio = 251°, sol = 24.62 h, año = 686.98 días terrestres = 668.6 soles (la fuente dice 667).

$$
S_{TOA}(L_s)=S_0\left(\frac{1+e\cos(L_s-L_{s,p})}{1-e^2}\right)^2,\quad \delta=\arcsin(\sin\varepsilon\sin L_s)
$$

$$
\cos\theta_z^{\text{mediodía}}=\sin\phi\sin\delta+\cos\phi\cos\delta=\cos(\phi-\delta),\qquad I_{TOA,h}=S_{TOA}\cos\theta_z
$$

Mediodía local a 40°N:

| Estación (HN) | L_s | S_TOA | θ_z | I_TOA,h | Superficie τ=0.4 | Superficie τ=2.0 | Reducción vs. verano despejado |
|---|---|---|---|---|---|---|---|
| Equinoccio de primavera | 0° | 564.5 | 40.0° | 432.4 | 333.0 | 117.2 | −70.1 % |
| Solsticio de verano (afelio) | 90° | 499.1 | 14.8° | 482.5 | 392.3 | 171.5 | −56.3 % |
| Equinoccio de otoño | 180° | 637.5 | 40.0° | 488.4 | 376.1 | 132.4 | −66.2 % |
| Solsticio de invierno (perihelio) | 270° | 711.2 | 65.2° | 298.4 | 185.3 | 27.5 | **−93.0 %** |

- Columnas S_TOA, θ_z e I_TOA,h: `[VERIFICADO]`.
- Columnas de superficie: `[FUENTE]`. La fuente no especifica el modelo radiativo. Los valores implican transmitancias globales (directa + difusa) mayores que Beer–Lambert puro (por ejemplo, τ = 0.4 a 40° da 0.77 frente a e^(−τ/cosθz) ≈ 0.59), lo cual concuerda con dispersión frontal del polvo, al estilo de las tablas de Appelbaum & Flood. No las extrapoles a otros τ sin el modelo.
- Implicación: en el perihelio, la alta insolación TOA se anula por θ_z grande y por la temporada de polvo. Esto justifica el criterio de latitud ≤40°N y la energía de fisión superficial (FSP), que además aporta ~130 kW de calor residual útil para fundir hielo (estudio Mars Seed).

### 5.3 Vientos, ciclones y polvo `[FUENTE]`

- **Tormentas locales ligadas a ciclones extratropicales** (Ogohara 2025, doi:10.1029/2025JE009216; Gebhardt et al. 2025, EMM/EXI con 1 imagen/h y 7–8 por evento; eventos del 15 y 24-sep-2024, MY37, L_s 329° y 335°):
  - Temporada: L_s 180° → 0°, con pausa cerca de L_s 270°.
  - Se inician a media-tarde en el **sector cálido** del ciclón, no sobre el frente frío.
  - El flujo cálido del sur desestabiliza la capa baja de día; de noche se intensifican los vientos del sur en la ladera norte de Elysium Mons.
- **Capa límite:** vientos mínimos de 10:00 a 16:00 LMST. Viking 1 registró ~20 m/s; Viking 2 (47.6°N, 225°W, en Utopia Planitia) usó anemómetros de película caliente sobrecalentados de 30 a 100 K, a 1–2 m de altura.
- `[DISCREPANCIA conceptual]` La fuente llama “umbral de velocidad de fricción” a ~35 m/s. Ese valor corresponde a la **velocidad del viento en corriente libre** para iniciar saltación. La velocidad de fricción u* umbral en Marte es del orden de 1–2 m/s.
- Ondas de montaña a sotavento de Phlegra Montes (margen W). Dust devils de 1–1000 m de diámetro y hasta 10 km de altura.
- Estadística de ~1350 eventos locales: las perturbaciones del HN son más débiles que las del HS.
  - Tormentas regionales: 3–20 soles, τ > 1, el nivel de 50 Pa (~25 km) supera 200 K.
  - GDE: calentamiento de >40 K a 50 Pa, hasta más de 230 K.
- **Asimilación de CDOD (GoMars; validado con EMARS y OpenMARS, MY25–MY37):**

$$
\tau_{model}=H(q_m,q_n),\qquad r_s=r_0\exp(\sigma_0^2),\qquad \Delta\tau=Q_{ext}\,\pi r_s^2\,\Delta q_n\,y_m
$$

q_m y q_n: concentraciones de masa y número de polvo; r_s: radio representativo de sección eficaz; y_m: espesor de la capa inferior; Q_ext: eficiencia de extinción.

### 5.4 Radiación ionizante

- Sin dinamo global; campos corticales <0.3 % del terrestre. GCR (H, He, C, N, O, Fe) y SEP/SPE producen secundarios (neutrones, γ) en el CO₂ y el regolito.
- A −4 km: Marte bloquea la mitad del cielo (2π sr); columna de 23.6–24.5 g/cm² y corte de ~155–178 MeV para protones `[FUENTE]`.
- **MSL/RAD (Gale, −4 km):** 0.213 mGy/día (ISS ≈ 0.240), equivalente a ~100–200 mSv/año sin blindaje.
- Subsuelo: 1.5 m → 17.9 ± 2.4 mSv/año; 3.0 m → 2.7 ± 1.0 mSv/año.

**Blindaje (Geant4 + regolito OLTARIS, −4 km MOLA, 6 capas, 18 m de longitud total)** `[FUENTE; porcentajes VERIFICADOS]`:

| Material | µGy/día | mGy/año | Reducción |
|---|---|---|---|
| Sin blindaje | 296.7 | 108.30 | 0 % |
| Aluminio | 214.3 | 78.22 | −27.77 % |
| Regolito / BN / Be | 212.6 | 77.60 | −28.35 % |
| SiO₂ | 209.3 | 76.39 | −29.46 % |
| Fibra de carbono / ETFE | 207.7 | 75.81 | −30.00 % |
| Mylar | 204.4 | 74.61 | −31.11 % |
| Caucho / Kevlar | 201.1 | 73.40 | −32.22 % |
| H₂O / PMMA / poliestireno | 199.4 | 72.78 | −32.79 % |
| LiH | 196.1 | 71.58 | −33.91 % |
| Ciclohexano | 194.5 | 70.99 | −34.45 % |
| Polietileno | 192.9 | 70.41 | −34.98 % |
| LiBH₄ | 189.6 | 69.20 | −36.10 % |
| LH₂ | 152.0 | 55.48 | −48.77 % |

> `[DISCREPANCIA]` La línea base del modelo (296.7 µGy/día) es ~39 % mayor que la medición de RAD (213 µGy/día) a la misma altitud. Usa la tabla para **comparar materiales entre sí**, no como predicción de dosis absoluta. La fuente no reporta el espesor areal de cada material, así que tampoco se puede normalizar por g/cm².

**Hábitat Mars Seed:** semicilindro de 5 × 15 m con extremos abovedados (75 m² para 2 personas). Cáscara de biocompuesto con regolito; liner de PHB (purificado con CO₂ supercrítico) para 57 kPa con factor de seguridad 4. Cubierto con 2 m de regolito (ρ = 1500 kg/m³ → 300 g/cm², ~400 t por módulo):

$$
\sigma=\rho g h=1500\times3.7\times2=11.1\ \text{kPa}\quad[\text{VERIFICADO}]
$$

Esa carga es ≪ 57 kPa de presión interna; la estructura trabaja neta a tracción.

### 5.5 Geotecnia `[FUENTE]`

| Material | TI (SI) |
|---|---|
| Polvo fino suelto | 28–135 |
| Arena | 135–630 |
| Duricostra | 252–513 |
| Llanuras circundantes | 100–200 |
| Unidad Sinuosa (THEMIS) | 200–250 |
| Criterio de exclusión (Golombek et al. 2021) | < 100 (sin capacidad portante) |

- TI de ~180–250 → arena fina de 150–250 µm (~170 µm sin cohesión); skin depth diurno ≤6 cm.
- Densidad aparente 1000–1600 kg/m³ (nominal 1300; Ash et al. 2016: 1.15–1.6 g/cm³; aumento de ~20 kg/m³ en los primeros 5 m).
- Porosidad ~65 % en superficie y <40 % en profundidad. Cohesión seca de unos pocos kPa. φ ≈ 30° (JSC Mars-1: 41°).
- **Permafrost (−60 °C):** el hielo cementa o forma lámina casi pura desde ~4–20 cm. La cohesión y la resistencia al corte suben en órdenes de magnitud y desgastan mucho las brocas. Diseño con auger cerrado: el suelo seco superficial sirve de tapón de sello y se descargan relaves secos.
- **Ensayo de perforación térmica (cámara de vacío):**
  - Bloque de hielo de 21.6 × 19 × 12.7 cm, preenfriado a −80 °C y mantenido a −60 °C con camisa de LN₂.
  - Presión de 7 ± 0.5 Torr (~933 Pa). Calefactor a 75 / 100 / 125 V AC. Punta de −60 a 100 °C. Carrera de 0–7.62 cm. Volumen fundido de 5–300 mL.
  - **Resultado:** la sonda pasiva no alcanza 7.62 cm ni con 125 W (pérdidas por sublimación y conducción). Hace falta actuación activa.

### 5.6 Geoquímica `[FUENTE]`

- **GRS** (Arcadia / Erebus Montes): Fe 14 wt %, Si 18–20 wt %. Depósito estimado de formaldehído atmosférico de ~10.5–11 mg/m²/año.
- Sulfatos y filosilicatos retienen 1.7–9 wt % de H₂O, pero extraerla exige alta temperatura y energía. Por eso el hielo libre es preferible.
- **Phoenix WCL:** pH 7.7 (7.2–8.2; análogos 7.4–8.7); sulfatos solubles en el orden de mM.
- **Phoenix TEGA:** ~50 mg por horno, hasta 1000 °C a 20 °C/min, purga de N₂ a 12 mbar y 0.04 sccm. Una endoterma con liberación de CO₂ indica CaCO₃.
- **Percloratos:** ~0.5 wt % de ClO₄⁻ más ClO₃⁻ (Phoenix y Gale). Liberación de O₂ que empieza a 325 °C y tiene su pico a 465 °C. Forman salmueras por delicuescencia.
- **Tratamiento ISRU:** el agua del subsuelo requiere intercambio iónico o reducción biológica del perclorato (toxicidad tiroidea) antes de consumo o hidroponía.
- **Lixiviación para biorreactor:** tanque de 1200 L con 1000 L de agua y 400 kg de regolito, agitado dos veces por sol; la fase acuosa se bombea al biorreactor y los insolubles se descartan.

---

## 6. Selección de sitios y arquitectura de exploración

### 6.1 Criterios (taller JPL/USGS/PSI + SpaceX, enero de 2019) `[FUENTE]`

- Elevación < −2 km MOLA (preferible < −3 km).
- Latitud < 40°N.
- Pendiente < 5° a escala de 10 m.
- Rocas: < 10 % de área fraccional acumulada (< 5 % de probabilidad de golpear una roca de > 0.5 m de alto o > 1 m de diámetro en una elipse de < 200 m con navegación relativa al terreno).
- TI > 100.
- Presencia de hielo masivo.

De 12 sitios en Arcadia, los **primarios** son **AP-1 y AP-9** (sobre la Unidad Sinuosa) y el **secundario prioritario** es **AP-8** (adyacente).

### 6.2 Nodos y matriz geodésica

R_local = 3388.00 km. Distancias y acimuts de toda la tabla `[VERIFICADO]` (todas las cifras coinciden a 0.1 km / 0.1°; la única diferencia es Centroide → Badger, 493.4 km frente a 493.5 km en la fuente).

| Nodo | Lat (°N) | Lon (°E) | z (km) | d desde AP-1 (km) | Az. desde AP-1 | d desde Centroide (km) | Az. desde Centroide |
|---|---|---|---|---|---|---|---|
| **AP-1 (base principal)** | 39.80 | 202.10 | −3.9 | 0 | — | 24.0 | 196.5° |
| Centroide (Alt. A) | 40.19 | 202.25 | −3.9 | 24.0 | 16.4° | 0 | — |
| Campo de HCP (ESP_037655_2210) | 40.560 | 202.404 | −3.9 | 47.0 | 16.9° | 23.0 | 17.5° |
| Frente de ogivas (Ruta 3) | 39.10 | 201.50 | −3.9 | 49.6 | 213.7° | 72.9 | 208.2° |
| AP-9 | 40.02 | 203.35 | −3.9 | 58.2 | 76.7° | 50.8 | 101.1° |
| AP-8 | 40.75 | 201.30 | −3.9 | 66.8 | 327.5° | 54.1 | 308.1° |
| Paleo-megaripples (APMR) | 39.90 | 204.70 | −3.9 | 118.2 | 86.3° | 112.2 | 98.0° |
| Cráter de 13 m (ESP_025840_2240) | 43.884 | 204.346 | −4.0 | 260.9 | 21.5° | 237.0 | 22.2° |
| EM-15 | 39.75 | 195.62 | −3.9 | 294.4 | 271.5° | 301.5 | 267.2° |
| EM-16 (Alt. B) | 39.89 | 192.03 | −3.9 | 457.0 | 273.9° | 462.8 | 271.1° |
| EZ Erebus Montes | 39.00 | 192.10 | −3.98 a −3.15 | 459.1 | 267.3° | 467.5 | 264.6° |
| Badger/Bullseye | 46.581 | 194.85 | −4.1 | 507.9 | 324.5° | 493.4 | 322.4° |
| Cráter de 150 m (ESP_073077_2155) | 35.10 | 189.80 | −3.8 | 640.0 | 248.1° | 655.2 | 246.6° |
| PM-1 | 35.23 | 163.95 | −3.2 | — | — | — | — |
| PM-7 | 36.43 | 162.16 | −2.3 | — | — | — | — |
| Domo tipo (W de Arcadia) | 39.07 | 172.41 | — | — | — | — | — |
| Thumbprint Terrain | 51 | 177 | ~−4 | — | — | — | — |

> Nota: la fuente asigna los sitios AP a Arcadia Planitia, pero el artículo de Luzzi et al. (2025) titula su área de estudio “northern Amazonis Planitia”. Los sitios están en la transición Arcadia–Amazonis (~202°E); según la fuente que cites, pueden aparecer con cualquiera de los dos nombres.

### 6.3 Justificación de AP-1 como base principal `[FUENTE]`

- Golombek et al. (2021) y Luzzi et al. (2025) lo consideran el sitio más seguro sobre la Unidad Sinuosa: pendiente < 5° a 10 m y casi sin rocas > 1 m (P < 5 %).
- Elevación −3.9 km (879.4 Pa) y latitud 39.80°N (≤ 40°N).
- TI de 200–250: ~10 cm de arena sobre hasta 80 m de hielo.
- Las tres rutas primarias miden ≤ 66.8 km, dentro del radio nominal de 100 km de una Zona de Exploración (EZ) de la NASA.
- Debilidad: su C_I combinado es moderado frente a los máximos locales de AP-9 y AP-8.

### 6.4 Rutas

| Ruta | Trazado | Longitud | Terreno | Objetivos |
|---|---|---|---|---|
| **1 (ENE)** | AP-1 → AP-9 (az. 76.7°) → APMR | 58.2 km (118.2 km extendida, az. 86.3° desde AP-1) | Unidad Sinuosa; polígonos; TI 200–250; knobs de hasta 20 m (exclusivos de la unidad) | ISRU en el hielo más espeso (SHARAD, hasta 80 m en US1; C_I máximo de la US); techo a 6–20 cm; paleo-megaripples y dunas litificadas |
| **2 (NNE → WNW)** | AP-1 → HCP (az. 16.9°, 47.0 km) → AP-8 | 66.8 km en línea recta; **97.8 km por la estación intermedia** `[VERIFICADO: HCP → AP-8 = 50.8 km, az. 283.1°]` | Sale de la US; TI 100–200; polígonos dómicos, scalloped, brain coral | Máximo C_N y C_I entre sitios adyacentes; reflector basal > ~20 m; minería a 6–20 cm; astrobiología (Mars Life Explorer, MEPAG I-A1 / II-B1) |
| **3 (SW)** | AP-1 → 39.10°N, 201.50°E (az. 213.7°) | 49.6 km | Ogivas y crestas semilunares de la US1; DTM ESP_052490_2200; cráteres expandidos con fosa o domo central | Glaciología (flujo hacia el SE; deformación hacia el SW sin paredes de valle); escarpes NNW–NE de baja insolación, preservados > 20 Myr, para trinchera o perforación horizontal |
| 4 (W) | AP-1 → EM-15 → EM-16 / EZ Erebus → DTEEC_061128_2190_061194_2190_A01 (38.6°N, 190.2°E) | 294.4 / 457.0 / 459.1 km | Brain terrain; brechas HNn | Glaciares cubiertos de escombros (LDA); rocas Noeico–Hespéricas |
| 5 (N) | AP-1 → cráter de 13 m (az. 21.5°) / → Badger (az. 324.5°) | 260.9 / 507.9 km | Llanura norte | Eyección de hielo limpio; terrazas a 13–17 m y 38–43 m |
| 6 (SW lejano) | AP-1 → cráter de 150 m (az. 248.1°), con extensión a criptodomos (167–180°E) o al TPT (51°N, 177°E) | 640.0 km (~450 km desde Erebus, según la fuente) | Límite meridional del hielo | Bloques de 3 m; tabla a 0.97 m; vulcanismo alcalino y sedimentario |

`[DISCREPANCIA]` La fuente da la Ruta 2 como “66.8 km directos”, pero el recorrido real por la estación de polígonos HCP mide 97.8 km. La afirmación de que las tres rutas “caben en < 67 km” solo es válida en línea recta.

### 6.5 Matriz comparativa de sitios `[FUENTE]`

| Sitio | Coordenadas | z (km) | Rol | Unidad | Pros | Contras |
|---|---|---|---|---|---|---|
| AP-1 | 39.80, 202.10 | −3.9 | Primario / base | Unidad Sinuosa | El más seguro y llano; sin rocas > 1 m; TI 200–250; ≤ 40°N; hielo a 6–20 cm | C_I moderado |
| AP-9 | 40.02, 203.35 | −3.9 | Primario / ISRU pesado | Unidad Sinuosa | Hielo más espeso (hasta 80 m); C_I máximo en la US | Más rugoso y rocoso que AP-1; lat. > 40° (40.02°) |
| AP-8 | 40.75, 201.30 | −3.9 | Secundario prioritario | Llanura periglacial | El más seguro fuera de la US; C_N y C_I máximos entre adyacentes; reflector > 20 m | Fuera de la US; 40.75°N; TI 100–200 |
| Frente de US1 | 39.10, 201.50 | −3.9 | Objetivo científico | Lóbulo terminal | Latitud más baja del grupo; ogivas y escarpes NE | La US se diluye en polígonos débiles y sin knobs |
| Centroide (Alt. A) | 40.19, 202.25 | −3.9 | Base alternativa | Margen N de la US | Equilibra distancias | 40.19°N; sin conteo de rocas en elipse de 200 m |
| EM-16 / EZ Erebus (Alt. B) | 39.89, 192.03 (EZ 39.0, 192.1) | −3.9 (EZ −3.98 a −3.15) | Primario / base alternativa | LDA + HNn | Retorno radar somero más fuerte; C_I máximo en Erebus; rocas antiguas; Fe 14 %, Si 18–20 % | A 457 km de AP-1; relieve local de 3–4 km |
| EM-15 | 39.75, 195.62 | −3.9 | Secundario | LDA | Cumple lat. y z; estación intermedia de la Ruta 4 | Señal radar y C_I menores que EM-16 |
| PM-1 | 35.23, 163.95 | −3.2 | Primario (W) | LDA | Latitud más baja del estudio; máximo C_G | 823.5 Pa; muy lejos del núcleo oriental |
| PM-7 | 36.43, 162.16 | −2.3 | Secundario (W) | LDA | Baja latitud | −2.3 km: no cumple la meta de < −3 km |
| Otros 9 AP | 37–43°N, 192–204°E | −3.9 | Descartados | 4 en la US / 5 adyacentes | Los de la US: lisos, sin rocas, TI alta | 3 de los 6 adyacentes carecen del reflector basal de > 20 m |

> Inconsistencia de criterio: la fuente exige latitud ≤ 40°N, pero AP-9 (40.02°N) y AP-8 (40.75°N) la superan y aun así son primario y secundario prioritario. El umbral funciona como preferencia, no como requisito duro.

---

## 7. Resumen de cifras clave (para respuestas rápidas)

| Magnitud | Valor | Etiqueta |
|---|---|---|
| Centro de la cuenca | ~47.2°N, 184.3°E, ~−4 km | FUENTE |
| WEH (neutrones) | 15–20 wt % | FUENTE |
| C_I | +0.6 a +0.7 desde ~40°N | FUENTE |
| ε′ regional | 2.5 ± 0.3 | FUENTE |
| Área / volumen de la lámina de hielo | ~10⁶ km² / ~10⁴ km³ | FUENTE / INFERENCIA |
| Techo de hielo en sitios AP | 6–20 cm | INFERENCIA |
| Espesor de hielo en la US1 | hasta 80 m | FUENTE |
| Presión a −3.9 km | 879 Pa (692–995) | VERIFICADO |
| Columna atmosférica a −3.9 km | 23.6 g/cm² | VERIFICADO |
| Irradiancia mínima (40°N, L_s 270°, τ = 2) | 27.5 W/m² | FUENTE |
| Dosis en superficie (RAD) | 0.213 mGy/día | FUENTE |
| Perclorato | ~0.5 wt % | FUENTE |
| pH del suelo (Phoenix) | 7.7 | FUENTE |
| Rutas primarias | 58.2 / 66.8 (97.8 real) / 49.6 km | VERIFICADO |

---

## 8. Limitaciones y fuentes de incertidumbre

1. **Zona ciega de SHARAD (~10–20 m):** el eco superficial y el filtrado de lóbulos laterales ocultan reflectores someros. Por ejemplo, en cráteres con terrazas a 18 y 23 m no aparece reflector. Para cerrar este hueco se propone International Mars Ice Mapper (I-MIM): SAR en banda L más sondeador VHF.
2. **No unicidad de ε′:** ε′ ≈ 3.15 se obtiene con hielo puro, con 50 % basalto + 50 % aire, o con 50/25/25 hielo/roca/aire. En el sur de Arcadia puede haber además un reflector profundo (contacto con Vastitas Borealis; Campbell et al. 2008) que contamina los retardos largos.
3. **Falsos positivos en C_RS:** varios metros de polvo seco de baja densidad imitan al hielo. Se descartan con TI > 100 (C_T) y C_N.
4. **Extrapolación de polígonos:** la relación entre diámetro (11 m) y profundidad del hielo (6–20 cm) se calibró en Phoenix (68°N). Luzzi et al. piden modelos termomecánicos locales y verificación in situ.
5. **Modelo atmosférico isotérmico** y **transmitancia de polvo sin modelo explícito** (§5.2).
6. **Línea base de dosis del modelo ≠ medición de RAD** (§5.4).
7. **Distancias esféricas** con radio fijo (§2.3).
8. **Coordenadas de sitios y valores instrumentales:** no se contrastaron contra las publicaciones primarias.

---

## 9. Implementación de referencia (Python)

```python
from math import *

# --- Geodesia ---
R_EQ, R_POL = 3396.19, 3376.20  # km

def r_local(lat_deg):
    p = radians(lat_deg)
    num = (R_EQ**2*cos(p))**2 + (R_POL**2*sin(p))**2
    den = (R_EQ*cos(p))**2 + (R_POL*sin(p))**2
    return sqrt(num/den)                      # r_local(40) -> 3388.00 km

def dist_az(p1, p2, R=3388.0):
    """p = (lat °N, lon °E). Devuelve (km, acimut ° desde N, horario)."""
    f1, l1 = map(radians, p1); f2, l2 = map(radians, p2)
    df, dl = f2-f1, l2-l1
    a = sin(df/2)**2 + cos(f1)*cos(f2)*sin(dl/2)**2
    d = 2*R*atan2(sqrt(a), sqrt(1-a))
    az = (degrees(atan2(sin(dl)*cos(f2), cos(f1)*sin(f2)-sin(f1)*cos(f2)*cos(dl))) + 360) % 360
    return d, az                              # dist_az((39.80,202.10),(40.02,203.35)) -> (58.2, 76.7)

# --- Radar ---
C = 2.99792e8
def eps_real(dt_two_way_s, depth_m):
    return (C*dt_two_way_s/(2*depth_m))**2    # eps_real(0.45e-6, 38) -> 3.15

def depth_from_eps(dt_two_way_s, eps):
    return C*dt_two_way_s/(2*sqrt(eps))       # depth_from_eps(0.45e-6, 2.5) -> 42.7 m

def swim_ci(cn, ct, cg, crs, crd):
    return (cn+ct+cg+crs+crd)/5

# --- Atmósfera ---
G, RGAS = 3.72076, 188.92
def atmos(z_km, T=210.0, P0=610.0):
    H = RGAS*T/G/1000
    P = P0*exp(-z_km/H)
    return dict(H_km=H, P_Pa=P, rho=P/(RGAS*T), Mcol_gcm2=0.1*P/G)

# --- Insolación TOA horizontal al mediodía ---
def toa_noon(Ls_deg, lat_deg, S0=590.0, e=0.0934, Lsp=251.0, obl=25.19):
    S = S0*((1+e*cos(radians(Ls_deg-Lsp)))/(1-e**2))**2
    dec = asin(sin(radians(obl))*sin(radians(Ls_deg)))
    cz = cos(radians(lat_deg) - dec)
    return S, degrees(acos(cz)), S*max(cz, 0)  # (Ls=270, 40) -> (711.2, 65.2, 298.4)

# --- Carga de regolito ---
def overburden_kPa(rho=1500, g=3.7, h=2.0):
    return rho*g*h/1000                       # 11.1 kPa
```

Ejemplo útil: con ε′ = 2.5 ± 0.3 y Δt₂ = 0.45 µs, la base del hielo queda a ≈ **42.7 m (39–45 m)**, coherente con el piso de Badger (38–43 m).

### 9.1 Nodos en formato máquina

```json
{
  "crs": "Mars 2000 planetocentric, lon +E 0-360, elevation MOLA km",
  "R_local_km": 3388.0,
  "nodes": [
    {"id":"AP-1","lat":39.80,"lon":202.10,"z":-3.9,"role":"primary_base","unit":"Sinuous Unit"},
    {"id":"CENTROID_A","lat":40.19,"lon":202.25,"z":-3.9,"role":"alt_base"},
    {"id":"HCP_ESP_037655_2210","lat":40.560,"lon":202.404,"z":-3.9,"role":"route2_waypoint"},
    {"id":"US1_FRONT","lat":39.10,"lon":201.50,"z":-3.9,"role":"route3_target"},
    {"id":"AP-9","lat":40.02,"lon":203.35,"z":-3.9,"role":"primary_isru","unit":"Sinuous Unit"},
    {"id":"AP-8","lat":40.75,"lon":201.30,"z":-3.9,"role":"secondary_priority"},
    {"id":"APMR","lat":39.90,"lon":204.70,"z":-3.9,"role":"route1_extension"},
    {"id":"CRATER_13m_ESP_025840_2240","lat":43.884,"lon":204.346,"z":-4.0,"role":"route5"},
    {"id":"EM-15","lat":39.75,"lon":195.62,"z":-3.9,"role":"secondary","unit":"LDA"},
    {"id":"EM-16","lat":39.89,"lon":192.03,"z":-3.9,"role":"alt_base_B","unit":"LDA"},
    {"id":"EZ_EREBUS","lat":39.00,"lon":192.10,"z_range":[-3.98,-3.15],"role":"exploration_zone"},
    {"id":"DTM_DTEEC_061128_2190","lat":38.6,"lon":190.2,"role":"route4_dtm"},
    {"id":"BADGER_ESP_018522_2270","lat":46.581,"lon":194.85,"z":-4.1,"role":"route5_calibration"},
    {"id":"CRATER_150m_ESP_073077_2155","lat":35.10,"lon":189.80,"z":-3.8,"role":"route6"},
    {"id":"PM-1","lat":35.23,"lon":163.95,"z":-3.2,"role":"primary_west","unit":"LDA"},
    {"id":"PM-7","lat":36.43,"lon":162.16,"z":-2.3,"role":"secondary_west","unit":"LDA"},
    {"id":"DOME_TYPE","lat":39.07,"lon":172.41,"role":"science_volcanic"},
    {"id":"THUMBPRINT_TERRAIN","lat":51.0,"lon":177.0,"role":"science_sedimentary_volcanism"}
  ],
  "routes": [
    {"id":1,"path":["AP-1","AP-9","APMR"],"km":[58.2,118.2]},
    {"id":2,"path":["AP-1","HCP_ESP_037655_2210","AP-8"],"km_direct":66.8,"km_via_waypoint":97.8},
    {"id":3,"path":["AP-1","US1_FRONT"],"km":49.6},
    {"id":4,"path":["AP-1","EM-15","EM-16","EZ_EREBUS"],"km":[294.4,457.0,459.1]},
    {"id":5,"path":["AP-1","CRATER_13m_ESP_025840_2240 | BADGER_ESP_018522_2270"],"km":[260.9,507.9]},
    {"id":6,"path":["AP-1","CRATER_150m_ESP_073077_2155"],"km":640.0}
  ]
}
```

---

## 10. Referencias (según la fuente)

- USGS/IAU. *Gazetteer of Planetary Nomenclature* — Features 348, 346, 347, 3893. https://planetarynames.wr.usgs.gov/Feature/348
- Luzzi, E. et al. (2025). Geomorphological evidence of near-surface ice at candidate landing sites in northern Amazonis Planitia, Mars. *JGR Planets* 130, e2024JE008724. doi:10.1029/2024JE008724
- Luzzi, E. et al. (2023). 54th LPSC, abstr. 2335.
- Golombek, M. P. et al. (2021). Candidate landing sites for future human missions in Arcadia Planitia, Erebus Montes, and Phlegra Montes. 52nd LPSC, abstr. 2420. https://www.hou.usra.edu/meetings/lpsc2021/pdf/2420.pdf
- Morgan, G. A. et al. (2021). Availability of subsurface water-ice resources in the northern mid-latitudes of Mars. *Nature Astronomy* 5, 230–236.
- Putzig, N. E. et al. (2019/2024). SWIM project & SHARAD. 9th/10th Int. Conf. Mars; NASA HLS2 Newsletter.
- Bramson, A. M. et al. (2015). Widespread excess ice in Arcadia Planitia, Mars. *GRL* 42, 6566–6574. doi:10.1002/2015GL064844; Bramson et al. (2013), 44th LPSC, abstr. 2905.
- Plaut, J. J. et al. (2009). 40th LPSC, abstr. 2147.
- Hibbard, S. M. et al. (2021). Evidence for widespread glaciation in Arcadia Planitia. *Icarus* 359, 114298; Hibbard et al. (2018), 49th LPSC, abstr. 2606.
- Dundas, C. M. et al. (2023). A large new crater exposes the limits of water ice on Mars. *GRL* 50, e2022GL100747.
- HiRISE ESP_025840_2240 y DTEEC_061128_2190_061194_2190_A01. https://www.uahirise.org/ESP_025840_2240
- Viola, D. et al. (2015). Expanded secondary craters in the Arcadia Planitia region. *Icarus* 248, 190–204; Viola et al. (2015), EZ Workshop, abstr. 1011.
- Tanaka, K. L. et al. (2014). USGS SIM 3292; Tanaka et al. (2005). USGS SIM 2888.
- Ramsdale, J. D. et al. (2019). Grid mapping the northern plains of Mars: Arcadia Planitia. *JGR Planets* 124, 504–527.
- De Toffoli, B. et al. (2021). *JGR Planets* 126, e2021JE006931.
- Farrand, W. H. et al. (2021). *Icarus* 357, 114111; Suárez-Valencia, J. E. et al. (2025). *Icarus* 441, 116673.
- Sako, M. et al. (2025). *JGR Planets*.
- Pathare, A. V. et al. (2018). *Icarus* 301, 97–116.
- Ogohara, K. (2025). *JGR Planets* 130, e2025JE009216; Gebhardt, C. et al. (2025). *JGR Planets*.
- Hecht, M. H. et al. (2009). Detection of perchlorate… Phoenix. *Science* 325, 64–67.
- Hassler, D. M. et al. (2014). *Science* 343; Matthiä et al. — https://arxiv.org/html/2205.13786v3
- Delage, P. et al. (2018). InSight landing site regolith physical properties.
- NASA/MEPAG. Mars Life Explorer Mission Concept Study (2023); I-MIM MDT Final Report (2022).

---

## 11. Registro de verificación

| Elemento | Resultado |
|---|---|
| R_local(40°N) | 3388.002 km ✔ |
| 13 distancias y acimuts desde AP-1 | ✔ (todas a 0.1) |
| 13 distancias y acimuts desde el Centroide | ✔ (Badger 493.4 frente a 493.5) |
| Tramo Ruta 2 HCP → AP-8 | 50.8 km, az. 283.1° (ausente en la fuente) |
| ε′ de Badger | 26.9 / 3.15 recalculado frente a 28.55 / 3.17 en la fuente (diferencia menor) |
| H (210 K / 220 K) | 10.66 / 11.17 km ✔ |
| Tabla barométrica (6 niveles × 6 columnas) | ✔ (≤ 0.2 Pa / 0.01 g/cm²) |
| S_TOA, θ_z, I_TOA,h (4 estaciones) | ✔ exacto |
| Transmitancia en superficie | No reproducible (modelo no especificado) |
| Porcentajes y dosis anuales de blindaje | ✔ |
| Carga de regolito y 300 g/cm² | 11.1 kPa ✔; 1500 kg/m³ × 2 m = 300 g/cm² ✔ |
| Albedo Arcadia 260°E frente a 120°W | ✘ inconsistente (120°W = 240°E) |
| “Umbral de velocidad de fricción 35 m/s” | ✘ confunde u* con velocidad del viento |
| Ruta 2 “66.8 km” | Solo en línea recta; 97.8 km por la estación intermedia |
