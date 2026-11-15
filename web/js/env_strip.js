// Environment strip (spec M4, D-F1/F2, P-08): T, P, ρ at the mean elevation of the selected route (`out` of the
// active mode; the base elevation when nothing is selected), noon irradiance at Ls 270°/40°N for τ 0.4 and 2.0,
// and the surface dose rate. Shared with M5 (unchanged). Values are fixed by design (no season selector).
import { env_fixed } from './atmos.js';

const STYLE_ID = 'env-strip-style';
const CSS = `
.env-strip { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 22px; padding: 8px 16px; font-size: 12px; }
.env-strip .env-where { color: var(--muted); }
.env-strip .env-item { display: inline-flex; gap: 6px; align-items: baseline; }
.env-strip dl { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 0; }
.env-strip dt { color: var(--muted); }
.env-strip dd { margin: 0; color: var(--text); font-variant-numeric: tabular-nums; }
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** Mean elevation (m) of a route, weighted by segment length. */
export function meanElevation(route) {
  const p = route?.points;
  if (!p || p.length < 2) return p?.[0]?.z_m ?? null;
  let sw = 0;
  let sz = 0;
  for (let k = 1; k < p.length; k++) {
    const w = p[k].s_km - p[k - 1].s_km;
    sw += w;
    sz += (w * (p[k].z_m + p[k - 1].z_m)) / 2;
  }
  return sw > 0 ? sz / sw : p[0].z_m;
}

/** Values shown in the strip, for an elevation in metres. */
export function envValues(z_m) {
  const e = env_fixed(z_m / 1000);
  return { z_m, T_K: e.T_K, P_Pa: e.P_Pa, rho: e.rho, irr04: e.irr_tau04_Wm2, irr20: e.irr_tau20_Wm2, dose: e.dose_rate_mGy_day, Ls: e.Ls_deg };
}

export function mountEnvStrip(el, ctx) {
  if (!el) return { destroy() {} };
  injectStyle();
  const bus = ctx?.bus ?? document;

  function render() {
    const { mode, poiId } = ctx?.getState?.() ?? {};
    const base = ctx?.data?.getBase?.();
    const route = poiId ? ctx.data.getRoute(poiId, mode, 'out') : null;
    const z = route ? meanElevation(route) : base?.elev_m ?? null;
    if (z == null) { el.innerHTML = '<div class="env-strip"><span class="env-where">Environment: elevation not available</span></div>'; return; }
    const v = envValues(z);
    const where = route ? `Environment along the route (mean ${Math.round(z)} m)` : `Environment at ${base.id} (${Math.round(z)} m)`;
    const item = (k, label, value) => `<div class="env-item" data-env="${k}"><dt>${label}</dt><dd>${value}</dd></div>`;
    el.innerHTML = `<div class="env-strip" role="group" aria-label="Environment">
      <span class="env-where">${where}, Ls ${v.Ls}°, noon</span>
      <dl>
        ${item('T', 'Temperature', `${v.T_K.toFixed(0)} K (${(v.T_K - 273.15).toFixed(0)} °C)`)}
        ${item('P', 'Pressure', `${v.P_Pa.toFixed(0)} Pa`)}
        ${item('rho', 'Air density', `${v.rho.toFixed(4)} kg/m³`)}
        ${item('irr', 'Irradiance', `${v.irr04.toFixed(1)} W/m² clear (τ 0.4), ${v.irr20.toFixed(1)} W/m² dusty (τ 2.0)`)}
        ${item('dose', 'Dose rate', `${v.dose.toFixed(3)} mGy/day`)}
      </dl></div>`;
  }

  const on = ['poi:selected', 'poi:cleared', 'mode:changed'];
  on.forEach((n) => bus.addEventListener(n, render));
  render();
  return { destroy() { on.forEach((n) => bus.removeEventListener(n, render)); el.innerHTML = ''; } };
}
