// H-01: ¿o2Plan (JS) termina con las rutas reales y un EVA limit dado? Uso: node p5_o2_hang_js.mjs <repo> <poi> <eva_h> [v]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [repo, poi, eva, v] = process.argv.slice(2);
const W = await import(pathToFileURL(repo + '/web/js/models/walker.js').href);
const TW = await import(pathToFileURL(repo + '/web/js/telemetry_walker.js').href).catch((e) => ({ err: e.message }));
const routes = JSON.parse(readFileSync(repo + '/web/data/routes.json', 'utf8')).routes;
const get = (d) => routes.find((r) => r.poi === poi && r.mode === 'walker' && r.direction === d);
const w = { ...W.defaultWalker(), ...(v ? { v: Number(v) } : {}) };
const segs = [];
for (const r of [get('out'), get('back')]) for (let k = 1; k < r.points.length; k++) {
  const p = r.points; const s = W.segment(w, 1000 * (p[k].s_km - p[k - 1].s_km), p[k].grade_deg, p[k].rough); segs.push({ t_s: s.t_s, O2_L: s.O2_L });
}
const t0 = Date.now();
const o = W.o2Plan(segs, { eva_limit_h: Number(eva), reserve_min: 30, contingency: 0.1 });
console.log(poi, eva, 'n_evas', o.n_evas, 'O2', o.O2_required_L.toFixed(1), Date.now() - t0, 'ms', TW.err ? '(telemetry_walker no importable en node: ' + TW.err.slice(0, 60) + ')' : '');
