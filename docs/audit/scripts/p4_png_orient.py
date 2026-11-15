"""Fase 4: orientación de PNGs (correlación con el raster fuente, normal vs volteado) y paleta de leyenda vs colores reales."""
import json, sys, pathlib, numpy as np, rasterio
from PIL import Image
repo = pathlib.Path(sys.argv[1])
rd = lambda f: rasterio.open(repo / "data/processed" / f).read(1).astype(float)
src = {"elevation": rd("dem_200m.tif"), "slope": rd("slope_deg.tif"), "roughness": rd("roughness.tif"), "shielding": rd("shield_col.tif")}
L = json.loads((repo / "web/data/layers/layers.json").read_text(encoding="utf-8"))
for l in L["layers"]:
    if l["id"] not in src: continue
    im = Image.open(repo / "web/data" / l["file"]).convert("RGBA"); a = np.asarray(im).astype(float)
    lum = a[..., :3].mean(-1); s = src[l["id"]]
    pal = l.get("palette")
    # mapear color -> valor con la paleta de la leyenda (vecino más cercano)
    c = lambda x, y: np.corrcoef(x.ravel(), y.ravel())[0, 1]
    msg = f"{l['id']:10s} corr(lum, src)={c(lum, s):+.3f} volteado_NS={c(lum[::-1], s):+.3f} volteado_EO={c(lum[:, ::-1], s):+.3f}"
    if pal:
        stops = pal if isinstance(pal, list) else pal.get("stops", pal)
        try:
            cols = np.array([[int(p['color'][i:i+2], 16) for i in (1, 3, 5)] if isinstance(p, dict) else [int(p[1][i:i+2], 16) for i in (1,3,5)] for p in stops], float)
            vals = np.array([p['value'] if isinstance(p, dict) else p[0] for p in stops], float)
            d = ((a[..., None, :3] - cols[None, None]) ** 2).sum(-1); k = d.argmin(-1)
            est = vals[k]; mind = np.sqrt(d.min(-1))
            msg += f" | paleta: dist RGB mediana a la parada más cercana={np.median(mind):.1f} corr(valor_paleta, src)={c(est, s):+.3f}"
        except Exception as e:
            msg += f" | paleta no interpretable ({type(e).__name__}: {str(stops)[:120]})"
    print(msg)
print({l["id"]: str(l.get("palette"))[:160] for l in L["layers"]})
print("stats:", json.dumps(L.get("stats"), ensure_ascii=False)[:800])
