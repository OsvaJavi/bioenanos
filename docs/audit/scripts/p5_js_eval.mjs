// Fase 5: evalúa web/js/models/*.js sobre entradas JSON (argv[3]) -> stdout JSON
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const repo = process.argv[2];
const R = await import(pathToFileURL(repo + '/web/js/models/rover.js').href);
const W = await import(pathToFileURL(repo + '/web/js/models/walker.js').href);
const inp = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const out = {};
out.rover = inp.rover.map(([d, th, r, z, p]) => { const e = R.segmentEnergy(d, th, r, { z_m: z, payload_kg: p }); return [e.E_drive_J, e.E_aux_J, e.E_total_J, e.t_s]; });
out.walker = inp.walker.map(([w, d, th, r]) => { const s = W.segment(w, d, th, r); const m = W.metabolic(w, Math.tan(th * Math.PI / 180), r); return [s.E_J, s.O2_L, s.t_s, m.P_total_W, m.HR_bpm, m.sweat_L_h, W.coreTempC(m.P_total_W, w.W, 3600)]; });
out.o2 = inp.o2.map(([segs, plan]) => { const p = W.o2Plan(segs.map(([t_s, O2_L]) => ({ t_s, O2_L })), plan); return [p.n_evas, p.O2_required_L, p.O2_max_per_EVA_L, p.O2_metabolic_L]; });
out.verdict = inp.verdict.map(([a, b]) => R.verdict(a, b).verdict);
const routes = JSON.parse(readFileSync(repo + '/web/data/routes.json', 'utf8')).routes;
out.routes = routes.map((r) => r.mode === 'rover' ? R.routeEnergy(r.points) : W.routeEnergy(r.points));
out.routeSegs = routes.map((r) => {
  const s = [];
  for (let k = 1; k < r.points.length; k++) {
    const a = r.points[k - 1], b = r.points[k]; const d = 1000 * (b.s_km - a.s_km);
    s.push(r.mode === 'rover' ? R.segmentEnergy(d, b.grade_deg, b.rough, { z_m: 0.5 * (a.z_m + b.z_m) }).E_total_J : W.segment(null, d, b.grade_deg, b.rough).E_J);
  }
  return s;
});
out.payloadValidation = inp.payload.map((x) => { const v = R.validatePayload(x); return [v.ok, v.value]; });
process.stdout.write(JSON.stringify(out));
