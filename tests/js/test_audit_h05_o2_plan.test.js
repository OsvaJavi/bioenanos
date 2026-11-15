// Audit H-05: o2Plan must always terminate when splitting segments at EVA boundaries (float boundary case).
// Runs in a child process with a timeout so a regression fails instead of hanging Vitest.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FIXTURE = fileURLToPath(new URL('../fixtures/o2_plan_float_boundary.json', import.meta.url));
const WALKER = new URL('../../web/js/models/walker.js', import.meta.url).href;

function runPlan(fx, timeout = 15000) {
  const code = `
    const W = await import(${JSON.stringify(WALKER)});
    const fx = JSON.parse(process.argv[1]);
    const p = W.o2Plan(fx.segments.map(([t_s, O2_L]) => ({ t_s, O2_L })), { eva_limit_h: fx.eva_limit_h, reserve_min: fx.reserve_min, contingency: fx.contingency });
    const met = fx.segments.reduce((a, s) => a + s[1], 0);
    console.log(JSON.stringify({ n_evas: p.n_evas, perEva: p.O2_per_EVA_L, met, req: p.O2_required_L }));`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', code, JSON.stringify(fx)], { timeout, encoding: 'utf8' });
}

describe('audit H-05 o2Plan split at EVA boundaries', () => {
  it('terminates on the float-boundary fixture and conserves oxygen', () => {
    const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const r = runPlan(fx);
    expect(r.error?.code, 'o2Plan did not terminate (timeout)').toBeUndefined();
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.n_evas).toBe(14);
    // per-EVA values = (metabolic share + reserve) * (1 + contingency); their metabolic shares must add up to the total
    const reserveL = (out.req / (1 + fx.contingency) - out.met) / out.n_evas;
    const metShares = out.perEva.map((p) => p / (1 + fx.contingency) - reserveL);
    expect(metShares.reduce((a, b) => a + b, 0)).toBeCloseTo(out.met, 6);
    expect(Math.min(...metShares)).toBeGreaterThanOrEqual(-1e-9);
  });
});
