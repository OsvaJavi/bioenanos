// DOM rendering for the sidebar, legend, banner and the About / Data credits dialogs (spec M3).
import { assumptionRows, sortByDistance } from './data.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const MODE_LABEL = { rover: 'ROVER', walker: 'ON FOOT' };

/** POI list ordered by the 3-D length of the `out` route of the active mode (spec M3, D-B6). */
export function renderPOIList({ pois, mode, selectedId, getRoute, onSelect }) {
  const list = $('#poi-list');
  const sorted = sortByDistance(pois, mode, getRoute);
  const lengths = sorted.map((p) => getRoute(p.id, mode, 'out')?.length_km_3d ?? null);
  const max = Math.max(...lengths.filter((v) => v != null), 1);
  list.innerHTML = sorted.map((p, k) => {
    const len = lengths[k];
    const dist = len == null ? 'n/a' : `${len.toFixed(1)} km`;
    const pct = len == null ? 0 : Math.max(3, (100 * len) / max);
    const sel = p.id === selectedId;
    return `<li><button type="button" class="poi-row" data-id="${esc(p.id)}" aria-pressed="${sel}"
      aria-label="${esc(p.name)}, route distance ${esc(dist)} ${mode === 'rover' ? 'by rover' : 'on foot'}">
      <span class="poi-short">${esc(p.short)}</span>
      <span class="poi-name">${esc(p.name.split('·').slice(1).join('·').trim() || p.name)}</span>
      <span class="poi-dist" data-km="${len ?? ''}">${esc(dist)}</span>
      <span class="poi-bar" aria-hidden="true"><i style="width:${pct.toFixed(1)}%"></i></span>
    </button></li>`;
  }).join('');
  list.querySelectorAll('.poi-row').forEach((b) => b.addEventListener('click', () => onSelect(b.dataset.id)));
  $('#list-meta').textContent = `Route distance, ${mode === 'rover' ? 'rover' : 'on foot'}, one way`;
}

export function setListHint(poi, route) {
  const hint = $('#list-hint');
  if (!poi) { hint.textContent = 'Select a point of interest'; return; }
  hint.textContent = route ? `${poi.name}. ${poi.description}` : `${poi.name}. No route available in this mode.`;
}

/** Radio list of base layers; unavailable ones are disabled with the tooltip "Not available". */
export function renderLayerList({ layers, activeId, onChange }) {
  const box = $('#layer-list');
  box.innerHTML = layers.map((l) => {
    const dis = !l.available;
    const tip = dis ? 'Not available' : (l.legend ?? l.label);
    return `<label class="layer-opt${dis ? ' is-disabled' : ''}" title="${esc(tip)}">
      <input type="radio" name="layer" value="${esc(l.id)}" ${l.id === activeId ? 'checked' : ''} ${dis ? 'disabled aria-disabled="true"' : ''}>
      <span>${esc(l.label)}</span>${dis ? '<span class="tag">Not available</span>' : (l.proxy ? '<span class="tag">proxy</span>' : '')}
    </label>`;
  }).join('');
  box.querySelectorAll('input[name="layer"]').forEach((i) => i.addEventListener('change', () => onChange(i.value)));
}

export function renderDetailSub({ detail, show, sub, onChange }) {
  const box = $('#detail-sub');
  box.hidden = !show;
  $('#detail-note').hidden = !show;
  if (!show || !detail) { box.innerHTML = ''; return; }
  const opts = [['hillshade', 'Hillshade'], ['slope', 'Slope'], ['ortho', 'Ortho']].filter(([k]) => detail.subfiles?.[k]);
  box.innerHTML = opts.map(([k, label]) => `<label><input type="radio" name="detail-sub" value="${k}" ${k === sub ? 'checked' : ''}> ${label}</label>`).join('')
    + (detail.location_label ? `<p class="detail-loc">${esc(detail.location_label)}</p>` : '');
  box.querySelectorAll('input').forEach((i) => i.addEventListener('change', () => onChange(i.value)));
}

