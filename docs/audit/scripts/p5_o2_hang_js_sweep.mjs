// H-01 (JS): réplica EXACTA del bucle de o2Plan (web/js/models/walker.js) con tope de iteraciones, barriendo
// POI × velocidad (paso 0.05 m/s) × EVA limit (1.00–12.00 h, paso 0.01) con el astronauta por defecto.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const repo = process.argv[2];
const W = await import(pathToFileURL(repo + '/web/js/models/walker.js').href);
const routes = JSON.parse(readFileSync(repo + '/web/data/routes.json', 'utf8')).routes;
function hangs(segments, eva_limit_h, cap = 100000) {
  let t_total = 0; for (const s of segments) t_total += s.t_s;
  const t_round_h = t_total / 3600;
  const n_evas = Math.max(1, Math.ceil(Math.round((t_round_h / eva_limit_h) * 1e9) / 1e9));
  const lim = eva_limit_h * 3600; let clock = 0; let it = 0;
  for (const s of segments) {
    let remT = s.t_s;
    while (remT > 1e-12) {
      if (++it > cap) return { clock, lim, k: Math.min(Math.floor(clock / lim), n_evas - 1), remT };
      const k = Math.min(Math.floor(clock / lim), n_evas - 1);
      const room = k < n_evas - 1 ? (k + 1) * lim - clock : remT;
      const take = Math.min(remT, room);
      remT -= take; clock += take;
    }
  }
  return null;
}
const hits = [];
for (const poi of ['AP-9', 'APMR', 'HCP_ESP_037655_2210', 'AP-8', 'US1_FRONT']) {
  const rs = ['out', 'back'].map((d) => routes.find((r) => r.poi === poi && r.mode === 'walker' && r.direction === d));
  for (let vi = 8; vi <= 32; vi++) {
    const v = Math.round(vi * 5) / 100;
    const w = { ...W.defaultWalker(), v };
    const segs = [];
    for (const r of rs) for (let k = 1; k < r.points.length; k++) {
      const p = r.points; const s = W.segment(w, 1000 * (p[k].s_km - p[k - 1].s_km), p[k].grade_deg, p[k].rough); segs.push({ t_s: s.t_s, O2_L: s.O2_L });
    }
    for (let e = 100; e <= 1200; e++) { const h = hangs(segs, e / 100); if (h) hits.push([poi, v, e / 100, h]); }
  }
}
console.log('combinaciones que cuelgan (JS):', hits.length, 'de', 5 * 25 * 1101);
console.log('con EVA en pasos de 0.5 h:', hits.filter((h) => Math.round(h[2] * 2) === h[2] * 2).length);
console.log('con v = 1.0 m/s:', hits.filter((h) => h[1] === 1).map((h) => `${h[0]}@${h[2]}h`).slice(0, 30).join(', '));
console.log('ejemplos:', JSON.stringify(hits.slice(0, 8)));
