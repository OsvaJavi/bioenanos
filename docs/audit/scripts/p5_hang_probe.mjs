// Fase 5: localiza qué función JS no termina. Corre cada bloque con un contador y reporta el primer caso lento.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const repo = process.argv[2];
const R = await import(pathToFileURL(repo + '/web/js/models/rover.js').href);
const W = await import(pathToFileURL(repo + '/web/js/models/walker.js').href);
const inp = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const which = process.argv[4];
const t0 = Date.now();
if (which === 'rover') inp.rover.forEach(([d, th, r, z, p]) => R.segmentEnergy(d, th, r, { z_m: z, payload_kg: p }));
if (which === 'walker') inp.walker.forEach(([w, d, th, r]) => { W.segment(w, d, th, r); W.metabolic(w, 0.1, r); });
if (which === 'o2') inp.o2.forEach(([segs, plan], i) => {
  process.stderr.write(`o2 case ${i}\n`);
  W.o2Plan(segs.map(([t_s, O2_L]) => ({ t_s, O2_L })), plan);
});
if (which === 'routes') { const routes = JSON.parse(readFileSync(repo + '/web/data/routes.json', 'utf8')).routes; routes.forEach((r) => (r.mode === 'rover' ? R.routeEnergy(r.points) : W.routeEnergy(r.points))); }
console.log(which, 'ok', Date.now() - t0, 'ms');