/** Legend of the active layer: colour ramp + min/max/unit when the layer has a palette, text otherwise. */
export function renderLegend(layer, detailSub) {
  const el = $('#legend');
  if (!layer || !layer.available) { el.innerHTML = ''; return; }
  let title = layer.legend ?? layer.label;
  let palette = layer.palette;
  let min = layer.min;
  let max = layer.max;
  let unit = layer.unit;
  if (layer.id === 'detail') {
    title = detailSub === 'slope' ? `Detail slope (deg), 0–${layer.max}°` : detailSub === 'ortho' ? 'Detail orthoimage' : 'Detail hillshade';
    palette = detailSub === 'slope' ? [[0, '#000004'], [0.2, '#3b0f70'], [0.4, '#8c2981'], [0.6, '#de4968'], [0.8, '#fe9f6d'], [1, '#fcfdbf']] : null;
    unit = 'deg';
  }
  const fmt = (v) => (v == null ? '' : Math.abs(v) >= 100 ? v.toFixed(0) : String(+v.toFixed(2)));
  // A ramp with numbers only where the numbers mean something (hillshade values are a display stretch).
  const showRamp = palette && (unit || layer.proxy || layer.id === 'detail');
  const u = (v) => (v == null ? '' : `${fmt(v)}${unit ? ` ${esc(unit)}` : ''}`);
  const ramp = showRamp ? `<div class="legend-ramp" style="background:linear-gradient(90deg,${palette.map(([t, c]) => `${c} ${(t * 100).toFixed(0)}%`).join(',')})"></div>
    <div class="legend-scale"><span>${u(min)}</span><span>${u(max)}</span></div>` : '';
  const head = layer.id === 'detail' ? title : layer.label;
  const note = layer.id === 'detail' ? '' : layer.legend;
  el.innerHTML = `<div class="legend-title">${esc(head)}</div>${ramp}${note ? `<div class="legend-note">${esc(note)}</div>` : ''}`;
}

export function setMockBanner(show) { $('#mock-banner').hidden = !show; }

/** M6: notice under the legend when a layer image is missing (labels = names of the layers that failed; [] clears it). */
export function setLayerNotice(labels) {
  const legend = $('#legend');
  let el = legend.querySelector('.legend-error');
  if (!labels.length) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.className = 'legend-error'; el.setAttribute('role', 'status'); legend.append(el); }
  el.textContent = `Image not available: ${labels.join(', ')}. The rest of the map and the routes still work.`;
}

export function showFatal(message) {
  const el = $('#fatal');
  el.hidden = false;
  el.textContent = message;
}

