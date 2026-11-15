// Fase 3: evalúa web/js/geo.js sobre puntos dados (stdin JSON) y devuelve resultados.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const repo = process.argv[2];
const geo = await import(pathToFileURL(repo + '/web/js/geo.js').href);
const pts = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const out = pts.map(([lat, lon]) => { const [x, y] = geo.ll_to_xy(lat, lon); const [la, lo] = geo.xy_to_ll(x, y); return [x, y, la, lo, ...geo.ll_to_cell(lat, lon), geo.kx(lat)]; });
process.stdout.write(JSON.stringify(out));