/** About / Assumptions: every ASSUMPTION / PROXY constant (from C_meta) + the modelling notes of spec §6.4, P-11, P-12, P-16. */
export function renderAbout(C_meta) {
  const rows = assumptionRows(C_meta);
  const fmtVal = (v) => (Array.isArray(v) ? v.join(' / ') : typeof v === 'object' ? JSON.stringify(v) : String(v));
  $('#about-body').innerHTML = `
    <h3>What this tool does</h3>
    <p>It plans traverses from base AP-1 to five science sites in Arcadia Planitia, for a pressurised rover and for an astronaut on foot.
    Routes minimise energy (rover) or metabolic cost (on foot) over a 200 m elevation model, and the panels below the map estimate energy,
    oxygen and environment along the selected route.</p>
    <h3>Modelling limits</h3>
    <ul>
      <li>Routes are pre-computed with default parameters: rover payload 350 kg; reference astronaut 80 kg with a 170 kg suit and 10 kg of gear (P-11).
        Changing mass recalculates energy but not the route geometry.</li>
      <li>The detail view (CTX DTM, 20 m) is visual only and is not used for routing (P-12). The 200 m elevation model cannot see obstacles smaller than about 200 m.</li>
      <li>Crew life support inside the rover is not modelled (P-16).</li>
      <li>Walking cost uses Minetti's net cost polynomial; it overestimates level walking by about 52 %, which is on the safe side for oxygen.
        It is valid for grades up to 0.45; the 20° on-foot cut stays inside that range. Scaling it by total mass with the suit is an extrapolation.</li>
      <li>Environment values are fixed: northern winter solstice (Ls 270°), noon, 40°N, 210 K. Dose ignores suit and rover shielding.</li>
      <li>Roughness and the radiation-shielding layer are relative proxies. No TES thermal-inertia product was found, so terrain is not excluded by thermal inertia.</li>
      <li>The THEMIS day-IR mosaic sits about 450 m off the CTX and Viking images; it is shown as published.</li>
      <li>The rover verdict is very sensitive to the rolling-resistance coefficient (crr): with 0.08 every site allows a round trip, with 0.30 none does.</li>
      <li>On foot, short climbs on the AP-9, AP-8 and APMR routes push the metabolic rate above 900 W, and on AP-9 and APMR the estimated core
        temperature passes 38.5 °C within an EVA. The panel flags both; the model is conservative (core temperature only resets between EVAs).</li>
      <li>Rover data: drag coefficient 0.23 and curb mass 2092 kg from Tesla's official specification; frontal area, usable battery and GVWR
        from the EVKX aggregator.</li>
    </ul>
    <h3>Assumptions and proxies (${rows.length})</h3>
    <table><thead><tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Type</th><th>Reference</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r.key)}</td><td class="num">${esc(fmtVal(r.value))}</td><td>${esc(r.unit ?? '')}</td><td>${esc(r.source)}</td><td>${esc(r.ref ?? '')}</td></tr>`).join('')}
    </tbody></table>`;
}

const CREDITS = [
  ['Elevation (regional)', 'Mars HRSC–MOLA blended DEM, 200 m, v2. CC BY-SA 3.0 IGO — DLR, ESA, FU Berlin, NASA, USGS. Derived layers (hillshade, slope, roughness, shielding) share this licence.',
    'https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m'],
  ['Elevation (detail)', 'CTX DTM J20_052424_2201_XN_40N158W__J20_052490_2201_XN_40N158W and orthoimage, USGS STAC. CC0 — NASA/JPL-Caltech/MSSS, USGS.',
    'https://stac.astrogeology.usgs.gov/docs/data/mars/ctxdtms/'],
  ['Thermal', 'THEMIS day IR global mosaic, 100 m, v12 — NASA/JPL-Caltech/Arizona State University, USGS.',
    'https://planetarymaps.usgs.gov/mosaic/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12.tif'],
  ['Optical', 'Viking MDIM 2.1 colour mosaic, 232 m — NASA, USGS.',
    'https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif'],
  ['MOLA', 'Mars Global Surveyor MOLA. Public domain — NASA, USGS.',
    'https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m'],
  ['Rover data (official)', 'Tesla Model S Dual Motor specification: drag coefficient 0.23, curb mass 2092 kg. Used only as a reference vehicle for the energy model.',
    'https://www.tesla.com/en_gb/models/design'],
  ['Rover data (aggregator)', 'Tesla Model S AWD MY2026 specifications as listed by EVKX: frontal area, usable battery, GVWR.',
    'https://evkx.net/models/tesla/model_s/model_s_awd/specifications'],
  ['Site context', 'Arcadia Planitia technical study supplied by the team (coordinates, environment, site rationale).', null],
  ['Map library', 'Leaflet 1.9.4, BSD-2-Clause.', 'https://leafletjs.com/'],
];

export function renderCredits() {
  $('#credits-body').innerHTML = `<ul>${CREDITS.map(([what, text, url]) => `<li><strong>${esc(what)}.</strong> ${esc(text)}
    ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Source</a>` : ''}</li>`).join('')}</ul>`;
}

export function setModeButtons(mode) {
  document.body.dataset.mode = mode;
  document.querySelectorAll('.mode-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('#telemetry-rover').hidden = mode !== 'rover';
  $('#telemetry-walker').hidden = mode !== 'walker';
}

export function setCursor(text) { $('#cursor-readout').textContent = text; }
export function setBaseLine(base) {
  $('#base-line').textContent = `Base of Operations: ${base.id}, ${base.lat.toFixed(2)}°N ${base.lon.toFixed(2)}°E`
    + (base.elev_m != null ? `, ${Math.round(base.elev_m)} m` : '');
}
